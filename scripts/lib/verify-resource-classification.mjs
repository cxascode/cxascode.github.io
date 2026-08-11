import fs from "node:fs/promises";
import path from "node:path";
import {
  buildResourceClassificationPayload,
  compareClassificationPayloads,
} from "./resource-classification-scan.mjs";
import { ensureProviderSource } from "./provider-source.mjs";
import {
  DEPENDENCY_TREE_DIR,
  filterDependencyTreeVersionIds,
  RESOURCE_CLASSIFICATION_DIR,
  resolvePublicDataDir,
} from "./public-data-paths.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

export async function resolveLatestProviderVersion(repoRoot = REPO_ROOT) {
  const versionArg = (getArgValue("version") || getArgValue("latest") || "").trim();
  if (versionArg) return versionArg.replace(/^v/i, "");

  const dependencyDir = resolvePublicDataDir(repoRoot, DEPENDENCY_TREE_DIR);
  const latestPath = path.join(dependencyDir, "latest.json");
  try {
    const latest = await loadJson(latestPath);
    if (latest?.version) {
      return String(latest.version).replace(/^v/i, "");
    }
  } catch {
    // fall through
  }

  const indexPath = path.join(dependencyDir, "index.json");
  const index = await loadJson(indexPath);
  const versions = filterDependencyTreeVersionIds(index);
  if (versions.length === 0) {
    throw new Error("No provider version found in public/dependency-tree-json/");
  }

  return String(versions[0]).replace(/^v/i, "");
}

export async function verifyResourceClassificationForVersion(version, {
  repoRoot = REPO_ROOT,
  providerRoot = null,
  classificationPath = null,
} = {}) {
  const resolvedVersion = String(version || "").trim().replace(/^v/i, "");
  if (!resolvedVersion) {
    throw new Error("Provider version is required.");
  }

  const outputDir = resolvePublicDataDir(repoRoot, RESOURCE_CLASSIFICATION_DIR);
  const artifactPath =
    classificationPath || path.join(outputDir, `${resolvedVersion}.json`);
  const expected = await loadJson(artifactPath);
  const resolvedProviderRoot =
    providerRoot || (await ensureProviderSource(resolvedVersion));
  const actual = buildResourceClassificationPayload(resolvedProviderRoot, resolvedVersion);

  return {
    version: resolvedVersion,
    artifactPath,
    providerRoot: resolvedProviderRoot,
    result: compareClassificationPayloads(expected, actual, artifactPath),
  };
}

export async function verifyAllResourceClassifications(repoRoot = REPO_ROOT) {
  const outputDir = resolvePublicDataDir(repoRoot, RESOURCE_CLASSIFICATION_DIR);
  const index = await loadJson(path.join(outputDir, "index.json"));
  const versions = filterDependencyTreeVersionIds(index);
  const reports = [];

  for (const entry of versions) {
    reports.push(await verifyResourceClassificationForVersion(entry, { repoRoot }));
  }

  return reports;
}

export function printClassificationMismatch(mismatch) {
  console.error(`\n${mismatch.key} mismatch:`);
  if (mismatch.missing.length > 0) {
    console.error("  missing from provider scan (regenerate classification artifacts):");
    for (const type of mismatch.missing) console.error(`    - ${type}`);
  }
  if (mismatch.extra.length > 0) {
    console.error("  extra in provider scan (regenerate classification artifacts):");
    for (const type of mismatch.extra) console.error(`    + ${type}`);
  }
}
