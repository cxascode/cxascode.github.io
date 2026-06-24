/**
 * Resolve the Genesys Cloud admin GUI menu path for a resource type.
 * Uses overrides.json guiMenuPaths when present, otherwise public/gui-menu-paths.json.
 */
export function resolveGuiMenuPath(resourceType, overrides, generatedGuiMenuPaths) {
  const type = (resourceType || "").trim();
  if (!type) return "";

  const overrideMap = overrides?.guiMenuPaths;
  if (overrideMap && typeof overrideMap === "object") {
    const overridePath = overrideMap[type];
    if (typeof overridePath === "string" && overridePath.trim()) {
      return overridePath.trim();
    }
  }

  const map =
    generatedGuiMenuPaths && typeof generatedGuiMenuPaths === "object"
      ? generatedGuiMenuPaths
      : null;
  const path = map?.[type];
  return typeof path === "string" ? path.trim() : "";
}

export function normalizeGeneratedGuiMenuPaths(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}
