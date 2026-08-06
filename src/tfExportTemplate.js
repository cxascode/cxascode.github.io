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

/**
 * Per-type exclude_attributes / ignore_changes guidance from overrides.json
 * tfExportExcludeAttributes. Each array holds literal HCL list entries for
 * exclude_attributes and ignore_changes; attributes holds labels for the note prose.
 */
export function resolveTfExportExcludeAttributesEntry(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return null;

  const map = overrides?.tfExportExcludeAttributes;
  if (!map || typeof map !== "object") return null;

  const entry = map[type];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;

  const excludeAttributes = normalizeTfExportBracketValues(entry.exclude_attributes);
  const ignoreChanges = normalizeTfExportBracketValues(entry.ignore_changes);
  const attributes = normalizeTfExportBracketValues(entry.attributes);

  if (excludeAttributes.length === 0 || attributes.length === 0) return null;

  return { attributes, excludeAttributes, ignoreChanges };
}

function normalizeTfExportBracketValues(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
}

function formatTfExportExcludeAttributesList(values) {
  return `[ ${values.map((value) => JSON.stringify(value)).join(", ")} ]`;
}

function formatTfExportIgnoreChangesList(values) {
  return `[ ${values.join(", ")} ]`;
}

function formatAttributeListForProse(attributes) {
  if (attributes.length === 0) return "";
  if (attributes.length === 1) return `\`${attributes[0]}\``;
  if (attributes.length === 2) {
    return `\`${attributes[0]}\` and \`${attributes[1]}\``;
  }
  const last = attributes[attributes.length - 1];
  const rest = attributes.slice(0, -1).map((attr) => `\`${attr}\``).join(", ");
  return `${rest}, and \`${last}\``;
}

/**
 * Build the Good To Know markdown note for exclude_attributes guidance.
 */
export function buildTfExportExcludeAttributesNote(
  resourceType,
  { attributes, excludeAttributes, ignoreChanges },
  resourceName = RESOURCE_NAME_PLACEHOLDER
) {
  const type = (resourceType || "").trim();
  if (
    !type ||
    !Array.isArray(attributes) ||
    attributes.length === 0 ||
    !Array.isArray(excludeAttributes) ||
    excludeAttributes.length === 0
  ) {
    return "";
  }

  const label =
    typeof resourceName === "string" && resourceName.trim()
      ? resourceName.trim()
      : RESOURCE_NAME_PLACEHOLDER;

  const excludeLine = `exclude_attributes = ${formatTfExportExcludeAttributesList(excludeAttributes)}`;

  const lines = [
    `**Good To Know:** For this resource type, consider excluding ${formatAttributeListForProse(attributes)}.`,
    "",
    "If you use `exclude_attributes`, add a matching `lifecycle { ignore_changes = [...] }` block on each exported resource. Otherwise Terraform may plan to remove those attributes from the org on apply.",
    "",
    "**In `genesyscloud_tf_export`:**",
    "```",
    excludeLine,
    "```",
  ];

  if (Array.isArray(ignoreChanges) && ignoreChanges.length > 0) {
    const ignoreLine = `ignore_changes = ${formatTfExportIgnoreChangesList(ignoreChanges)}`;
    lines.push(
      "",
      "**On the exported resource:**",
      "```",
      `resource "${type}" "${label}" {`,
      "  ...",
      "  lifecycle {",
      `    ${ignoreLine}`,
      "  }",
      "  ...",
      "}",
      "```"
    );
  }

  return lines.join("\n");
}

/**
 * Per-type Good To Know note for the export template panel. Empty when the type
 * has no tfExportExcludeAttributes entry in overrides.json.
 */
export function resolveTfExportNote(resourceType, overrides, resourceName) {
  const entry = resolveTfExportExcludeAttributesEntry(resourceType, overrides);
  if (!entry) return "";
  return buildTfExportExcludeAttributesNote(resourceType, entry, resourceName);
}

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
    tfExportAttrLine("split_files_by_resource", "true"),
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
