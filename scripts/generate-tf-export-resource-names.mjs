import fs from "node:fs/promises";
import path from "node:path";
import { scanProviderBlockLabels } from "./lib/tf-export-block-label.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_PROVIDER_ROOT = path.resolve(
  REPO_ROOT,
  "../terraform-provider-genesyscloud/genesyscloud"
);
const DEFAULT_OUTPUT = path.resolve(REPO_ROOT, "public/tf-export-resource-names.json");

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function loadJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function main() {
  const providerRoot = path.resolve(
    getArgValue("provider") ||
      process.env.TF_EXPORT_PROVIDER_ROOT ||
      DEFAULT_PROVIDER_ROOT
  );
  const outputPath = path.resolve(getArgValue("output") || DEFAULT_OUTPUT);
  const verifyPath = path.resolve(getArgValue("verify") || outputPath);

  let providerStat;
  try {
    providerStat = await fs.stat(providerRoot);
  } catch {
    console.error(`Provider source not found: ${providerRoot}`);
    console.error(
      "Clone terraform-provider-genesyscloud or pass --provider=/path/to/genesyscloud"
    );
    process.exit(1);
  }

  if (!providerStat.isDirectory()) {
    console.error(`Provider path is not a directory: ${providerRoot}`);
    process.exit(1);
  }

  const tfExportResourceNames = scanProviderBlockLabels(providerRoot);
  const payload = {
    tfExportResourceNames: Object.fromEntries(
      Object.entries(tfExportResourceNames).sort(([a], [b]) => a.localeCompare(b))
    ),
  };

  if (hasFlag("verify")) {
    let expected;
    try {
      expected = await loadJson(verifyPath);
    } catch {
      console.error(`Verify file not found: ${verifyPath}`);
      process.exit(1);
    }

    const expectedMap = expected.tfExportResourceNames || {};
    const missing = Object.keys(expectedMap).filter(
      (type) => payload.tfExportResourceNames[type] !== expectedMap[type]
    );
    const extra = Object.keys(payload.tfExportResourceNames).filter(
      (type) => !(type in expectedMap)
    );

    let exitCode = 0;
    if (missing.length > 0) {
      exitCode = 1;
      console.error("Generated map differs from verify file:");
      for (const type of missing.sort()) {
        console.error(`  ${type}`);
        console.error(`    expected: ${expectedMap[type]}`);
        console.error(`    actual:   ${payload.tfExportResourceNames[type] ?? "(missing)"}`);
      }
    }
    if (extra.length > 0) {
      exitCode = 1;
      console.error("Resource types present in generated map but not verify file:");
      for (const type of extra.sort()) {
        console.error(`  - ${type}: ${payload.tfExportResourceNames[type]}`);
      }
    }
    if (exitCode === 0) {
      console.log(
        `tf-export-resource-names verified (${Object.keys(expectedMap).length} resource types).`
      );
    }
    process.exit(exitCode);
  }

  const rendered = `${JSON.stringify(payload, null, 2)}\n`;

  if (hasFlag("stdout")) {
    process.stdout.write(rendered);
    return;
  }

  await fs.writeFile(outputPath, rendered, "utf8");
  console.log(
    `Wrote ${outputPath} (${Object.keys(payload.tfExportResourceNames).length} resource types)`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
