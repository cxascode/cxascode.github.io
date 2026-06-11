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
  "release-notes-data",
  "seo",
  "assets",
]);

const VERSION_PATH_RE = /^v?(\d+\.\d+\.\d+)$/i;

function normalizePathname(pathname) {
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function normalizeResourceType(value) {
  return (value || "").trim();
}

function normalizeVersion(version) {
  const trimmed = String(version || "").trim();
  if (!trimmed || trimmed === "latest") return "";
  return trimmed.replace(/^v/i, "");
}

export function isVersionPathSegment(segment) {
  return VERSION_PATH_RE.test((segment || "").trim());
}

export function fromVersionPathSegment(segment) {
  const match = (segment || "").trim().match(VERSION_PATH_RE);
  return match ? match[1] : "";
}

export function toVersionPathSegment(version) {
  const bare = normalizeVersion(version);
  return bare ? `v${bare}` : "";
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

function appendVersionSegment(pathname, version) {
  const versionSegment = toVersionPathSegment(version);
  if (!versionSegment) return normalizePathname(pathname);
  return normalizePathname(`${normalizePathname(pathname)}/${versionSegment}`);
}

export function dialogPathname(dialogId, version = "latest") {
  const segment = DIALOG_PATH_SEGMENT[dialogId];
  if (!segment) return appRootPathname();

  if (dialogId === DIALOG_ATTRIBUTE_INDEX) {
    return attributeIndexPathname("", version);
  }

  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(new URL(segment, new URL(root, "http://local")).pathname);
  return appendVersionSegment(base, version);
}

export function attributeIndexPathname(resourceType = "", version = "latest") {
  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(
    new URL(
      DIALOG_PATH_SEGMENT[DIALOG_ATTRIBUTE_INDEX],
      new URL(root, "http://local")
    ).pathname
  );
  const typed = normalizeResourceType(resourceType);

  if (typed) {
    const withResource = normalizePathname(`${base}/${encodeURIComponent(typed)}`);
    return appendVersionSegment(withResource, version);
  }

  return appendVersionSegment(base, version);
}

function parseAttributeIndexPathname(pathname) {
  const segments = pathSegments(pathname);
  if (segments[0] !== DIALOG_PATH_SEGMENT[DIALOG_ATTRIBUTE_INDEX]) return null;
  if (segments.length > 3) return null;
  if (segments.length === 3 && !isVersionPathSegment(segments[2])) return null;

  let resource = "";
  let version = "";

  if (segments.length === 2) {
    if (isVersionPathSegment(segments[1])) {
      version = fromVersionPathSegment(segments[1]);
    } else {
      resource = normalizeResourceType(decodeURIComponent(segments[1]));
    }
  } else if (segments.length === 3) {
    resource = normalizeResourceType(decodeURIComponent(segments[1]));
    version = fromVersionPathSegment(segments[2]);
  }

  return { resource, version };
}

export function resourcePathname(resourceType, version = "latest") {
  const typed = normalizeResourceType(resourceType);
  if (!typed) return appRootPathname();

  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(
    new URL(encodeURIComponent(typed), new URL(root, "http://local")).pathname
  );
  return appendVersionSegment(base, version);
}

export function readDialogFromLocation() {
  try {
    return readDialogFromPathname(window.location.pathname);
  } catch {
    return "";
  }
}

function readDialogFromPathname(pathname) {
  const segments = pathSegments(pathname);
  if (segments.length === 0) return "";

  const first = segments[0];
  for (const dialogId of VALID_DIALOGS) {
    if (DIALOG_PATH_SEGMENT[dialogId] !== first) continue;

    if (dialogId === DIALOG_ATTRIBUTE_INDEX) {
      return parseAttributeIndexPathname(pathname) ? dialogId : "";
    }

    if (segments.length > 2) return "";
    if (segments.length === 2 && !isVersionPathSegment(segments[1])) return "";
    return dialogId;
  }

  return "";
}

export function readVersionFromLocation() {
  try {
    const attributeIndex = parseAttributeIndexPathname(window.location.pathname);
    if (attributeIndex) return attributeIndex.version;

    const segments = pathSegments(window.location.pathname);
    if (segments.length !== 2) return "";
    if (!isVersionPathSegment(segments[1])) return "";
    return fromVersionPathSegment(segments[1]);
  } catch {
    return "";
  }
}

export function readAttributeIndexResourceFromLocation() {
  try {
    return parseAttributeIndexPathname(window.location.pathname)?.resource || "";
  } catch {
    return "";
  }
}

export function readResourceTypeFromLocation() {
  try {
    if (readDialogFromLocation()) return "";

    const segments = pathSegments(window.location.pathname);
    if (segments.length === 0 || segments.length > 2) return "";
    if (segments.length === 2 && !isVersionPathSegment(segments[1])) return "";

    const segment = decodeURIComponent(segments[0]);
    if (!segment || RESERVED_PATH_SEGMENTS.has(segment)) return "";

    return normalizeResourceType(segment);
  } catch {
    return "";
  }
}

export function replaceDialogInUrl(
  dialogId,
  resourceType = "",
  version = "latest",
  { attributeIndexResource = "" } = {}
) {
  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);

    if (dialogId && VALID_DIALOGS.has(dialogId)) {
      if (dialogId === DIALOG_ATTRIBUTE_INDEX) {
        url.pathname = attributeIndexPathname(attributeIndexResource, version);
      } else {
        url.pathname = dialogPathname(dialogId, version);
      }
    } else {
      const typed = normalizeResourceType(resourceType);
      url.pathname = typed ? resourcePathname(typed, version) : appRootPathname();
    }

    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

export function replaceAttributeIndexInUrl(resourceFilter = "", version = "latest") {
  replaceDialogInUrl(DIALOG_ATTRIBUTE_INDEX, "", version, {
    attributeIndexResource: resourceFilter,
  });
}

export function replaceResourceInUrl(resourceType, version = "latest") {
  if (readDialogFromLocation()) return;

  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);

    const typed = normalizeResourceType(resourceType);
    url.pathname = typed ? resourcePathname(typed, version) : appRootPathname();

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

export function buildDialogPermalink(dialogId, version = "latest", resourceFilter = "") {
  if (!VALID_DIALOGS.has(dialogId)) return "";

  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    if (dialogId === DIALOG_ATTRIBUTE_INDEX) {
      url.pathname = attributeIndexPathname(resourceFilter, version);
    } else {
      url.pathname = dialogPathname(dialogId, version);
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function buildAttributeIndexPermalink(resourceType = "", version = "latest") {
  try {
    return new URL(
      attributeIndexPathname(resourceType, version),
      window.location.origin
    ).toString();
  } catch {
    return "";
  }
}

export function buildResourceTypePermalink(resourceType, version = "latest") {
  const typed = normalizeResourceType(resourceType);
  if (!typed) return "";

  try {
    return new URL(resourcePathname(typed, version), window.location.origin).toString();
  } catch {
    return "";
  }
}

export function dialogPermalinkPaths() {
  return [...VALID_DIALOGS].map((dialogId) => dialogPathname(dialogId));
}
