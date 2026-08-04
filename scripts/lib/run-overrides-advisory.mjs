import { scanProviderDeprecatedResources } from "./deprecated-scan.mjs";
import { scanProviderCannotBeDestroyed } from "./non-deletable-scan.mjs";
import { scanProviderNonExportableResources } from "./non-exportable-scan.mjs";
import { compareOverrideList } from "./advisory-overrides-report.mjs";

/** Drift in these keys fails verify-overrides-advisory (provider added a new signal). */
export const FAIL_ON_MISSING_OVERRIDE_KEYS = [
  "deprecatedResourceTypes",
  "cannotBeDestroyedResourceTypes",
];

/** Report-only keys — scan suggests candidates but overrides are curated manually. */
export const ADVISORY_ONLY_OVERRIDE_KEYS = ["nonExportableResourceTypes"];

export function runOverridesAdvisory(providerRoot, overrides = {}) {
  const deprecated = scanProviderDeprecatedResources(providerRoot);
  const nonExportable = scanProviderNonExportableResources(providerRoot);
  const cannotBeDestroyed = scanProviderCannotBeDestroyed(providerRoot);

  const reports = {
    deprecatedResourceTypes: compareOverrideList(
      "deprecatedResourceTypes",
      deprecated.deprecatedResourceTypes,
      overrides
    ),
    nonExportableResourceTypes: compareOverrideList(
      "nonExportableResourceTypes",
      nonExportable.nonExportableResourceTypes,
      overrides
    ),
    cannotBeDestroyedResourceTypes: compareOverrideList(
      "cannotBeDestroyedResourceTypes",
      cannotBeDestroyed.cannotBeDestroyedResourceTypes,
      overrides
    ),
  };

  const details = {
    deprecated: deprecated.details,
    nonExportable: nonExportable.details,
    cannotBeDestroyed: cannotBeDestroyed.details,
    exportersWithoutGetResources: nonExportable.exportersWithoutGetResources,
  };

  const blockingMissing = FAIL_ON_MISSING_OVERRIDE_KEYS.flatMap(
    (key) => reports[key].missingFromOverrides
  );

  return {
    reports,
    details,
    blockingMissing,
    hasBlockingDrift: blockingMissing.length > 0,
  };
}
