import { getNonExportableResourceTypes } from "./dependency-tree-overrides.mjs";
import { getSpreadsheetOutResourceTypes } from "./priority-group-keywords.mjs";

export function getOutOfScopeResourceTypes(overrides) {
  return getSpreadsheetOutResourceTypes(overrides).sort((a, b) => a.localeCompare(b));
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
  nonExportableTypes = []
) {
  const replaceTypes =
    replaceWithDatasourceTypes instanceof Set
      ? replaceWithDatasourceTypes
      : new Set(replaceWithDatasourceTypes);
  const nonExportable =
    nonExportableTypes instanceof Set ? nonExportableTypes : new Set(nonExportableTypes);

  return outOfScopeTypes.filter((type) => !replaceTypes.has(type) && !nonExportable.has(type));
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

export function resolveExcludeFilterResources(terraformContent, overrides) {
  const outOfScopeTypes = getOutOfScopeResourceTypes(overrides);
  const replaceTypes = parseReplaceWithDatasourceTypes(terraformContent);
  const nonExportableTypes = getNonExportableResourceTypes(overrides);
  return buildExcludeFilterResources(outOfScopeTypes, replaceTypes, nonExportableTypes);
}
