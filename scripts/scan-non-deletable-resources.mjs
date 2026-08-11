import path from "node:path";
import { scanProviderCannotBeDestroyed } from "./lib/non-deletable-scan.mjs";
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
const scanned = scanProviderCannotBeDestroyed(providerRoot);

const report = compareOverrideList(
  "cannotBeDestroyedResourceTypes",
  scanned.cannotBeDestroyedResourceTypes,
  classification
);

console.log(`Scanned ${providerRoot}`);
console.log(`Compared against ${classificationPath}`);
printAdvisorySection("Cannot be destroyed resources (advisory)", report, {
  details: scanned.details,
});
console.log(
  "\nAdvisory only — regenerate public/resource-classification/*.json after review."
);
