import { GENERATED_PUBLIC_DATA_DIRS } from "./publicDataPaths.js";

const BASE = import.meta.env.BASE_URL || "/";

export const DIALOG_RELEASE_NOTES = "release-notes";
export const DIALOG_SITE_UPDATES = "site-updates";
export const DIALOG_CREATION_ORDER = "creation-order";
export const DIALOG_ATTRIBUTE_INDEX = "attribute-index";
export const DIALOG_ENV_VARS = "env-vars";

export const SITE_UPDATES_ENTRY_QUERY_KEY = "entry";

export const SPREADSHEET_PATH_SEGMENT = "spreadsheet";
export const LAB_FILES_PATH_SEGMENT = "labfiles";
export const ROLES_PATH_SEGMENT = "roles";
export const ROLE_READ_WRITE_SEGMENT = "read-write";
export const ROLE_READ_ONLY_SEGMENT = "read-only";

const ROLE_DOWNLOAD_SEGMENTS = new Set([ROLE_READ_WRITE_SEGMENT, ROLE_READ_ONLY_SEGMENT]);

export const DIALOG_FILTER_QUERY_KEY = "filter";
export const ATTRIBUTE_INDEX_FILTER_QUERY_KEY = DIALOG_FILTER_QUERY_KEY;

const LEGACY_DIALOG_QUERY_KEY = "dialog";
const LEGACY_TYPE_QUERY_KEY = "type";

const DIALOG_PATH_SEGMENT = {
  [DIALOG_RELEASE_NOTES]: "release-notes",
  [DIALOG_SITE_UPDATES]: "site-updates",
  [DIALOG_CREATION_ORDER]: "creation-order",
  [DIALOG_ATTRIBUTE_INDEX]: "attribute-index",
  [DIALOG_ENV_VARS]: "env-vars",
};

const DIALOGS_WITHOUT_PROVIDER_VERSION = new Set([DIALOG_SITE_UPDATES]);

export const VALID_DIALOGS = new Set(Object.keys(DIALOG_PATH_SEGMENT));

const RESERVED_PATH_SEGMENTS = new Set([
  ...Object.values(DIALOG_PATH_SEGMENT),
  SPREADSHEET_PATH_SEGMENT,
  LAB_FILES_PATH_SEGMENT,
  ROLES_PATH_SEGMENT,
  ROLE_READ_WRITE_SEGMENT,
  ROLE_READ_ONLY_SEGMENT,
  ...GENERATED_PUBLIC_DATA_DIRS,
  "release-notes-data",
  "site-updates-data",
  "seo",
  "assets",
]);

const VERSION_PATH_RE = /^v?(\d+\.\d+\.\d+)$/i;
const SITE_UPDATES_ENTRY_PATH_RE = /^(\d{4}-\d{2}-\d{2})$/;

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

export function isSiteUpdatesEntryPathSegment(segment) {
  return SITE_UPDATES_ENTRY_PATH_RE.test((segment || "").trim());
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

function setDialogFilterOnUrl(url, filter = "") {
  const trimmed = (filter || "").trim();
  if (trimmed) {
    url.searchParams.set(DIALOG_FILTER_QUERY_KEY, trimmed);
  } else {
    url.searchParams.delete(DIALOG_FILTER_QUERY_KEY);
  }
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

export function siteUpdatesPathname(entry = "latest") {
  const base = dialogPathname(DIALOG_SITE_UPDATES);
  const trimmed = (entry || "").trim();
  if (!trimmed || trimmed === "latest") return base;
  if (!isSiteUpdatesEntryPathSegment(trimmed)) return base;
  return normalizePathname(`${base}/${trimmed}`);
}

export function dialogPathname(dialogId, version = "latest") {
  const segment = DIALOG_PATH_SEGMENT[dialogId];
  if (!segment) return appRootPathname();

  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(new URL(segment, new URL(root, "http://local")).pathname);
  if (DIALOGS_WITHOUT_PROVIDER_VERSION.has(dialogId)) return base;
  return appendVersionSegment(base, version);
}

function readLegacyAttributeIndexFilterFromPath(pathname) {
  const segments = pathSegments(pathname);
  if (segments[0] !== DIALOG_PATH_SEGMENT[DIALOG_ATTRIBUTE_INDEX]) return "";

  if (segments.length === 2 && !isVersionPathSegment(segments[1])) {
    return normalizeResourceType(decodeURIComponent(segments[1]));
  }

  if (segments.length === 3 && isVersionPathSegment(segments[2])) {
    return normalizeResourceType(decodeURIComponent(segments[1]));
  }

  return "";
}

function readLegacyAttributeIndexVersionFromPath(pathname) {
  const segments = pathSegments(pathname);
  if (segments[0] !== DIALOG_PATH_SEGMENT[DIALOG_ATTRIBUTE_INDEX]) return "";

  if (segments.length === 2 && isVersionPathSegment(segments[1])) {
    return fromVersionPathSegment(segments[1]);
  }

  if (segments.length === 3 && isVersionPathSegment(segments[2])) {
    return fromVersionPathSegment(segments[2]);
  }

  return "";
}

export function attributeIndexLocation(filter = "", version = "latest") {
  const url = new URL(dialogPathname(DIALOG_ATTRIBUTE_INDEX, version), "http://local");
  setDialogFilterOnUrl(url, filter);
  return `${url.pathname}${url.search}`;
}

export function creationOrderLocation(filter = "", version = "latest") {
  const url = new URL(dialogPathname(DIALOG_CREATION_ORDER, version), "http://local");
  setDialogFilterOnUrl(url, filter);
  return `${url.pathname}${url.search}`;
}

export function siteUpdatesLocation(entry = "latest") {
  return siteUpdatesPathname(entry);
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

export function readSpreadsheetDownloadFromLocation() {
  try {
    const segments = pathSegments(window.location.pathname);
    if (segments[0] !== SPREADSHEET_PATH_SEGMENT) return null;
    if (segments.length === 1) return "latest";
    if (segments.length === 2 && isVersionPathSegment(segments[1])) {
      return fromVersionPathSegment(segments[1]);
    }
    return null;
  } catch {
    return null;
  }
}

export function spreadsheetPathname(version = "latest") {
  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(
    new URL(SPREADSHEET_PATH_SEGMENT, new URL(root, "http://local")).pathname
  );
  return appendVersionSegment(base, version);
}

export function readLabFilesDownloadFromLocation() {
  try {
    const segments = pathSegments(window.location.pathname);
    if (segments[0] !== LAB_FILES_PATH_SEGMENT) return null;
    if (segments.length === 1) return "latest";
    if (segments.length === 2 && isVersionPathSegment(segments[1])) {
      return fromVersionPathSegment(segments[1]);
    }
    return null;
  } catch {
    return null;
  }
}

export function labFilesPathname(version = "latest") {
  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(
    new URL(LAB_FILES_PATH_SEGMENT, new URL(root, "http://local")).pathname
  );
  return appendVersionSegment(base, version);
}

export function readRoleDownloadFromLocation() {
  try {
    const segments = pathSegments(window.location.pathname);
    if (segments[0] !== ROLES_PATH_SEGMENT) return null;
    if (segments.length < 2 || segments.length > 3) return null;

    const role = segments[1];
    if (!ROLE_DOWNLOAD_SEGMENTS.has(role)) return null;

    if (segments.length === 2) return { role, version: "latest" };

    const versionSegment = segments[2];
    if (versionSegment === "latest") return { role, version: "latest" };
    if (isVersionPathSegment(versionSegment)) {
      return { role, version: fromVersionPathSegment(versionSegment) };
    }

    return null;
  } catch {
    return null;
  }
}

export function roleDownloadPathname(role, version = "latest") {
  if (!ROLE_DOWNLOAD_SEGMENTS.has(role)) return appRootPathname();

  const root = BASE.endsWith("/") ? BASE : `${BASE}/`;
  const base = normalizePathname(
    new URL(`${ROLES_PATH_SEGMENT}/${role}`, new URL(root, "http://local")).pathname
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
  if (segments.length === 0 || segments.length > 2) return "";

  if (segments.length === 2) {
    const isSiteUpdates = segments[0] === DIALOG_PATH_SEGMENT[DIALOG_SITE_UPDATES];
    if (isSiteUpdates && isSiteUpdatesEntryPathSegment(segments[1])) {
      return DIALOG_SITE_UPDATES;
    }
    if (!isVersionPathSegment(segments[1])) return "";
  }

  const first = segments[0];
  for (const dialogId of VALID_DIALOGS) {
    if (DIALOG_PATH_SEGMENT[dialogId] === first) {
      return dialogId;
    }
  }

  return "";
}

export function readVersionFromLocation() {
  try {
    const segments = pathSegments(window.location.pathname);
    if (segments.length !== 2) return "";
    if (!isVersionPathSegment(segments[1])) return "";
    return fromVersionPathSegment(segments[1]);
  } catch {
    return "";
  }
}

export function readDialogFilterFromLocation() {
  try {
    const url = new URL(window.location.href);
    return (url.searchParams.get(DIALOG_FILTER_QUERY_KEY) || "").trim();
  } catch {
    return "";
  }
}

function readSiteUpdatesEntryFromPath(pathname) {
  const segments = pathSegments(pathname);
  if (segments[0] !== DIALOG_PATH_SEGMENT[DIALOG_SITE_UPDATES]) return "";
  if (segments.length === 2 && isSiteUpdatesEntryPathSegment(segments[1])) {
    return segments[1];
  }
  return "";
}

export function readSiteUpdatesEntryFromLocation() {
  try {
    const fromPath = readSiteUpdatesEntryFromPath(window.location.pathname);
    if (fromPath) return fromPath;

    const url = new URL(window.location.href);
    return (url.searchParams.get(SITE_UPDATES_ENTRY_QUERY_KEY) || "").trim();
  } catch {
    return "";
  }
}

export function migrateLegacySiteUpdatesEntryUrl() {
  try {
    if (readSiteUpdatesEntryFromPath(window.location.pathname)) return false;
    if (readDialogFromLocation() !== DIALOG_SITE_UPDATES) return false;

    const entry = readSiteUpdatesEntryFromLocation();
    if (!entry) return false;

    replaceSiteUpdatesInUrl(entry);
    return true;
  } catch {
    return false;
  }
}

export function readCreationOrderFilterFromLocation() {
  return readDialogFilterFromLocation();
}

export function readAttributeIndexFilterFromLocation() {
  try {
    const fromQuery = readDialogFilterFromLocation();
    if (fromQuery) return fromQuery;

    return readLegacyAttributeIndexFilterFromPath(window.location.pathname);
  } catch {
    return "";
  }
}

export function migrateLegacyAttributeIndexUrl() {
  try {
    const filter = readLegacyAttributeIndexFilterFromPath(window.location.pathname);
    if (!filter) return false;

    const version = readLegacyAttributeIndexVersionFromPath(window.location.pathname);
    replaceAttributeIndexInUrl(filter, version || "latest");
    return true;
  } catch {
    return false;
  }
}

export function readResourceTypeFromLocation() {
  try {
    if (readDialogFromLocation()) return "";

    const segments = pathSegments(window.location.pathname);
    if (segments.length === 0 || segments.length > 2) return "";
    if (
      segments.length === 2 &&
      !isVersionPathSegment(segments[1]) &&
      !(segments[0] === DIALOG_PATH_SEGMENT[DIALOG_SITE_UPDATES] &&
        isSiteUpdatesEntryPathSegment(segments[1]))
    ) {
      return "";
    }

    const segment = decodeURIComponent(segments[0]);
    if (!segment || RESERVED_PATH_SEGMENTS.has(segment)) return "";

    return normalizeResourceType(segment);
  } catch {
    return "";
  }
}

function setSiteUpdatesEntryOnUrl(url, entry = "") {
  url.searchParams.delete(SITE_UPDATES_ENTRY_QUERY_KEY);
  url.pathname = siteUpdatesPathname(entry);
}

export function replaceDialogInUrl(dialogId, resourceType = "", version = "latest") {
  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.searchParams.delete(DIALOG_FILTER_QUERY_KEY);
    url.searchParams.delete(SITE_UPDATES_ENTRY_QUERY_KEY);

    if (dialogId && VALID_DIALOGS.has(dialogId)) {
      url.pathname =
        dialogId === DIALOG_SITE_UPDATES
          ? siteUpdatesPathname("latest")
          : dialogPathname(dialogId, version);
    } else {
      const typed = normalizeResourceType(resourceType);
      url.pathname = typed ? resourcePathname(typed, version) : appRootPathname();
    }

    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

export function replaceSiteUpdatesInUrl(entry = "latest") {
  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.searchParams.delete(DIALOG_FILTER_QUERY_KEY);
    setSiteUpdatesEntryOnUrl(url, entry);
    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

export function replaceAttributeIndexInUrl(filter = "", version = "latest") {
  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.pathname = dialogPathname(DIALOG_ATTRIBUTE_INDEX, version);
    setDialogFilterOnUrl(url, filter);
    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

export function replaceCreationOrderInUrl(filter = "", version = "latest") {
  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.pathname = dialogPathname(DIALOG_CREATION_ORDER, version);
    setDialogFilterOnUrl(url, filter);
    replaceIfChanged(url);
  } catch {
    /* ignore invalid URLs */
  }
}

export function replaceResourceInUrl(resourceType, version = "latest") {
  if (readDialogFromLocation()) return;

  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.searchParams.delete(DIALOG_FILTER_QUERY_KEY);

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

export function buildDialogPermalink(dialogId, version = "latest") {
  if (!VALID_DIALOGS.has(dialogId)) return "";

  try {
    const url = new URL(window.location.href);
    stripLegacyQueryParams(url);
    url.pathname =
      dialogId === DIALOG_SITE_UPDATES
        ? siteUpdatesPathname(readSiteUpdatesEntryFromLocation() || "latest")
        : dialogPathname(dialogId, version);
    if (dialogId !== DIALOG_ATTRIBUTE_INDEX && dialogId !== DIALOG_CREATION_ORDER) {
      url.searchParams.delete(DIALOG_FILTER_QUERY_KEY);
    }
    url.searchParams.delete(SITE_UPDATES_ENTRY_QUERY_KEY);
    return url.toString();
  } catch {
    return "";
  }
}

export function buildAttributeIndexPermalink(filter = "", version = "latest") {
  try {
    return new URL(attributeIndexLocation(filter, version), window.location.origin).toString();
  } catch {
    return "";
  }
}

export function buildCreationOrderPermalink(filter = "", version = "latest") {
  try {
    return new URL(creationOrderLocation(filter, version), window.location.origin).toString();
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
