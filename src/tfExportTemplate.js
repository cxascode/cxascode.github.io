import { effectiveDependencies } from "./effectiveDependencies.js";

export { effectiveDependencies };

export const RESOURCE_NAME_PLACEHOLDER = "<name>";

export const TF_EXPORT_MODE_EXPORT = "export";
export const TF_EXPORT_MODE_EXPORT_STATE = "exportstate";

/**
 * Resolve the managed-resource block label placeholder for include_filter_resources.
 * Data-source export paths (ExportAsDataFunc) are not modeled here.
 * Uses overrides.json tfExportResourceNames when present, otherwise the
 * version-specific generated map for the selected provider release.
 */
export function resolveTfExportResourceName(
  resourceType,
  overrides,
  tfExportResourceNames
) {
  const type = (resourceType || "").trim();
  if (!type) return RESOURCE_NAME_PLACEHOLDER;

  const overrideMap = overrides?.tfExportResourceNames;
  if (overrideMap && typeof overrideMap === "object") {
    const overrideName = overrideMap[type];
    if (typeof overrideName === "string" && overrideName.trim()) {
      return overrideName.trim();
    }
  }

  const map =
    tfExportResourceNames && typeof tfExportResourceNames === "object"
      ? tfExportResourceNames
      : null;
  const name = map?.[type];
  if (typeof name === "string" && name.trim()) return name.trim();

  return RESOURCE_NAME_PLACEHOLDER;
}

/**
 * Resolve env var comment lines for a resource type.
 * providerEnvVars is an ordered array from public/provider-env-vars.json;
 * export-template lists resource types per entry.
 */
export function resolveProviderEnvVars(resourceType, providerEnvVars) {
  const type = (resourceType || "").trim();
  if (!type) return [];

  const vars = providerEnvVars;
  if (!Array.isArray(vars)) return [];

  return vars
    .filter((entry) => {
      const exportTemplate = entry?.["export-template"];
      return Array.isArray(exportTemplate) && exportTemplate.includes(type);
    })
    .map((entry) => {
      if (!entry || typeof entry.name !== "string" || !entry.name.trim()) return null;
      return {
        name: entry.name.trim(),
        valueHint: typeof entry.valueHint === "string" ? entry.valueHint : "1",
        description: typeof entry.description === "string" ? entry.description.trim() : "",
      };
    })
    .filter(Boolean);
}

function formatEnvVarComment({ name, valueHint, description }) {
  const assignment =
    valueHint === "" ? `# export ${name}=` : `# export ${name}=${valueHint}`;
  return description ? `${assignment}  # ${description}` : assignment;
}

export { formatEnvVarComment as formatProviderEnvVarExportComment };

const TF_EXPORT_ATTR_WIDTH = "use_legacy_architect_flow_exporter".length;

function tfExportAttrLine(name, value) {
  return `  ${name.padEnd(TF_EXPORT_ATTR_WIDTH)} = ${value}`;
}

function normalizeTfExportMode(mode) {
  return mode === TF_EXPORT_MODE_EXPORT_STATE
    ? TF_EXPORT_MODE_EXPORT_STATE
    : TF_EXPORT_MODE_EXPORT;
}

/**
 * Build a genesyscloud_tf_export resource block for a resource type.
 *
 * - include_filter_resources: single filter for the selected type and resource name
 * - replace_with_datasource (export mode): depends-on types as datasource patterns, excluding self-deps
 * - exportstate mode: include_state_file true, no dependency resolution, empty replace_with_datasource
 */
export function buildTfExportAttributes(
  resourceType,
  dependencies,
  resourceName,
  { mode = TF_EXPORT_MODE_EXPORT } = {}
) {
  const type = (resourceType || "").trim();
  if (!type) return "";

  const exportMode = normalizeTfExportMode(mode);
  const isExportState = exportMode === TF_EXPORT_MODE_EXPORT_STATE;

  const name =
    typeof resourceName === "string" && resourceName.trim()
      ? resourceName.trim()
      : RESOURCE_NAME_PLACEHOLDER;

  const replaceEntries = effectiveDependencies(type, dependencies).map(
    (d) => `${d.trim()}::.*`
  );

  const includeFilter = `["${type}::^${name}$"]`;
  const replaceWith = isExportState
    ? "[]"
    : `[${replaceEntries.map((e) => JSON.stringify(e)).join(", ")}]`;

  const body = [
    tfExportAttrLine("directory", '"./genesyscloud"'),
    tfExportAttrLine("enable_dependency_resolution", isExportState ? "false" : "true"),
    tfExportAttrLine("export_format", '"hcl"'),
    tfExportAttrLine("exclude_attributes", "[]"),
    tfExportAttrLine("include_state_file", isExportState ? "true" : "false"),
    tfExportAttrLine("include_filter_resources", includeFilter),
    tfExportAttrLine("log_permission_errors", "true"),
    tfExportAttrLine("replace_with_datasource", replaceWith),
    tfExportAttrLine("split_files_by_resource", "false"),
    tfExportAttrLine(
      "use_legacy_architect_flow_exporter",
      isExportState ? "true" : "false"
    ),
  ].join("\n");

  return `resource "genesyscloud_tf_export" "tf_export" {\n${body}\n}`;
}

/**
 * Build the full copyable export template: env var shell comments, then the HCL block.
 */
export function buildTfExportTemplate(
  resourceType,
  dependencies,
  resourceName,
  envVars,
  { mode = TF_EXPORT_MODE_EXPORT } = {}
) {
  const block = buildTfExportAttributes(resourceType, dependencies, resourceName, { mode });
  if (!block) return "";

  const preamble = (envVars || []).map(formatEnvVarComment);
  if (preamble.length === 0) return block;

  return `${preamble.join("\n")}\n\n${block}`;
}
