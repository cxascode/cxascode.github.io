import {
  RELEASE_NOTES_DATA_PATH,
  RELEASE_NOTES_SCOPE_EXPORT,
  RELEASE_NOTES_SCOPE_PROVIDER,
  TF_EXPORT_DATA_PATH,
  toReleaseNotesVersion,
} from "./releaseNotes.js";

const BASE = import.meta.env.BASE_URL;

export const ATTRIBUTE_INDEX_MIN_VERSION = "v1.60.0";

export const ATTRIBUTE_INDEX_DESCRIPTION =
  `This list is generated from the release notes available on this site. Introduced is omitted when the item existed before ${ATTRIBUTE_INDEX_MIN_VERSION}.`;

export const ATTRIBUTE_INDEX_SCOPE_PROVIDER = RELEASE_NOTES_SCOPE_PROVIDER;
export const ATTRIBUTE_INDEX_SCOPE_EXPORT = RELEASE_NOTES_SCOPE_EXPORT;

export const ATTRIBUTE_INDEX_RESOURCE_LEVEL_ATTRIBUTE = "(resource-level behavior)";

export const ATTRIBUTE_INDEX_VIEW_ALL = "all";
export const ATTRIBUTE_INDEX_VIEW_TYPE_LIFECYCLE = "typeLifecycle";

export const ATTRIBUTE_INDEX_TYPE_LIFECYCLE_ADDED = "added";
export const ATTRIBUTE_INDEX_TYPE_LIFECYCLE_REMOVED = "removed";

export function formatAttributeIndexTypeLifecycleKind(kind) {
  if (kind === "data_source") return "Data source";
  if (kind === "resource") return "Resource";
  return kind || "Resource";
}

export function formatAttributeIndexTypeLifecycleStatus(status) {
  if (status === ATTRIBUTE_INDEX_TYPE_LIFECYCLE_ADDED) return "Added";
  if (status === ATTRIBUTE_INDEX_TYPE_LIFECYCLE_REMOVED) return "Removed";
  return status || "";
}

function attributeIndexJsonUrl(scope = ATTRIBUTE_INDEX_SCOPE_PROVIDER) {
  const root =
    scope === ATTRIBUTE_INDEX_SCOPE_EXPORT ? TF_EXPORT_DATA_PATH : RELEASE_NOTES_DATA_PATH;
  return `${BASE}${root}/resource-attribute-index.json`;
}

function attributeIndexMarkdownUrl(scope = ATTRIBUTE_INDEX_SCOPE_PROVIDER) {
  const root =
    scope === ATTRIBUTE_INDEX_SCOPE_EXPORT ? TF_EXPORT_DATA_PATH : RELEASE_NOTES_DATA_PATH;
  return `${BASE}${root}/resource-attribute-index.md`;
}

export const RESOURCE_ATTRIBUTE_INDEX_JSON_URL = attributeIndexJsonUrl(
  ATTRIBUTE_INDEX_SCOPE_PROVIDER
);
export const RESOURCE_ATTRIBUTE_INDEX_MD_URL = attributeIndexMarkdownUrl(
  ATTRIBUTE_INDEX_SCOPE_PROVIDER
);

const indexCache = new Map();

export async function fetchResourceAttributeIndex(scope = ATTRIBUTE_INDEX_SCOPE_PROVIDER) {
  if (indexCache.has(scope)) return indexCache.get(scope);

  const res = await fetch(attributeIndexJsonUrl(scope), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch attribute index: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("Attribute index is not an array");
  }

  indexCache.set(scope, json);
  return json;
}

export async function fetchResourceAttributeIndexMarkdown(
  scope = ATTRIBUTE_INDEX_SCOPE_PROVIDER
) {
  const res = await fetch(attributeIndexMarkdownUrl(scope), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch attribute index: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

function normalizeVersionForCompare(value) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed || trimmed === "unknown") return "";
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
}

function versionParts(value) {
  const normalized = normalizeVersionForCompare(value);
  if (!normalized) return null;
  return normalized.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function attributeIndexRecencyParts(entry) {
  return (
    versionParts(entry?.last_updated) ||
    versionParts(entry?.introduced) ||
    versionParts(entry?.removed)
  );
}

function compareVersionPartsDesc(aParts, bParts) {
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i += 1) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av !== bv) return bv - av;
  }

  return 0;
}

function compareAttributeIndexEntryTieBreak(a, b) {
  const resourceCompare = String(a?.resource || "").localeCompare(String(b?.resource || ""));
  if (resourceCompare !== 0) return resourceCompare;
  return String(a?.attribute || "").localeCompare(String(b?.attribute || ""));
}

export function compareAttributeIndexEntriesByRecency(a, b) {
  const aParts = attributeIndexRecencyParts(a);
  const bParts = attributeIndexRecencyParts(b);

  if (!aParts && !bParts) {
    return compareAttributeIndexEntryTieBreak(a, b);
  }
  if (!aParts) return 1;
  if (!bParts) return -1;

  const versionCompare = compareVersionPartsDesc(aParts, bParts);
  if (versionCompare !== 0) return versionCompare;

  return compareAttributeIndexEntryTieBreak(a, b);
}

export function sortAttributeIndexEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return [...entries].sort(compareAttributeIndexEntriesByRecency);
}

export function filterIndexForResource(index, resourceType) {
  const type = (resourceType || "").trim();
  if (!type || !Array.isArray(index)) return [];

  return sortAttributeIndexEntries(index.filter((entry) => entry?.resource === type));
}

export function getIndexVersionOptions(index) {
  if (!Array.isArray(index)) return [];

  const versions = new Set();

  for (const entry of index) {
    if (Array.isArray(entry.history)) {
      for (const item of entry.history) {
        const version = (item?.version || "").trim();
        if (version) versions.add(version);
      }
    }
  }

  return [...versions].sort((a, b) =>
    compareVersionPartsDesc(versionParts(a), versionParts(b))
  );
}

export function getAttributeIndexTypeLifecycleVersionOptions(index) {
  if (!Array.isArray(index)) return [];

  const versions = new Set();

  for (const entry of index) {
    if (!isAttributeIndexTypeLifecycleEntry(entry)) continue;

    for (const item of entry.history) {
      const change = (item?.change || "").trim().toLowerCase();
      if (change !== "added" && change !== "removed") continue;

      const version = (item?.version || "").trim();
      if (version) versions.add(version);
    }
  }

  return [...versions].sort((a, b) =>
    compareVersionPartsDesc(versionParts(a), versionParts(b))
  );
}

function entryMatchesTypeLifecycleVersionFilter(entry, versionFilter) {
  if (!versionFilter) return true;

  const target = normalizeVersionForCompare(versionFilter);
  if (!target) return true;
  if (!isAttributeIndexTypeLifecycleEntry(entry)) return false;

  return entry.history.some((item) => {
    const change = (item?.change || "").trim().toLowerCase();
    if (change !== "added" && change !== "removed") return false;
    return normalizeVersionForCompare(item?.version) === target;
  });
}

function entryMatchesVersionFilter(entry, versionFilter) {
  if (!versionFilter) return true;

  const target = normalizeVersionForCompare(versionFilter);
  if (!target) return true;

  if (Array.isArray(entry.history) && entry.history.length) {
    return entry.history.some(
      (item) => normalizeVersionForCompare(item?.version) === target
    );
  }

  return [entry.introduced, entry.last_updated, entry.removed].some(
    (value) => normalizeVersionForCompare(value) === target
  );
}

export function isAttributeIndexTypeLifecycleEntry(entry) {
  const type = (entry?.type || "").trim();
  if (type !== "resource" && type !== "data_source") return false;
  if ((entry?.attribute || "").trim() !== ATTRIBUTE_INDEX_RESOURCE_LEVEL_ATTRIBUTE) return false;
  if (!Array.isArray(entry?.history) || entry.history.length === 0) return false;

  return entry.history.some((item) => {
    const change = (item?.change || "").trim().toLowerCase();
    return change === "added" || change === "removed";
  });
}

function compareAttributeIndexTypeLifecycleRows(a, b) {
  const versionCompare = compareVersionPartsDesc(
    versionParts(a?.version),
    versionParts(b?.version)
  );
  if (versionCompare !== 0) return versionCompare;

  const statusCompare = String(a?.status || "").localeCompare(String(b?.status || ""));
  if (statusCompare !== 0) return statusCompare;

  return String(a?.resource || "").localeCompare(String(b?.resource || ""));
}

export function flattenAttributeIndexTypeLifecycleRows(entries) {
  if (!Array.isArray(entries)) return [];

  const rows = [];

  for (const entry of entries) {
    if (!isAttributeIndexTypeLifecycleEntry(entry)) continue;

    for (const item of entry.history) {
      const change = (item?.change || "").trim().toLowerCase();
      if (change !== "added" && change !== "removed") continue;

      const version = (item?.version || "").trim();
      if (!version) continue;

      rows.push({
        resource: entry.resource,
        status: change,
        kind: entry.type,
        version,
      });
    }
  }

  return rows.sort(compareAttributeIndexTypeLifecycleRows);
}

export function filterIndexEntries(
  index,
  {
    query = "",
    typeFilter = "",
    statusFilter = "",
    versionFilter = "",
    typeLifecycleOnly = false,
  } = {}
) {
  if (!Array.isArray(index)) return [];

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = index.filter((entry) => {
    if (typeLifecycleOnly && !isAttributeIndexTypeLifecycleEntry(entry)) return false;
    if (typeFilter && entry?.type !== typeFilter) return false;
    if (statusFilter && entry?.status !== statusFilter) return false;
    if (typeLifecycleOnly) {
      if (!entryMatchesTypeLifecycleVersionFilter(entry, versionFilter)) return false;
    } else if (!entryMatchesVersionFilter(entry, versionFilter)) {
      return false;
    }

    if (!normalizedQuery) return true;

    const haystack = [
      entry?.type,
      entry?.resource,
      entry?.attribute,
      entry?.status,
      entry?.latest_summary,
      entry?.introduced,
      entry?.last_updated,
      entry?.removed,
      ...(Array.isArray(entry?.history)
        ? entry.history.flatMap((item) => [item?.version, item?.change, item?.summary])
        : []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });

  return sortAttributeIndexEntries(filtered);
}

export function getIndexFilterOptions(index) {
  if (!Array.isArray(index)) {
    return { types: [], statuses: [] };
  }

  const types = [...new Set(index.map((entry) => entry?.type).filter(Boolean))].sort();
  const statuses = [...new Set(index.map((entry) => entry?.status).filter(Boolean))].sort();

  return { types, statuses };
}

export function getAttributeIndexHistoryForVersion(entry, versionFilter) {
  if (!versionFilter || !Array.isArray(entry?.history)) return [];

  const target = normalizeVersionForCompare(versionFilter);
  if (!target) return [];

  return entry.history.filter(
    (item) => normalizeVersionForCompare(item?.version) === target
  );
}

export function formatAttributeIndexRowSummary(entry, versionFilter = "") {
  const versionHistory = getAttributeIndexHistoryForVersion(entry, versionFilter);
  if (versionHistory.length) {
    return [
      ...new Set(
        versionHistory
          .map((item) => (item?.summary || "").trim())
          .filter(Boolean)
      ),
    ].join(" ");
  }

  return (entry?.latest_summary || "").trim();
}

export function formatAttributeIndexVersionEventLabel(entry, versionFilter = "") {
  if (!versionFilter) return "";

  const versionHistory = getAttributeIndexHistoryForVersion(entry, versionFilter);
  if (!versionHistory.length) return "";

  const label = toReleaseNotesVersion(versionFilter);
  const changes = new Set(
    versionHistory.map((item) => (item?.change || "").trim().toLowerCase()).filter(Boolean)
  );

  if (changes.has("removed")) return `Removed ${label}`;
  if (changes.has("added") && changes.size === 1) return `Introduced ${label}`;
  return `Changed ${label}`;
}

export function formatAttributeIndexType(type) {
  if (type === "data_source") return "Data source";
  if (type === "resource") return "Resource";
  if (type === "export_behavior") return "Export behavior";
  if (type === "provider_configuration") return "Provider configuration";
  return type || "Unknown";
}

export function formatAttributeIndexIntroducedLabel(value) {
  const normalized = (value || "").trim();
  if (!normalized || normalized.toLowerCase() === "unknown") return "";
  return `Introduced ${toReleaseNotesVersion(normalized)}`;
}

export function formatAttributeIndexLastChanged(lastUpdated, introduced) {
  const normalized = (lastUpdated || "").trim();
  if (!normalized) return "";
  if (normalizeVersionForCompare(normalized) === normalizeVersionForCompare(introduced)) {
    return "";
  }
  return `Changed ${toReleaseNotesVersion(normalized)}`;
}

export function attributeIndexEntryKey(entry) {
  return `${entry?.type || "unknown"}:${entry?.resource || "unknown"}:${entry?.attribute || "unknown"}`;
}
