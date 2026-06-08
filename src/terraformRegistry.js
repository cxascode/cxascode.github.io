const PROVIDER_DOCS_BASE =
  "https://registry.terraform.io/providers/MyPureCloud/genesyscloud";

function normalizeRegistryVersion(version) {
  const normalizedVersion = (version || "latest").trim().replace(/^v/i, "");
  return normalizedVersion === "latest" ? "latest" : normalizedVersion;
}

/**
 * Terraform Registry provider docs index (no resource slug).
 *
 * @param {string} version "latest" or a provider semver (e.g. 1.80.0)
 */
export function buildTerraformRegistryProviderDocsUrl(version) {
  const versionSegment = normalizeRegistryVersion(version);
  return `${PROVIDER_DOCS_BASE}/${versionSegment}/docs`;
}

/**
 * Terraform Registry docs URL for a Genesys Cloud resource type.
 *
 * @param {string} resourceType e.g. genesyscloud_ai_studio_summary_setting
 * @param {string} version "latest" or a provider semver (e.g. 1.80.0)
 */
export function buildTerraformRegistryDocsUrl(resourceType, version) {
  const type = (resourceType || "").trim();
  if (!type.startsWith("genesyscloud_")) return "";

  const slug = type.slice("genesyscloud_".length);
  if (!slug) return "";

  const versionSegment = normalizeRegistryVersion(version);

  return `${PROVIDER_DOCS_BASE}/${versionSegment}/docs/resources/${slug}`;
}
