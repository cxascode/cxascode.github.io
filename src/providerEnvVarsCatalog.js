export const ENV_VAR_STATUS_EXPORT_TEMPLATE = "export-template";
export const ENV_VAR_STATUS_IGNORED = "ignored";
export const ENV_VAR_STATUS_CATALOGED = "cataloged";

export const PROVIDER_ENV_VARS_DESCRIPTION =
  "Environment variables read by the Genesys Cloud Terraform provider and genesyscloud_tf_export. Export-template entries appear as shell comments above export blocks on resource pages.";

export function normalizeProviderEnvVarsCatalog(catalog) {
  if (!catalog || typeof catalog !== "object") {
    return [];
  }

  const ignored = new Set(
    Array.isArray(catalog.providerEnvVarsIgnore)
      ? catalog.providerEnvVarsIgnore
          .filter((name) => typeof name === "string")
          .map((name) => name.trim())
          .filter(Boolean)
      : []
  );

  const vars = Array.isArray(catalog.providerEnvVars) ? catalog.providerEnvVars : [];

  return vars
    .filter((entry) => entry && typeof entry.name === "string" && entry.name.trim())
    .map((entry) => {
      const name = entry.name.trim();
      const exportTemplate = Array.isArray(entry["export-template"])
        ? entry["export-template"].filter((type) => typeof type === "string" && type.trim())
        : [];
      const valueHint = typeof entry.valueHint === "string" ? entry.valueHint : "1";
      const description =
        typeof entry.description === "string" ? entry.description.trim() : "";

      let status = ENV_VAR_STATUS_CATALOGED;
      if (ignored.has(name)) {
        status = ENV_VAR_STATUS_IGNORED;
      } else if (exportTemplate.length > 0) {
        status = ENV_VAR_STATUS_EXPORT_TEMPLATE;
      }

      return {
        name,
        valueHint,
        description,
        exportTemplate,
        status,
      };
    });
}

export function filterProviderEnvVarRows(rows, { query = "", status = "" } = {}) {
  const normalizedStatus = (status || "").trim();
  const q = (query || "").trim().toLowerCase();

  return rows.filter((row) => {
    if (normalizedStatus && row.status !== normalizedStatus) return false;
    if (!q) return true;

    const haystack = [row.name, row.description, row.exportTemplate.join(" "), row.valueHint]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function providerEnvVarStatusLabel(status) {
  switch (status) {
    case ENV_VAR_STATUS_EXPORT_TEMPLATE:
      return "Export template";
    case ENV_VAR_STATUS_IGNORED:
      return "Ignored";
    default:
      return "Cataloged";
  }
}
