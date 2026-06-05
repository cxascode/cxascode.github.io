export const RESOURCE_NAME_PLACEHOLDER = "<name>";

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

const TF_EXPORT_ATTR_WIDTH = "use_legacy_architect_flow_exporter".length;

function tfExportAttrLine(name, value) {
  return `  ${name.padEnd(TF_EXPORT_ATTR_WIDTH)} = ${value}`;
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

  const body = [
    tfExportAttrLine("directory", '"./genesyscloud"'),
    tfExportAttrLine("enable_dependency_resolution", "true"),
    tfExportAttrLine("export_format", '"hcl"'),
    tfExportAttrLine("exclude_attributes", "[]"),
    tfExportAttrLine("include_state_file", "false"),
    tfExportAttrLine("include_filter_resources", includeFilter),
    tfExportAttrLine("log_permission_errors", "true"),
    tfExportAttrLine("replace_with_datasource", replaceWith),
    tfExportAttrLine("split_files_by_resource", "false"),
    tfExportAttrLine("use_legacy_architect_flow_exporter", "false"),
  ].join("\n");

  return `resource "genesyscloud_tf_export" "tf_export" {\n${body}\n}`;
}
