import fs from "node:fs";
import path from "node:path";
import { SKIP_PACKAGES } from "./tf-export-block-label.mjs";

const RESOURCE_TYPE_PATTERN = /const\s+ResourceType\s*=\s*"([^"]+)"/;
const IS_SINGLETON_PATTERN = /IsSingleton:\s*true/;

function readPackageGoFiles(packageDir) {
  return fs
    .readdirSync(packageDir)
    .filter((entry) => entry.endsWith(".go") && !entry.endsWith("_test.go"))
    .map((entry) => ({
      name: entry,
      content: fs.readFileSync(path.join(packageDir, entry), "utf8"),
    }));
}

export function derivePackageSingleton(packageDir) {
  const files = readPackageGoFiles(packageDir);
  if (files.length === 0) return null;

  let resourceType = null;
  let isSingleton = false;

  for (const file of files) {
    if (!resourceType) {
      const match = file.content.match(RESOURCE_TYPE_PATTERN);
      if (match) resourceType = match[1];
    }
    if (IS_SINGLETON_PATTERN.test(file.content)) {
      isSingleton = true;
    }
  }

  if (!isSingleton || !resourceType) return null;
  return resourceType;
}

/** Resource types whose exporter sets IsSingleton: true in provider source. */
export function scanProviderSingletons(providerRoot) {
  const results = [];

  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    const resourceType = derivePackageSingleton(packageDir);
    if (resourceType) results.push(resourceType);
  }

  return results.sort((a, b) => a.localeCompare(b));
}
