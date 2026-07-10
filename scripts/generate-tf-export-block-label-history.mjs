import fs from "node:fs/promises";
import path from "node:path";
import {
  combineTfExportBlockLabelChanges,
  TF_EXPORT_BLOCK_LABEL_HISTORY_FILENAME,
} from "./lib/tf-export-block-label-history.mjs";
import {
  resolvePublicDataDir,
  TF_EXPORT_RESOURCE_NAMES_DIR,
} from "./lib/public-data-paths.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const RESOURCE_NAMES_DIR = resolvePublicDataDir(REPO_ROOT, TF_EXPORT_RESOURCE_NAMES_DIR);
const OUTPUT_PATH = path.join(REPO_ROOT, "public", TF_EXPORT_BLOCK_LABEL_HISTORY_FILENAME);

const VERSION_FILE_PATTERN = /^\d+\.\d+\.\d+\.json$/;

async function loadVersionMapsFromDir(dir) {
  let entries = [];

  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }

  const versionMaps = [];

  for (const entry of entries.sort()) {
    if (!VERSION_FILE_PATTERN.test(entry)) continue;

    const filePath = path.join(dir, entry);
    const raw = await fs.readFile(filePath, "utf8");
    const json = JSON.parse(raw);
    versionMaps.push({
      version: entry.replace(/\.json$/, ""),
      map: json?.tfExportResourceNames && typeof json.tfExportResourceNames === "object"
        ? json.tfExportResourceNames
        : {},
    });
  }

  return versionMaps;
}

export async function generateTfExportBlockLabelHistory({
  resourceNamesDir = RESOURCE_NAMES_DIR,
  outputPath = OUTPUT_PATH,
} = {}) {
  const versionMaps = await loadVersionMapsFromDir(resourceNamesDir);
  const changes = combineTfExportBlockLabelChanges(versionMaps);
  const payload = { changes };

  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  return { outputPath, changeCount: changes.length, versionCount: versionMaps.length };
}

async function main() {
  const result = await generateTfExportBlockLabelHistory();
  console.log(
    `Wrote ${path.relative(REPO_ROOT, result.outputPath)} (${result.changeCount} placeholder changes across ${result.versionCount} provider versions).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
