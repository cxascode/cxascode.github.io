import fs from "node:fs/promises";
import path from "node:path";
import { applyOverrides } from "./dependency-tree-overrides.mjs";
import {
  ensureProviderSource,
  pathExists,
  PROVIDER_SOURCE_CACHE_ROOT,
} from "./provider-source.mjs";

export const FLOW_TF_RESOURCE = "genesyscloud_flow";
export const AUTOMATED_SOURCE = "genesyscloud/dependent_consumers/dependent_consumers.go";

const DEPENDENT_CONSUMER_RE =
  /dependentConsumerMap\["([^"]+)"\]\s*=\s*"([^"]+)"/g;

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/, "");
}

export function parseDependentConsumerMap(goSource) {
  const mapping = {};
  for (const match of goSource.matchAll(DEPENDENT_CONSUMER_RE)) {
    mapping[match[1]] = match[2];
  }
  if (Object.keys(mapping).length === 0) {
    throw new Error("No dependentConsumerMap entries found in Go source");
  }
  return Object.fromEntries(Object.entries(mapping).sort(([a], [b]) => a.localeCompare(b)));
}

export async function loadDependentConsumerMap(providerVersion) {
  const version = normalizeVersion(providerVersion);
  const goPathFor = (providerRoot) =>
    path.join(providerRoot, "dependent_consumers", "dependent_consumers.go");

  let providerRoot = await ensureProviderSource(version);
  let goPath = goPathFor(providerRoot);

  if (!(await pathExists(goPath))) {
    const cacheRoot =
      process.env.TF_EXPORT_PROVIDER_CACHE || PROVIDER_SOURCE_CACHE_ROOT;
    const versionDir = path.join(cacheRoot, version);
    console.warn(
      `[warn] ${version}: missing ${path.basename(path.dirname(goPath))}/ in cached provider source; re-downloading`
    );
    await fs.rm(versionDir, { recursive: true, force: true });
    providerRoot = await ensureProviderSource(version);
    goPath = goPathFor(providerRoot);
  }

  const goSource = await fs.readFile(goPath, "utf8");
  return parseDependentConsumerMap(goSource);
}

export function buildAutomatedFlowDependencies(consumerMap) {
  return [
    ...new Set(
      Object.values(consumerMap).filter(
        (tfResource) => tfResource && tfResource !== FLOW_TF_RESOURCE
      )
    ),
  ].sort();
}

export function flowTypeIdsFromConsumerMap(consumerMap) {
  return Object.entries(consumerMap)
    .filter(([, tfResource]) => tfResource === FLOW_TF_RESOURCE)
    .map(([objectType]) => objectType)
    .sort();
}

export function loadOverridesByType(overrides) {
  if (overrides?.by_type && typeof overrides.by_type === "object") {
    return overrides.by_type;
  }
  return {};
}

export function applyFlowDependencyOverrides(baseDependencies, override) {
  if (!override) {
    return [...baseDependencies];
  }

  if (override.dependencies != null) {
    if (!Array.isArray(override.dependencies)) {
      throw new Error("genesyscloud_flow.dependencies must be a list");
    }
    return [
      ...new Set(
        override.dependencies
          .map((item) => String(item).trim())
          .filter(Boolean)
      ),
    ].sort();
  }

  const deps = new Set(baseDependencies);
  for (const item of override.dependencies_add || []) {
    const value = String(item).trim();
    if (value) deps.add(value);
  }
  for (const item of override.dependencies_remove || []) {
    const value = String(item).trim();
    if (value) deps.delete(value);
  }
  return [...deps].sort();
}

export function buildFlowDependencyArtifact(consumerMap, overridesByType, providerVersion) {
  const automated = buildAutomatedFlowDependencies(consumerMap);
  const flowOverride = overridesByType?.[FLOW_TF_RESOURCE] || {};
  const final = applyFlowDependencyOverrides(automated, flowOverride);

  return {
    terraform_resource: FLOW_TF_RESOURCE,
    description:
      "Terraform resource types Architect flows may consume at export time. " +
      "Automated base from provider dependent_consumers.go; optional add/remove " +
      `from overrides.json by_type.${FLOW_TF_RESOURCE}.`,
    provider_version: normalizeVersion(providerVersion),
    automated_source: AUTOMATED_SOURCE,
    dependent_consumer_map: consumerMap,
    flow_type_ids: flowTypeIdsFromConsumerMap(consumerMap),
    automated_dependencies: automated,
    dependencies_add: [...(flowOverride.dependencies_add || [])],
    dependencies_remove: [...(flowOverride.dependencies_remove || [])],
    possible_dependencies: final,
  };
}

export function mergeFlowDependenciesIntoTree(
  dependencyTree,
  flowDependencies,
  { providerVersion, overridesFile = "" } = {}
) {
  if (!dependencyTree || !Array.isArray(dependencyTree.resources)) {
    throw new Error("dependency_tree JSON must contain a top-level resources list");
  }

  const merged = structuredClone(dependencyTree);
  const metadata = {
    merged_at: new Date().toISOString(),
    provider_version: normalizeVersion(providerVersion),
    automated_source: AUTOMATED_SOURCE,
    overrides_file: overridesFile || null,
  };

  let flowEntry = merged.resources.find((resource) => resource?.type === FLOW_TF_RESOURCE);
  if (!flowEntry) {
    flowEntry = { type: FLOW_TF_RESOURCE };
    merged.resources.push(flowEntry);
  }

  flowEntry.dependencies = [...flowDependencies];
  flowEntry.dependency_source = AUTOMATED_SOURCE;
  flowEntry.dependency_merge = metadata;
  merged.dependency_tree_merge = metadata;
  return merged;
}

export async function buildMergedDependencyTree({
  providerVersion,
  dependencyTree,
  overrides,
  consumerMap,
}) {
  const overridesByType = loadOverridesByType(overrides);
  const artifact = buildFlowDependencyArtifact(
    consumerMap,
    overridesByType,
    providerVersion
  );
  const withFlow = mergeFlowDependenciesIntoTree(
    dependencyTree,
    artifact.possible_dependencies,
    {
      providerVersion,
      overridesFile: overrides ? "public/overrides.json" : "",
    }
  );
  return applyOverrides(withFlow, overrides);
}
