/**
 * Resolve the Genesys Cloud admin GUI menu path for a resource type.
 * Uses overrides.json guiMenuPaths when present, otherwise src/gui-menu-paths.json menuCatalog.
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

export function normalizeMenuCatalog(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry) => entry && typeof entry.path === "string" && entry.path.trim());
}

/** @deprecated Use normalizeGuiMenuPathsDocument instead. */
export function normalizeGeneratedGuiMenuPaths(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value;
}

function normalizeMenuPathKey(menuPath) {
  return String(menuPath || "")
    .trim()
    .replace(/ & /g, " and ")
    .split(" > ")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" > ");
}

/**
 * Build a resource-type index from menuCatalog entries.
 */
export function buildGuiMenuPathIndex(menuCatalog) {
  const index = {};

  for (const entry of normalizeMenuCatalog(menuCatalog)) {
    const menuPath = entry.path.trim();
    const types = Array.isArray(entry.resourceTypes) ? entry.resourceTypes : [];
    for (const resourceType of types) {
      if (typeof resourceType === "string" && resourceType.trim()) {
        index[resourceType.trim()] = menuPath;
      }
    }
  }

  return index;
}

/**
 * Load generated src/gui-menu-paths.json into a resource-type -> menu path index.
 * Supports the consolidated menuCatalog shape and legacy guiMenuPaths map.
 */
export function normalizeGuiMenuPathsDocument(doc) {
  if (!doc || typeof doc !== "object") return {};

  const catalog = normalizeMenuCatalog(doc.menuCatalog);
  if (catalog.length > 0) {
    return buildGuiMenuPathIndex(catalog);
  }

  return normalizeGeneratedGuiMenuPaths(doc.guiMenuPaths);
}

export function getSupportedResourcesMenuPaths(menuCatalog) {
  return normalizeMenuCatalog(menuCatalog)
    .filter((entry) => entry.includeInSupportedResources !== false)
    .map((entry) => entry.path.trim());
}

/**
 * Attach generated resource types to menuCatalog entries by menu path.
 */
export function attachResourceTypesToMenuCatalog(menuCatalog, guiMenuPaths) {
  const typesByNorm = new Map();

  for (const [resourceType, menuPath] of Object.entries(guiMenuPaths || {})) {
    if (typeof menuPath !== "string" || !menuPath.trim()) continue;
    const norm = normalizeMenuPathKey(menuPath);
    if (!typesByNorm.has(norm)) typesByNorm.set(norm, []);
    typesByNorm.get(norm).push(resourceType);
  }

  for (const types of typesByNorm.values()) {
    types.sort((a, b) => a.localeCompare(b));
  }

  return normalizeMenuCatalog(menuCatalog).map((entry) => {
    const norm = normalizeMenuPathKey(entry.path);
    return {
      ...entry,
      resourceTypes: typesByNorm.get(norm) || [],
    };
  });
}
