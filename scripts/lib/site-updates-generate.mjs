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
  /^public\/resource-permissions-json\//,
  /^public\/resource-permissions-tf\//,
  /^public\/tf-export-resource-names\//,
  /^public\/tf-export-singletons\//,
  /^public\/spreadsheet-templates\//,
  /^public\/lab-packages\//,
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
  /^public\/site-updates-data\//,
];

/** Commit subjects that describe hidden or permalink-only features. */
const HIDDEN_FEATURE_SUBJECT_RE =
  /\b(lab files?|lab package|cx as code lab|spreadsheet|practice zip|\/labfiles|\/spreadsheet)\b/i;

const SKIP_SUBJECT_RE =
  /^(chore\(release-notes\)|chore: monthly keep-alive|merge (branch|pull request)|update (app\.jsx|overrides\.json|package-lock\.json|deploy-pages\.yml|provider-source\.mjs)|bump |dependabot|fix(ed)? ci|github actions|deploy-pages|build script|sitemap|seo\b)/i;

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

export function resolveRange(options) {
  let base = options.base;
  const head = options.head || "HEAD";

  if (!isValidRev(base)) {
    try {
      if (isValidRev("main")) base = git("merge-base main HEAD");
      else if (isValidRev("origin/main")) base = git("merge-base origin/main HEAD");
      else base = git("rev-parse HEAD~1");
    } catch {
      base = "";
    }
  }

  if (!isValidRev(base) || base === git(`rev-parse ${head}`)) {
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

export function isUserVisiblePath(filePath) {
  if (isDataOnlyPath(filePath)) return false;
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
    if (dialogMatch) {
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

export function buildMarkdown({ date, subjects }) {
  const title = formatTitleFromDate(date);
  const lines = [
    AUTO_MARKER,
    `## Site updates — ${title}`,
    "",
  ];

  if (subjects.length) {
    lines.push("### What's new", "");
    for (const subject of subjects) {
      lines.push(`- ${subject}`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

export function appendMarkdown(existing, { subjects }) {
  if (!subjects.length) return `${existing.trim()}\n`;

  const blocks = ["### What's new", "", ...subjects.map((subject) => `- ${subject}`), ""];

  return `${existing.trim()}\n\n${blocks.join("\n").trim()}\n`;
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
  const hints = featureHints(visibleFiles);

  if (!options.force && visibleFiles.length === 0) {
    console.log(
      `Site updates: no user-visible changes between ${base.slice(0, 7)}..${head.slice(0, 7)}; skipping.`
    );
    return { wrote: false, reason: "no-user-visible", base, head, files };
  }

  if (!options.force && subjects.length === 0 && hints.length === 0) {
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
      markdown = appendMarkdown(existing, { subjects });
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
