import { getNonExportableResourceTypes } from "./dependency-tree-overrides.mjs";
import { getSpreadsheetOutResourceTypes } from "./priority-group-keywords.mjs";

function normalizeResourceTypeList(raw) {
  if (!Array.isArray(raw)) return [];

  return [
    ...new Set(
      raw
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim())
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function getOutOfScopeResourceTypes(overrides) {
  return normalizeResourceTypeList(getSpreadsheetOutResourceTypes(overrides));
}

export function getLabfilesAllOutResourceTypes(overrides) {
  return normalizeResourceTypeList(overrides?.labfiles?.allout);
}

/** Resource types registered for a provider version (from dependency-tree-merged-json). */
export function getKnownResourceTypes(dependencyTree) {
  if (!dependencyTree || !Array.isArray(dependencyTree.resources)) return null;

  return new Set(
    dependencyTree.resources
      .map((resource) => (typeof resource?.type === "string" ? resource.type.trim() : ""))
      .filter(Boolean)
  );
}

function stripHclLineComments(terraformContent) {
  return terraformContent
    .split("\n")
    .map((line) => {
      const commentIndex = line.indexOf("#");
      return commentIndex === -1 ? line : line.slice(0, commentIndex);
    })
    .join("\n");
}

export function parseReplaceWithDatasourceTypes(terraformContent) {
  const types = new Set();
  const withoutComments = stripHclLineComments(terraformContent);
  const blockMatch = withoutComments.match(/replace_with_datasource\s*=\s*\[([\s\S]*?)\]/);
  if (!blockMatch) return types;

  for (const match of blockMatch[1].matchAll(/"([^"]+)"/g)) {
    const resourceType = match[1].split("::")[0]?.trim();
    if (resourceType) types.add(resourceType);
  }

  return types;
}

export function buildExcludeFilterResources(
  outOfScopeTypes,
  replaceWithDatasourceTypes,
  nonExportableTypes = [],
  knownResourceTypes = null
) {
  const replaceTypes =
    replaceWithDatasourceTypes instanceof Set
      ? replaceWithDatasourceTypes
      : new Set(replaceWithDatasourceTypes);
  const nonExportable =
    nonExportableTypes instanceof Set ? nonExportableTypes : new Set(nonExportableTypes);
  const knownTypes =
    knownResourceTypes instanceof Set ? knownResourceTypes : null;

  return outOfScopeTypes.filter((type) => {
    if (replaceTypes.has(type) || nonExportable.has(type)) return false;
    if (knownTypes) return knownTypes.has(type);
    return true;
  });
}

export function renderExcludeFilterResourcesAttribute(resourceTypes, indent = "  ") {
  if (resourceTypes.length === 0) {
    return `${indent}exclude_filter_resources     = []`;
  }

  const lines = resourceTypes.map((type) => `${indent}  "${type}",`);
  return `${indent}exclude_filter_resources     = [\n${lines.join("\n")}\n${indent}]`;
}

export function patchExcludeFilterResources(terraformContent, resourceTypes) {
  const replacement = renderExcludeFilterResourcesAttribute(resourceTypes);
  const pattern = /  exclude_filter_resources\s*=\s*\[[\s\S]*?\]/;

  if (!pattern.test(terraformContent)) {
    throw new Error("exclude_filter_resources block not found in Terraform content");
  }

  return terraformContent.replace(pattern, replacement);
}

function resolveExcludeFilterResourcesFromOutTypes(
  outOfScopeTypes,
  terraformContent,
  overrides,
  classification,
  dependencyTree = null
) {
  const replaceTypes = parseReplaceWithDatasourceTypes(terraformContent);
  const nonExportableTypes = getNonExportableResourceTypes(classification, overrides);
  const knownResourceTypes = getKnownResourceTypes(dependencyTree);
  return buildExcludeFilterResources(
    outOfScopeTypes,
    replaceTypes,
    nonExportableTypes,
    knownResourceTypes
  );
}

export function resolveExcludeFilterResources(
  terraformContent,
  overrides,
  classification,
  dependencyTree = null
) {
  return resolveExcludeFilterResourcesFromOutTypes(
    getOutOfScopeResourceTypes(overrides),
    terraformContent,
    overrides,
    classification,
    dependencyTree
  );
}

export function resolveExportAllExcludeFilterResources(
  terraformContent,
  overrides,
  classification,
  dependencyTree = null
) {
  return resolveExcludeFilterResourcesFromOutTypes(
    getLabfilesAllOutResourceTypes(overrides),
    terraformContent,
    overrides,
    classification,
    dependencyTree
  );
}
