import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { computeCreationOrder } from "../src/dependencyOrder.js";
import { effectiveDependencies } from "../src/effectiveDependencies.js";
import {
  isSingletonTfExportResource,
  normalizeSingletonResourceTypes,
} from "../src/tfExportSingletons.js";
import { resolveTfExportResourceName } from "../src/tfExportTemplate.js";
import {
  applyOverrides,
  getDeprecatedResourceTypes,
  getHiddenResourceTypes,
  getNonExportableResourceTypes,
} from "./lib/dependency-tree-overrides.mjs";
import {
  MIN_SINGLETON_FLAG_VERSION,
  TF_EXPORT_RESOURCE_NAMES_DIR,
  TF_EXPORT_SINGLETONS_DIR,
} from "./lib/public-data-path-constants.mjs";

const INPUT_DIR = path.resolve("public/dependency-tree-json");
const OUTPUT_DIR = path.resolve("public/spreadsheet-templates");
const PUBLIC_DIR = path.resolve("public");
const TEMPLATE_PATH = path.resolve(
  "scripts/templates/cx-as-code-spreadsheet-template.xlsx"
);
const DEFAULT_OVERRIDES_PATH = path.resolve("public/overrides.json");

const AUTH_DIVISION_RESOURCE_TYPE = "genesyscloud_auth_division";
const SPREADSHEET_SINGLETON_NOTE = "Org-wide singleton";
const SPREADSHEET_DEPRECATED_NOTE = "Deprecated";
const SPREADSHEET_NON_EXPORTABLE_NOTE = "Non-exportable";

const GRAY_FILL = {
  type: "pattern",
  pattern: "solid",
  fgColor: { theme: 2 },
  bgColor: { indexed: 64 },
};

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function resolveGuiMenuPath(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return "TBD";

  const paths = overrides?.guiMenuPaths;
  if (!paths || typeof paths !== "object") return "TBD";

  const menuPath = paths[type];
  const trimmed = typeof menuPath === "string" ? menuPath.trim() : "";
  return trimmed || "TBD";
}

function resolveSpreadsheetScopePrefix(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return null;

  const prefixGroups = overrides?.spreadsheetScopePrefixes;
  if (!prefixGroups || typeof prefixGroups !== "object") return null;

  for (const [prefix, resourceTypes] of Object.entries(prefixGroups)) {
    if (typeof prefix !== "string" || !prefix) continue;
    if (!Array.isArray(resourceTypes)) continue;

    if (resourceTypes.some((entry) => typeof entry === "string" && entry.trim() === type)) {
      return prefix;
    }
  }

  return null;
}

function isDivisionAware(dependencies) {
  if (!Array.isArray(dependencies)) return false;
  return dependencies.includes(AUTH_DIVISION_RESOURCE_TYPE);
}

function compareVersions(a, b) {
  const aParts = String(a)
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  const bParts = String(b)
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => Number.parseInt(n, 10) || 0);
  const length = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < length; i += 1) {
    const av = aParts[i] ?? 0;
    const bv = bParts[i] ?? 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }

  return 0;
}

async function loadTfExportCatalog(version) {
  const singletonPath = path.join(PUBLIC_DIR, TF_EXPORT_SINGLETONS_DIR, `${version}.json`);
  const namesPath = path.join(PUBLIC_DIR, TF_EXPORT_RESOURCE_NAMES_DIR, `${version}.json`);

  let singletonTypes = new Set();
  let resourceNames = {};

  try {
    const json = JSON.parse(await fs.readFile(singletonPath, "utf8"));
    singletonTypes = normalizeSingletonResourceTypes(json?.singletonResourceTypes);
  } catch {
    // tf-export-singletons may be missing before local bootstrap
  }

  try {
    const json = JSON.parse(await fs.readFile(namesPath, "utf8"));
    resourceNames =
      json?.tfExportResourceNames && typeof json.tfExportResourceNames === "object"
        ? json.tfExportResourceNames
        : {};
  } catch {
    // tf-export-resource-names may be missing before local bootstrap
  }

  return {
    singletonTypes,
    resourceNames,
    useSingletonExporterFlag: compareVersions(version, MIN_SINGLETON_FLAG_VERSION) >= 0,
  };
}

function resolveSpreadsheetNotes(
  resourceType,
  overrides,
  tfExportCatalog,
  deprecatedTypes,
  nonExportableTypes
) {
  const notes = [];

  const resourceName = resolveTfExportResourceName(
    resourceType,
    overrides,
    tfExportCatalog.resourceNames
  );
  const isSingleton = isSingletonTfExportResource(
    resourceType,
    tfExportCatalog.singletonTypes,
    resourceName,
    tfExportCatalog.useSingletonExporterFlag
  );
  if (isSingleton) notes.push(SPREADSHEET_SINGLETON_NOTE);
  if (deprecatedTypes.has(resourceType)) notes.push(SPREADSHEET_DEPRECATED_NOTE);
  if (nonExportableTypes.has(resourceType)) notes.push(SPREADSHEET_NON_EXPORTABLE_NOTE);

  return notes.length > 0 ? notes.join("; ") : "";
}

function buildDepsMap(raw) {
  const depsMap = new Map();

  if (!raw || !Array.isArray(raw.resources)) {
    return depsMap;
  }

  for (const resource of raw.resources) {
    if (!resource || typeof resource.type !== "string") continue;

    const from = resource.type;
    const deps = Array.isArray(resource.dependencies) ? resource.dependencies : [];

    if (!depsMap.has(from)) depsMap.set(from, new Set());

    for (const dep of deps) {
      if (typeof dep !== "string") continue;
      depsMap.get(from).add(dep);
    }
  }

  return depsMap;
}

function buildTierByType(tiers) {
  const tierByType = new Map();

  for (let index = 0; index < tiers.length; index += 1) {
    for (const type of tiers[index]) {
      tierByType.set(type, index + 1);
    }
  }

  return tierByType;
}

function buildResourceRows(raw, overrides, tfExportCatalog) {
  const hidden = getHiddenResourceTypes(overrides);
  const deprecatedTypes = getDeprecatedResourceTypes(overrides);
  const nonExportableTypes = getNonExportableResourceTypes(overrides);
  const patched = applyOverrides(raw, overrides);
  const byType = new Map();

  for (const resource of patched.resources || []) {
    if (!resource || typeof resource.type !== "string") continue;
    if (hidden.has(resource.type)) continue;
    byType.set(resource.type, resource);
  }

  const depsMap = buildDepsMap(patched);
  const { flatOrder, tiers } = computeCreationOrder(depsMap, { hiddenTypes: hidden });
  const tierByType = buildTierByType(tiers);
  const orderedTypes = [...flatOrder];

  const orderedSet = new Set(orderedTypes);
  const remaining = [...byType.keys()]
    .filter((type) => !orderedSet.has(type))
    .sort((a, b) => a.localeCompare(b));

  orderedTypes.push(...remaining);

  return orderedTypes.map((type) => {
    const resource = byType.get(type);
    const allDependencies = Array.isArray(resource?.dependencies)
      ? resource.dependencies.filter((d) => typeof d === "string")
      : [];
    const dependencies = effectiveDependencies(type, allDependencies);

    return {
      menuPath: resolveGuiMenuPath(type, overrides),
      resourceType: type,
      divisionAware: isDivisionAware(allDependencies) ? "Yes" : "No",
      dependencyCount: dependencies.length,
      scopePrefix: resolveSpreadsheetScopePrefix(type, overrides),
      priority: tierByType.get(type) ?? null,
      notes: resolveSpreadsheetNotes(
        type,
        overrides,
        tfExportCatalog,
        deprecatedTypes,
        nonExportableTypes
      ),
    };
  });
}

async function loadOverrides() {
  const overridesPath = path.resolve(
    getArgValue("overrides") || DEFAULT_OVERRIDES_PATH
  );
  console.log(`Loading overrides from ${overridesPath}`);

  try {
    const raw = await fs.readFile(overridesPath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log("No overrides file found, continuing without overrides.");
      return {};
    }
    throw err;
  }
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeWorkbook(rows, outPath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Spreadsheet template is missing a worksheet.");
  }

  const lastRow = worksheet.rowCount;
  if (lastRow > 1) {
    worksheet.spliceRows(2, lastRow - 1);
  }

  for (let i = 0; i < rows.length; i += 1) {
    const rowNumber = i + 2;
    const row = worksheet.getRow(rowNumber);
    const entry = rows[i];

    row.getCell(1).value = entry.menuPath;
    row.getCell(2).value = entry.resourceType;
    row.getCell(3).value = entry.divisionAware;
    row.getCell(4).value = entry.dependencyCount;
    row.getCell(5).value = entry.scopePrefix;
    row.getCell(6).value = null;
    row.getCell(7).value = entry.priority;
    row.getCell(8).value = null;
    row.getCell(9).value = null;
    row.getCell(10).value = entry.notes || null;

    for (const col of [5, 6, 7, 8]) {
      row.getCell(col).fill = GRAY_FILL;
    }

    row.commit();
  }

  await workbook.xlsx.writeFile(outPath);
}

async function resolveLatestVersion(explicitLatest, jsonFiles) {
  if (explicitLatest) return explicitLatest;

  const indexPath = path.join(INPUT_DIR, "index.json");
  try {
    const versions = JSON.parse(await fs.readFile(indexPath, "utf8"));
    if (Array.isArray(versions) && versions.length > 0) {
      return versions[0];
    }
  } catch {
    // fall through to versioned filenames
  }

  const fromFiles = jsonFiles
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return fromFiles[0] || "";
}

async function main() {
  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

  const overrides = await loadOverrides();

  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith(".json") &&
        e.name !== "index.json" &&
        e.name !== "latest.json"
    )
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (jsonFiles.length === 0) {
    throw new Error(
      `No dependency tree JSON files found in ${INPUT_DIR}. Run "npm run bootstrap-local-dev" first.`
    );
  }

  const latest = await resolveLatestVersion(getArgValue("latest"), jsonFiles);
  if (!latest) {
    throw new Error("Could not determine latest provider version.");
  }

  console.log(`Using latest version: ${latest}`);

  for (const file of jsonFiles) {
    const version = file.replace(/\.json$/, "");
    const inputPath = path.join(INPUT_DIR, file);
    const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
    const tfExportCatalog = await loadTfExportCatalog(version);
    const rows = buildResourceRows(raw, overrides, tfExportCatalog);
    const outPath = path.join(OUTPUT_DIR, `${version}-cx-as-code-template.xlsx`);

    await writeWorkbook(rows, outPath);
    console.log(
      `Generated spreadsheet template for ${version} (${rows.length} resource types) -> ${outPath}`
    );
  }

  const latestSrc = path.join(OUTPUT_DIR, `${latest}-cx-as-code-template.xlsx`);
  const latestDst = path.join(OUTPUT_DIR, "latest-cx-as-code-template.xlsx");

  try {
    await fs.access(latestSrc);
  } catch {
    throw new Error(
      `Expected ${latestSrc} was not generated. Check that public/dependency-tree-json/${latest}.json exists.`
    );
  }

  await fs.copyFile(latestSrc, latestDst);
  console.log(`Updated latest spreadsheet alias -> ${latestDst}`);
  console.log(
    'Local download URL after "npm run dev": /spreadsheet-templates/latest-cx-as-code-template.xlsx'
  );
}

main().catch((err) => {
  if (err?.code === "ERR_MODULE_NOT_FOUND" && String(err.message).includes("exceljs")) {
    console.error('Missing exceljs. Run "npm ci" first, then retry.');
  } else {
    console.error(err);
  }
  process.exit(1);
});
