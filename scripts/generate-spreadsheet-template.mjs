import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const INPUT_DIR = path.resolve("public/dependency-tree-json");
const OUTPUT_DIR = path.resolve("public/spreadsheet-templates");
const TEMPLATE_PATH = path.resolve(
  "scripts/templates/cx-as-code-spreadsheet-template.xlsx"
);
const DEFAULT_OVERRIDES_PATH = path.resolve("src/overrides.json");

const AUTH_DIVISION_RESOURCE_TYPE = "genesyscloud_auth_division";

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

function applyOverrides(raw, overrides) {
  if (!raw || !Array.isArray(raw.resources)) return raw;
  if (!overrides || typeof overrides !== "object") return raw;

  const patched = {
    ...raw,
    resources: raw.resources.map((r) => ({ ...r })),
  };

  const byType = new Map();
  for (const r of patched.resources) {
    if (r && typeof r.type === "string") byType.set(r.type, r);
  }

  const replace = overrides.replaceDependencies;
  if (replace && typeof replace === "object") {
    for (const [type, mapping] of Object.entries(replace)) {
      const r = byType.get(type);
      if (!r || !Array.isArray(r.dependencies) || typeof mapping !== "object") {
        continue;
      }

      r.dependencies = r.dependencies.map((d) =>
        typeof d === "string" ? mapping[d] || d : d
      );
    }
  }

  const add = overrides.addDependencies;
  if (add && typeof add === "object") {
    for (const [type, additions] of Object.entries(add)) {
      if (!Array.isArray(additions)) continue;

      const r = byType.get(type);
      if (!r) continue;

      const current = Array.isArray(r.dependencies) ? r.dependencies : [];
      const set = new Set(current.filter((d) => typeof d === "string"));

      for (const dep of additions) {
        if (typeof dep === "string" && dep.trim()) set.add(dep.trim());
      }

      r.dependencies = [...set];
    }
  }

  return patched;
}

function getHiddenResourceTypes(overrides) {
  const hidden = overrides?.hiddenResourceTypes;
  if (!Array.isArray(hidden)) return new Set();

  return new Set(
    hidden
      .filter((t) => typeof t === "string")
      .map((t) => t.trim())
      .filter(Boolean)
  );
}

function resolveGuiMenuPath(resourceType, overrides) {
  const type = (resourceType || "").trim();
  if (!type) return "";

  const paths = overrides?.guiMenuPaths;
  if (!paths || typeof paths !== "object") return "";

  const menuPath = paths[type];
  return typeof menuPath === "string" ? menuPath.trim() : "";
}

function isDivisionAware(dependencies) {
  if (!Array.isArray(dependencies)) return false;
  return dependencies.includes(AUTH_DIVISION_RESOURCE_TYPE);
}

function buildResourceRows(raw, overrides) {
  const hidden = getHiddenResourceTypes(overrides);
  const patched = applyOverrides(raw, overrides);
  const byType = new Map();

  for (const resource of patched.resources || []) {
    if (!resource || typeof resource.type !== "string") continue;
    if (hidden.has(resource.type)) continue;
    byType.set(resource.type, resource);
  }

  const guiOrder = Object.keys(overrides?.guiMenuPaths || {}).filter((type) =>
    byType.has(type)
  );

  const orderedTypes = [...guiOrder];
  const orderedSet = new Set(orderedTypes);

  const remaining = [...byType.keys()]
    .filter((type) => !orderedSet.has(type))
    .sort((a, b) => a.localeCompare(b));

  orderedTypes.push(...remaining);

  return orderedTypes.map((type) => {
    const resource = byType.get(type);
    const dependencies = Array.isArray(resource?.dependencies)
      ? resource.dependencies.filter((d) => typeof d === "string")
      : [];

    return {
      menuPath: resolveGuiMenuPath(type, overrides),
      resourceType: type,
      divisionAware: isDivisionAware(dependencies) ? "Yes" : "No",
      dependencyCount: dependencies.length,
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
    row.getCell(5).value = null;
    row.getCell(6).value = null;
    row.getCell(7).value = null;
    row.getCell(8).value = null;
    row.getCell(9).value = null;
    row.getCell(10).value = null;

    for (const col of [5, 6, 7, 8]) {
      row.getCell(col).fill = GRAY_FILL;
    }

    row.commit();
  }

  await workbook.xlsx.writeFile(outPath);
}

async function main() {
  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

  const latest = getArgValue("latest");
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

  for (const file of jsonFiles) {
    const version = file.replace(/\.json$/, "");
    const inputPath = path.join(INPUT_DIR, file);
    const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
    const rows = buildResourceRows(raw, overrides);
    const outPath = path.join(OUTPUT_DIR, `${version}-cx-as-code-template.xlsx`);

    await writeWorkbook(rows, outPath);
    console.log(
      `Generated spreadsheet template for ${version} (${rows.length} resource types)`
    );
  }

  if (latest) {
    const latestSrc = path.join(OUTPUT_DIR, `${latest}-cx-as-code-template.xlsx`);
    const latestDst = path.join(OUTPUT_DIR, "latest-cx-as-code-template.xlsx");
    await fs.copyFile(latestSrc, latestDst);
    console.log(`Updated latest spreadsheet alias for ${latest}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
