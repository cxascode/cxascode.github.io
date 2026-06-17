import {
  artifactDownloadVersionLabel,
  fetchNewestListedRelease,
  RELEASE_NOTES_SCOPE_EXPORT,
  RELEASE_NOTES_SCOPE_PROVIDER,
} from "./releaseNotes.js";

const BASE = import.meta.env.BASE_URL;

export const ARTIFACT_SPREADSHEET = "spreadsheet";
export const ARTIFACT_READ_WRITE_ROLE = "read-write-role";
export const ARTIFACT_READ_ONLY_ROLE = "read-only-role";

const ARTIFACTS = {
  [ARTIFACT_SPREADSHEET]: {
    latestPath: "spreadsheet-templates/latest-cx-as-code-template.xlsx",
    versionedPath: (version) => `spreadsheet-templates/${version}-cx-as-code-template.xlsx`,
    filename: (label) => `cx-as-code-template-${label}.xlsx`,
  },
  [ARTIFACT_READ_WRITE_ROLE]: {
    latestPath: "resource-permissions-tf/latest-read-write-role.tf",
    versionedPath: (version) => `resource-permissions-tf/${version}-read-write-role.tf`,
    filename: (label) => `cx-as-code-read-write-role-${label}.tf`,
  },
  [ARTIFACT_READ_ONLY_ROLE]: {
    latestPath: "resource-permissions-tf/latest-read-only-role.tf",
    versionedPath: (version) => `resource-permissions-tf/${version}-read-only-role.tf`,
    filename: (label) => `cx-as-code-read-only-role-${label}.tf`,
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

export function artifactHref(artifactId, version = "latest") {
  const config = ARTIFACTS[artifactId];
  if (!config) return "";

  if (isLatestArtifactVersion(version)) {
    return `${BASE}${config.latestPath}`;
  }

  return `${BASE}${config.versionedPath(normalizeArtifactVersion(version))}`;
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
    href: artifactHref(artifactId, version),
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
