export const RECREATES_ON_CHANGE_LABEL = "Changing these attributes recreates the resource";
export const RECREATES_ON_CHANGE_SPREADSHEET_PREFIX = "Recreates if attributes change";

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

export function formatSpreadsheetForceNewAttributeList(attributes) {
  if (!Array.isArray(attributes) || attributes.length === 0) return "";

  const names = attributes
    .map((entry) => (typeof entry === "string" ? entry : entry?.attribute))
    .filter((name) => typeof name === "string" && name.trim())
    .map((name) => name.trim());

  return names.length > 0 ? names.join(", ") : "";
}

export function formatSpreadsheetForceNewNote(attributes) {
  const list = formatSpreadsheetForceNewAttributeList(attributes);
  if (!list) return "";
  return `${RECREATES_ON_CHANGE_SPREADSHEET_PREFIX}: ${list}`;
}

export function hasForceNewAttributes(resourceType, catalog) {
  return getForceNewAttributes(resourceType, catalog).length > 0;
}
