import { RESOURCE_NAME_PLACEHOLDER } from "./tfExportTemplate.js";

/** Normalize singletonResourceTypes from generated tf-export-singletons JSON. */
export function normalizeSingletonResourceTypes(value) {
  if (!Array.isArray(value)) return new Set();
  return new Set(
    value
      .filter((entry) => typeof entry === "string" && entry.trim())
      .map((entry) => entry.trim())
  );
}

function isSingletonByExporterFlag(resourceType, singletonResourceTypes) {
  const type = (resourceType || "").trim();
  if (!type) return false;

  if (singletonResourceTypes instanceof Set) {
    return singletonResourceTypes.has(type);
  }

  if (Array.isArray(singletonResourceTypes)) {
    return singletonResourceTypes.includes(type);
  }

  return false;
}

/** Pre-1.78.0 fallback: fixed tf-export block label (no placeholder segments). */
export function isSingletonByFixedExportName(resourceName) {
  const name = (resourceName || "").trim();
  if (!name || name === RESOURCE_NAME_PLACEHOLDER) return false;
  return !name.includes("<");
}

/**
 * True for org-wide singleton exporters.
 * Uses IsSingleton from provider source on 1.78.0+; fixed export block labels before that.
 */
export function isSingletonTfExportResource(
  resourceType,
  singletonResourceTypes,
  tfExportResourceName,
  useSingletonExporterFlag
) {
  if (useSingletonExporterFlag) {
    return isSingletonByExporterFlag(resourceType, singletonResourceTypes);
  }

  return isSingletonByFixedExportName(tfExportResourceName);
}
