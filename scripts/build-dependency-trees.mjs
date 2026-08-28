import fs from "node:fs/promises";
import path from "node:path";
import {
  buildFlowDependencyArtifact,
  buildMergedDependencyTree,
  formatArchitectDependencyArtifactLog,
  loadDependentConsumerMap,
  loadOverridesByType,
} from "./lib/flow-dependency-merge.mjs";
import { pathExists } from "./lib/provider-source.mjs";
import {
  ARCHITECT_FLOW_DEPENDENCY_TYPE_MAPPING_DIR,
  DEPENDENCY_TREE_DIR,
  DEPENDENCY_TREE_MERGED_DIR,
  PUBLIC_DIR_NAME,
} from "./lib/public-data-path-constants.mjs";
import { resolvePublicDataDir } from "./lib/public-data-paths.mjs";
import {
  listVersionedPublicJson,
  refreshPublicVersionAliases,
} from "./lib/versioned-public-json.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TREE_DIR = resolvePublicDataDir(REPO_ROOT, DEPENDENCY_TREE_DIR);
const FLOW_MAPPING_DIR = resolvePublicDataDir(
  REPO_ROOT,
  ARCHITECT_FLOW_DEPENDENCY_TYPE_MAPPING_DIR
);
const MERGED_DIR = resolvePublicDataDir(REPO_ROOT, DEPENDENCY_TREE_MERGED_DIR);
const OVERRIDES_PATH = path.join(REPO_ROOT, PUBLIC_DIR_NAME, "overrides.json");
const STALE_MERGED_PATH = path.join(TREE_DIR, "latest-merged.json");

function compareVersionsAsc(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function parseArgs() {
  const latestArg = process.argv.find((arg) => arg.startsWith("--latest="));
  return {
    versionOnly: latestArg ? latestArg.split("=")[1]?.trim().replace(/^v/, "") : "",
  };
}

async function listVersionsToBuild(versionOnly) {
  if (versionOnly) {
    return [versionOnly];
  }

  const indexPath = path.join(TREE_DIR, "index.json");
  if (await pathExists(indexPath)) {
    const index = await loadJson(indexPath);
    if (Array.isArray(index) && index.length > 0) {
      return [...index].sort(compareVersionsAsc);
    }
  }

  const versions = await listVersionedPublicJson(TREE_DIR);
  if (versions.length === 0) {
    throw new Error(
      `No dependency tree versions found in ${TREE_DIR}. Bootstrap dependency-tree-json first.`
    );
  }
  return [...versions].sort(compareVersionsAsc);
}

async function buildProviderVersion(version, overrides) {
  const consumerMap = await loadDependentConsumerMap(version);
  const overridesByType = loadOverridesByType(overrides);
  const flowArtifact = buildFlowDependencyArtifact(
    consumerMap,
    overridesByType,
    version
  );

  const treePath = path.join(TREE_DIR, `${version}.json`);
  const dependencyTree = await loadJson(treePath);

  await writeJson(path.join(FLOW_MAPPING_DIR, `${version}.json`), flowArtifact);

  const merged = await buildMergedDependencyTree({
    providerVersion: version,
    dependencyTree,
    overrides,
    consumerMap,
  });
  await writeJson(path.join(MERGED_DIR, `${version}.json`), merged);

  console.log(`[info] ${version}: wrote flow mapping + merged dependency tree`);
  console.log(formatArchitectDependencyArtifactLog("genesyscloud_flow", flowArtifact));
}

async function main() {
  const { versionOnly } = parseArgs();
  await fs.mkdir(FLOW_MAPPING_DIR, { recursive: true });
  await fs.mkdir(MERGED_DIR, { recursive: true });

  if (await pathExists(STALE_MERGED_PATH)) {
    await fs.rm(STALE_MERGED_PATH);
    console.log(`Removed stale ${path.relative(REPO_ROOT, STALE_MERGED_PATH)}`);
  }

  const overrides = (await pathExists(OVERRIDES_PATH))
    ? await loadJson(OVERRIDES_PATH)
    : {};

  const versions = await listVersionsToBuild(versionOnly);
  console.log(`Building dependency trees for ${versions.length} version(s)...`);

  for (const version of versions) {
    await buildProviderVersion(version, overrides);
  }

  const latest = versions[versions.length - 1];
  const latestTree = await refreshPublicVersionAliases(TREE_DIR, latest);
  const latestFlow = await refreshPublicVersionAliases(FLOW_MAPPING_DIR, latest);
  const latestMerged = await refreshPublicVersionAliases(MERGED_DIR, latest);

  console.log(
    `Wrote dependency artifacts (${versions.length} versions, latest ${latest})`
  );
  console.log(`  ${DEPENDENCY_TREE_DIR} -> ${latestTree}`);
  console.log(`  ${ARCHITECT_FLOW_DEPENDENCY_TYPE_MAPPING_DIR} -> ${latestFlow}`);
  console.log(`  ${DEPENDENCY_TREE_MERGED_DIR} -> ${latestMerged}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
