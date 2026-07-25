import fs from "node:fs/promises";
import path from "node:path";
import {
  PRIVATE_OVERRIDES_RELATIVE_PATH,
  PUBLIC_DIR_NAME,
} from "./public-data-path-constants.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

export const DEFAULT_OVERRIDES_PATH = path.join(REPO_ROOT, PUBLIC_DIR_NAME, "overrides.json");
export const DEFAULT_PRIVATE_OVERRIDES_PATH = path.join(
  REPO_ROOT,
  PRIVATE_OVERRIDES_RELATIVE_PATH
);

async function readJsonOptional(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err?.code === "ENOENT") return {};
    throw err;
  }
}

/**
 * Load public/overrides.json plus bundled src/private-overrides.json.
 * Spreadsheet and supported-resources generators consume both as one document.
 */
export async function loadOverridesDocument(
  overridesPath = DEFAULT_OVERRIDES_PATH,
  privateOverridesPath = DEFAULT_PRIVATE_OVERRIDES_PATH
) {
  const [overrides, privateDoc] = await Promise.all([
    readJsonOptional(overridesPath),
    readJsonOptional(privateOverridesPath),
  ]);

  if (!privateDoc || typeof privateDoc !== "object") {
    return overrides;
  }

  return {
    ...overrides,
    ...(privateDoc.supportedResourcesTemplates
      ? { supportedResourcesTemplates: privateDoc.supportedResourcesTemplates }
      : {}),
    ...(privateDoc.spreadsheetTemplates
      ? { spreadsheetTemplates: privateDoc.spreadsheetTemplates }
      : {}),
  };
}
