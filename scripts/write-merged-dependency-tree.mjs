import fs from "node:fs/promises";
import path from "node:path";
import { applyOverrides } from "./lib/dependency-tree-overrides.mjs";
import { DEPENDENCY_TREE_DIR, PUBLIC_DIR_NAME } from "./lib/public-data-path-constants.mjs";

const PUBLIC_DIR = path.resolve(PUBLIC_DIR_NAME);
const DEP_DIR = path.join(PUBLIC_DIR, DEPENDENCY_TREE_DIR);
const LATEST_PATH = path.join(DEP_DIR, "latest.json");
const OVERRIDES_PATH = path.join(PUBLIC_DIR, "overrides.json");
const OUTPUT_PATH = path.join(DEP_DIR, "latest-merged.json");

async function write() {
  const [latestRaw, overridesRaw] = await Promise.all([
    fs.readFile(LATEST_PATH, "utf8"),
    fs.readFile(OVERRIDES_PATH, "utf8"),
  ]);

  const latest = JSON.parse(latestRaw);
  const overrides = JSON.parse(overridesRaw);
  const merged = applyOverrides(latest, overrides);

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  const version = merged?.version ?? "unknown";
  const resourceCount = Array.isArray(merged?.resources) ? merged.resources.length : 0;
  console.log(
    `Wrote merged dependency tree (${version}, ${resourceCount} resources) -> ${OUTPUT_PATH}`
  );
}

write();
