import { scanProviderRegistrations } from "./provider-registration-scan.mjs";

/** Meta resources that should not appear in non-exportable badge suggestions. */
export const NON_EXPORTABLE_SCAN_IGNORE = new Set([
  "genesyscloud_bcp_tf_exporter",
  "genesyscloud_tf_export",
]);

/**
 * Resource types registered without a matching RegisterExporter, plus exporters
 * missing GetResourcesFunc (weaker signal).
 */
export function scanProviderNonExportableResources(providerRoot) {
  const { resources, exporters, exportersWithoutGetResources } =
    scanProviderRegistrations(providerRoot);

  const exporterSet = new Set(exporters);
  const noExporterRegistered = resources.filter(
    (type) => !exporterSet.has(type) && !NON_EXPORTABLE_SCAN_IGNORE.has(type)
  );

  const missingGetResources = exportersWithoutGetResources.filter(
    (type) => !NON_EXPORTABLE_SCAN_IGNORE.has(type)
  );

  const suggested = [...noExporterRegistered].sort((a, b) => a.localeCompare(b));

  const details = {};
  for (const type of noExporterRegistered) {
    details[type] = { reason: "RegisterResource without RegisterExporter" };
  }
  for (const type of missingGetResources) {
    details[type] = {
      reason: "RegisterExporter without GetResourcesFunc",
      ...(details[type] || {}),
    };
  }

  return {
    nonExportableResourceTypes: suggested,
    noExporterRegistered: suggested,
    exportersWithoutGetResources: missingGetResources.sort((a, b) => a.localeCompare(b)),
    details,
  };
}
