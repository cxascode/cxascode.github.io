import path from "node:path";
import {
  getArgValue,
  printAdvisorySection,
  resolveProviderRoot,
} from "./lib/advisory-overrides-report.mjs";
import {
  loadClassificationJson,
  resolveClassificationPath,
  runClassificationAdvisory,
} from "./lib/run-classification-advisory.mjs";
import { resolveLatestProviderVersion } from "./lib/verify-resource-classification.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const versionArg = (getArgValue("version") || getArgValue("latest") || "").trim();
const version = versionArg
  ? versionArg.replace(/^v/i, "")
  : await resolveLatestProviderVersion(REPO_ROOT);
const classificationPath = path.resolve(
  getArgValue("classification") || resolveClassificationPath(REPO_ROOT, version)
);

const providerRoot = resolveProviderRoot(REPO_ROOT);
const classification = await loadClassificationJson(classificationPath);
const { reports, details } = runClassificationAdvisory(providerRoot, classification);

console.log(`Scanned ${providerRoot}`);
console.log(`Compared against ${classificationPath}`);

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
  "\nAdvisory only — provider scans suggest candidates; regenerate public/resource-classification/*.json after review."
);
console.log("CI/build use verify-overrides-advisory.mjs to fail on classification drift.");
