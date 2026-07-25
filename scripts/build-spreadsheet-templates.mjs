#!/usr/bin/env node
/**
 * Regenerates checked-in spreadsheet template workbooks from shared styles.
 * Generators load these templates and inherit header/layout/view styling.
 */
import path from "node:path";
import {
  DEPLOY_SPREADSHEET_TEMPLATE_PATH,
  SUPPORTED_RESOURCES_TEMPLATE_PATH,
  writeDeploySpreadsheetTemplate,
  writeSupportedResourcesTemplate,
} from "./lib/spreadsheet-styles.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

async function main() {
  const deployPath = await writeDeploySpreadsheetTemplate(DEPLOY_SPREADSHEET_TEMPLATE_PATH);
  console.log(`Wrote ${path.relative(REPO_ROOT, deployPath)}`);

  const supportedResourcesPath = await writeSupportedResourcesTemplate(
    SUPPORTED_RESOURCES_TEMPLATE_PATH
  );
  console.log(`Wrote ${path.relative(REPO_ROOT, supportedResourcesPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
