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
import {
  findLabReadmeProviderVersionMismatch,
  findLabTemplateProviderVersionPinMismatches,
  isLabTerraformTemplateFile,
  LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER,
  patchLabReadmeProviderVersion,
  patchProviderVersionPins,
} from "./lib/lab-package-version.mjs";
import {
  DEPENDENCY_TREE_DIR,
  isDependencyTreeVersionJsonFilename,
  LAB_PACKAGES_DIR,
  resolvePublicDataDir,
  PRIVATE_OVERRIDES_RELATIVE_PATH,
} from "./lib/public-data-paths.mjs";
import { loadOverridesDocument } from "./lib/load-overrides-document.mjs";

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
const LAB_README_FILENAME = "README.md";
const DEFAULT_OVERRIDES_PATH = path.resolve(REPO_ROOT, "public/overrides.json");
const STAMP_DIR = path.resolve(REPO_ROOT, ".cache-meta/artifact-stamps/lab");

const LAB_GLOBAL_INPUT_RELATIVE_PATHS = [
  "public/overrides.json",
  PRIVATE_OVERRIDES_RELATIVE_PATH,
  "scripts/lib/dependency-tree-overrides.mjs",
  "scripts/lib/filter-builder-template.mjs",
  "scripts/lib/load-overrides-document.mjs",
  "scripts/lib/lab-export-scope.mjs",
  "scripts/lib/lab-package-version.mjs",
  "scripts/lib/public-data-path-constants.mjs",
];
const SKIP_TEMPLATE_ENTRIES = new Set([".vscode", ".DS_Store", "__MACOSX"]);

import {
  combinedInputsHash,
  getArgValue,
  hasArgFlag,
  hashDirectory,
  hashFile,
  hashPaths,
  shouldSkipIncremental,
  writeStamp,
} from "./lib/generated-artifact-incremental.mjs";

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
  return loadOverridesDocument(DEFAULT_OVERRIDES_PATH);
}

async function validateLabTemplateProviderVersionPins(rootDir, relativeDir = "") {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const mismatches = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    const relativePath = relativeDir ? path.join(relativeDir, entry.name) : entry.name;

    if (entry.isDirectory()) {
      mismatches.push(...(await validateLabTemplateProviderVersionPins(entryPath, relativePath)));
      continue;
    }

    if (!isLabTerraformTemplateFile(entry.name)) continue;

    const content = await fs.readFile(entryPath, "utf8");
    const unexpectedPins = findLabTemplateProviderVersionPinMismatches(content);
    if (unexpectedPins.length > 0) {
      mismatches.push({ relativePath, unexpectedPins });
    }
  }

  return mismatches;
}

async function patchLabReadme(stagingDir, version) {
  const readmePath = path.join(stagingDir, LAB_README_FILENAME);
  if (!(await pathExists(readmePath))) return;

  const original = await fs.readFile(readmePath, "utf8");
  const patched = patchLabReadmeProviderVersion(original, version);
  if (patched !== original) {
    await fs.writeFile(readmePath, patched, "utf8");
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

    if (!isLabTerraformTemplateFile(entry.name)) continue;

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
  await patchLabReadme(stagingDir, version);

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

async function computeLabInputsHash(version, globalInputsHash) {
  const depHash = await hashFile(path.join(INPUT_DIR, `${version}.json`));
  return combinedInputsHash([globalInputsHash, version, depHash]);
}

async function main() {
  if (!(await pathExists(TEMPLATE_ROOT))) {
    throw new Error(`Lab template not found at ${TEMPLATE_ROOT}`);
  }

  const templatePinMismatches = await validateLabTemplateProviderVersionPins(TEMPLATE_ROOT);
  if (templatePinMismatches.length > 0) {
    const details = templatePinMismatches
      .map(
        ({ relativePath, unexpectedPins }) =>
          `${relativePath}: ${[...new Set(unexpectedPins)].join(", ")}`
      )
      .join("; ");
    throw new Error(
      `Lab template provider version pins must use ~> ${LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER} before build (mismatches: ${details})`
    );
  }

  const templateReadmePath = path.join(TEMPLATE_ROOT, LAB_README_FILENAME);
  if (await pathExists(templateReadmePath)) {
    const readme = await fs.readFile(templateReadmePath, "utf8");
    const readmeMismatches = findLabReadmeProviderVersionMismatch(readme);
    if (readmeMismatches.length > 0) {
      throw new Error(
        `Lab template README provider version must be ~> ${LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER} before build (mismatches: ${[...new Set(readmeMismatches)].join(", ")})`
      );
    }
  }

  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

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

  const latest = await resolveLatestVersion(getArgValue("latest"), jsonFiles);
  if (!latest) {
    throw new Error("Could not determine latest provider version.");
  }

  console.log(`Using latest version: ${latest}`);

  const incremental = hasArgFlag("incremental");
  const force = hasArgFlag("force");
  const globalInputsHash = incremental
    ? await combinedInputsHash([
        await hashPaths(REPO_ROOT, LAB_GLOBAL_INPUT_RELATIVE_PATHS),
        await hashDirectory(TEMPLATE_ROOT, { ignore: SKIP_TEMPLATE_ENTRIES }),
      ])
    : "";

  const overrides = await loadOverrides();
  const stagingRoot = path.join(REPO_ROOT, ".cache", "lab-package-staging", Date.now().toString());
  await ensureDir(stagingRoot);

  let generatedCount = 0;
  let skippedCount = 0;

  try {
    for (const file of jsonFiles) {
      const version = file.replace(/\.json$/, "");
      const zipPath = path.join(OUTPUT_DIR, `${version}-${OUTPUT_BASENAME}.zip`);
      const stampPath = path.join(STAMP_DIR, `${version}.json`);
      const inputsHash = incremental
        ? await computeLabInputsHash(version, globalInputsHash)
        : "";

      if (
        await shouldSkipIncremental({
          incremental,
          force,
          outPath: zipPath,
          stampPath,
          inputsHash,
        })
      ) {
        console.log(`Skipping lab package for ${version} (inputs unchanged)`);
        skippedCount += 1;
        continue;
      }

      const dependencyTree = JSON.parse(
        await fs.readFile(path.join(INPUT_DIR, file), "utf8")
      );
      const versionStagingRoot = path.join(stagingRoot, version);
      await buildLabPackage(version, versionStagingRoot, {
        overrides,
        dependencyTree,
      });

      await zipDirectory(
        path.join(versionStagingRoot, LAB_FOLDER_NAME),
        zipPath
      );
      if (incremental) {
        await writeStamp(stampPath, inputsHash);
      }
      generatedCount += 1;
      console.log(`Generated lab package for ${version} -> ${zipPath}`);

      await fs.rm(versionStagingRoot, { recursive: true, force: true });
    }

    if (incremental) {
      console.log(
        `Lab packages: generated ${generatedCount}, skipped ${skippedCount} (incremental).`
      );
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
