import path from "node:path";
import { scanProviderCannotBeDestroyed } from "./lib/non-deletable-scan.mjs";
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
const scanned = scanProviderCannotBeDestroyed(providerRoot);

const report = compareOverrideList(
  "cannotBeDestroyedResourceTypes",
  scanned.cannotBeDestroyedResourceTypes,
  overrides
);

console.log(`Scanned ${providerRoot}`);
console.log(`Compared against ${overridesPath}`);
printAdvisorySection("Cannot be destroyed resources (advisory)", report, {
  details: scanned.details,
});
console.log(
  "\nAdvisory only — merge into public/overrides.json → cannotBeDestroyedResourceTypes after review."
);
