import fs from "node:fs/promises";
import path from "node:path";
import { ensureProviderSource } from "./lib/provider-source.mjs";
import { scanProviderEnvVars } from "./lib/tf-export-env-vars-scan.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const CATALOG_PATH = path.resolve(REPO_ROOT, "public/provider-env-vars.json");
const DEPENDENCY_DIR = path.resolve(REPO_ROOT, "public/dependency-tree-json");

const AUTO_CATALOG_DESCRIPTION = "Provider environment variable (auto-cataloged; update description)";

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeCatalog(catalog) {
  await fs.writeFile(CATALOG_PATH, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
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
  if (!Array.isArray(index) || index.length === 0) {
    throw new Error("No provider version found in public/dependency-tree-json/");
  }

  return String(index[0]).replace(/^v/, "");
}

function defaultValueHint(name) {
  return name.endsWith("_MAX") || name.endsWith("_TIMEOUT") ? "" : "1";
}

function createCatalogEntry(name) {
  return {
    name,
    valueHint: defaultValueHint(name),
    description: AUTO_CATALOG_DESCRIPTION,
    "export-template": [],
  };
}

function loadCatalogMaps(catalog) {
  const byName = new Map();
  const ignored = new Set();

  if (!Array.isArray(catalog.providerEnvVars)) {
    catalog.providerEnvVars = [];
  }

  if (!Array.isArray(catalog.providerEnvVarsIgnore)) {
    catalog.providerEnvVarsIgnore = [];
  }

  for (const entry of catalog.providerEnvVars) {
    if (typeof entry?.name === "string" && entry.name.trim()) {
      byName.set(entry.name.trim(), entry);
    }
  }

  for (const name of catalog.providerEnvVarsIgnore) {
    if (typeof name === "string" && name.trim()) {
      ignored.add(name.trim());
    }
  }

  return { byName, ignored };
}

function hasExportTemplate(entry) {
  const exportTemplate = entry?.["export-template"];
  return Array.isArray(exportTemplate) && exportTemplate.length > 0;
}

function catalogNewVars(catalog, discovered, byName) {
  const added = [];

  for (const name of discovered) {
    if (byName.has(name)) continue;
    const entry = createCatalogEntry(name);
    catalog.providerEnvVars.push(entry);
    byName.set(name, entry);
    added.push(name);
  }

  return added;
}

function findTriageNeeded(discovered, byName, ignored) {
  const needsTriage = [];

  for (const name of discovered) {
    const entry = byName.get(name);
    if (!entry) continue;
    if (!hasExportTemplate(entry) && !ignored.has(name)) {
      needsTriage.push(name);
    }
  }

  return needsTriage;
}

async function main() {
  const catalog = await loadJson(CATALOG_PATH);
  const providerArg = getArgValue("provider");
  const version = await resolveLatestVersion();
  const providerRoot = providerArg
    ? path.resolve(providerArg)
    : await ensureProviderSource(version);
  const discovered = scanProviderEnvVars(providerRoot);
  let { byName, ignored } = loadCatalogMaps(catalog);

  const added = catalogNewVars(catalog, discovered, byName);

  if (added.length > 0) {
    await writeCatalog(catalog);
    console.log(
      `Auto-cataloged ${added.length} new environment variable(s) in public/provider-env-vars.json:`
    );
    for (const name of added) {
      console.log(`  - ${name}`);
    }
    console.log("");
  }

  const needsTriage = findTriageNeeded(discovered, byName, ignored);

  if (needsTriage.length > 0) {
    console.error(
      `${needsTriage.length} environment variable(s) need triage for provider v${version}:`
    );
    for (const name of needsTriage) {
      console.error(`  - ${name}`);
    }
    console.error("");
    console.error(
      "Assign export-template resource types to use in export templates, or add the name to providerEnvVarsIgnore to skip."
    );
    if (added.length > 0) {
      console.error("Commit public/provider-env-vars.json with your triage changes.");
    }
    process.exit(1);
  }

  console.log(
    `provider-env-vars verified for provider v${version} (${discovered.length} discovered, ${byName.size} cataloged, ${ignored.size} ignored).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
