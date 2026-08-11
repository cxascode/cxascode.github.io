import fs from "node:fs/promises";
import path from "node:path";
import { ensureProviderSource, pathExists } from "./lib/provider-source.mjs";
import {
  DEPENDENCY_TREE_DIR,
  filterDependencyTreeVersionIds,
  isDependencyTreeVersionJsonFilename,
  RESOURCE_CLASSIFICATION_DIR,
  resolvePublicDataDir,
} from "./lib/public-data-paths.mjs";
import {
  buildResourceClassificationPayload,
  compareClassificationPayloads,
} from "./lib/resource-classification-scan.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_PROVIDER_ROOT = path.resolve(
  REPO_ROOT,
  "../terraform-provider-genesyscloud/genesyscloud"
);
const OUTPUT_DIR = resolvePublicDataDir(REPO_ROOT, RESOURCE_CLASSIFICATION_DIR);
const DEPENDENCY_DIR = resolvePublicDataDir(REPO_ROOT, DEPENDENCY_TREE_DIR);

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function compareVersionsDesc(a, b) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function listDependencyVersions() {
  let versions = [];

  const indexPath = path.join(DEPENDENCY_DIR, "index.json");
  if (await pathExists(indexPath)) {
    const index = await loadJson(indexPath);
    if (Array.isArray(index)) {
      versions = filterDependencyTreeVersionIds(index);
    }
  }

  if (versions.length === 0 && (await pathExists(DEPENDENCY_DIR))) {
    const entries = await fs.readdir(DEPENDENCY_DIR, { withFileTypes: true });
    versions = entries
      .filter((entry) => entry.isFile() && isDependencyTreeVersionJsonFilename(entry.name))
      .map((entry) => entry.name.replace(/\.json$/, ""));
  }

  return [...new Set(versions)].sort(compareVersionsDesc);
}

async function writePayload(outputPath, payload) {
  await ensureDir(path.dirname(outputPath));
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeIndexAndLatest(versions) {
  const sorted = [...versions].sort(compareVersionsDesc);
  await fs.writeFile(
    path.join(OUTPUT_DIR, "index.json"),
    `${JSON.stringify(sorted, null, 2)}\n`,
    "utf8"
  );
  if (sorted.length === 0) return "";

  const latest = sorted[0];
  const latestSrc = path.join(OUTPUT_DIR, `${latest}.json`);
  const latestDst = path.join(OUTPUT_DIR, "latest.json");
  await fs.copyFile(latestSrc, latestDst);
  return latest;
}

const CLASSIFICATION_SUMMARY_KEYS = [
  "deprecatedResourceTypes",
  "nonExportableResourceTypes",
  "cannotBeDestroyedResourceTypes",
];

function summarizePayload(payload) {
  return CLASSIFICATION_SUMMARY_KEYS.map(
    (key) => `${key}=${(payload?.[key] || []).length}`
  ).join(", ");
}

async function generateForVersion(version, { providerRoot } = {}) {
  const outputPath = path.join(OUTPUT_DIR, `${version}.json`);

  const resolvedProviderRoot =
    providerRoot ||
    (getArgValue("provider") && path.resolve(getArgValue("provider"))) ||
    process.env.TF_EXPORT_PROVIDER_ROOT ||
    (await ensureProviderSource(version));

  let providerStat;
  try {
    providerStat = await fs.stat(resolvedProviderRoot);
  } catch {
    console.error(`Provider source not found for ${version}: ${resolvedProviderRoot}`);
    process.exit(1);
  }

  if (!providerStat.isDirectory()) {
    console.error(`Provider path is not a directory: ${resolvedProviderRoot}`);
    process.exit(1);
  }

  const payload = buildResourceClassificationPayload(resolvedProviderRoot, version);
  await writePayload(outputPath, payload);
  console.log(
    `Wrote ${path.relative(REPO_ROOT, outputPath)} (${summarizePayload(payload)})`
  );
  return outputPath;
}

async function generateAll() {
  await ensureDir(OUTPUT_DIR);
  const versions = await listDependencyVersions();

  if (versions.length === 0) {
    throw new Error(
      `No dependency tree versions found in ${DEPENDENCY_DIR}. Bootstrap dependency-tree-json first.`
    );
  }

  console.log(`Generating resource classification for ${versions.length} provider version(s)...`);

  for (const version of versions) {
    await generateForVersion(version);
  }

  const latest = await writeIndexAndLatest(versions);
  console.log(
    `resource-classification index updated (${versions.length} versions, latest ${latest})`
  );
}

async function main() {
  const version = (getArgValue("version") || getArgValue("latest") || "").trim();
  const providerArg = getArgValue("provider") || process.env.TF_EXPORT_PROVIDER_ROOT || "";
  const outputPath = path.resolve(
    getArgValue("output") ||
      (version ? path.join(OUTPUT_DIR, `${version}.json`) : path.join(OUTPUT_DIR, "latest.json"))
  );
  const verifyPath = path.resolve(getArgValue("verify") || outputPath);

  if (hasFlag("verify")) {
    const providerRoot = path.resolve(providerArg || (version ? "" : DEFAULT_PROVIDER_ROOT));
    const resolvedProviderRoot =
      providerRoot || (version ? await ensureProviderSource(version) : DEFAULT_PROVIDER_ROOT);
    const resolvedVersion =
      version ||
      String((await loadJson(verifyPath))?.version || "")
        .trim()
        .replace(/^v/i, "");
    const actual = buildResourceClassificationPayload(resolvedProviderRoot, resolvedVersion);
    const expected = await loadJson(verifyPath);
    const result = compareClassificationPayloads(expected, actual, verifyPath);

    if (!result.ok) {
      for (const mismatch of result.mismatches) {
        console.error(`\n${mismatch.key} mismatch:`);
        if (mismatch.missing.length > 0) {
          console.error("  missing from generated scan:");
          for (const type of mismatch.missing) console.error(`    - ${type}`);
        }
        if (mismatch.extra.length > 0) {
          console.error("  extra in generated scan:");
          for (const type of mismatch.extra) console.error(`    + ${type}`);
        }
      }
      process.exit(1);
    }

    console.log(`resource-classification verified (${summarizePayload(expected)}).`);
    return;
  }

  if (version) {
    await generateForVersion(version, {
      providerRoot: providerArg ? path.resolve(providerArg) : undefined,
    });
    const versions = await listDependencyVersions();
    if (versions.length > 0) {
      await writeIndexAndLatest(versions);
    }
    return;
  }

  if (hasFlag("stdout") || providerArg) {
    const providerRoot = path.resolve(providerArg || DEFAULT_PROVIDER_ROOT);

    if (!(await pathExists(providerRoot))) {
      console.error(`Provider source not found: ${providerRoot}`);
      console.error("Pass --provider=/path/to/genesyscloud");
      process.exit(1);
    }

    const payload = buildResourceClassificationPayload(providerRoot);
    const rendered = `${JSON.stringify(payload, null, 2)}\n`;

    if (hasFlag("stdout")) {
      process.stdout.write(rendered);
      return;
    }

    await writePayload(outputPath, payload);
    console.log(`Wrote ${outputPath} (${summarizePayload(payload)})`);
    return;
  }

  await generateAll();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
