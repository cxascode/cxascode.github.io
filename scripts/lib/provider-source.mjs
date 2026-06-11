import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const PROVIDER_OWNER = "MyPureCloud";
export const PROVIDER_REPO = "terraform-provider-genesyscloud";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DEFAULT_CACHE_ROOT = path.resolve(REPO_ROOT, ".cache/provider-source");

// Display version (vX.Y.Z) -> actual upstream GitHub release tag.
// Keep in sync with RELEASE_TAG_OVERRIDES in cxascode/releasenotes.
export const RELEASE_TAG_OVERRIDES = {
  "v1.68.2": "1.68.2",
};

function normalizeVersion(version) {
  return String(version).trim().replace(/^v/, "");
}

function displayVersion(version) {
  const normalized = normalizeVersion(version);
  return normalized ? `v${normalized}` : "";
}

export function resolveProviderReleaseTag(version) {
  const display = displayVersion(version);
  if (!display) {
    throw new Error("Provider version is required");
  }

  return RELEASE_TAG_OVERRIDES[display] || display;
}

export function providerSourceUrl(tag) {
  return `https://github.com/${PROVIDER_OWNER}/${PROVIDER_REPO}/archive/refs/tags/${tag}.tar.gz`;
}

export async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return genesyscloud/ source for a provider release version.
 * Downloads and extracts the release .tar.gz once, then reuses the cache.
 */
export async function ensureProviderSource(
  version,
  cacheRoot = process.env.TF_EXPORT_PROVIDER_CACHE ||
    DEFAULT_CACHE_ROOT
) {
  const normalizedVersion = normalizeVersion(version);
  if (!normalizedVersion) {
    throw new Error("Provider version is required");
  }

  const providerRoot = path.join(cacheRoot, normalizedVersion, "genesyscloud");
  if (await pathExists(providerRoot)) {
    return providerRoot;
  }

  const tag = resolveProviderReleaseTag(normalizedVersion);
  const url = providerSourceUrl(tag);
  await fs.mkdir(cacheRoot, { recursive: true });

  const tarball = path.join(cacheRoot, `${tag}.tar.gz`);
  if (!(await pathExists(tarball))) {
    console.log(`Downloading provider source ${tag}...`);
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(
        `Failed to download provider source ${tag}: ${response.status} ${response.statusText}`
      );
    }
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(tarball, Buffer.from(arrayBuffer));
  }

  const extracted = path.join(cacheRoot, `terraform-provider-genesyscloud-${normalizedVersion}`);
  await execFileAsync("tar", ["-xzf", tarball, "-C", cacheRoot]);

  if (!(await pathExists(path.join(extracted, "genesyscloud")))) {
    throw new Error(`genesyscloud/ not found in provider source archive for ${tag}`);
  }

  await fs.mkdir(path.join(cacheRoot, normalizedVersion), { recursive: true });
  await fs.rename(path.join(extracted, "genesyscloud"), providerRoot);
  await fs.rm(extracted, { recursive: true, force: true });

  return providerRoot;
}
