import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(".");
const SITE_UPDATES_DIR = path.join(ROOT, "public", "site-updates-data");
const VERSIONS_DIR = path.join(SITE_UPDATES_DIR, "versions");
const AUTO_MARKER = "<!-- site-updates:auto -->";

const DATA_ONLY_PATHS = [
  /^public\/release-notes-data\//,
  /^public\/dependency-tree-json\//,
  /^public\/dependency-tree-merged-json\//,
  /^public\/resource-permissions-json\//,
  /^public\/resource-permissions-tf\//,
  /^public\/tf-export-resource-names\//,
  /^public\/tf-export-singletons\//,
  /^public\/spreadsheet-templates\//,
  /^public\/lab-packages\//,
  /^scripts\/generate-spreadsheet-template\.mjs$/,
  /^scripts\/lib\/(lab-export-scope|priority-group-keywords)\.mjs$/,
  /^src\/artifactDownloads\.js$/,
  /^public\/overrides\.json$/,
  /^public\/provider-env-vars\.json$/,
  /^public\/sitemap\.(xml|txt)$/,
  /^public\/seo\//,
  /^\.github\//,
  /^\.automation\//,
  /^\.cache/,
  /^package-lock\.json$/,
  /^dist\//,
];

const USER_VISIBLE_PATHS = [
  /^src\//,
  /^index\.html$/,
  /^scripts\/write-sitemap\.mjs$/,
];

/** Site-updates feature files — not end-user features to announce. */
const SITE_UPDATES_INFRA_PATHS = [
  /^public\/site-updates-data\//,
  /^src\/SiteUpdatesDialog\.jsx$/,
  /^src\/siteUpdates\.js$/,
  /^scripts\/generate-site-updates\.mjs$/,
  /^scripts\/lib\/site-updates-generate\.mjs$/,
];

/** Commit subjects that describe hidden or permalink-only features. */
const HIDDEN_FEATURE_SUBJECT_RE =
  /\b(lab files?|lab package|cx as code lab|spreadsheet|repo recommendations?|practice zip|\/labfiles|\/spreadsheet|\/roles|role template|site updates?|site notes?|env vars?|environment variables?)\b/i;

/** Repo, lab-package, or build-pipeline changes — not explorer UI for end users. */
const INTERNAL_SITE_UPDATE_SUBJECT_RE =
  /\b(readme versioning|terraform\.tfvars|tfvars|latest-merged|json generation|lab readme|bootstrap-local|write-merged|merged-dependency|resource-type-changes|generate-resource|deploy-pages|github actions|provider-source)\b/i;

export function mentionsHiddenSiteFeature(text) {
  return HIDDEN_FEATURE_SUBJECT_RE.test(String(text || ""));
}

export function mentionsInternalSiteUpdate(text) {
  return INTERNAL_SITE_UPDATE_SUBJECT_RE.test(String(text || ""));
}

const SKIP_SUBJECT_RE =
  /^(chore\(release-notes\)|chore\(site-updates\)|chore: monthly keep-alive|merge (branch|pull request)|update (app\.jsx|overrides\.json|package-lock\.json|deploy-pages\.yml|provider-source\.mjs)|bump |dependabot|fix(ed)? ci|github actions|deploy-pages|build script|sitemap|seo\b)/i;

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    base: process.env.GITHUB_EVENT_BEFORE || "",
    head: process.env.GITHUB_SHA || "HEAD",
    date: "",
    dryRun: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--force") options.force = true;
    else if (arg === "--base") options.base = argv[++i] || "";
    else if (arg === "--head") options.head = argv[++i] || "HEAD";
    else if (arg === "--date") options.date = argv[++i] || "";
  }

  return options;
}

function git(args) {
  return execSync(`git ${args}`, { encoding: "utf8", cwd: ROOT }).trim();
}

function isValidRev(rev) {
  if (!rev || /^0+$/.test(rev)) return false;
  try {
    git(`rev-parse --verify ${rev}^{commit}`);
    return true;
  } catch {
    return false;
  }
}

function resolveHeadRev(head) {
  try {
    return git(`rev-parse ${head}`);
  } catch {
    return "";
  }
}

/** Fetch a commit that may be missing from shallow CI checkouts. */
function ensureRevAvailable(rev) {
  if (!rev || /^0+$/.test(rev) || isValidRev(rev)) return isValidRev(rev);
  try {
    execSync(`git fetch --depth=1 origin ${rev}`, { cwd: ROOT, stdio: "pipe" });
  } catch {
    // Fall through to local rev-parse.
  }
  return isValidRev(rev);
}

/** Ensure HEAD~1 exists when checkout used fetch-depth: 1. */
function ensureParentHistory() {
  if (isValidRev("HEAD~1")) return;
  try {
    execSync("git fetch --depth=2 origin HEAD", { cwd: ROOT, stdio: "pipe" });
  } catch {
    // Fall through to later fallbacks.
  }
}

export function resolveRange(options) {
  let base = options.base;
  const head = options.head || "HEAD";
  const headRev = resolveHeadRev(head);

  if (!headRev) return null;

  if (base) ensureRevAvailable(base);

  if (!isValidRev(base)) {
    ensureParentHistory();
    try {
      if (isValidRev("HEAD~1")) {
        base = git("rev-parse HEAD~1");
      } else if (isValidRev("main")) {
        const candidate = git("merge-base main HEAD");
        if (candidate !== headRev) base = candidate;
      } else if (isValidRev("origin/main")) {
        const candidate = git("merge-base origin/main HEAD");
        if (candidate !== headRev) base = candidate;
      }
    } catch {
      base = "";
    }
  }

  if (!isValidRev(base)) return null;

  try {
    if (git(`rev-parse ${base}`) === headRev) return null;
  } catch {
    return null;
  }

  return { base, head };
}

export function changedFiles(base, head) {
  try {
    const out = git(`diff --name-only ${base}..${head}`);
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isDataOnlyPath(filePath) {
  return DATA_ONLY_PATHS.some((pattern) => pattern.test(filePath));
}

export function isSiteUpdatesInfraPath(filePath) {
  return SITE_UPDATES_INFRA_PATHS.some((pattern) => pattern.test(filePath));
}

export function isUserVisiblePath(filePath) {
  if (isDataOnlyPath(filePath)) return false;
  if (isSiteUpdatesInfraPath(filePath)) return false;
  if (USER_VISIBLE_PATHS.some((pattern) => pattern.test(filePath))) return true;
  if (/^scripts\/generate-/.test(filePath)) {
    return !/^scripts\/generate-(tf-export|resource-permissions)/.test(filePath);
  }
  return false;
}

export function cleanSubject(subject) {
  return String(subject || "")
    .replace(/\s*\(#\d+\)\s*$/, "")
    .replace(/^(Enh\/|Fix\/|Chore\/|enh\/|fix\/|chore\/)\s*/i, "")
    .replace(/^chore:\s*/i, "")
    .trim();
}

export function shouldIncludeSubject(subject) {
  const cleaned = cleanSubject(subject);
  if (!cleaned) return false;
  if (SKIP_SUBJECT_RE.test(cleaned)) return false;
  if (HIDDEN_FEATURE_SUBJECT_RE.test(cleaned)) return false;
  if (mentionsInternalSiteUpdate(cleaned)) return false;
  if (/^take \d+$/i.test(cleaned)) return false;
  if (/^(this one has to be it|hopefully final|another special|special one-time|splitting the baby)$/i.test(cleaned)) {
    return false;
  }
  return true;
}

export function commitSubjects(base, head) {
  try {
    const out = git(`log ${base}..${head} --no-merges --format=%s`);
    const subjects = out ? out.split("\n").filter(Boolean) : [];
    const seen = new Set();
    const result = [];

    for (const subject of subjects) {
      if (!shouldIncludeSubject(subject)) continue;
      const cleaned = cleanSubject(subject);
      const key = cleaned.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
    }

    return result;
  } catch {
    return [];
  }
}

export function featureHints(files) {
  const hints = new Set();

  for (const filePath of files) {
    const dialogMatch = filePath.match(/^src\/(.+)Dialog\.jsx$/);
    if (dialogMatch && filePath !== "src/SiteUpdatesDialog.jsx") {
      const name = dialogMatch[1].replace(/([a-z])([A-Z])/g, "$1 $2");
      hints.add(`Dialog update: ${name}`);
    }
    if (filePath === "src/appPermalinks.js") hints.add("Permalink or routing updates");
    if (filePath === "src/pageSeo.js") hints.add("SEO metadata updates");
    if (filePath === "src/App.jsx") hints.add("Explorer UI updates");
    if (filePath === "src/App.css") hints.add("Look-and-feel updates");
    if (filePath === "scripts/write-sitemap.mjs") hints.add("Sitemap and discoverability updates");
  }

  return [...hints];
}

export function formatTitleFromDate(dateStr) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function resolveEntryDate(head, explicitDate = "") {
  if (explicitDate) return explicitDate;
  try {
    return git(`show -s --format=%cd --date=short ${head}`);
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function isAutoGeneratedEntry(content) {
  return content.includes(AUTO_MARKER);
}

function capitalizeSentence(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`;
}

/** Turn commit subjects into readable site-update sections when possible. */
export function expandSubject(subject) {
  const cleaned = cleanSubject(subject);
  const lower = cleaned.toLowerCase();

  if (/\bnon[- ]?exportable\b/.test(lower)) {
    return {
      summary: "Non-exportable resource visibility in Explorer.",
      sections: [
        {
          title: "Non-exportable resource visibility",
          bullets: [
            "Resources that cannot be exported with genesyscloud_tf_export now show a Non-exportable badge in the resource list and detail panel.",
            "genesyscloud_tf_export template guidance in Explorer reflects non-exportable resource types.",
          ],
        },
      ],
    };
  }

  if (/\bdeprecated\b/.test(lower)) {
    return {
      summary: "Deprecated resource visibility in Explorer.",
      sections: [
        {
          title: "Deprecated resource visibility",
          bullets: [
            "Deprecated resource types now show a clear badge in the resource list and detail panel.",
          ],
        },
      ],
    };
  }

  if (/\bout[- ]of[- ]scope\b|\bout of scope\b/.test(lower)) {
    return {
      summary: "Out-of-scope export guidance in Explorer.",
      sections: [
        {
          title: "Out-of-scope export guidance",
          bullets: [
            "Out-of-scope resource types are labeled consistently in Explorer export guidance.",
          ],
        },
      ],
    };
  }

  if (/\bsingleton\b/.test(lower)) {
    return {
      summary: "Singleton resource visibility and export guidance.",
      sections: [
        {
          title: "Singleton resource visibility",
          bullets: [
            "Resources that can only exist once per org now show a clear Singleton indicator in the resource list and detail panel.",
            "Export templates and guidance reflect singleton constraints.",
          ],
        },
      ],
    };
  }

  if (/\bexport resource name\b/.test(lower)) {
    return {
      summary: "",
      sections: [
        {
          title: "What's new",
          bullets: [
            "Export resource name changes now appear as their own type in attribute history.",
          ],
        },
      ],
    };
  }

  if (/\bforcenew\b|\bforce recreate\b|\bforce[- ]new\b/.test(lower)) {
    return {
      summary: "Attributes that force resource recreate are shown in Explorer.",
      sections: [
        {
          title: "Attributes that force recreate",
          bullets: [
            "Resource detail panels list attributes that trigger a full resource recreate when changed.",
          ],
        },
      ],
    };
  }

  return {
    summary: "",
    sections: [{ title: "What's new", bullets: [capitalizeSentence(cleaned)] }],
  };
}

function normalizeDedupeKey(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function dedupeBullets(bullets) {
  const seen = new Set();
  const result = [];

  for (const bullet of bullets) {
    const key = normalizeDedupeKey(bullet);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(bullet);
  }

  return result;
}

function dedupeSummaries(summaries) {
  return dedupeBullets(summaries);
}

function filterVisibleBullets(bullets) {
  return bullets.filter(
    (bullet) =>
      bullet && !mentionsHiddenSiteFeature(bullet) && !mentionsInternalSiteUpdate(bullet)
  );
}

/** Parse an auto-generated site-update entry into header, summary, and sections. */
export function parseAutoMarkdown(content) {
  const lines = String(content || "").split("\n");
  const summaries = [];
  const sections = new Map();
  let headerLine = "";
  let currentSection = null;
  let afterHeader = false;
  let seenFirstSection = false;

  for (const line of lines) {
    if (line.includes(AUTO_MARKER)) continue;

    if (line.startsWith("## ")) {
      headerLine = line;
      afterHeader = true;
      continue;
    }

    if (line.startsWith("### ")) {
      seenFirstSection = true;
      currentSection = line.slice(4).trim();
      if (!sections.has(currentSection)) {
        sections.set(currentSection, []);
      }
      continue;
    }

    if (line.startsWith("- ")) {
      if (currentSection) {
        sections.get(currentSection).push(line.slice(2).trim());
      }
      continue;
    }

    if (afterHeader && !seenFirstSection && line.trim()) {
      summaries.push(line.trim());
    }
  }

  for (const [title, bullets] of sections) {
    sections.set(title, dedupeBullets(bullets));
  }

  return { headerLine, summaries: dedupeSummaries(summaries), sections };
}

function collectSubjectBlocks(subjects) {
  const expansions = subjects.map(expandSubject);
  const summaries = dedupeSummaries(
    expansions
      .map((expansion) => expansion.summary)
      .filter(
        (summary) =>
          summary && !mentionsHiddenSiteFeature(summary) && !mentionsInternalSiteUpdate(summary)
      )
  );
  const sections = new Map();

  for (const expansion of expansions) {
    for (const section of expansion.sections) {
      const bullets = filterVisibleBullets(section.bullets);
      if (!bullets.length) continue;

      const existing = sections.get(section.title) || [];
      sections.set(section.title, dedupeBullets([...existing, ...bullets]));
    }
  }

  return { summaries, sections };
}

function mergeSectionMaps(baseSections, incomingSections) {
  const merged = new Map(baseSections);

  for (const [title, bullets] of incomingSections) {
    const existing = merged.get(title) || [];
    merged.set(title, dedupeBullets([...existing, ...bullets]));
  }

  return merged;
}

function renderMarkdownBlocks({ headerLine, summaries, sections }) {
  const lines = [AUTO_MARKER, headerLine, ""];

  if (summaries.length) {
    lines.push(summaries.join(" "), "");
  }

  for (const [title, bullets] of sections) {
    if (!bullets.length) continue;
    lines.push(`### ${title}`, "");
    for (const bullet of bullets) {
      lines.push(`- ${bullet}`);
    }
    lines.push("");
  }

  return lines;
}

export function buildMarkdown({ date, subjects }) {
  const headerLine = `## Site updates — ${formatTitleFromDate(date)}`;
  const { summaries, sections } = collectSubjectBlocks(subjects);
  return `${renderMarkdownBlocks({ headerLine, summaries, sections }).join("\n").trim()}\n`;
}

export function appendMarkdown(existing, { subjects, date = "" }) {
  if (!subjects.length) return `${existing.trim()}\n`;

  const parsed = parseAutoMarkdown(existing);
  const incoming = collectSubjectBlocks(subjects);
  const headerLine =
    parsed.headerLine || `## Site updates — ${formatTitleFromDate(date)}`;
  const summaries = dedupeSummaries([...parsed.summaries, ...incoming.summaries]);
  const sections = mergeSectionMaps(parsed.sections, incoming.sections);

  return `${renderMarkdownBlocks({ headerLine, summaries, sections }).join("\n").trim()}\n`;
}

export function updateIndexEntries(index, version, title) {
  const next = index.filter((entry) => entry?.version !== version);
  const previous = next[0]?.version || "";
  next.unshift({
    version,
    previous,
    title,
    path: `/site-updates-data/versions/${version}.md`,
  });

  for (let i = 0; i < next.length; i += 1) {
    next[i].previous = next[i + 1]?.version || "";
  }

  return next;
}

export async function generateSiteUpdates(options = parseArgs()) {
  const range = resolveRange(options);
  if (!range) {
    console.log("Site updates: no merge range detected; skipping.");
    return { wrote: false, reason: "no-range" };
  }

  const { base, head } = range;
  const files = changedFiles(base, head);
  const visibleFiles = files.filter(isUserVisiblePath);
  const subjects = commitSubjects(base, head);

  if (!options.force && visibleFiles.length === 0) {
    console.log(
      `Site updates: no user-visible changes between ${base.slice(0, 7)}..${head.slice(0, 7)}; skipping.`
    );
    return { wrote: false, reason: "no-user-visible", base, head, files };
  }

  if (!options.force && subjects.length === 0) {
    console.log("Site updates: only data or chore changes detected; skipping.");
    return { wrote: false, reason: "no-notable-changes", base, head, files };
  }

  const date = resolveEntryDate(head, options.date);
  const title = formatTitleFromDate(date);
  const versionPath = path.join(VERSIONS_DIR, `${date}.md`);

  let markdown = buildMarkdown({ date, subjects });
  let mode = "create";

  try {
    const existing = await fs.readFile(versionPath, "utf8");
    if (isAutoGeneratedEntry(existing)) {
      markdown = appendMarkdown(existing, { subjects, date });
      mode = "append";
    } else {
      console.log(
        `Site updates: ${date}.md exists and looks hand-written; skipping auto-update.`
      );
      return { wrote: false, reason: "manual-entry-exists", date, base, head };
    }
  } catch {
    // new entry
  }

  if (options.dryRun) {
    console.log(`Site updates dry run (${mode}) for ${date}:`);
    console.log(markdown);
    return { wrote: false, reason: "dry-run", date, markdown, base, head };
  }

  await fs.mkdir(VERSIONS_DIR, { recursive: true });
  await fs.writeFile(versionPath, markdown, "utf8");
  await fs.writeFile(path.join(SITE_UPDATES_DIR, "latest.md"), markdown, "utf8");

  let index = [];
  try {
    index = JSON.parse(await fs.readFile(path.join(SITE_UPDATES_DIR, "index.json"), "utf8"));
  } catch {
    index = [];
  }

  const nextIndex = updateIndexEntries(index, date, title);
  await fs.writeFile(
    path.join(SITE_UPDATES_DIR, "index.json"),
    `${JSON.stringify(nextIndex, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(SITE_UPDATES_DIR, "latest.json"),
    `${JSON.stringify(
      {
        version: date,
        title,
        path: `/site-updates-data/versions/${date}.md`,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  console.log(
    `Site updates: ${mode} ${path.relative(ROOT, versionPath)} from ${base.slice(0, 7)}..${head.slice(0, 7)} (${visibleFiles.length} user-visible files, ${subjects.length} commits).`
  );

  return {
    wrote: true,
    mode,
    date,
    base,
    head,
    visibleFiles,
    subjects,
  };
}
