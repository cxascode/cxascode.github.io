const BASE = import.meta.env.BASE_URL;

export const RELEASE_NOTES_DATA_PATH = "release-notes-data";

export function toReleaseNotesVersion(version) {
  if (!version || version === "latest") return "";
  const trimmed = String(version).trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

/** Display label for provider semver values in the UI. */
export const formatProviderVersion = toReleaseNotesVersion;

export function fromReleaseNotesVersion(version) {
  return String(version).trim().replace(/^v/i, "");
}

export function releaseNotesMarkdownUrl(version) {
  const v = toReleaseNotesVersion(version);
  if (!v) return "";
  return `${BASE}${RELEASE_NOTES_DATA_PATH}/versions/${v}.md`;
}

export function releaseNotesChangesUrl(version) {
  const v = toReleaseNotesVersion(version);
  if (!v) return "";
  return `${BASE}${RELEASE_NOTES_DATA_PATH}/changes/${v}.json`;
}

export async function fetchReleaseNotesMarkdown(version) {
  const url = releaseNotesMarkdownUrl(version);
  if (!url) return "";

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return "";
  if (!res.ok) {
    throw new Error(`Failed to fetch release notes: ${res.status} ${res.statusText}`);
  }

  return res.text();
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
