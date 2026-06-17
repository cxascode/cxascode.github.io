import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  listResourceTypes,
  patchFilterBuilderTemplate,
} from "./lib/filter-builder-template.mjs";
import {
  patchExcludeFilterResources,
  resolveExcludeFilterResources,
} from "./lib/lab-export-scope.mjs";
import { patchProviderVersionPins } from "./lib/lab-package-version.mjs";
import {
  DEPENDENCY_TREE_DIR,
  LAB_PACKAGES_DIR,
  resolvePublicDataDir,
} from "./lib/public-data-paths.mjs";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const TEMPLATE_ROOT = path.resolve(
  REPO_ROOT,
  "scripts/templates/cx-as-code-lab/CX_as_Code-Lab"
);
const INPUT_DIR = resolvePublicDataDir(REPO_ROOT, DEPENDENCY_TREE_DIR);
const OUTPUT_DIR = resolvePublicDataDir(REPO_ROOT, LAB_PACKAGES_DIR);

const LAB_FOLDER_NAME = "CX_as_Code-Lab";
const OUTPUT_BASENAME = "cx-as-code-lab";
const FILTER_BUILDER_FILENAME = "filter-builder-template.xlsx";
const EXPORT_PIPELINE_MAIN_TF = "exportpipeline/main.tf";
const DEFAULT_OVERRIDES_PATH = path.resolve(REPO_ROOT, "public/overrides.json");
const SKIP_TEMPLATE_ENTRIES = new Set([".vscode", ".DS_Store", "__MACOSX"]);

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function pathExists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    if (SKIP_TEMPLATE_ENTRIES.has(entry.name) || entry.name.startsWith("._")) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
      continue;
    }

    await fs.copyFile(srcPath, destPath);
  }
}

async function loadOverrides() {
  try {
    const raw = await fs.readFile(DEFAULT_OVERRIDES_PATH, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

async function patchTerraformFiles(rootDir, version) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      await patchTerraformFiles(entryPath, version);
      continue;
    }

    if (!entry.name.endsWith(".tf")) continue;

    const original = await fs.readFile(entryPath, "utf8");
    const patched = patchProviderVersionPins(original, version);
    if (patched !== original) {
      await fs.writeFile(entryPath, patched, "utf8");
    }
  }
}

async function zipDirectory(sourceDir, zipPath) {
  await ensureDir(path.dirname(zipPath));
  if (await pathExists(zipPath)) {
    await fs.rm(zipPath, { force: true });
  }

  const parentDir = path.dirname(sourceDir);
  const folderName = path.basename(sourceDir);

  await execFileAsync("zip", ["-rq", zipPath, folderName], { cwd: parentDir });
}

async function resolveLatestVersion(explicitLatest, jsonFiles) {
  if (explicitLatest) return explicitLatest.replace(/^v/i, "");

  const fromFiles = jsonFiles
    .map((file) => file.replace(/\.json$/, ""))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));

  return fromFiles[0] || "";
}

async function buildLabPackage(version, stagingRoot, { overrides, dependencyTree }) {
  const stagingDir = path.join(stagingRoot, LAB_FOLDER_NAME);
  await copyDir(TEMPLATE_ROOT, stagingDir);
  await patchTerraformFiles(stagingDir, version);

  const filterBuilderPath = path.join(stagingDir, FILTER_BUILDER_FILENAME);
  if (await pathExists(filterBuilderPath)) {
    const resourceTypes = listResourceTypes(dependencyTree, overrides);
    await patchFilterBuilderTemplate(filterBuilderPath, resourceTypes);
  }

  const exportPipelinePath = path.join(stagingDir, EXPORT_PIPELINE_MAIN_TF);
  if (await pathExists(exportPipelinePath)) {
    const original = await fs.readFile(exportPipelinePath, "utf8");
    const excludeTypes = resolveExcludeFilterResources(original, overrides);
    const patched = patchExcludeFilterResources(original, excludeTypes);
    if (patched !== original) {
      await fs.writeFile(exportPipelinePath, patched, "utf8");
    }
  }

  return stagingDir;
}

async function main() {
  if (!(await pathExists(TEMPLATE_ROOT))) {
    throw new Error(`Lab template not found at ${TEMPLATE_ROOT}`);
  }

  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        entry.name !== "index.json" &&
        entry.name !== "latest.json"
    )
    .map((entry) => entry.name)
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

  const overrides = await loadOverrides();
  const stagingRoot = path.join(REPO_ROOT, ".cache", "lab-package-staging", Date.now().toString());
  await ensureDir(stagingRoot);

  try {
    for (const file of jsonFiles) {
      const version = file.replace(/\.json$/, "");
      const dependencyTree = JSON.parse(
        await fs.readFile(path.join(INPUT_DIR, file), "utf8")
      );
      const versionStagingRoot = path.join(stagingRoot, version);
      await buildLabPackage(version, versionStagingRoot, {
        overrides,
        dependencyTree,
      });

      const zipPath = path.join(OUTPUT_DIR, `${version}-${OUTPUT_BASENAME}.zip`);
      await zipDirectory(
        path.join(versionStagingRoot, LAB_FOLDER_NAME),
        zipPath
      );
      console.log(`Generated lab package for ${version} -> ${zipPath}`);

      await fs.rm(versionStagingRoot, { recursive: true, force: true });
    }

    const latestZip = path.join(OUTPUT_DIR, `${latest}-${OUTPUT_BASENAME}.zip`);
    const latestAlias = path.join(OUTPUT_DIR, `latest-${OUTPUT_BASENAME}.zip`);

    if (!(await pathExists(latestZip))) {
      throw new Error(`Expected ${latestZip} was not generated.`);
    }

    await fs.copyFile(latestZip, latestAlias);
    console.log(`Updated latest lab package alias -> ${latestAlias}`);
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
