export const RECREATES_ON_CHANGE_LABEL = "Changing these attributes recreates the resource";
export const RECREATES_ON_CHANGE_SPREADSHEET_PREFIX = "Recreates if attrib(s) changed";

export function normalizeForceNewCatalog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

export function getForceNewAttributes(resourceType, catalog) {
  const type = (resourceType || "").trim();
  if (!type) return [];

  const map = normalizeForceNewCatalog(catalog);
  const entries = map[type];
  if (!Array.isArray(entries)) return [];

  return entries
    .map((entry) => {
      if (typeof entry === "string") return entry.trim();
      if (entry && typeof entry.attribute === "string") return entry.attribute.trim();
      return "";
    })
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

export function formatSpreadsheetForceNewNote(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) return "";

  const names = attributes
    .map((entry) => (typeof entry === "string" ? entry : entry?.attribute))
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim());

  if (!names.length) return "";
  return `${RECREATES_ON_CHANGE_SPREADSHEET_PREFIX}: ${names.join(", ")}`;
}

export function hasForceNewAttributes(resourceType, catalog) {
  return getForceNewAttributes(resourceType, catalog).length > 0;
}
