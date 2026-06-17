import path from "node:path";
import { PUBLIC_DIR_NAME } from "./public-data-path-constants.mjs";

export * from "./public-data-path-constants.mjs";

export function resolvePublicDataDir(repoRoot, segment) {
  return path.resolve(repoRoot, PUBLIC_DIR_NAME, segment);
}
