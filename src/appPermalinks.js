const BASE = import.meta.env.BASE_URL || "/";

export const DIALOG_RELEASE_NOTES = "release-notes";
export const DIALOG_CREATION_ORDER = "creation-order";
export const DIALOG_ATTRIBUTE_INDEX = "attribute-index";

const LEGACY_DIALOG_QUERY_KEY = "dialog";
const LEGACY_TYPE_QUERY_KEY = "type";

const DIALOG_PATH_SEGMENT = {
  [DIALOG_RELEASE_NOTES]: "release-notes",
  [DIALOG_CREATION_ORDER]: "creation-order",
  [DIALOG_ATTRIBUTE_INDEX]: "attribute-index",
};

export const VALID_DIALOGS = new Set(Object.keys(DIALOG_PATH_SEGMENT));

const RESERVED_PATH_SEGMENTS = new Set([
  ...Object.values(DIALOG_PATH_SEGMENT),
  "dependency-tree-json",
  "resource-permissions-json",
  "resource-permissions-tf",
  "spreadsheet-templates",
  "release-notes",
  "seo",
  "assets",
]);

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeResourceType(value) {
  return (value || "").trim();
}

function stripLegacyQueryParams(url) {
  url.searchParams.delete(LEGACY_DIALOG_QUERY_KEY);
  url.searchParams.delete(LEGACY_TYPE_QUERY_KEY);
}

export function appRootPathname() {
  return normalizePathname(new URL(BASE, "http://local").pathname);
}

function pathSegments(pathname) {
  const root = appRootPathname();
  const normalized = normalizePathname(pathname);

  if (normalized === root) return [];

  const prefix = root === "/" ? "" : root;
  if (prefix && !normalized.startsWith(prefix)) return [];

  const remainder =
    root === "/"
      ? normalized.replace(/^\//, "")
      : normalized.slice(prefix.length).replace(/^\//, "");

  return remainder.split("/").filter(Boolean);
}

export function dialogPathname(dialogId) {
  const segment = DIALOG_PATH_SEGMENT[dialogId];
  if (!segment) return appRootPathname();

  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  return normalizePathname(new URL(segment, new URL(root, "http://local")).pathname);
}

export function resourcePathname(resourceType) {
  const typed = normalizeResourceType(resourceType);
  if (!typed) return appRootPathname();

  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  return normalizePathname(
    new URL(encodeURIComponent(typed), new URL(root, "http://local")).pathname
  );
}

export function readDialogFromLocation() {
  try {
    return readDialogFromPathname(window.location.pathname);
  } catch {
    return "";
  }
}

function readDialogFromPathname(pathname) {
  const normalized = normalizePathname(pathname);

  for (const dialogId of VALID_DIALOGS) {
    if (normalized === dialogPathname(dialogId)) {
      return dialogId;
    }
  }

  return "";
}

export function readResourceTypeFromLocation() {
  try {
    if (readDialogFromLocation()) return "";

    const segments = pathSegments(window.location.pathname);
    if (segments.length !== 1) return "";

    const segment = decodeURIComponent(segments[0]);
    if (!segment || RESERVED_PATH_SEGMENTS.has(segment)) return "";

    return normalizeResourceType(segment);
  } catch {
    return "";
  }
}

export function replaceDialogInUrl(dialogId, resourceType = "") {
  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);

    if (dialogId && VALID_DIALOGS.has(dialogId)) {
      url.pathname = dialogPathname(dialogId);
    } else {
      const typed = normalizeResourceType(resourceType);
      url.pathname = typed ? resourcePathname(typed) : appRootPathname();
    }

    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

export function replaceResourceInUrl(resourceType) {
  if (readDialogFromLocation()) return;

  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);

    const typed = normalizeResourceType(resourceType);
    url.pathname = typed ? resourcePathname(typed) : appRootPathname();

    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

function replaceIfChanged(url) {
  const next = `${url.pathname}${url.search}${url.hash}`;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next !== current) {
    history.replaceState(null, "", next);
  }
}

export function buildDialogPermalink(dialogId) {
  if (!VALID_DIALOGS.has(dialogId)) return "";

  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.pathname = dialogPathname(dialogId);
    return url.toString();
  } catch {
    return "";
  }
}

export function buildResourceTypePermalink(resourceType) {
  const typed = normalizeResourceType(resourceType);
  if (!typed) return "";

  try {
    return new URL(resourcePathname(typed), window.location.origin).toString();
  } catch {
    return "";
  }
}

export function dialogPermalinkPaths() {
  return [...VALID_DIALOGS].map((dialogId) => dialogPathname(dialogId));
}
