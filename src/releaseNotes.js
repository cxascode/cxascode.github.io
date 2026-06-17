const BASE = import.meta.env.BASE_URL;

export const RELEASE_NOTES_DATA_PATH = "release-notes-data";
export const TF_EXPORT_DATA_PATH = `${RELEASE_NOTES_DATA_PATH}/tf-export`;
export const TF_EXPORT_RESOURCE = "genesyscloud_tf_export";

export const RELEASE_NOTES_SCOPE_PROVIDER = "provider";
export const RELEASE_NOTES_SCOPE_EXPORT = "export";

export function toReleaseNotesVersion(version) {
  if (!version || version === "latest") return "";
  const trimmed = String(version).trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

/** Display label for provider semver values in the UI. */
export const formatProviderVersion = toReleaseNotesVersion;

/**
 * Version label for downloaded artifact filenames. Resolves "latest" to the
 * newest listed provider release when one is known.
 */
export function artifactDownloadVersionLabel(version, newestListedRelease = "") {
  const bare = String(version || "")
    .trim()
    .replace(/^v/i, "");
  if (bare && bare !== "latest") {
    return toReleaseNotesVersion(bare) || "unknown";
  }

  const resolved = String(newestListedRelease || "")
    .trim()
    .replace(/^v/i, "");
  return toReleaseNotesVersion(resolved) || "unknown";
}

/** index.json may only list semver trees; exclude bundled filenames if present. */
export function newestListedReleaseFromIndex(versions) {
  if (!Array.isArray(versions)) return "";
  const found = versions.find(
    (version) =>
      typeof version === "string" &&
      version.trim() &&
      version !== "latest" &&
      version !== "index"
  );
  return found ? found.trim() : "";
}

export async function fetchNewestListedRelease() {
  try {
    const res = await fetch(`${BASE}dependency-tree-json/index.json`, { cache: "no-store" });
    if (!res.ok) return "";
    const json = await res.json();
    return newestListedReleaseFromIndex(json);
  } catch {
    return "";
  }
}

export function fromReleaseNotesVersion(version) {
  return String(version).trim().replace(/^v/i, "");
}

function releaseNotesMarkdownUrlForRoot(root, version) {
  const v = toReleaseNotesVersion(version);
  if (!v) return "";
  return `${BASE}${root}/versions/${v}.md`;
}

function releaseNotesChangesUrlForRoot(root, version) {
  const v = toReleaseNotesVersion(version);
  if (!v) return "";
  return `${BASE}${root}/changes/${v}.json`;
}

export function releaseNotesMarkdownUrl(version) {
  return releaseNotesMarkdownUrlForRoot(RELEASE_NOTES_DATA_PATH, version);
}

export function releaseNotesChangesUrl(version) {
  return releaseNotesChangesUrlForRoot(RELEASE_NOTES_DATA_PATH, version);
}

export function tfExportMarkdownUrl(version) {
  return releaseNotesMarkdownUrlForRoot(TF_EXPORT_DATA_PATH, version);
}

export function releaseNotesIndexUrl(scope = RELEASE_NOTES_SCOPE_PROVIDER) {
  const root =
    scope === RELEASE_NOTES_SCOPE_EXPORT ? TF_EXPORT_DATA_PATH : RELEASE_NOTES_DATA_PATH;
  return `${BASE}${root}/index.json`;
}

async function fetchReleaseNotesMarkdownFromUrl(url, label = "release notes") {
  if (!url) return "";

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return "";
  if (!res.ok) {
    throw new Error(`Failed to fetch ${label}: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

export async function fetchReleaseNotesMarkdown(version, scope = RELEASE_NOTES_SCOPE_PROVIDER) {
  const url =
    scope === RELEASE_NOTES_SCOPE_EXPORT
      ? tfExportMarkdownUrl(version)
      : releaseNotesMarkdownUrl(version);
  const label = scope === RELEASE_NOTES_SCOPE_EXPORT ? "export release notes" : "release notes";
  return fetchReleaseNotesMarkdownFromUrl(url, label);
}

export function releaseNotesDownloadLabel(scope = RELEASE_NOTES_SCOPE_PROVIDER) {
  return scope === RELEASE_NOTES_SCOPE_EXPORT
    ? "Download export release notes"
    : "Download release notes";
}

export async function fetchReleaseNotesChanges(version) {
  const url = releaseNotesChangesUrl(version);
  if (!url) return null;

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch release changes: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return json && Array.isArray(json.changes) ? json : null;
}

let releaseNotesIndexCache = new Map();

export async function fetchReleaseNotesIndex(scope = RELEASE_NOTES_SCOPE_PROVIDER) {
  if (releaseNotesIndexCache.has(scope)) {
    return releaseNotesIndexCache.get(scope);
  }

  const url = releaseNotesIndexUrl(scope);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch release notes index: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  const entries = Array.isArray(json) ? json : [];
  releaseNotesIndexCache.set(scope, entries);
  return entries;
}

export function releaseNotesVersionsFromIndex(index) {
  if (!Array.isArray(index)) return [];
  return index.map((entry) => fromReleaseNotesVersion(entry?.version)).filter(Boolean);
}

export function filterChangesForResource(changesPayload, resourceType) {
  const type = (resourceType || "").trim();
  if (!type || !changesPayload?.changes) return [];

  return changesPayload.changes.filter((entry) => entry?.resource === type);
}

export function formatReleaseChangeLabel(change) {
  if (change === "added") return "Added";
  if (change === "removed") return "Removed";
  if (change === "updated") return "Changed";
  return change || "Changed";
}

export function formatReleaseChangeKind(kind) {
  if (kind === "resource_behavior") return "Resource behavior";
  if (kind === "state_behavior") return "State behavior";
  if (kind === "attribute") return "Attribute";
  return kind || "";
}
