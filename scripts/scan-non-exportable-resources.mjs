import path from "node:path";
import { scanProviderNonExportableResources } from "./lib/non-exportable-scan.mjs";
import {
  compareOverrideList,
  getArgValue,
  loadOverridesJson,
  printAdvisorySection,
  resolveProviderRoot,
} from "./lib/advisory-overrides-report.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_OVERRIDES_PATH = path.resolve(REPO_ROOT, "public/overrides.json");

const providerRoot = resolveProviderRoot(REPO_ROOT);
const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);
const overrides = await loadOverridesJson(overridesPath);
const scanned = scanProviderNonExportableResources(providerRoot);

const report = compareOverrideList(
  "nonExportableResourceTypes",
  scanned.nonExportableResourceTypes,
  overrides
);

console.log(`Scanned ${providerRoot}`);
console.log(`Compared against ${overridesPath}`);
printAdvisorySection("Non-exportable resources (advisory)", report, {
  details: scanned.details,
});

if (scanned.exportersWithoutGetResources.length) {
  console.log("\nAlso review exporters missing GetResourcesFunc (informational):");
  console.log(JSON.stringify(scanned.exportersWithoutGetResources, null, 2));
}

console.log(
  "\nAdvisory only — not every type without an exporter needs the badge (e.g. action resources)."
);
console.log("Merge intentional types into public/overrides.json after review.");
