import fs from "node:fs";
import path from "node:path";

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]+$/;

const ENV_NAME_PREFIXES = [
  "GENESYSCLOUD_",
  "ENABLE_",
  "BYPASS_",
  "BCP_",
  "TF_",
  "MRMO_",
  "ROUTING_",
  "OVERRIDE_",
  "USE_LOCAL_",
  "LOCAL_STACK",
  "CONSISTENCY_",
];

function looksLikeEnvVar(name) {
  return ENV_NAME_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isGoSourceFile(fileName) {
  return fileName.endsWith(".go") && !fileName.endsWith("_test.go");
}

function walkGoFiles(rootDir) {
  const files = [];

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "vendor" || entry.name.startsWith(".")) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (isGoSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

function addEnvName(names, value) {
  const trimmed = (value || "").trim();
  if (ENV_NAME_PATTERN.test(trimmed) && looksLikeEnvVar(trimmed)) {
    names.add(trimmed);
  }
}

function scanGoSource(content, names) {
  for (const match of content.matchAll(/EnvDefaultFunc\("([A-Z0-9_]+)"/g)) {
    addEnvName(names, match[1]);
  }

  for (const match of content.matchAll(/os\.(?:Getenv|LookupEnv)\("([A-Z0-9_]+)"\)/g)) {
    addEnvName(names, match[1]);
  }

  for (const match of content.matchAll(/=\s*"([A-Z][A-Z0-9_]+)"/g)) {
    addEnvName(names, match[1]);
  }
}

/**
 * Scan provider genesyscloud/ source for environment variable names used in
 * non-test Go files (feature toggles, provider schema, resource code).
 */
export function scanProviderEnvVars(providerRoot) {
  const names = new Set();
  const files = walkGoFiles(providerRoot);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    scanGoSource(content, names);
  }

  return [...names].sort();
}
