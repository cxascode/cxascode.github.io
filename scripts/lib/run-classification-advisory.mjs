import fs from "node:fs/promises";
import path from "node:path";
import { scanProviderDeprecatedResources } from "./deprecated-scan.mjs";
import { scanProviderCannotBeDestroyed } from "./non-deletable-scan.mjs";
import { scanProviderNonExportableResources } from "./non-exportable-scan.mjs";
import { compareOverrideList } from "./advisory-overrides-report.mjs";
import { normalizeClassificationDocument } from "../../src/resourceClassification.js";

export const CLASSIFICATION_KEYS = [
  "deprecatedResourceTypes",
  "nonExportableResourceTypes",
  "cannotBeDestroyedResourceTypes",
];

/** Drift in these keys fails verify-resource-classification during CI/build. */
export const FAIL_ON_CLASSIFICATION_DRIFT_KEYS = [
  "deprecatedResourceTypes",
  "cannotBeDestroyedResourceTypes",
];

/** Report-only keys — scan may suggest more than the committed artifact lists. */
export const ADVISORY_ONLY_CLASSIFICATION_KEYS = ["nonExportableResourceTypes"];

export function runClassificationAdvisory(providerRoot, classification = {}) {
  const deprecated = scanProviderDeprecatedResources(providerRoot);
  const nonExportable = scanProviderNonExportableResources(providerRoot);
  const cannotBeDestroyed = scanProviderCannotBeDestroyed(providerRoot);
  const normalized = normalizeClassificationDocument(classification);

  const reports = {
    deprecatedResourceTypes: compareOverrideList(
      "deprecatedResourceTypes",
      deprecated.deprecatedResourceTypes,
      normalized
    ),
    nonExportableResourceTypes: compareOverrideList(
      "nonExportableResourceTypes",
      nonExportable.nonExportableResourceTypes,
      normalized
    ),
    cannotBeDestroyedResourceTypes: compareOverrideList(
      "cannotBeDestroyedResourceTypes",
      cannotBeDestroyed.cannotBeDestroyedResourceTypes,
      normalized
    ),
  };

  const details = {
    deprecated: deprecated.details,
    nonExportable: nonExportable.details,
    cannotBeDestroyed: cannotBeDestroyed.details,
    exportersWithoutGetResources: nonExportable.exportersWithoutGetResources,
  };

  const blockingMissing = FAIL_ON_CLASSIFICATION_DRIFT_KEYS.flatMap(
    (key) => reports[key].missingFromOverrides
  );

  return {
    reports,
    details,
    blockingMissing,
    hasBlockingDrift: blockingMissing.length > 0,
  };
}

export async function loadClassificationJson(classificationPath) {
  try {
    const raw = await fs.readFile(classificationPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

export function resolveClassificationPath(repoRoot, version) {
  return path.resolve(
    repoRoot,
    "public/resource-classification",
    `${String(version).replace(/^v/i, "")}.json`
  );
}
