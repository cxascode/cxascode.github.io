import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const OWNER = "MyPureCloud";
const REPO = "terraform-provider-genesyscloud";

const PUBLIC_DIR = path.resolve("public");
const DEP_DIR = path.join(PUBLIC_DIR, "dependency-tree-json");
const PERM_JSON_DIR = path.join(PUBLIC_DIR, "resource-permissions-json");
const PERM_TF_DIR = path.join(PUBLIC_DIR, "resource-permissions-tf");

const DEP_LATEST_PATH = path.join(DEP_DIR, "latest.json");
const RW_LATEST_PATH = path.join(PERM_TF_DIR, "latest-read-write-role.tf");
const RO_LATEST_PATH = path.join(PERM_TF_DIR, "latest-read-only-role.tf");

function compareVersionsDesc(a, b) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removeIfExists(filePath) {
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // ignore
  }
}

async function fetchJson(url, token) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "cxascode-local-bootstrap",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed ${res.status} ${res.statusText} for ${url}\n${text}`);
  }
  return res.json();
}

async function downloadFile(url, outPath, token) {
  const headers = {
    Accept: "application/octet-stream",
    "User-Agent": "cxascode-local-bootstrap",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Download failed ${res.status} ${res.statusText} for ${url}\n${text}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  await fs.writeFile(outPath, Buffer.from(arrayBuffer));
}

async function getLatestRelease(token) {
  const apiBase = `https://api.github.com/repos/${OWNER}/${REPO}`;
  return fetchJson(`${apiBase}/releases/latest`, token);
}

function getAssetUrl(releaseJson, prefix) {
  const assets = Array.isArray(releaseJson?.assets) ? releaseJson.assets : [];
  const match = assets.find(
    (asset) => typeof asset?.name === "string" && asset.name.startsWith(prefix) && asset.name.endsWith(".json"),
  );
  return match?.browser_download_url || "";
}

async function getVersionedDependencyVersions() {
  if (!(await exists(DEP_DIR))) return [];
  const entries = await fs.readdir(DEP_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+\.\d+\.\d+\.json$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort(compareVersionsDesc);
}

async function writeIndexJson() {
  const versions = await getVersionedDependencyVersions();
  await fs.writeFile(
    path.join(DEP_DIR, "index.json"),
    JSON.stringify(versions, null, 2) + "\n",
    "utf8",
  );
  return versions;
}

async function runGenerator(latest) {
  await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["scripts/generate-resource-permissions-tf.mjs", `--latest=${latest}`],
      { stdio: "inherit" },
    );

    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`generate-resource-permissions-tf exited with code ${code}`));
    });

    child.on("error", reject);
  });
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  const latestArg = process.argv.find((arg) => arg.startsWith("--latest="));
  const forcedLatest = latestArg ? latestArg.split("=")[1] : "";

  await ensureDir(DEP_DIR);
  await ensureDir(PERM_JSON_DIR);
  await ensureDir(PERM_TF_DIR);

  // Clean up old top-level aliases if they still exist from previous layout.
  await removeIfExists(path.join(PUBLIC_DIR, "dependency_tree.json"));
  await removeIfExists(path.join(PUBLIC_DIR, "read-write-role.tf"));
  await removeIfExists(path.join(PUBLIC_DIR, "read-only-role.tf"));

  let latestVersion = forcedLatest;
  let depUrl = "";
  let permUrl = "";

  if (latestVersion) {
    console.log(`Using forced latest version: ${latestVersion}`);
  } else {
    console.log(`Fetching latest release from ${OWNER}/${REPO}...`);
    const release = await getLatestRelease(token);
    const latestTag = String(release?.tag_name || "").trim();

    if (!latestTag) {
      throw new Error("Latest release did not contain tag_name");
    }

    latestVersion = latestTag.replace(/^v/, "");
    depUrl = getAssetUrl(release, "dependency_tree-");
    permUrl = getAssetUrl(release, "resource_permissions-");

    console.log(`Latest upstream release: ${latestTag} (${latestVersion})`);
  }

  const depOut = path.join(DEP_DIR, `${latestVersion}.json`);
  if (!(await exists(depOut))) {
    if (!depUrl) {
      const release = await getLatestRelease(token);
      depUrl = getAssetUrl(release, "dependency_tree-");
    }
    if (!depUrl) {
      throw new Error(`Could not find dependency_tree-${latestVersion}.json asset in latest release`);
    }
    console.log(`Downloading dependency tree ${latestVersion} -> ${depOut}`);
    await downloadFile(depUrl, depOut, token);
  } else {
    console.log(`Already have ${depOut}`);
  }

  const permOut = path.join(PERM_JSON_DIR, `${latestVersion}.json`);
  if (!(await exists(permOut))) {
    if (!permUrl && !forcedLatest) {
      const release = await getLatestRelease(token);
      permUrl = getAssetUrl(release, "resource_permissions-");
    }
    if (permUrl) {
      console.log(`Downloading resource permissions ${latestVersion} -> ${permOut}`);
      await downloadFile(permUrl, permOut, token);
    } else {
      console.log(`No resource_permissions asset found for ${latestVersion}; continuing without it.`);
    }
  } else {
    console.log(`Already have ${permOut}`);
  }

  const versions = await writeIndexJson();
  console.log(`Indexed ${versions.length} dependency tree version(s)`);

  await fs.copyFile(depOut, DEP_LATEST_PATH);
  console.log(`Updated ${path.relative(process.cwd(), DEP_LATEST_PATH)}`);

  await runGenerator(latestVersion);

  if (await exists(RW_LATEST_PATH)) {
    console.log(`Updated ${path.relative(process.cwd(), RW_LATEST_PATH)}`);
  }
  if (await exists(RO_LATEST_PATH)) {
    console.log(`Updated ${path.relative(process.cwd(), RO_LATEST_PATH)}`);
  }

  console.log(`Local dev bootstrap complete. Latest version: ${latestVersion}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
