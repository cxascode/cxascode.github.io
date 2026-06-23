import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export function getArgValue(name, argv = process.argv) {
  const prefix = `--${name}=`;
  const arg = argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

export function hasArgFlag(name, argv = process.argv) {
  return argv.includes(`--${name}`);
}

export async function hashFile(filePath) {
  try {
    const buf = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch (err) {
    if (err?.code === "ENOENT") return "";
    throw err;
  }
}

export async function hashDirectory(dirPath, { ignore = new Set() } = {}) {
  const parts = [];

  async function walk(dir, prefix = "") {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (ignore.has(entry.name) || entry.name.startsWith("._")) continue;

      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath, rel);
        continue;
      }

      parts.push(`${rel}:${await hashFile(fullPath)}`);
    }
  }

  await walk(dirPath);
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

export async function combinedInputsHash(parts) {
  return crypto
    .createHash("sha256")
    .update(parts.filter((part) => part !== undefined && part !== null).join("\n"))
    .digest("hex");
}

export async function readStamp(stampPath) {
  try {
    const raw = await fs.readFile(stampPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeStamp(stampPath, inputsHash) {
  await fs.mkdir(path.dirname(stampPath), { recursive: true });
  await fs.writeFile(
    stampPath,
    JSON.stringify(
      {
        inputsHash,
        generatedAt: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf8"
  );
}

export async function shouldSkipIncremental({
  incremental,
  force,
  outPath,
  stampPath,
  inputsHash,
}) {
  if (!incremental || force) return false;

  try {
    await fs.access(outPath);
  } catch {
    return false;
  }

  const stamp = await readStamp(stampPath);
  return Boolean(stamp && stamp.inputsHash === inputsHash);
}

export async function hashPaths(repoRoot, relativePaths) {
  const hashes = [];

  for (const relativePath of relativePaths) {
    const absolutePath = path.resolve(repoRoot, relativePath);
    hashes.push(`${relativePath}:${await hashFile(absolutePath)}`);
  }

  return crypto.createHash("sha256").update(hashes.join("\n")).digest("hex");
}
