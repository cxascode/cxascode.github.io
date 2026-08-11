export const CLASSIFICATION_KEYS = [
  "deprecatedResourceTypes",
  "nonExportableResourceTypes",
  "cannotBeDestroyedResourceTypes",
];

function normalizeTypeList(values) {
  if (!Array.isArray(values)) return [];

  return [
    ...new Set(
      values
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function normalizeClassificationDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      version: null,
      deprecatedResourceTypes: [],
      nonExportableResourceTypes: [],
      cannotBeDestroyedResourceTypes: [],
    };
  }

  return {
    version: value.version || null,
    deprecatedResourceTypes: normalizeTypeList(value.deprecatedResourceTypes),
    nonExportableResourceTypes: normalizeTypeList(value.nonExportableResourceTypes),
    cannotBeDestroyedResourceTypes: normalizeTypeList(value.cannotBeDestroyedResourceTypes),
  };
}

export function classificationTypeSet(classification, key) {
  const document = normalizeClassificationDocument(classification);
  return new Set(document[key] || []);
}

export function resolveClassificationTypeSets(classification, overrides = null) {
  const document = normalizeClassificationDocument(classification);
  const extras = overrides?.classificationExtras;

  return {
    deprecatedTypes: mergeClassificationTypes(document.deprecatedResourceTypes, extras?.deprecatedResourceTypes),
    nonExportableTypes: mergeClassificationTypes(
      document.nonExportableResourceTypes,
      extras?.nonExportableResourceTypes
    ),
    cannotBeDestroyedTypes: mergeClassificationTypes(
      document.cannotBeDestroyedResourceTypes,
      extras?.cannotBeDestroyedResourceTypes
    ),
  };
}

function mergeClassificationTypes(baseTypes, extraTypes) {
  return new Set([...normalizeTypeList(baseTypes), ...normalizeTypeList(extraTypes)]);
}
