import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const GENERATOR_FILES = [
  "scripts/generate-tf-export-resource-names.mjs",
  "scripts/lib/tf-export-block-label.mjs",
  "scripts/lib/provider-source.mjs",
];

export const GENERATOR_HASH_PATH = path.join(
  REPO_ROOT,
  ".cache-meta/tf-export-generator-hash.txt"
);

export function computeTfExportGeneratorHash() {
  const hash = crypto.createHash("sha256");

  for (const relativePath of GENERATOR_FILES) {
    const absolutePath = path.join(REPO_ROOT, relativePath);
    hash.update(relativePath);
    hash.update("\0");
    hash.update(fs.readFileSync(absolutePath));
    hash.update("\0");
  }

  return hash.digest("hex");
}

export function readStoredTfExportGeneratorHash() {
  try {
    return fs.readFileSync(GENERATOR_HASH_PATH, "utf8").trim();
  } catch {
    return "";
  }
}

export function writeStoredTfExportGeneratorHash(value) {
  fs.mkdirSync(path.dirname(GENERATOR_HASH_PATH), { recursive: true });
  fs.writeFileSync(GENERATOR_HASH_PATH, `${value}\n`, "utf8");
}

export function shouldForceTfExportRegeneration() {
  if (process.env.TF_EXPORT_FORCE === "1") return true;
  const current = computeTfExportGeneratorHash();
  const stored = readStoredTfExportGeneratorHash();
  return Boolean(stored) && stored !== current;
}

export function noteTfExportGeneratorHash() {
  writeStoredTfExportGeneratorHash(computeTfExportGeneratorHash());
}
