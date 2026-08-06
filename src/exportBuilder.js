export const EXPORT_BUILDER_BASE_URL = "https://cxascode.github.io/exportbuilder/";

/**
 * Export Builder URL, optionally scoped to a resource type permalink.
 *
 * @param {string} [resourceType] e.g. genesyscloud_auth_division
 */
export function buildExportBuilderUrl(resourceType) {
  const type = (resourceType || "").trim();
  if (!type) return EXPORT_BUILDER_BASE_URL;

  const base = EXPORT_BUILDER_BASE_URL.replace(/\/$/, "");
  return `${base}/${encodeURIComponent(type)}`;
}
