/**
 * Central visibility policy for site features.
 *
 * Add a feature here once when it should not be promoted on the public site
 * (or when it needs special handling). Downstream build steps derive filters
 * from this file instead of hard-coding paths/keywords in each script.
 *
 * visibility:
 *   - public     — explorer dialogs linked in nav / sitemap; announce in site updates
 *   - semi-public — valid route + SEO, not linked in nav or sitemap
 *   - shareable  — download permalink users share directly (header link optional);
 *                  suppress generator/chore commits in site updates
 *   - hidden     — private download permalink; never announce or scrub into site updates
 *
 * siteUpdates.commitKeywords — omit matching git commit subjects from site updates
 * siteUpdates.scrubKeywords    — remove matching text from auto-generated site updates
 * siteUpdates.dataOnlyPaths    — file paths that never count as user-visible changes
 */

/** @typedef {"public" | "semi-public" | "shareable" | "hidden"} FeatureVisibility */

/** @type {ReadonlyArray<{
 *   id: string;
 *   visibility: FeatureVisibility;
 *   permalink?: { segment: string; subSegments?: string[] };
 *   siteUpdates?: {
 *     commitKeywords?: string[];
 *     scrubKeywords?: string[];
 *     dataOnlyPaths?: RegExp[];
 *   };
 * }>} */
export const SITE_FEATURES = [
  {
    id: "spreadsheet",
    visibility: "hidden",
    permalink: { segment: "spreadsheet" },
    siteUpdates: {
      commitKeywords: [
        "spreadsheet",
        "/spreadsheet",
        "repo recommendations",
        "practice zip",
        "cx-as-code-template",
      ],
      scrubKeywords: ["spreadsheet", "/spreadsheet", "repo recommendations", "practice zip"],
      dataOnlyPaths: [
        /^public\/spreadsheet-templates\//,
        /^scripts\/generate-spreadsheet-template\.mjs$/,
        /^scripts\/build-spreadsheet-templates\.mjs$/,
        /^scripts\/lib\/spreadsheet-styles\.mjs$/,
        /^scripts\/templates\/cx-as-code-spreadsheet-template\.xlsx$/,
      ],
    },
  },
  {
    id: "labfiles",
    visibility: "hidden",
    permalink: { segment: "labfiles" },
    siteUpdates: {
      commitKeywords: [
        "lab files",
        "lab file",
        "lab package",
        "lab packages",
        "cx as code lab",
        "/labfiles",
        "practice zip",
      ],
      scrubKeywords: [
        "lab files",
        "lab file",
        "lab package",
        "lab packages",
        "cx as code lab",
        "/labfiles",
        "practice zip",
      ],
      dataOnlyPaths: [
        /^public\/lab-packages\//,
        /^scripts\/generate-lab-package\.mjs$/,
        /^scripts\/lib\/lab-export-scope\.mjs$/,
      ],
    },
  },
  {
    id: "supported-resources",
    visibility: "hidden",
    permalink: { segment: "supported-resources" },
    siteUpdates: {
      commitKeywords: [
        "supported resources",
        "supported-resources",
        "/supported-resources",
        "configuration coverage",
      ],
      scrubKeywords: [
        "supported resources",
        "supported-resources",
        "/supported-resources",
        "configuration coverage",
      ],
      dataOnlyPaths: [
        /^public\/supported-resources-templates\//,
        /^scripts\/generate-supported-resources-spreadsheet\.mjs$/,
        /^scripts\/lib\/supported-resources-menu-destination\.mjs$/,
        /^scripts\/templates\/cx-as-code-supported-resources-template\.xlsx$/,
      ],
    },
  },
  {
    id: "roles",
    visibility: "shareable",
    permalink: { segment: "roles", subSegments: ["read-write", "read-only"] },
    siteUpdates: {
      commitKeywords: ["role template", "/roles"],
      scrubKeywords: [],
      dataOnlyPaths: [
        /^public\/resource-permissions-json\//,
        /^public\/resource-permissions-tf\//,
        /^scripts\/generate-resource-permissions-tf\.mjs$/,
      ],
    },
  },
  {
    id: "env-vars",
    visibility: "semi-public",
    permalink: { segment: "env-vars" },
    siteUpdates: {
      commitKeywords: ["env vars", "environment variables", "provider-env-vars"],
      scrubKeywords: ["env vars", "environment variables"],
      dataOnlyPaths: [/^public\/provider-env-vars\.json$/, /^scripts\/verify-tf-export-env-vars\.mjs$/],
    },
  },
];

/** Generated/provider cache paths — not end-user feature announcements. */
export const BUILD_DATA_ONLY_PATHS = [
  /^public\/release-notes-data\//,
  /^public\/dependency-tree-json\//,
  /^public\/dependency-tree-merged-json\//,
  /^public\/tf-export-resource-names\//,
  /^public\/tf-export-singletons\//,
  /^public\/schema-force-new\//,
  /^scripts\/lib\/priority-group-keywords\.mjs$/,
  /^src\/artifactDownloads\.js$/,
  /^public\/overrides\.json$/,
  /^public\/sitemap\.(xml|txt)$/,
  /^public\/seo\//,
  /^\.github\//,
  /^\.automation\//,
  /^\.cache/,
  /^package-lock\.json$/,
  /^dist\//,
];

/** Commit subjects that describe build/infra work, not explorer UX. */
export const INTERNAL_SITE_UPDATE_COMMIT_KEYWORDS = [
  "readme versioning",
  "terraform.tfvars",
  "tfvars",
  "latest-merged",
  "json generation",
  "lab readme",
  "bootstrap-local",
  "write-merged",
  "merged-dependency",
  "resource-type-changes",
  "generate-resource",
  "deploy-pages",
  "github actions",
  "provider-source",
];

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

function keywordToPattern(keyword) {
  const trimmed = String(keyword || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("/")) {
    return trimmed.replace(ESCAPE_REGEX, "\\$&");
  }
  return `\\b${trimmed.replace(ESCAPE_REGEX, "\\$&")}\\b`;
}

function collectKeywords(selector) {
  const keywords = new Set();
  for (const feature of SITE_FEATURES) {
    for (const keyword of feature.siteUpdates?.[selector] || []) {
      if (keyword) keywords.add(keyword);
    }
  }
  return [...keywords];
}

function collectDataOnlyPathPatterns() {
  const patterns = [...BUILD_DATA_ONLY_PATHS];
  for (const feature of SITE_FEATURES) {
    for (const pattern of feature.siteUpdates?.dataOnlyPaths || []) {
      patterns.push(pattern);
    }
  }
  return patterns;
}

function buildKeywordRegex(keywords, { wordBoundary = true } = {}) {
  const parts = keywords
    .map((keyword) => (wordBoundary ? keywordToPattern(keyword) : keyword.replace(ESCAPE_REGEX, "\\$&")))
    .filter(Boolean);
  if (!parts.length) return /(?!)/;
  return new RegExp(`(?:${parts.join("|")})`, "i");
}

let cachedPolicy = null;

function getPolicy() {
  if (cachedPolicy) return cachedPolicy;

  const commitKeywords = [
    ...collectKeywords("commitKeywords"),
    ...INTERNAL_SITE_UPDATE_COMMIT_KEYWORDS,
    "site updates",
    "site notes",
  ];
  const scrubKeywords = collectKeywords("scrubKeywords");

  cachedPolicy = {
    dataOnlyPathPatterns: collectDataOnlyPathPatterns(),
    hiddenPermalinkTextPattern: buildKeywordRegex(scrubKeywords),
    hiddenCommitSubjectPattern: buildKeywordRegex(commitKeywords),
    suppressedSubjectPattern: buildKeywordRegex(
      SITE_FEATURES.flatMap((feature) => feature.siteUpdates?.commitKeywords || [])
    ),
  };

  return cachedPolicy;
}

export function getSiteUpdateDataOnlyPathPatterns() {
  return getPolicy().dataOnlyPathPatterns;
}

export function getHiddenPermalinkSiteUpdateTextPattern() {
  return getPolicy().hiddenPermalinkTextPattern;
}

export function getHiddenFeatureCommitSubjectPattern() {
  return getPolicy().hiddenCommitSubjectPattern;
}

export function isDataOnlyFeaturePath(filePath) {
  return getSiteUpdateDataOnlyPathPatterns().some((pattern) => pattern.test(filePath));
}

export function mentionsHiddenSiteFeature(text) {
  return getHiddenPermalinkSiteUpdateTextPattern().test(String(text || ""));
}

export function mentionsInternalSiteUpdate(text) {
  return buildKeywordRegex(INTERNAL_SITE_UPDATE_COMMIT_KEYWORDS).test(String(text || ""));
}

export function isSiteUpdateSuppressedSubject(subject) {
  return getPolicy().suppressedSubjectPattern.test(String(subject || ""));
}

export function getFeatureById(id) {
  return SITE_FEATURES.find((feature) => feature.id === id) || null;
}

export function getFeaturesByVisibility(visibility) {
  return SITE_FEATURES.filter((feature) => feature.visibility === visibility);
}

/** Dialog routes that belong in the public sitemap (not download permalinks). */
export const PUBLIC_SITEMAP_DIALOG_PATHS = [
  "/release-notes",
  "/site-updates",
  "/creation-order",
  "/attribute-index",
];
