import fs from "node:fs/promises";
import path from "node:path";
import {
  normalizeGuiMenuPathsDocument,
  normalizeMenuCatalog,
  getSupportedResourcesMenuPaths,
  resolveGuiMenuPath,
} from "../src/guiMenuPaths.js";
import { getHiddenResourceTypes } from "./lib/dependency-tree-overrides.mjs";
import {
  combinedInputsHash,
  getArgValue,
  hasArgFlag,
  hashFile,
  hashPaths,
  shouldSkipIncremental,
  writeStamp,
} from "./lib/generated-artifact-incremental.mjs";
import {
  isDependencyTreeVersionJsonFilename,
  SUPPORTED_RESOURCES_TEMPLATES_DIR,
} from "./lib/public-data-path-constants.mjs";
import {
  applySupportedResourcesLayout,
  applyWorksheetView,
  autoFitWorksheetColumns,
  clearDataRows,
  loadWorkbookFromTemplate,
  styleDataCell,
  styleLeafMenuCell,
  styleSectionCell,
  styleSubsectionCell,
  SUPPORTED_RESOURCES_HEADERS,
  SUPPORTED_RESOURCES_TEMPLATE_PATH,
} from "./lib/spreadsheet-styles.mjs";

const PUBLIC_DIR = path.resolve("public");
const INPUT_DIR = path.join(PUBLIC_DIR, "dependency-tree-json");
const OUTPUT_DIR = path.join(PUBLIC_DIR, SUPPORTED_RESOURCES_TEMPLATES_DIR);
const DEFAULT_OVERRIDES_PATH = path.join(PUBLIC_DIR, "overrides.json");
const GUI_MENU_PATHS_PATH = path.join(PUBLIC_DIR, "gui-menu-paths.json");
const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const STAMP_DIR = path.resolve(REPO_ROOT, ".cache-meta/artifact-stamps/supported-resources");
const UNMAPPED_MENU_PATH = "TBD";

const SUPPORTED_RESOURCES_GLOBAL_INPUT_RELATIVE_PATHS = [
  "public/overrides.json",
  "public/gui-menu-paths.json",
  "scripts/templates/cx-as-code-supported-resources-template.xlsx",
  "scripts/lib/spreadsheet-styles.mjs",
  "scripts/lib/dependency-tree-overrides.mjs",
  "scripts/lib/supported-resources-menu-destination.mjs",
  "src/guiMenuPaths.js",
  "scripts/generate-supported-resources-spreadsheet.mjs",
];

/** Top-level sections from Genesys Directory command-nav (not legacy admin menu.json). */
const DIRECTORY_MENU_ROOTS = new Set([
  "Account",
  "Contacts",
  "Conversation Intelligence",
  "Digital and Telephony",
  "IT and Integrations",
  "Journey Management",
  "Knowledge",
  "Orchestration",
  "Performance Management",
  "User Management",
  "Workforce Management",
  "Workspace",
]);

function versionedOutputPath(version) {
  return path.join(OUTPUT_DIR, `${version}-supported-resources.xlsx`);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function isDirectoryMenuPath(menuPath) {
  const value = String(menuPath || "").trim();
  if (!value || value.includes(".title")) return false;
  return DIRECTORY_MENU_ROOTS.has(value.split(" > ")[0]);
}

async function loadJson(filePath, { optional = false } = {}) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (optional && err?.code === "ENOENT") return null;
    throw err;
  }
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
    // fall through
  }

  const fromFiles = jsonFiles
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return fromFiles[0] || "";
}

const PATH_SEP = " > ";

function normalizeMenuPathKey(menuPath) {
  return String(menuPath || "")
    .trim()
    .replace(/ & /g, " and ")
    .split(PATH_SEP)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(PATH_SEP);
}

function isSectionContainerPath(menuPath) {
  const segments = menuPath
    .split(PATH_SEP)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length === 1 && DIRECTORY_MENU_ROOTS.has(segments[0]);
}

function collectMenuPaths(menuRows, generatedGuiMenuPaths) {
  const generatedPaths = [
    ...new Set(
      Object.values(generatedGuiMenuPaths || {})
        .filter((menuPath) => typeof menuPath === "string" && menuPath.trim())
        .map((menuPath) => menuPath.trim())
    ),
  ];
  const generatedNorm = new Set(generatedPaths.map(normalizeMenuPathKey));

  const catalogByNorm = new Map();
  const paths = [];

  const insertPathInSection = (menuPath) => {
    const trimmed = menuPath.trim();
    const norm = normalizeMenuPathKey(trimmed);
    if (!trimmed || catalogByNorm.has(norm)) return;

    const section = trimmed.split(PATH_SEP)[0];
    let insertAt = paths.length;

    for (let index = paths.length - 1; index >= 0; index -= 1) {
      if (paths[index].split(PATH_SEP)[0] === section) {
        insertAt = index + 1;
        break;
      }
    }

    catalogByNorm.set(norm, trimmed);
    paths.splice(insertAt, 0, trimmed);
  };

  const addPath = (menuPath, { preferGenerated = false } = {}) => {
    const trimmed = menuPath.trim();
    if (!trimmed) return;

    if (isSectionContainerPath(trimmed) && !generatedNorm.has(normalizeMenuPathKey(trimmed))) {
      return;
    }

    const norm = normalizeMenuPathKey(trimmed);
    const existing = catalogByNorm.get(norm);

    if (existing) {
      if (preferGenerated && generatedNorm.has(norm) && existing !== trimmed) {
        const index = paths.indexOf(existing);
        if (index >= 0) paths[index] = trimmed;
        catalogByNorm.set(norm, trimmed);
      }
      return;
    }

    const section = trimmed.split(PATH_SEP)[0];
    const sectionExists = paths.some((pathValue) => pathValue.split(PATH_SEP)[0] === section);

    if (sectionExists) {
      insertPathInSection(trimmed);
    } else {
      catalogByNorm.set(norm, trimmed);
      paths.push(trimmed);
    }
  };

  for (const row of menuRows || []) {
    const menuPath = typeof row?.path === "string" ? row.path.trim() : "";
    if (!menuPath) continue;

    if (row.menuSource === "admin-menu") continue;
    if (row.menuSource === "directory-command-nav" || isDirectoryMenuPath(menuPath)) {
      addPath(menuPath);
    }
  }

  for (const menuPath of generatedPaths) {
    const norm = normalizeMenuPathKey(menuPath);
    if (catalogByNorm.has(norm)) {
      addPath(menuPath, { preferGenerated: true });
    } else {
      insertPathInSection(menuPath);
    }
  }

  return { paths, catalogByNorm };
}

function resolveCatalogPath(menuPath, catalogByNorm) {
  const trimmed = String(menuPath || "").trim();
  if (!trimmed) return "";
  return catalogByNorm.get(normalizeMenuPathKey(trimmed)) || trimmed;
}

function parseMenuPathTiers(menuPath) {
  const segments = menuPath
    .split(" > ")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { section: "", group: "", item: "" };
  }

  if (segments.length === 1) {
    return { section: segments[0], group: "", item: segments[0] };
  }

  if (segments.length === 2) {
    return { section: segments[0], group: "", item: segments[1] };
  }

  return {
    section: segments[0],
    group: segments[1],
    item: segments[segments.length - 1],
  };
}

function buildNestedRows(orderedMenuPaths, entriesByPath) {
  const rows = [];
  let currentSection = "";
  let currentGroup = "";

  for (const menuPath of orderedMenuPaths) {
    const entry = entriesByPath.get(menuPath);
    if (!entry) continue;

    if (menuPath === UNMAPPED_MENU_PATH) {
      rows.push({ kind: "section", label: UNMAPPED_MENU_PATH });
      rows.push({
        kind: "path",
        item: UNMAPPED_MENU_PATH,
        group: "",
        supported: entry.supported,
        resourceTypes: entry.resourceTypes,
      });
      continue;
    }

    const { section, group, item } = parseMenuPathTiers(menuPath);

    if (section !== currentSection) {
      rows.push({ kind: "section", label: section });
      currentSection = section;
      currentGroup = "";
    }

    if (group && group !== currentGroup) {
      rows.push({ kind: "subsection", label: group });
      currentGroup = group;
    } else if (!group) {
      currentGroup = "";
    }

    rows.push({
      kind: "path",
      item,
      group,
      supported: entry.supported,
      resourceTypes: entry.resourceTypes,
    });
  }

  return rows;
}

function buildSupportedResourceEntries(
  menuPaths,
  catalogByNorm,
  resourceTypes,
  overrides,
  generatedGuiMenuPaths
) {
  const hidden = getHiddenResourceTypes(overrides);
  const pathToTypes = new Map(menuPaths.map((menuPath) => [menuPath, []]));
  const unmappedTypes = [];

  for (const type of resourceTypes) {
    if (hidden.has(type)) continue;

    const resolvedPath = resolveGuiMenuPath(type, overrides, generatedGuiMenuPaths);
    if (!resolvedPath) {
      unmappedTypes.push(type);
      continue;
    }

    const catalogPath = resolveCatalogPath(resolvedPath, catalogByNorm);
    if (!pathToTypes.has(catalogPath)) {
      pathToTypes.set(catalogPath, []);
    }

    pathToTypes.get(catalogPath).push(type);
  }

  for (const types of pathToTypes.values()) {
    types.sort((a, b) => a.localeCompare(b));
  }

  unmappedTypes.sort((a, b) => a.localeCompare(b));

  const entries = [...pathToTypes.entries()].map(([menuPath, types]) => ({
    menuPath,
    resourceTypes: types,
    supported: types.length > 0 ? "Yes" : "No",
  }));

  if (unmappedTypes.length > 0) {
    entries.push({
      menuPath: UNMAPPED_MENU_PATH,
      resourceTypes: unmappedTypes,
      supported: "Yes",
    });
  }

  return entries;
}

async function writeWorkbook(rows, outPath) {
  const workbook = await loadWorkbookFromTemplate(SUPPORTED_RESOURCES_TEMPLATE_PATH);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Supported-resources template is missing a worksheet.");
  }

  applySupportedResourcesLayout(worksheet);
  clearDataRows(worksheet, 2);

  let rowNumber = 2;
  let maxOutlineLevel = 0;

  for (const entry of rows) {
    const row = worksheet.getRow(rowNumber);

    if (entry.kind === "section") {
      row.outlineLevel = 0;
      const cell = row.getCell(1);
      cell.value = entry.label;
      styleSectionCell(cell);
      rowNumber += 1;
      continue;
    }

    if (entry.kind === "subsection") {
      row.outlineLevel = 1;
      maxOutlineLevel = Math.max(maxOutlineLevel, 1);
      const cell = row.getCell(1);
      cell.value = entry.label;
      styleSubsectionCell(cell);
      rowNumber += 1;
      continue;
    }

    row.outlineLevel = entry.group ? 2 : 1;
    maxOutlineLevel = Math.max(maxOutlineLevel, row.outlineLevel);
    styleLeafMenuCell(row.getCell(1), { indent: entry.group ? 2 : 1 });
    row.getCell(1).value = entry.item;
    row.getCell(2).value = entry.supported;
    row.getCell(3).value = entry.resourceTypes.join(", ");
    styleDataCell(row.getCell(2));
    styleDataCell(row.getCell(3));
    rowNumber += 1;
  }

  // Keep section headers visible; subsection rows and items start collapsed.
  worksheet.properties.outlineLevelRow = Math.min(1, maxOutlineLevel);

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, rowNumber - 1), column: 3 },
  };

  applyWorksheetView(worksheet, { showOutlineSymbols: true, activeCell: "C2" });

  autoFitWorksheetColumns(worksheet, {
    columnCount: SUPPORTED_RESOURCES_HEADERS.length,
    excludeLastColumn: true,
  });

  await workbook.xlsx.writeFile(outPath);
}

async function computeSupportedResourcesInputsHash(version, globalInputsHash) {
  const depHash = await hashFile(path.join(INPUT_DIR, `${version}.json`));
  return combinedInputsHash([globalInputsHash, version, depHash]);
}

async function generateSupportedResourcesForVersion({
  version,
  overrides,
  generatedGuiMenuPaths,
  menuCatalog,
  explicitOutput = "",
}) {
  const dependencyTree = await loadJson(path.join(INPUT_DIR, `${version}.json`));
  const resourceTypes = [
    ...new Set(
      (dependencyTree?.resources || [])
        .map((resource) => resource?.type)
        .filter((type) => typeof type === "string" && type.trim())
        .map((type) => type.trim())
    ),
  ].sort((a, b) => a.localeCompare(b));

  const menuCatalogRows = menuCatalog.map((entry) => ({
    path: entry.path,
    menuSource: entry.menuSource || "directory-command-nav",
  }));

  const { catalogByNorm } = collectMenuPaths(menuCatalogRows, generatedGuiMenuPaths);
  const spreadsheetMenuPaths = getSupportedResourcesMenuPaths(menuCatalog);

  if (menuCatalog.length === 0 || spreadsheetMenuPaths.length === 0) {
    throw new Error(
      `No menu catalog found in ${path.relative(process.cwd(), GUI_MENU_PATHS_PATH)}. Run "npm run generate-gui-menu-paths" first.`
    );
  }

  const pathEntries = buildSupportedResourceEntries(
    spreadsheetMenuPaths,
    catalogByNorm,
    resourceTypes,
    overrides,
    generatedGuiMenuPaths
  );
  const entriesByPath = new Map(pathEntries.map((entry) => [entry.menuPath, entry]));
  const rows = buildNestedRows(spreadsheetMenuPaths, entriesByPath);
  const outputPath = path.resolve(explicitOutput || versionedOutputPath(version));

  await ensureDir(path.dirname(outputPath));
  await writeWorkbook(rows, outputPath);

  const pathRows = rows.filter((row) => row.kind === "path");
  const supportedPathCount = pathRows.filter(
    (row) => row.item !== UNMAPPED_MENU_PATH && row.supported === "Yes"
  ).length;
  const mappedTypeCount = pathRows.reduce(
    (sum, row) => sum + (row.resourceTypes?.length || 0),
    0
  );

  return {
    outputPath,
    pathRowCount: pathRows.length,
    supportedPathCount,
    mappedTypeCount,
  };
}

async function main() {
  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

  const versionArg = getArgValue("latest");
  const explicitOutput = getArgValue("output");
  const incremental = hasArgFlag("incremental");
  const force = hasArgFlag("force");

  const overrides = (await loadJson(DEFAULT_OVERRIDES_PATH, { optional: true })) || {};
  const guiMenuPathsDoc = (await loadJson(GUI_MENU_PATHS_PATH, { optional: true })) || {};
  const generatedGuiMenuPaths = normalizeGuiMenuPathsDocument(guiMenuPathsDoc);
  const menuCatalog = normalizeMenuCatalog(guiMenuPathsDoc.menuCatalog);

  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && isDependencyTreeVersionJsonFilename(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (jsonFiles.length === 0) {
    throw new Error(
      `No dependency tree JSON files found in ${INPUT_DIR}. Run "npm run bootstrap-local-dev" first.`
    );
  }

  const latest = await resolveLatestVersion(versionArg, jsonFiles);
  if (!latest) {
    throw new Error("Could not determine provider version.");
  }

  console.log(`Using latest version: ${latest}`);

  if (explicitOutput) {
    const result = await generateSupportedResourcesForVersion({
      version: latest,
      overrides,
      generatedGuiMenuPaths,
      menuCatalog,
      explicitOutput,
    });
    console.log(
      `Wrote ${path.relative(process.cwd(), result.outputPath)} (${result.pathRowCount} menu paths, ${result.supportedPathCount} with supported types, ${result.mappedTypeCount} resource types mapped for ${latest})`
    );
    return;
  }

  const globalInputsHash = incremental
    ? await hashPaths(REPO_ROOT, SUPPORTED_RESOURCES_GLOBAL_INPUT_RELATIVE_PATHS)
    : "";

  let generatedCount = 0;
  let skippedCount = 0;

  for (const file of jsonFiles) {
    const version = file.replace(/\.json$/, "");
    const outPath = versionedOutputPath(version);
    const stampPath = path.join(STAMP_DIR, `${version}.json`);
    const inputsHash = incremental
      ? await computeSupportedResourcesInputsHash(version, globalInputsHash)
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
      console.log(`Skipping supported-resources spreadsheet for ${version} (inputs unchanged)`);
      skippedCount += 1;
      continue;
    }

    const result = await generateSupportedResourcesForVersion({
      version,
      overrides,
      generatedGuiMenuPaths,
      menuCatalog,
    });

    if (incremental) {
      await writeStamp(stampPath, inputsHash);
    }

    generatedCount += 1;
    console.log(
      `Generated supported-resources spreadsheet for ${version} (${result.pathRowCount} menu paths, ${result.supportedPathCount} with supported types, ${result.mappedTypeCount} resource types mapped) -> ${path.relative(process.cwd(), result.outputPath)}`
    );
  }

  if (incremental) {
    console.log(
      `Supported-resources spreadsheets: generated ${generatedCount}, skipped ${skippedCount} (incremental).`
    );
  }

  const latestSrc = versionedOutputPath(latest);
  const latestDst = path.join(OUTPUT_DIR, "latest-supported-resources.xlsx");

  try {
    await fs.access(latestSrc);
  } catch {
    throw new Error(
      `Expected ${latestSrc} was not generated. Check that public/dependency-tree-json/${latest}.json exists.`
    );
  }

  await fs.copyFile(latestSrc, latestDst);
  console.log(`Updated latest supported-resources alias -> ${latestDst}`);
  console.log(
    'Local download URL after "npm run dev": /supported-resources/latest or /supported-resources-templates/latest-supported-resources.xlsx'
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
