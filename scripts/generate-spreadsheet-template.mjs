import fs from "node:fs/promises";
import path from "node:path";
import { effectiveDependencies } from "../src/effectiveDependencies.js";
import {
  isSingletonTfExportResource,
  normalizeSingletonResourceTypes,
} from "../src/tfExportSingletons.js";
import {
  formatSpreadsheetForceNewAttributeList,
  getForceNewAttributes,
  normalizeForceNewCatalog,
} from "../src/schemaForceNew.js";
import { resolveTfExportResourceName } from "../src/tfExportTemplate.js";
import {
  normalizeGuiMenuPathsDocument,
  resolveGuiMenuPath,
} from "../src/guiMenuPaths.js";
import {
  applyOverrides,
  getDeprecatedResourceTypes,
  getHiddenResourceTypes,
  getNonExportableResourceTypes,
} from "./lib/dependency-tree-overrides.mjs";
import {
  compareSpreadsheetRows,
  getRepoAssignments,
  getRepoDeployOrderIndex,
  getSkippedResourceTypes,
  getSpreadsheetOutResourceTypesSet,
  resolveRepoPriority,
  resolveSpreadsheetRepoName,
} from "./lib/priority-group-keywords.mjs";
import {
  isDependencyTreeVersionJsonFilename,
  MIN_SINGLETON_FLAG_VERSION,
  SCHEMA_FORCE_NEW_DIR,
  TF_EXPORT_RESOURCE_NAMES_DIR,
  TF_EXPORT_SINGLETONS_DIR,
} from "./lib/public-data-path-constants.mjs";
import {
  applyDeployEditingColumnFills,
  autoFitWorksheetColumns,
  clearDataRows,
  DEPLOY_SPREADSHEET_DATA_COLUMN_COUNT,
  DEPLOY_SPREADSHEET_TEMPLATE_PATH,
  loadWorkbookFromTemplate,
  SPREADSHEET_DEPRECATED_NOTE,
  SPREADSHEET_NON_EXPORTABLE_NOTE,
  SPREADSHEET_SINGLETON_NOTE,
  styleDataCell,
} from "./lib/spreadsheet-styles.mjs";

const INPUT_DIR = path.resolve("public/dependency-tree-json");
const OUTPUT_DIR = path.resolve("public/spreadsheet-templates");
const PUBLIC_DIR = path.resolve("public");
const TEMPLATE_PATH = DEPLOY_SPREADSHEET_TEMPLATE_PATH;
const DEFAULT_OVERRIDES_PATH = path.resolve("public/overrides.json");
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const STAMP_DIR = path.resolve(REPO_ROOT, ".cache-meta/artifact-stamps/spreadsheet");

const SPREADSHEET_GLOBAL_INPUT_RELATIVE_PATHS = [
  "public/overrides.json",
  "scripts/templates/cx-as-code-spreadsheet-template.xlsx",
  "scripts/lib/spreadsheet-styles.mjs",
  "scripts/lib/dependency-tree-overrides.mjs",
  "scripts/lib/priority-group-keywords.mjs",
  "src/effectiveDependencies.js",
  "src/guiMenuPaths.js",
  "src/tfExportTemplate.js",
  "src/tfExportSingletons.js",
  "src/schemaForceNew.js",
];

const AUTH_DIVISION_RESOURCE_TYPE = "genesyscloud_auth_division";

import {
  combinedInputsHash,
  getArgValue,
  hasArgFlag,
  hashDirectory,
  hashFile,
  hashPaths,
  hashStableJson,
  shouldSkipIncremental,
  writeStamp,
} from "./lib/generated-artifact-incremental.mjs";

function resolveSpreadsheetMenuPath(resourceType, overrides, generatedGuiMenuPaths) {
  const menuPath = resolveGuiMenuPath(resourceType, overrides, generatedGuiMenuPaths);
  return menuPath || "TBD";
}

function resolveSpreadsheetScopePrefix(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return null;

  if (getSpreadsheetOutResourceTypesSet(overrides).has(type)) {
    return "out";
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
  const forceNewPath = path.join(PUBLIC_DIR, SCHEMA_FORCE_NEW_DIR, `${version}.json`);

  let singletonTypes = new Set();
  let resourceNames = {};
  let forceNewCatalog = {};

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

  try {
    const json = JSON.parse(await fs.readFile(forceNewPath, "utf8"));
    forceNewCatalog = normalizeForceNewCatalog(json?.forceNewAttributes);
  } catch {
    // schema-force-new may be missing before local bootstrap
  }

  return {
    singletonTypes,
    resourceNames,
    forceNewCatalog,
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

function resolveSpreadsheetRecreateAttributes(resourceType, forceNewCatalog) {
  return formatSpreadsheetForceNewAttributeList(
    getForceNewAttributes(resourceType, forceNewCatalog)
  );
}

function buildResourceRows(raw, overrides, tfExportCatalog, generatedGuiMenuPaths) {
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

  const repoContext = {
    skipped: getSkippedResourceTypes(overrides),
    out: getSpreadsheetOutResourceTypesSet(overrides),
    assignments: getRepoAssignments(overrides),
  };
  const repoDeployOrderIndex = getRepoDeployOrderIndex(overrides);

  const rows = [...byType.keys()].map((type) => {
    const resource = byType.get(type);
    const allDependencies = Array.isArray(resource?.dependencies)
      ? resource.dependencies.filter((d) => typeof d === "string")
      : [];
    const dependencies = effectiveDependencies(type, allDependencies);

    const scopePrefix = resolveSpreadsheetScopePrefix(type, overrides);
    const inScope = scopePrefix !== "out";
    const repoName = inScope ? resolveSpreadsheetRepoName(type, repoContext) : null;

    return {
      menuPath: resolveSpreadsheetMenuPath(type, overrides, generatedGuiMenuPaths),
      resourceType: type,
      divisionAware: isDivisionAware(allDependencies) ? "Yes" : "No",
      dependencyCount: dependencies.length,
      scopePrefix,
      priority: inScope ? resolveRepoPriority(repoName, repoDeployOrderIndex) : null,
      repoName,
      recreateAttributes: resolveSpreadsheetRecreateAttributes(
        type,
        tfExportCatalog.forceNewCatalog
      ),
      notes: resolveSpreadsheetNotes(
        type,
        overrides,
        tfExportCatalog,
        deprecatedTypes,
        nonExportableTypes
      ),
    };
  });

  return rows.sort(compareSpreadsheetRows);
}

async function loadGeneratedGuiMenuPaths() {
  const guiMenuPathsPath = path.join(PUBLIC_DIR, "gui-menu-paths.json");
  try {
    const parsed = JSON.parse(await fs.readFile(guiMenuPathsPath, "utf8"));
    return normalizeGuiMenuPathsDocument(parsed);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log("No gui-menu-paths.json found, continuing without generated menu paths.");
      return {};
    }
    throw err;
  }
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
  const workbook = await loadWorkbookFromTemplate(TEMPLATE_PATH);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Spreadsheet template is missing a worksheet.");
  }

  // Header row, layout, and frozen view come from the checked-in template; column widths
  // are autofit from content except the last column (Recreate attributes).
  clearDataRows(worksheet, 2);

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
    row.getCell(8).value = entry.repoName;
    row.getCell(9).value = null;
    row.getCell(10).value = entry.notes || null;
    row.getCell(11).value = entry.recreateAttributes || null;

    for (let column = 1; column <= DEPLOY_SPREADSHEET_DATA_COLUMN_COUNT; column += 1) {
      styleDataCell(row.getCell(column));
    }

    applyDeployEditingColumnFills(row);

    row.commit();
  }

  const lastDataRow = rows.length + 1;
  for (let rowNumber = worksheet.rowCount; rowNumber > lastDataRow; rowNumber -= 1) {
    worksheet.spliceRows(rowNumber, 1);
  }

  worksheet.autoFilter =
    rows.length > 0
      ? `A1:K${lastDataRow}`
      : `A1:K1`;

  autoFitWorksheetColumns(worksheet, {
    columnCount: DEPLOY_SPREADSHEET_DATA_COLUMN_COUNT,
    excludeLastColumn: true,
  });

  await workbook.xlsx.writeFile(outPath);
}

function buildSpreadsheetMenuPathsFingerprint(raw, overrides, generatedGuiMenuPaths) {
  const types = [
    ...new Set(
      (raw.resources || [])
        .map((resource) => resource?.type)
        .filter((type) => typeof type === "string" && type.trim())
        .map((type) => type.trim())
    ),
  ].sort();

  return Object.fromEntries(
    types.map((type) => [
      type,
      resolveSpreadsheetMenuPath(type, overrides, generatedGuiMenuPaths),
    ])
  );
}

async function computeSpreadsheetInputsHash(
  version,
  globalInputsHash,
  overrides,
  generatedGuiMenuPaths
) {
  const inputPath = path.join(INPUT_DIR, `${version}.json`);
  const depHash = await hashFile(inputPath);
  const namesHash = await hashFile(
    path.join(PUBLIC_DIR, TF_EXPORT_RESOURCE_NAMES_DIR, `${version}.json`)
  );
  const singletonHash = await hashFile(
    path.join(PUBLIC_DIR, TF_EXPORT_SINGLETONS_DIR, `${version}.json`)
  );
  const forceNewHash = await hashFile(
    path.join(PUBLIC_DIR, SCHEMA_FORCE_NEW_DIR, `${version}.json`)
  );

  let menuPathsHash = "";
  try {
    const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
    menuPathsHash = hashStableJson(
      buildSpreadsheetMenuPathsFingerprint(raw, overrides, generatedGuiMenuPaths)
    );
  } catch {
    menuPathsHash = "";
  }

  return combinedInputsHash([
    globalInputsHash,
    version,
    depHash,
    namesHash,
    singletonHash,
    forceNewHash,
    menuPathsHash,
  ]);
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
  const generatedGuiMenuPaths = await loadGeneratedGuiMenuPaths();

  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && isDependencyTreeVersionJsonFilename(e.name))
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

  const incremental = hasArgFlag("incremental");
  const force = hasArgFlag("force");
  const globalInputsHash = incremental
    ? await hashPaths(REPO_ROOT, SPREADSHEET_GLOBAL_INPUT_RELATIVE_PATHS)
    : "";

  let generatedCount = 0;
  let skippedCount = 0;

  for (const file of jsonFiles) {
    const version = file.replace(/\.json$/, "");
    const outPath = path.join(OUTPUT_DIR, `${version}-cx-as-code-template.xlsx`);
    const stampPath = path.join(STAMP_DIR, `${version}.json`);
    const inputsHash = incremental
      ? await computeSpreadsheetInputsHash(
          version,
          globalInputsHash,
          overrides,
          generatedGuiMenuPaths
        )
      : "";

    if (
      await shouldSkipIncremental({
        incremental,
        force,
        outPath,
        stampPath,
        inputsHash,
      })
    ) {
      console.log(`Skipping spreadsheet template for ${version} (inputs unchanged)`);
      skippedCount += 1;
      continue;
    }

    const inputPath = path.join(INPUT_DIR, file);
    const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
    const tfExportCatalog = await loadTfExportCatalog(version);
    const rows = buildResourceRows(raw, overrides, tfExportCatalog, generatedGuiMenuPaths);

    await writeWorkbook(rows, outPath);
    if (incremental) {
      await writeStamp(stampPath, inputsHash);
    }
    generatedCount += 1;
    console.log(
      `Generated spreadsheet template for ${version} (${rows.length} resource types) -> ${outPath}`
    );
  }

  if (incremental) {
    console.log(
      `Spreadsheet templates: generated ${generatedCount}, skipped ${skippedCount} (incremental).`
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
