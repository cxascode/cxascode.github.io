import { RELEASE_NOTES_DATA_PATH, toReleaseNotesVersion } from "./releaseNotes.js";

const BASE = import.meta.env.BASE_URL;

export const ATTRIBUTE_INDEX_MIN_VERSION = "v1.60.0";

export const ATTRIBUTE_INDEX_DESCRIPTION =
  `This index is generated from the release notes available on this site. Introduced is omitted when the item existed before ${ATTRIBUTE_INDEX_MIN_VERSION}.`;

export const RESOURCE_ATTRIBUTE_INDEX_JSON_URL =
  `${BASE}${RELEASE_NOTES_DATA_PATH}/resource-attribute-index.json`;
export const RESOURCE_ATTRIBUTE_INDEX_MD_URL =
  `${BASE}${RELEASE_NOTES_DATA_PATH}/resource-attribute-index.md`;

let indexCache = null;

export async function fetchResourceAttributeIndex() {
  if (indexCache) return indexCache;

  const res = await fetch(RESOURCE_ATTRIBUTE_INDEX_JSON_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch attribute index: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (!Array.isArray(json)) {
    throw new Error("Attribute index is not an array");
  }

  indexCache = json;
  return json;
}

export async function fetchResourceAttributeIndexMarkdown() {
  const res = await fetch(RESOURCE_ATTRIBUTE_INDEX_MD_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch attribute index: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

export function filterIndexForResource(index, resourceType) {
  const type = (resourceType || "").trim();
  if (!type || !Array.isArray(index)) return [];

  return index
    .filter((entry) => entry?.resource === type)
    .sort((a, b) => String(a.attribute).localeCompare(String(b.attribute)));
}

export function filterIndexEntries(index, { query = "", typeFilter = "", statusFilter = "" } = {}) {
  if (!Array.isArray(index)) return [];

  const normalizedQuery = query.trim().toLowerCase();

  return index.filter((entry) => {
    if (typeFilter && entry?.type !== typeFilter) return false;
    if (statusFilter && entry?.status !== statusFilter) return false;

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
}

export function getIndexFilterOptions(index) {
  if (!Array.isArray(index)) {
    return { types: [], statuses: [] };
  }

  const types = [...new Set(index.map((entry) => entry?.type).filter(Boolean))].sort();
  const statuses = [...new Set(index.map((entry) => entry?.status).filter(Boolean))].sort();

  return { types, statuses };
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

function normalizeVersionForCompare(value) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed || trimmed === "unknown") return "";
  return trimmed.startsWith("v") ? trimmed.slice(1) : trimmed;
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
