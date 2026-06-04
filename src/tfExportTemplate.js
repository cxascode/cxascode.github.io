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
 * Build a genesyscloud_tf_export resource block for a resource type.
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

  const includeFilter = `["${type}::^${name}$"]`;
  const replaceWith = `[${replaceEntries.map((e) => JSON.stringify(e)).join(", ")}]`;

  return `resource "genesyscloud_tf_export" "tf_export" {
  directory                    = "./genesyscloud"
  enable_dependency_resolution = true
  export_format                = "hcl"
  exclude_attributes           = []
  include_state_file           = false
  include_filter_resources = ${includeFilter}
  log_permission_errors        = true
  replace_with_datasource = ${replaceWith}
  split_files_by_resource      = false
  use_legacy_architect_flow_exporter = false
}`;
}
