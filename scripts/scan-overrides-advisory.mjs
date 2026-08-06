import path from "node:path";
import {
  getArgValue,
  loadOverridesJson,
  printAdvisorySection,
  resolveProviderRoot,
} from "./lib/advisory-overrides-report.mjs";
import { runOverridesAdvisory } from "./lib/run-overrides-advisory.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_OVERRIDES_PATH = path.resolve(REPO_ROOT, "public/overrides.json");

const providerRoot = resolveProviderRoot(REPO_ROOT);
const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);
const overrides = await loadOverridesJson(overridesPath);
const { reports, details } = runOverridesAdvisory(providerRoot, overrides);

console.log(`Scanned ${providerRoot}`);
console.log(`Compared against ${overridesPath}`);

printAdvisorySection("Deprecated resources (advisory)", reports.deprecatedResourceTypes, {
  details: details.deprecated,
});

printAdvisorySection(
  "Non-exportable resources (advisory)",
  reports.nonExportableResourceTypes,
  { details: details.nonExportable }
);

if (details.exportersWithoutGetResources?.length) {
  console.log("\nExporters missing GetResourcesFunc (informational):");
  console.log(JSON.stringify(details.exportersWithoutGetResources, null, 2));
}

printAdvisorySection("Cannot be destroyed resources (advisory)", reports.cannotBeDestroyedResourceTypes, {
  details: details.cannotBeDestroyed,
});

console.log(
  "\nAdvisory only — provider scans suggest candidates; curate public/overrides.json manually."
);
console.log("CI/build use verify-overrides-advisory.mjs to fail on blocking drift.");
