import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PROVIDER_OWNER = "MyPureCloud";
export const PROVIDER_REPO = "terraform-provider-genesyscloud";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_CACHE_ROOT = path.resolve(REPO_ROOT, ".cache/provider-source");
const RELEASE_NOTES_INDEX = path.join(
  REPO_ROOT,
  "public/release-notes-data/index.json"
);

let releaseTagByVersionPromise;

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/, "");
}

async function loadReleaseTagByVersion() {
  if (!releaseTagByVersionPromise) {
    releaseTagByVersionPromise = (async () => {
      const map = new Map();

      try {
        const index = JSON.parse(await fs.readFile(RELEASE_NOTES_INDEX, "utf8"));
        for (const entry of index) {
          const version = normalizeVersion(entry?.version);
          const releaseUrl = String(entry?.release_url || "");
          const match = releaseUrl.match(/\/releases\/tag\/([^/?#]+)$/);
          if (version && match?.[1]) {
            map.set(version, match[1]);
          }
        }
      } catch {
        // Release notes index is optional during early bootstrap.
      }

      return map;
    })();
  }

  return releaseTagByVersionPromise;
}

export async function resolveProviderReleaseTag(version) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) {
    throw new Error("Provider version is required");
  }

  const releaseTags = await loadReleaseTagByVersion();
  return releaseTags.get(normalizedVersion) || `v${normalizedVersion}`;
}

export function providerSourceUrl(tag) {
  return `https://github.com/${PROVIDER_OWNER}/${PROVIDER_REPO}/archive/refs/tags/${tag}.tar.gz`;
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return genesyscloud/ source for a provider release version.
 * Downloads and extracts the release .tar.gz once, then reuses the cache.
 */
export async function ensureProviderSource(
  version,
  cacheRoot = process.env.TF_EXPORT_PROVIDER_CACHE ||
    DEFAULT_CACHE_ROOT
) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) {
    throw new Error("Provider version is required");
  }

  const providerRoot = path.join(cacheRoot, normalizedVersion, "genesyscloud");
  if (await pathExists(providerRoot)) {
    return providerRoot;
  }

  const tag = await resolveProviderReleaseTag(normalizedVersion);
  const url = providerSourceUrl(tag);
  await fs.mkdir(cacheRoot, { recursive: true });

  const tarball = path.join(cacheRoot, `${tag}.tar.gz`);
  if (!(await pathExists(tarball))) {
    console.log(`Downloading provider source ${tag}...`);
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(
        `Failed to download provider source ${tag}: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(tarball, Buffer.from(arrayBuffer));
  }

  const extracted = path.join(cacheRoot, `terraform-provider-genesyscloud-${normalizedVersion}`);
  await execFileAsync("tar", ["-xzf", tarball, "-C", cacheRoot]);

  if (!(await pathExists(path.join(extracted, "genesyscloud")))) {
    throw new Error(`genesyscloud/ not found in provider source archive for ${tag}`);
  }

  await fs.mkdir(path.join(cacheRoot, normalizedVersion), { recursive: true });
  await fs.rename(path.join(extracted, "genesyscloud"), providerRoot);
  await fs.rm(extracted, { recursive: true, force: true });

  return providerRoot;
}
