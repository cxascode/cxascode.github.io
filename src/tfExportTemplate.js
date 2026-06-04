export const RESOURCE_NAME_PLACEHOLDER = "<resource name>";

/**
 * Resolve the Genesys Cloud resource name for include_filter_resources.
 * Uses overrides.json tfExportResourceNames when present for the type.
 */
export function resolveTfExportResourceName(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return RESOURCE_NAME_PLACEHOLDER;

  const map = overrides?.tfExportResourceNames;
  if (!map || typeof map !== "object") return RESOURCE_NAME_PLACEHOLDER;

  const name = map[type];
  if (typeof name === "string" && name.trim()) return name.trim();

  return RESOURCE_NAME_PLACEHOLDER;
}

/**
 * Build genesyscloud_tf_export attribute lines for a resource type.
 *
 * - include_filter_resources: single filter for the selected type and resource name
 * - replace_with_datasource: depends-on types as datasource patterns, excluding self-deps
 */
export function buildTfExportAttributes(resourceType, dependencies, resourceName) {
  const type = (resourceType || "").trim();
  if (!type) return "";

  const name =
    typeof resourceName === "string" && resourceName.trim()
      ? resourceName.trim()
      : RESOURCE_NAME_PLACEHOLDER;

  const deps = Array.isArray(dependencies) ? dependencies : [];
  const replaceEntries = deps
    .filter((d) => typeof d === "string" && d.trim() && d.trim() !== type)
    .map((d) => `${d.trim()}::.*`);

  const includeLine = `include_filter_resources = ["${type}::^${name}$"]`;
  const replaceLine = `replace_with_datasource = [${replaceEntries
    .map((e) => JSON.stringify(e))
    .join(",")}]`;

  return `${includeLine}\n${replaceLine}`;
}
