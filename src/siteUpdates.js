const BASE = import.meta.env.BASE_URL;

export const SITE_UPDATES_DATA_PATH = "site-updates-data";

export const SITE_UPDATES_AUTO_MARKER = "<!-- site-updates:auto -->";
const SITE_UPDATES_AUTO_MARKER_RE = /^<!--\s*site-updates:auto\s*-->\s*\n?/i;
const AUTO_GEN_DISCLAIMER_RE =
  /^_.*auto-generated from merged branch changes.*_\s*\n?/im;
const EXPLORER_AREAS_SECTION_RE =
  /### (?:Additional )?Explorer areas touched[\s\S]*?(?=\n### |\n## |$)/gi;
const FILE_DETAILS_BLOCK_RE = /<details>[\s\S]*?<\/details>\s*/gi;

export function siteUpdatesIndexUrl() {
  return `${BASE}${SITE_UPDATES_DATA_PATH}/index.json`;
}

export function siteUpdatesMarkdownUrl(entry) {
  const trimmed = String(entry || "").trim();
  if (!trimmed || trimmed === "latest") {
    return `${BASE}${SITE_UPDATES_DATA_PATH}/latest.md`;
  }
  return `${BASE}${SITE_UPDATES_DATA_PATH}/versions/${trimmed}.md`;
}

let siteUpdatesIndexCache = null;

export async function fetchSiteUpdatesIndex() {
  if (siteUpdatesIndexCache) return siteUpdatesIndexCache;

  const res = await fetch(siteUpdatesIndexUrl(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch site updates index: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const entries = Array.isArray(json) ? json : [];
  siteUpdatesIndexCache = entries;
  return entries;
}

export function siteUpdatesEntriesFromIndex(index) {
  if (!Array.isArray(index)) return [];
  return index
    .map((entry) => ({
      version: String(entry?.version || "").trim(),
      title: String(entry?.title || entry?.version || "").trim(),
    }))
    .filter((entry) => entry.version);
}

export function stripSiteUpdatesAutoMarker(markdown) {
  return String(markdown || "").replace(SITE_UPDATES_AUTO_MARKER_RE, "");
}

/** Remove generator metadata and other dev-only markdown before rendering. */
export function prepareSiteUpdatesMarkdownForDisplay(markdown) {
  return stripSiteUpdatesAutoMarker(markdown)
    .replace(AUTO_GEN_DISCLAIMER_RE, "")
    .replace(EXPLORER_AREAS_SECTION_RE, "")
    .replace(FILE_DETAILS_BLOCK_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trimStart();
}

export async function fetchSiteUpdatesMarkdown(entry) {
  const url = siteUpdatesMarkdownUrl(entry);
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return "";
  if (!res.ok) {
    throw new Error(`Failed to fetch site updates: ${res.status} ${res.statusText}`);
  }
  return prepareSiteUpdatesMarkdownForDisplay(await res.text());
}

export function formatSiteUpdatesEntryLabel(entry) {
  return entry?.title || entry?.version || "";
}
