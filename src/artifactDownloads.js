import {
  LAB_PACKAGES_DIR,
  RESOURCE_PERMISSIONS_TF_DIR,
  SPREADSHEET_TEMPLATES_DIR,
  SUPPORTED_RESOURCES_TEMPLATES_DIR,
} from "./publicDataPaths.js";
import {
  artifactDownloadVersionLabel,
  fetchNewestListedRelease,
  RELEASE_NOTES_SCOPE_EXPORT,
  RELEASE_NOTES_SCOPE_PROVIDER,
} from "./releaseNotes.js";

const BASE = import.meta.env.BASE_URL;

export const ARTIFACT_SPREADSHEET = "spreadsheet";
export const ARTIFACT_SUPPORTED_RESOURCES = "supported-resources";
export const ARTIFACT_READ_WRITE_ROLE = "read-write-role";
export const ARTIFACT_READ_ONLY_ROLE = "read-only-role";
export const ARTIFACT_LAB = "lab";

const ARTIFACTS = {
  [ARTIFACT_SPREADSHEET]: {
    latestPath: `${SPREADSHEET_TEMPLATES_DIR}/latest-cx-as-code-template.xlsx`,
    versionedPath: (version) => `${SPREADSHEET_TEMPLATES_DIR}/${version}-cx-as-code-template.xlsx`,
    filename: (label) => `cx-as-code-template-${label}.xlsx`,
  },
  [ARTIFACT_SUPPORTED_RESOURCES]: {
    latestPath: `${SUPPORTED_RESOURCES_TEMPLATES_DIR}/latest-supported-resources.xlsx`,
    versionedPath: (version) =>
      `${SUPPORTED_RESOURCES_TEMPLATES_DIR}/${version}-supported-resources.xlsx`,
    filename: (label) => `cx-as-code-supported-resources-${label}.xlsx`,
  },
  [ARTIFACT_READ_WRITE_ROLE]: {
    latestPath: `${RESOURCE_PERMISSIONS_TF_DIR}/latest-read-write-role.tf`,
    versionedPath: (version) => `${RESOURCE_PERMISSIONS_TF_DIR}/${version}-read-write-role.tf`,
    filename: (label) => `cx-as-code-read-write-role-${label}.tf`,
  },
  [ARTIFACT_READ_ONLY_ROLE]: {
    latestPath: `${RESOURCE_PERMISSIONS_TF_DIR}/latest-read-only-role.tf`,
    versionedPath: (version) => `${RESOURCE_PERMISSIONS_TF_DIR}/${version}-read-only-role.tf`,
    filename: (label) => `cx-as-code-read-only-role-${label}.tf`,
  },
  [ARTIFACT_LAB]: {
    latestPath: `${LAB_PACKAGES_DIR}/latest-cx-as-code-lab.zip`,
    versionedPath: (version) => `${LAB_PACKAGES_DIR}/${version}-cx-as-code-lab.zip`,
    filename: (label) => `cx-as-code-lab-${label}.zip`,
  },
};

function normalizeArtifactVersion(version) {
  return String(version || "")
    .trim()
    .replace(/^v/i, "");
}

function isLatestArtifactVersion(version) {
  const bare = normalizeArtifactVersion(version);
  return !bare || bare === "latest";
}

export function artifactHref(artifactId, version = "latest", { cacheBust = false } = {}) {
  const config = ARTIFACTS[artifactId];
  if (!config) return "";

  const path = isLatestArtifactVersion(version)
    ? config.latestPath
    : config.versionedPath(normalizeArtifactVersion(version));

  const href = `${BASE}${path}`;
  return cacheBust ? `${href}?v=${Date.now()}` : href;
}

export async function resolveArtifactDownloadVersionLabel(
  version = "latest",
  newestListedRelease = ""
) {
  if (!isLatestArtifactVersion(version)) {
    return artifactDownloadVersionLabel(version, newestListedRelease);
  }

  const resolved = newestListedRelease || (await fetchNewestListedRelease());
  return artifactDownloadVersionLabel("latest", resolved);
}

export function artifactDownloadFilename(artifactId, versionLabel) {
  const config = ARTIFACTS[artifactId];
  if (!config) return "";
  return config.filename(versionLabel);
}

export function releaseNotesDownloadFilename(
  versionLabel,
  scope = RELEASE_NOTES_SCOPE_PROVIDER
) {
  if (versionLabel === "unknown") {
    return scope === RELEASE_NOTES_SCOPE_EXPORT
      ? "cx-as-code-export-release-notes.md"
      : "cx-as-code-release-notes.md";
  }

  if (scope === RELEASE_NOTES_SCOPE_EXPORT) {
    return `cx-as-code-export-release-notes-${versionLabel}.md`;
  }

  return `cx-as-code-release-notes-${versionLabel}.md`;
}

function triggerBrowserDownload({ href, filename }) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function triggerBlobDownload({ blob, filename, mimeType = "application/octet-stream" }) {
  const url = URL.createObjectURL(new Blob([blob], { type: mimeType }));
  try {
    triggerBrowserDownload({ href: url, filename });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function downloadUrlArtifact(
  artifactId,
  version = "latest",
  newestListedRelease = ""
) {
  const versionLabel = await resolveArtifactDownloadVersionLabel(version, newestListedRelease);
  triggerBrowserDownload({
    href: artifactHref(artifactId, version, { cacheBust: true }),
    filename: artifactDownloadFilename(artifactId, versionLabel),
  });
}

export async function downloadReleaseNotesArtifact(
  version = "latest",
  newestListedRelease = "",
  markdown = "",
  scope = RELEASE_NOTES_SCOPE_PROVIDER
) {
  const versionLabel = await resolveArtifactDownloadVersionLabel(version, newestListedRelease);
  triggerBlobDownload({
    blob: markdown,
    filename: releaseNotesDownloadFilename(versionLabel, scope),
    mimeType: "text/markdown;charset=utf-8",
  });
}
