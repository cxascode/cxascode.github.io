import { scanProviderDeprecatedResources } from "./deprecated-scan.mjs";
import { scanProviderCannotBeDestroyed } from "./non-deletable-scan.mjs";
import { scanProviderNonExportableResources } from "./non-exportable-scan.mjs";

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

export function buildResourceClassificationPayload(providerRoot, version = null) {
  const deprecated = scanProviderDeprecatedResources(providerRoot);
  const nonExportable = scanProviderNonExportableResources(providerRoot);
  const cannotBeDestroyed = scanProviderCannotBeDestroyed(providerRoot);

  return {
    version: version ? String(version).replace(/^v/i, "") : null,
    deprecatedResourceTypes: normalizeTypeList(deprecated.deprecatedResourceTypes),
    nonExportableResourceTypes: normalizeTypeList(nonExportable.nonExportableResourceTypes),
    cannotBeDestroyedResourceTypes: normalizeTypeList(
      cannotBeDestroyed.cannotBeDestroyedResourceTypes
    ),
  };
}

export function compareClassificationPayloads(expected, actual, label = "classification") {
  const mismatches = [];

  for (const key of CLASSIFICATION_KEYS) {
    const expectedList = normalizeTypeList(expected?.[key]);
    const actualList = normalizeTypeList(actual?.[key]);
    const expectedSet = new Set(expectedList);
    const actualSet = new Set(actualList);

    const missing = expectedList.filter((type) => !actualSet.has(type));
    const extra = actualList.filter((type) => !expectedSet.has(type));

    if (missing.length > 0 || extra.length > 0) {
      mismatches.push({ key, missing, extra });
    }
  }

  return {
    label,
    mismatches,
    ok: mismatches.length === 0,
  };
}
