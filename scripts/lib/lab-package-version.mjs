import { MIN_DEPENDENCY_TREE_VERSION } from "./public-data-path-constants.mjs";

/** Match genesyscloud provider version pins in lab .tf files. */
export const PROVIDER_VERSION_PIN_RE = /version\s*=\s*"~>\s*[\d.]+"/g;

/** Match genesyscloud provider version line in lab README.md. */
export const LAB_README_PROVIDER_VERSION_RE = /genesyscloud\s+~>\s*[\d.]+/g;

const LAB_README_PROVIDER_VERSION_VALUE_RE = /genesyscloud\s+~>\s*([\d.]+)/g;

/** Static lab template source pins; replaced per zip at package build time. */
export const LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER = MIN_DEPENDENCY_TREE_VERSION;

export function isLabTerraformTemplateFile(filename) {
  return filename.endsWith(".tf") || filename.endsWith(".tf.bak");
}

export function renderProviderVersionPin(version) {
  const normalized = String(version || "")
    .trim()
    .replace(/^v/i, "");
  if (!normalized) {
    throw new Error("Provider version is required");
  }
  return `version = "~> ${normalized}"`;
}

export function renderLabTemplateProviderVersionPin() {
  return renderProviderVersionPin(LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER);
}

export function findProviderVersionPinValues(content) {
  return [...content.matchAll(PROVIDER_VERSION_PIN_VALUE_RE)].map((match) => match[1]);
}

export function findLabTemplateProviderVersionPinMismatches(content) {
  const expected = LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER;
  return findProviderVersionPinValues(content).filter((value) => value !== expected);
}

export function renderLabReadmeProviderVersionLine(version) {
  const normalized = String(version || "")
    .trim()
    .replace(/^v/i, "");
  if (!normalized) {
    throw new Error("Provider version is required");
  }
  return `genesyscloud ~> ${normalized}`;
}

export function findLabReadmeProviderVersionValues(content) {
  return [...content.matchAll(LAB_README_PROVIDER_VERSION_VALUE_RE)].map((match) => match[1]);
}

export function findLabReadmeProviderVersionMismatch(content) {
  const expected = LAB_TEMPLATE_PROVIDER_VERSION_PLACEHOLDER;
  return findLabReadmeProviderVersionValues(content).filter((value) => value !== expected);
}

export function patchLabReadmeProviderVersion(content, version) {
  return content.replace(LAB_README_PROVIDER_VERSION_RE, renderLabReadmeProviderVersionLine(version));
}

export function patchProviderVersionPins(content, version) {
  return content.replace(PROVIDER_VERSION_PIN_RE, renderProviderVersionPin(version));
}
