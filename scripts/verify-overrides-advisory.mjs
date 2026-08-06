import fs from "node:fs/promises";
import path from "node:path";
import { filterDependencyTreeVersionIds } from "./lib/public-data-path-constants.mjs";
import { ensureProviderSource } from "./lib/provider-source.mjs";
import {
  getArgValue,
  loadOverridesJson,
  printAdvisorySection,
  resolveProviderRoot,
} from "./lib/advisory-overrides-report.mjs";
import {
  ADVISORY_ONLY_OVERRIDE_KEYS,
  FAIL_ON_MISSING_OVERRIDE_KEYS,
  runOverridesAdvisory,
} from "./lib/run-overrides-advisory.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_OVERRIDES_PATH = path.resolve(REPO_ROOT, "public/overrides.json");
const DEPENDENCY_DIR = path.resolve(REPO_ROOT, "public/dependency-tree-json");

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function resolveLatestVersion() {
  const versionArg = (getArgValue("version") || getArgValue("latest") || "").trim();
  if (versionArg) return versionArg.replace(/^v/, "");

  const latestPath = path.join(DEPENDENCY_DIR, "latest.json");
  try {
    const latest = await loadJson(latestPath);
    if (latest?.version) {
      return String(latest.version).replace(/^v/, "");
    }
  } catch {
    // fall through
  }

  const indexPath = path.join(DEPENDENCY_DIR, "index.json");
  const index = await loadJson(indexPath);
  const versions = filterDependencyTreeVersionIds(index);
  if (versions.length === 0) {
    throw new Error("No provider version found in public/dependency-tree-json/");
  }

  return String(versions[0]).replace(/^v/, "");
}

async function resolveScanProviderRoot() {
  const providerRootArg = getArgValue("provider-root");
  if (providerRootArg) {
    return path.resolve(providerRootArg);
  }

  const latestVersion = await resolveLatestVersion();
  return ensureProviderSource(latestVersion);
}

const providerRoot = await resolveScanProviderRoot();
const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);
const overrides = await loadOverridesJson(overridesPath);
const { reports, details, blockingMissing, hasBlockingDrift } = runOverridesAdvisory(
  providerRoot,
  overrides
);

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

console.log("\n--- verify summary ---");
console.log(
  `Blocking drift (missing ${FAIL_ON_MISSING_OVERRIDE_KEYS.join(", ")}): ${
    hasBlockingDrift ? blockingMissing.join(", ") : "none"
  }`
);
console.log(
  `Advisory-only keys (never fail verify): ${ADVISORY_ONLY_OVERRIDE_KEYS.join(", ")}`
);

if (hasBlockingDrift) {
  console.error(
    "\nverify-overrides-advisory failed: update public/overrides.json for newly detected provider signals."
  );
  process.exit(1);
}

console.log("\nverify-overrides-advisory passed.");
