#!/usr/bin/env node
/**
 * Regenerates checked-in spreadsheet template workbooks from shared styles.
 * Generators load these templates and inherit header/layout/view styling.
 */
import fs from "node:fs/promises";
import path from "node:path";
import {
  DEPLOY_SPREADSHEET_TEMPLATE_PATH,
  SUPPORTED_RESOURCES_TEMPLATE_PATH,
  writeDeploySpreadsheetTemplate,
  writeSupportedResourcesTemplate,
} from "./lib/spreadsheet-styles.mjs";
import {
  hasArgFlag,
  hashPaths,
  readStamp,
  writeStamp,
} from "./lib/generated-artifact-incremental.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const STAMP_PATH = path.join(
  REPO_ROOT,
  ".cache-meta/artifact-stamps/spreadsheet-templates.json"
);
const INPUT_PATHS = ["scripts/lib/spreadsheet-styles.mjs"];

function logTemplateResult({ path: templatePath, written }) {
  const relativePath = path.relative(REPO_ROOT, templatePath);
  if (written) {
    console.log(`Wrote ${relativePath}`);
    return;
  }
  console.log(`Unchanged ${relativePath}`);
}

async function templatesExist() {
  for (const templatePath of [
    DEPLOY_SPREADSHEET_TEMPLATE_PATH,
    SUPPORTED_RESOURCES_TEMPLATE_PATH,
  ]) {
    try {
      await fs.access(templatePath);
    } catch {
      return false;
    }
  }
  return true;
}

async function shouldSkipRebuild(force) {
  if (force) return false;

  const inputsHash = await hashPaths(REPO_ROOT, INPUT_PATHS);
  const stamp = await readStamp(STAMP_PATH);
  if (!stamp || stamp.inputsHash !== inputsHash) return false;

  return templatesExist();
}

async function main() {
  const force = hasArgFlag("force");

  if (await shouldSkipRebuild(force)) {
    console.log("Spreadsheet templates unchanged (inputs unchanged)");
    return;
  }

  const inputsHash = await hashPaths(REPO_ROOT, INPUT_PATHS);

  logTemplateResult(await writeDeploySpreadsheetTemplate(DEPLOY_SPREADSHEET_TEMPLATE_PATH));
  logTemplateResult(
    await writeSupportedResourcesTemplate(SUPPORTED_RESOURCES_TEMPLATE_PATH)
  );

  await writeStamp(STAMP_PATH, inputsHash);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
