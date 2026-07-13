/** How a Directory menu destination is used in the product UI. */
export const MENU_DESTINATION_KIND = {
  CONFIG: "config",
  DASHBOARD: "dashboard",
  AGENT: "agent",
  ACTIVITY: "activity",
  ANALYTICS: "analytics",
  APP: "app",
  APP_CONFIG: "app-config",
  OTHER: "other",
  UNKNOWN: "unknown",
};

/** Standalone app entry points that open configuration UIs (not #/admin/ pages). */
const CONFIG_APP_LINKS = new Set(["/architect", "/journey-management"]);

/**
 * Classify a Directory menu item from its link URL and decide whether it belongs
 * on the supported-resources configuration coverage spreadsheet.
 */
export function classifyMenuDestination({ link = "", path = "", menuSource = "" } = {}) {
  const trimmedLink = String(link || "").trim();
  const trimmedPath = String(path || "").trim();
  const source = String(menuSource || "").trim();

  if (!trimmedLink) {
    if (source === "admin-menu") {
      return {
        destinationKind: MENU_DESTINATION_KIND.CONFIG,
        includeInSpreadsheet: true,
        skipReason: null,
      };
    }

    return {
      destinationKind: MENU_DESTINATION_KIND.UNKNOWN,
      includeInSpreadsheet: true,
      skipReason: null,
      note: "No link metadata available; included in the spreadsheet by default.",
    };
  }

  if (trimmedLink.includes("/dashboards/")) {
    return {
      destinationKind: MENU_DESTINATION_KIND.DASHBOARD,
      includeInSpreadsheet: false,
      skipReason: "Dashboard or report view; not an admin configuration page.",
    };
  }

  if (trimmedLink.startsWith("#/agent/") || trimmedLink === "#/agent-ui") {
    return {
      destinationKind: MENU_DESTINATION_KIND.AGENT,
      includeInSpreadsheet: false,
      skipReason: "Agent workspace view; not an admin configuration page.",
    };
  }

  if (
    trimmedLink === "#/activity" ||
    trimmedLink === "#/timeline" ||
    trimmedLink.startsWith("#/activity/")
  ) {
    return {
      destinationKind: MENU_DESTINATION_KIND.ACTIVITY,
      includeInSpreadsheet: false,
      skipReason: "Activity or status view; not an admin configuration page.",
    };
  }

  if (trimmedLink.includes("analyticsexplorer") || trimmedLink.startsWith("#/analytics")) {
    return {
      destinationKind: MENU_DESTINATION_KIND.ANALYTICS,
      includeInSpreadsheet: false,
      skipReason: "Analytics explorer; not an admin configuration page.",
    };
  }

  if (trimmedLink.startsWith("#/admin/")) {
    return {
      destinationKind: MENU_DESTINATION_KIND.CONFIG,
      includeInSpreadsheet: true,
      skipReason: null,
    };
  }

  if (
    trimmedLink.startsWith("#/quality/admin/") ||
    trimmedLink.startsWith("#/topics-") ||
    trimmedLink.startsWith("#/programs-")
  ) {
    return {
      destinationKind: MENU_DESTINATION_KIND.CONFIG,
      includeInSpreadsheet: true,
      skipReason: null,
    };
  }

  if (trimmedLink.startsWith("#/partners/") || trimmedLink.startsWith("#/contacts")) {
    return {
      destinationKind: MENU_DESTINATION_KIND.CONFIG,
      includeInSpreadsheet: true,
      skipReason: null,
    };
  }

  if (trimmedLink.startsWith("/") && !trimmedLink.startsWith("//")) {
    if (CONFIG_APP_LINKS.has(trimmedLink)) {
      return {
        destinationKind: MENU_DESTINATION_KIND.APP_CONFIG,
        includeInSpreadsheet: true,
        skipReason: null,
      };
    }

    return {
      destinationKind: MENU_DESTINATION_KIND.APP,
      includeInSpreadsheet: false,
      skipReason:
        "Standalone application view; the menu entry opens an app rather than an admin configuration page.",
    };
  }

  if (trimmedLink === "#/home" || trimmedLink === "#/" || trimmedPath === "Profile") {
    return {
      destinationKind: MENU_DESTINATION_KIND.OTHER,
      includeInSpreadsheet: false,
      skipReason: "Navigation landing page; not a resource configuration destination.",
    };
  }

  if (trimmedLink.startsWith("#/search")) {
    return {
      destinationKind: MENU_DESTINATION_KIND.OTHER,
      includeInSpreadsheet: false,
      skipReason: "Search or directory browse view; not a resource configuration destination.",
    };
  }

  return {
    destinationKind: MENU_DESTINATION_KIND.OTHER,
    includeInSpreadsheet: false,
    skipReason: "Non-admin navigation item; not included in the configuration coverage map.",
  };
}

function normalizeMenuPathKey(menuPath, pathSep = " > ") {
  return String(menuPath || "")
    .trim()
    .replace(/ & /g, " and ")
    .split(pathSep)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(pathSep);
}

/**
 * Build a normalized-path index of link/titleKey metadata from gui-menu-paths debug output.
 */
export function buildMenuPathMetadataIndex(debugDoc, { pathSep = " > " } = {}) {
  const byNorm = new Map();

  const add = (menuPath, meta = {}) => {
    const trimmed = String(menuPath || "").trim();
    if (!trimmed) return;

    const norm = normalizeMenuPathKey(trimmed, pathSep);
    const existing = byNorm.get(norm) || { menuPath: trimmed };
    byNorm.set(norm, {
      ...existing,
      menuPath: trimmed,
      ...(meta.link ? { link: meta.link } : {}),
      ...(meta.titleKey ? { titleKey: meta.titleKey } : {}),
      ...(meta.menuSource ? { menuSource: meta.menuSource } : {}),
      ...(meta.authorize ? { authorize: meta.authorize } : {}),
    });
  };

  for (const row of debugDoc?.directoryMenuRows || []) {
    add(row.path, row);
  }

  for (const row of debugDoc?.menuRows || []) {
    if (row?.link || row?.titleKey || row?.menuSource) {
      add(row.path, row);
    }
  }

  for (const entry of debugDoc?.guiMenuPathCatalog || []) {
    if (!entry?.menuPath) continue;
    add(entry.menuPath, {
      link: entry.link,
      titleKey: entry.titleKey,
      menuSource: entry.menuSource,
      authorize: entry.menuAuthorize,
    });
  }

  return byNorm;
}

export function partitionMenuPathsForSpreadsheet(menuPaths, metadataByNorm, { pathSep = " > " } = {}) {
  const included = [];
  const excluded = [];

  for (const menuPath of menuPaths) {
    const meta = metadataByNorm.get(normalizeMenuPathKey(menuPath, pathSep)) || { menuPath };
    const classification = classifyMenuDestination({
      link: meta.link,
      path: menuPath,
      menuSource: meta.menuSource,
    });

    if (classification.includeInSpreadsheet) {
      included.push(menuPath);
      continue;
    }

    excluded.push({
      menuPath,
      link: meta.link || null,
      titleKey: meta.titleKey || null,
      menuSource: meta.menuSource || null,
      destinationKind: classification.destinationKind,
      skipReason: classification.skipReason,
    });
  }

  return { included, excluded };
}

/**
 * Build the public menu catalog from Directory command-nav rows (preserving nav order).
 */
export function buildMenuCatalog(menuRows, directoryMenuRows) {
  const directoryByPath = new Map(
    (directoryMenuRows || [])
      .filter((row) => typeof row?.path === "string" && row.path.trim())
      .map((row) => [row.path.trim(), row])
  );

  const catalog = [];
  const seen = new Set();

  for (const row of menuRows || []) {
    const menuPath = typeof row?.path === "string" ? row.path.trim() : "";
    if (!menuPath || seen.has(menuPath)) continue;

    const directoryRow = directoryByPath.get(menuPath) || row;
    const menuSource = directoryRow.menuSource || row.menuSource || "";
    const isDirectoryRow =
      menuSource === "directory-command-nav" ||
      (directoryByPath.has(menuPath) && menuSource !== "admin-menu");

    if (!isDirectoryRow) continue;

    seen.add(menuPath);

    const classification = classifyMenuDestination({
      link: directoryRow.link,
      path: menuPath,
      menuSource: directoryRow.menuSource || row.menuSource,
    });

    const entry = {
      path: menuPath,
      link: directoryRow.link || null,
      titleKey: directoryRow.titleKey || null,
      menuSource: directoryRow.menuSource || row.menuSource || "directory-command-nav",
      authorize: directoryRow.authorize || row.authorize || null,
      destinationKind: classification.destinationKind,
      includeInSupportedResources: classification.includeInSpreadsheet,
      skipReason: classification.skipReason,
    };

    if (classification.note) {
      entry.note = classification.note;
    }

    catalog.push(entry);
  }

  return catalog;
}

export function buildMenuCatalogMetadataIndex(menuCatalog, { pathSep = " > " } = {}) {
  const byNorm = new Map();

  for (const entry of menuCatalog || []) {
    if (!entry?.path) continue;
    const norm = normalizeMenuPathKey(entry.path, pathSep);
    byNorm.set(norm, entry);
  }

  return byNorm;
}
