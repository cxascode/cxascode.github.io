import fs from "node:fs/promises";
import path from "node:path";
import { DEPENDENCY_TREE_NON_VERSION_JSON_FILES } from "./public-data-path-constants.mjs";
import { pathExists } from "./provider-source.mjs";

const SEMVER_VERSION = /^\d+\.\d+\.\d+$/;

function compareVersionsDesc(a, b) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

export async function listVersionedPublicJson(directory) {
  if (!(await pathExists(directory))) {
    return [];
  }

  const entries = await fs.readdir(directory, { withFileTypes: true });
  const versions = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        !DEPENDENCY_TREE_NON_VERSION_JSON_FILES.has(entry.name) &&
        SEMVER_VERSION.test(entry.name.slice(0, -".json".length))
    )
    .map((entry) => entry.name.slice(0, -".json".length));

  return [...new Set(versions)].sort(compareVersionsDesc);
}

export async function writeIndexAndLatest(directory, versions) {
  await fs.mkdir(directory, { recursive: true });
  const sorted = [...new Set(versions)].sort(compareVersionsDesc);
  await fs.writeFile(
    path.join(directory, "index.json"),
    `${JSON.stringify(sorted, null, 2)}\n`,
    "utf8"
  );

  if (sorted.length === 0) {
    return "";
  }

  const latest = sorted[0];
  await fs.copyFile(
    path.join(directory, `${latest}.json`),
    path.join(directory, "latest.json")
  );
  return latest;
}

export async function refreshPublicVersionAliases(directory, providerVersion) {
  const versions = await listVersionedPublicJson(directory);
  const ver = String(providerVersion).trim().replace(/^v/, "");
  if (ver && !versions.includes(ver)) {
    versions.unshift(ver);
  }
  return writeIndexAndLatest(directory, versions);
}
