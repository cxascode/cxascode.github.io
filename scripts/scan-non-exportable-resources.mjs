import path from "node:path";
import { scanProviderNonExportableResources } from "./lib/non-exportable-scan.mjs";
import {
  compareOverrideList,
  getArgValue,
  printAdvisorySection,
  resolveProviderRoot,
} from "./lib/advisory-overrides-report.mjs";
import {
  loadClassificationJson,
  resolveClassificationPath,
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
const scanned = scanProviderNonExportableResources(providerRoot);

const report = compareOverrideList(
  "nonExportableResourceTypes",
  scanned.nonExportableResourceTypes,
  classification
);

console.log(`Scanned ${providerRoot}`);
console.log(`Compared against ${classificationPath}`);
printAdvisorySection("Non-exportable resources (advisory)", report, {
  details: scanned.details,
});

if (scanned.exportersWithoutGetResources.length) {
  console.log("\nAlso review exporters missing GetResourcesFunc (informational):");
  console.log(JSON.stringify(scanned.exportersWithoutGetResources, null, 2));
}

console.log(
  "\nAdvisory only — regenerate public/resource-classification/*.json after review."
);
