import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_PROVIDER_ROOT = path.resolve(
  import.meta.dirname,
  "../../terraform-provider-genesyscloud/genesyscloud"
);

export function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

export function resolveProviderRoot(repoRoot) {
  return path.resolve(getArgValue("provider-root") || DEFAULT_PROVIDER_ROOT);
}

export async function loadOverridesJson(overridesPath) {
  try {
    const raw = await fs.readFile(overridesPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

export function compareOverrideList(overrideKey, suggested, overrides = {}) {
  const current = Array.isArray(overrides[overrideKey])
    ? overrides[overrideKey].filter((entry) => typeof entry === "string").map((entry) => entry.trim())
    : [];

  const suggestedSet = new Set(suggested);
  const currentSet = new Set(current);

  return {
    overrideKey,
    suggested: [...suggestedSet].sort((a, b) => a.localeCompare(b)),
    inOverrides: suggested.filter((type) => currentSet.has(type)).sort((a, b) => a.localeCompare(b)),
    missingFromOverrides: suggested
      .filter((type) => !currentSet.has(type))
      .sort((a, b) => a.localeCompare(b)),
    extraInOverrides: current
      .filter((type) => !suggestedSet.has(type))
      .sort((a, b) => a.localeCompare(b)),
  };
}

export function printAdvisorySection(title, report, { details } = {}) {
  console.log(`\n=== ${title} ===\n`);
  console.log(`Override key: ${report.overrideKey}`);
  console.log(`Suggested (${report.suggested.length}):`);
  console.log(JSON.stringify(report.suggested, null, 2));

  if (report.inOverrides.length) {
    console.log(`\nAlready in overrides (${report.inOverrides.length}):`);
    console.log(JSON.stringify(report.inOverrides, null, 2));
  }

  if (report.missingFromOverrides.length) {
    console.log(`\nMissing from overrides (${report.missingFromOverrides.length}):`);
    console.log(JSON.stringify(report.missingFromOverrides, null, 2));
  }

  if (report.extraInOverrides.length) {
    console.log(`\nExtra in overrides — review manually (${report.extraInOverrides.length}):`);
    console.log(JSON.stringify(report.extraInOverrides, null, 2));
  }

  if (details && Object.keys(details).length > 0) {
    console.log("\nDetails:");
    console.log(JSON.stringify(details, null, 2));
  }
}
