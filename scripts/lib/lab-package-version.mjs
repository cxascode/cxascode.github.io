/** Match genesyscloud provider version pins in lab .tf files. */
export const PROVIDER_VERSION_PIN_RE = /version\s*=\s*"~>\s*[\d.]+"/g;

export function renderProviderVersionPin(version) {
  const normalized = String(version || "")
    .trim()
    .replace(/^v/i, "");
  if (!normalized) {
    throw new Error("Provider version is required");
  }
  return `version = "~> ${normalized}"`;
}

export function patchProviderVersionPins(content, version) {
  return content.replace(PROVIDER_VERSION_PIN_RE, renderProviderVersionPin(version));
}
