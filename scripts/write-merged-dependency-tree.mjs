import fs from "node:fs/promises";
import path from "node:path";
import { applyOverrides } from "./lib/dependency-tree-overrides.mjs";
import { pathExists } from "./lib/provider-source.mjs";
import {
  DEPENDENCY_TREE_DIR,
  DEPENDENCY_TREE_MERGED_DIR,
  PUBLIC_DIR_NAME,
} from "./lib/public-data-path-constants.mjs";
import { resolvePublicDataDir } from "./lib/public-data-paths.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const INPUT_DIR = resolvePublicDataDir(REPO_ROOT, DEPENDENCY_TREE_DIR);
const OUTPUT_DIR = resolvePublicDataDir(REPO_ROOT, DEPENDENCY_TREE_MERGED_DIR);
const OVERRIDES_PATH = path.join(REPO_ROOT, PUBLIC_DIR_NAME, "overrides.json");

function compareVersionsDesc(a, b) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function listDependencyVersions() {
  let versions = [];

  const indexPath = path.join(INPUT_DIR, "index.json");
  if (await pathExists(indexPath)) {
    const index = await loadJson(indexPath);
    if (Array.isArray(index)) {
      versions = index.filter((entry) => typeof entry === "string" && entry.trim());
    }
  }

  if (versions.length === 0 && (await pathExists(INPUT_DIR))) {
    const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
    versions = entries
      .filter(
        (entry) =>
          entry.isFile() &&
          entry.name.endsWith(".json") &&
          entry.name !== "index.json" &&
          entry.name !== "latest.json"
      )
      .map((entry) => entry.name.slice(0, -".json".length));
  }

  return [...new Set(versions)].sort(compareVersionsDesc);
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
  await fs.copyFile(
    path.join(OUTPUT_DIR, `${latest}.json`),
    path.join(OUTPUT_DIR, "latest.json")
  );
  return latest;
}

async function write() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const versions = await listDependencyVersions();
  if (versions.length === 0) {
    throw new Error(
      `No dependency tree versions found in ${INPUT_DIR}. Bootstrap dependency-tree-json first.`
    );
  }

  const overrides = await loadJson(OVERRIDES_PATH);

  for (const version of versions) {
    const raw = await loadJson(path.join(INPUT_DIR, `${version}.json`));
    const merged = applyOverrides(raw, overrides);
    const outputPath = path.join(OUTPUT_DIR, `${version}.json`);
    await fs.writeFile(outputPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  }

  const latest = await writeIndexAndLatest(versions);
  console.log(
    `Wrote merged dependency trees (${versions.length} versions, latest ${latest}) -> ${OUTPUT_DIR}`
  );
}

write();
