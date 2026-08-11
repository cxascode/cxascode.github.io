export function getHiddenResourceTypes(overrides) {
  const hidden = overrides?.hiddenResourceTypes;
  if (!Array.isArray(hidden)) return new Set();

  return new Set(
    hidden
      .filter((entry) => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean)
  );
}

/** Default link substrings that exclude admin routes from supported-resources (override in src/private-overrides.json). */
export const DEFAULT_SUPPORTED_RESOURCES_ADMIN_EXCLUSION_KEYWORDS = [
  "troubleshooting",
  "platformusage",
  "embed/analytics",
  "live-now",
  "billing/summary",
  "#/admin/usage",
  "wfm/adherence",
  "wfm/shrinkage",
  "intradayMonitoring",
  "main-forecast",
  "wfm/schedules",
  "shiftTrades",
  "workPlanV2/assignments",
  "historicalImportV2",
  "quality/agentEvaluations",
  "quality/calibrations",
  "quality/evaluators",
  "quality/encryptionKeys",
  "telephony/cloud-media",
  "telephony/edges",
  "telephony/topology",
  "telecom/numbers",
  "outbound/admin/eventViewer",
  "routing/disconnectInteractions",
];

function normalizeAdminExclusionKeywordList(keywords) {
  if (!Array.isArray(keywords)) return null;
  return keywords
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim());
}

/**
 * Admin link substrings excluded from supported-resources after the admin/non-admin split.
 */
function getSupportedResourcesTemplates(overrides) {
  return overrides?.supportedResourcesTemplates;
}

export function getSupportedResourcesAdminExclusionKeywords(overrides) {
  const custom =
    getSupportedResourcesTemplates(overrides)?.adminExclusionKeywords ||
    overrides?.supportedResourcesAdminExclusionKeywords ||
    overrides?.supportedResourcesDestinationKeywords;

  if (Array.isArray(custom)) {
    return normalizeAdminExclusionKeywordList(custom) || [...DEFAULT_SUPPORTED_RESOURCES_ADMIN_EXCLUSION_KEYWORDS];
  }

  if (custom && typeof custom === "object") {
    const flattened = Object.values(custom).flatMap((entry) =>
      Array.isArray(entry) ? entry : []
    );
    const normalized = normalizeAdminExclusionKeywordList(flattened);
    if (normalized?.length) return normalized;
  }

  return [...DEFAULT_SUPPORTED_RESOURCES_ADMIN_EXCLUSION_KEYWORDS];
}

function normalizeKeywordList(keywords) {
  if (!Array.isArray(keywords)) return null;
  return keywords
    .filter((entry) => typeof entry === "string" && entry.trim())
    .map((entry) => entry.trim());
}

/**
 * Feature-toggle name substrings that bypass preview exclusion (step 2).
 * Unmapped toggle-gated paths whose toggle contains any keyword are included on the sheet.
 */
export function getSupportedResourcesFeatureToggleKeywords(overrides) {
  const custom =
    getSupportedResourcesTemplates(overrides)?.featureToggleKeywords ||
    overrides?.supportedResourcesFeatureToggleKeywords;
  return normalizeKeywordList(custom) || [];
}


import { classificationTypeSet, resolveClassificationTypeSets } from "../../src/resourceClassification.js";

export function getDeprecatedResourceTypes(classification, overrides = null) {
  return resolveClassificationTypeSets(classification, overrides).deprecatedTypes;
}

export function getNonExportableResourceTypes(classification, overrides = null) {
  return resolveClassificationTypeSets(classification, overrides).nonExportableTypes;
}

export function getCannotBeDestroyedResourceTypes(classification, overrides = null) {
  return resolveClassificationTypeSets(classification, overrides).cannotBeDestroyedTypes;
}

export function getClassificationTypeSet(classification, key, overrides = null) {
  const sets = resolveClassificationTypeSets(classification, overrides);
  if (key === "deprecatedResourceTypes") return sets.deprecatedTypes;
  if (key === "nonExportableResourceTypes") return sets.nonExportableTypes;
  if (key === "cannotBeDestroyedResourceTypes") return sets.cannotBeDestroyedTypes;
  return classificationTypeSet(classification, key);
}

export function applyOverrides(raw, overrides) {
  if (!raw || !Array.isArray(raw.resources)) return raw;
  if (!overrides || typeof overrides !== "object") return raw;

  const patched = {
    ...raw,
    resources: raw.resources.map((resource) => ({ ...resource })),
  };

  const byType = new Map();
  for (const resource of patched.resources) {
    if (resource && typeof resource.type === "string") {
      byType.set(resource.type, resource);
    }
  }

  const replace = overrides.replaceDependencies;
  if (replace && typeof replace === "object") {
    for (const [type, mapping] of Object.entries(replace)) {
      const resource = byType.get(type);
      if (
        !resource ||
        !Array.isArray(resource.dependencies) ||
        typeof mapping !== "object"
      ) {
        continue;
      }

      resource.dependencies = resource.dependencies.map((dependency) =>
        typeof dependency === "string" ? mapping[dependency] || dependency : dependency
      );
    }
  }

  const add = overrides.addDependencies;
  if (add && typeof add === "object") {
    for (const [type, additions] of Object.entries(add)) {
      if (!Array.isArray(additions)) continue;

      const resource = byType.get(type);
      if (!resource) continue;

      const current = Array.isArray(resource.dependencies) ? resource.dependencies : [];
      const set = new Set(current.filter((dependency) => typeof dependency === "string"));

      for (const dependency of additions) {
        if (typeof dependency === "string" && dependency.trim()) {
          set.add(dependency.trim());
        }
      }

      resource.dependencies = [...set];
    }
  }

  return patched;
}
