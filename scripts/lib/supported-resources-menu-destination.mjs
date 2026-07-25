import { mergeDirectoryMenuRowsByPath } from "./directory-command-nav.mjs";
import {
  getSupportedResourcesAdminExclusionKeywords,
  getSupportedResourcesFeatureToggleKeywords,
} from "./dependency-tree-overrides.mjs";

/** Internal non-admin chrome labels (not written to menuCatalog). */
export const MENU_DESTINATION_KIND = {
  DASHBOARD: "dashboard",
  AGENT: "agent",
  ACTIVITY: "activity",
  ANALYTICS: "analytics",
  APP: "app",
  PARTNER: "partner",
  OTHER: "other",
  UNKNOWN: "unknown",
};

const NON_ADMIN_SKIP_REASON = {
  [MENU_DESTINATION_KIND.DASHBOARD]: "Non-admin link; dashboard or report view.",
  [MENU_DESTINATION_KIND.AGENT]: "Non-admin link; agent workspace view.",
  [MENU_DESTINATION_KIND.ACTIVITY]: "Non-admin link; activity or status view.",
  [MENU_DESTINATION_KIND.ANALYTICS]: "Non-admin link; analytics explorer view.",
  [MENU_DESTINATION_KIND.APP]: "Non-admin link; standalone application view.",
  [MENU_DESTINATION_KIND.PARTNER]: "Non-admin link; partner portal view.",
  [MENU_DESTINATION_KIND.OTHER]: "Non-admin link; not in the configuration coverage map.",
  [MENU_DESTINATION_KIND.UNKNOWN]:
    "Non-admin link; no link metadata available yet.",
};

const SKIP_REASON = {
  PREVIEW_TOGGLE:
    "Unmapped feature toggle; excluded until a resource-type mapping exists or the toggle drops from the nav bundle.",
  ADMIN_EXCLUSION:
    "Admin link matched adminExclusionKeywords in src/private-overrides.json.",
};

function entryHasResourceTypeMappings(resourceTypes) {
  return Array.isArray(resourceTypes) && resourceTypes.length > 0;
}

function getClassifierOptions(overrides = null) {
  return {
    adminExclusionKeywords: getSupportedResourcesAdminExclusionKeywords(overrides),
    featureToggleAllowKeywords: getSupportedResourcesFeatureToggleKeywords(overrides),
  };
}

/** Unmapped toggle-gated path whose toggle name contains a featureToggleKeywords entry. */
export function featureToggleBypassesPreviewExclusion(featureToggles, featureToggleAllowKeywords) {
  if (!Array.isArray(featureToggles) || featureToggles.length === 0) return false;

  const keywords = featureToggleAllowKeywords || [];
  if (keywords.length === 0) return false;

  return featureToggles.some((toggle) => {
    const haystack = String(toggle).toLowerCase();
    return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
  });
}

function excludedResult(skipReason, note = null) {
  return {
    includeInSupportedResources: false,
    skipReason,
    ...(note ? { note } : {}),
  };
}

function includedResult() {
  return {
    includeInSupportedResources: true,
    skipReason: null,
  };
}

/** Admin routes contain the substring "admin" in the link (#/admin/, #/quality/admin/, …).
 *  Standalone apps such as /architect are non-admin unless they have resource-type mappings. */
export function linkContainsAdmin(link) {
  return String(link || "").toLowerCase().includes("admin");
}

/**
 * Step 3: non-admin — any link that does not contain "admin".
 * Returns a chrome kind to exclude, or null when the link is admin.
 */
export function classifyNonAdminChrome({ link = "", path = "", menuSource = "" } = {}) {
  const trimmedLink = String(link || "").trim();
  const trimmedPath = String(path || "").trim();

  if (!trimmedLink) {
    if (String(menuSource || "").trim() === "admin-menu") {
      return null;
    }
    return MENU_DESTINATION_KIND.UNKNOWN;
  }

  if (trimmedLink.includes("/dashboards/")) {
    return MENU_DESTINATION_KIND.DASHBOARD;
  }

  if (linkContainsAdmin(trimmedLink)) {
    return null;
  }

  if (trimmedLink.startsWith("#/agent/") || trimmedLink === "#/agent-ui") {
    return MENU_DESTINATION_KIND.AGENT;
  }

  if (
    trimmedLink === "#/activity" ||
    trimmedLink === "#/timeline" ||
    trimmedLink.startsWith("#/activity/")
  ) {
    return MENU_DESTINATION_KIND.ACTIVITY;
  }

  if (trimmedLink.includes("analyticsexplorer") || trimmedLink.startsWith("#/analytics")) {
    return MENU_DESTINATION_KIND.ANALYTICS;
  }

  if (trimmedLink.startsWith("#/partners/")) {
    return MENU_DESTINATION_KIND.PARTNER;
  }

  if (trimmedLink.startsWith("/") && !trimmedLink.startsWith("//")) {
    return MENU_DESTINATION_KIND.APP;
  }

  if (trimmedLink === "#/home" || trimmedLink === "#/" || trimmedPath === "Profile") {
    return MENU_DESTINATION_KIND.OTHER;
  }

  if (trimmedLink.startsWith("#/search")) {
    return MENU_DESTINATION_KIND.OTHER;
  }

  return MENU_DESTINATION_KIND.OTHER;
}

/**
 * Step 4: exclusions from the admin set (private-overrides adminExclusionKeywords).
 * Only reached when the link contains "admin" and passed steps 1–3.
 */
export function isAdminExclusionLink(link, adminExclusionKeywords) {
  const trimmedLink = String(link || "").trim();
  if (!trimmedLink) return false;

  const keywords = adminExclusionKeywords || getSupportedResourcesAdminExclusionKeywords();
  const haystack = trimmedLink.toLowerCase();

  return keywords.some((keyword) => haystack.includes(String(keyword).toLowerCase()));
}

/** Step 5 default: link contains "admin" (not chrome, not excluded by keyword). */
export function isAdminConfigLink(link) {
  return linkContainsAdmin(link);
}

/**
 * Resolve spreadsheet inclusion for one menu catalog entry.
 *
 * Supported-resources funnel (v2):
 * 1. Known CX as Code mappings always win → include
 * 2. Exclude unmapped feature toggles, except names matching featureToggleKeywords → include
 * 3. Exclude non-admin (link does not contain "admin")
 * 4. Exclude admin links matching adminExclusionKeywords
 * 5. Remaining admin links → include
 */
export function resolveMenuCatalogEntry(
  { link = "", path = "", menuSource = "", featureToggles, resourceTypes } = {},
  { adminExclusionKeywords, featureToggleAllowKeywords } = {}
) {
  const exclusionKeywords = adminExclusionKeywords || getSupportedResourcesAdminExclusionKeywords();
  const toggleAllowKeywords =
    featureToggleAllowKeywords ?? getSupportedResourcesFeatureToggleKeywords();

  if (entryHasResourceTypeMappings(resourceTypes)) {
    return includedResult();
  }

  const hasToggles = Array.isArray(featureToggles) && featureToggles.length > 0;
  if (hasToggles) {
    if (featureToggleBypassesPreviewExclusion(featureToggles, toggleAllowKeywords)) {
      return includedResult();
    }
    return excludedResult(SKIP_REASON.PREVIEW_TOGGLE);
  }

  const chromeKind = classifyNonAdminChrome({ link, path, menuSource });
  if (chromeKind) {
    return excludedResult(
      NON_ADMIN_SKIP_REASON[chromeKind] || NON_ADMIN_SKIP_REASON[MENU_DESTINATION_KIND.OTHER]
    );
  }

  if (isAdminExclusionLink(link, exclusionKeywords)) {
    return excludedResult(SKIP_REASON.ADMIN_EXCLUSION);
  }

  if (isAdminConfigLink(link) || (!link && String(menuSource || "").trim() === "admin-menu")) {
    return includedResult();
  }

  return excludedResult(NON_ADMIN_SKIP_REASON[MENU_DESTINATION_KIND.OTHER]);
}

/** @deprecated Prefer resolveMenuCatalogEntry. */
export function classifyMenuDestination(params = {}, options = {}) {
  const resolved = resolveMenuCatalogEntry(params, options);
  return {
    includeInSpreadsheet: resolved.includeInSupportedResources,
    skipReason: resolved.skipReason,
    ...(resolved.note ? { note: resolved.note } : {}),
  };
}

/** @deprecated Prefer resolveMenuCatalogEntry; retained for tests and debug tooling. */
export function classifyKindFromLink(params = {}) {
  const resolved = resolveMenuCatalogEntry({ ...params, resourceTypes: [], featureToggles: [] });
  if (resolved.includeInSupportedResources) return "config";
  if (resolved.skipReason === SKIP_REASON.PREVIEW_TOGGLE) return "preview";
  if (resolved.skipReason === SKIP_REASON.ADMIN_EXCLUSION) return "excluded";
  return "other";
}

function applyClassificationToEntry(entry, resolved) {
  const next = {
    ...entry,
    includeInSupportedResources: resolved.includeInSupportedResources,
  };

  delete next.destinationKind;
  delete next.supportedResourcesStep;

  if (resolved.skipReason) {
    next.skipReason = resolved.skipReason;
  } else {
    delete next.skipReason;
  }

  if (resolved.note) {
    next.note = resolved.note;
  } else {
    delete next.note;
  }

  return next;
}

/** Apply destination classification to a menu catalog (after resource types are attached). */
export function finalizeMenuCatalog(menuCatalog, overrides = null) {
  const classifierOptions = getClassifierOptions(overrides);

  return (menuCatalog || []).map((entry) => {
    const resolved = resolveMenuCatalogEntry(entry, classifierOptions);
    return applyClassificationToEntry(entry, resolved);
  });
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
      ...(meta.featureToggles ? { featureToggles: meta.featureToggles } : {}),
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

export function partitionMenuPathsForSpreadsheet(
  menuPaths,
  metadataByNorm,
  { pathSep = " > ", overrides = null } = {}
) {
  const classifierOptions = getClassifierOptions(overrides);
  const included = [];
  const excluded = [];

  for (const menuPath of menuPaths) {
    const meta = metadataByNorm.get(normalizeMenuPathKey(menuPath, pathSep)) || { menuPath };
    const classification = resolveMenuCatalogEntry(
      {
        link: meta.link,
        path: menuPath,
        menuSource: meta.menuSource,
        featureToggles: meta.featureToggles,
        resourceTypes: meta.resourceTypes,
      },
      classifierOptions
    );

    if (classification.includeInSupportedResources) {
      included.push(menuPath);
      continue;
    }

    excluded.push({
      menuPath,
      link: meta.link || null,
      titleKey: meta.titleKey || null,
      menuSource: meta.menuSource || null,
      skipReason: classification.skipReason,
    });
  }

  return { included, excluded };
}

/**
 * Build the public menu catalog from Directory command-nav rows (preserving nav order).
 */
export function buildMenuCatalog(directoryMenuRows, overrides = null) {
  const classifierOptions = getClassifierOptions(overrides);
  const mergedRows = mergeDirectoryMenuRowsByPath(directoryMenuRows);

  const catalog = [];

  for (const row of mergedRows) {
    const menuPath = typeof row?.path === "string" ? row.path.trim() : "";
    if (!menuPath) continue;

    const featureToggles =
      Array.isArray(row.featureToggles) && row.featureToggles.length > 0
        ? [...row.featureToggles]
        : undefined;

    const resolved = resolveMenuCatalogEntry(
      {
        link: row.link,
        path: menuPath,
        menuSource: row.menuSource,
        featureToggles,
        resourceTypes: [],
      },
      classifierOptions
    );

    const entry = applyClassificationToEntry(
      {
        path: menuPath,
        link: row.link || null,
        titleKey: row.titleKey || null,
        menuSource: row.menuSource || "directory-command-nav",
        authorize: row.authorize || null,
        ...(featureToggles ? { featureToggles } : {}),
      },
      resolved
    );

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
