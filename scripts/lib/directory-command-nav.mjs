const PATH_SEP = " > ";
const COMMAND_VIEW_PREFIX = "navBar.commandView.";

const PREFERRED_DIRECTORY_TITLE_KEY_PATTERNS = [/\.taskListWorkitems$/];

function directoryTitleKeyRank(titleKey) {
  if (!titleKey) return 0;
  return PREFERRED_DIRECTORY_TITLE_KEY_PATTERNS.some((pattern) => pattern.test(titleKey)) ? 2 : 1;
}

function permissionsToAuthorize(permissions) {
  return [...new Set(permissions.filter(Boolean))]
    .sort()
    .map((permission) => `policy=${permission}`)
    .join(" | ");
}

function resolveCommandViewNode(node, segment) {
  if (!node || typeof node !== "object") return null;

  let current = node;
  for (const part of segment.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = current.subMenu?.[part] ?? current[part];
  }

  return current;
}

function labelFromCommandViewNode(value, fallback) {
  if (typeof value === "string") return value;
  if (typeof value?.title === "string") return value.title;
  return fallback;
}

export function commandViewTitleToPath(titleKey, directoryTranslations) {
  const commandView = directoryTranslations?.navBar?.commandView;
  if (!commandView || !titleKey.startsWith(COMMAND_VIEW_PREFIX)) return null;

  const rest = titleKey.slice(COMMAND_VIEW_PREFIX.length);
  const segments = rest.split(".subMenu.");
  if (segments.length === 0) return null;

  let node = commandView;
  const labels = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const isLeaf = index === segments.length - 1;

    if (isLeaf) {
      labels.push(labelFromCommandViewNode(resolveCommandViewNode(node, segment), segment));
      continue;
    }

    node = resolveCommandViewNode(node, segment);
    if (!node || typeof node !== "object") return null;
    labels.push(labelFromCommandViewNode(node, segment));
    node = node.subMenu ?? node;
  }

  return labels.filter(Boolean).join(PATH_SEP) || null;
}

const COMMAND_NAV_ENTRY_START =
  /title:"(navBar\.commandView\.[^"]+)"(?:,icon:[^,]+)?,(?:link:"([^"]+)"|link:""\.concat\(window\.location\.origin,"([^"]+)"\))(?:,altLink:\[[^\]]*\])?,hide:/g;

const HIDE_EXPR_TERMINATORS = [
  ',keywords:"',
  ",externalLink:",
  ",subMenu:[",
  '},{title:"navBar.commandView',
];

function findHideExprEnd(bundleText, hideStart) {
  let hideEnd = -1;

  for (const terminator of HIDE_EXPR_TERMINATORS) {
    const index = bundleText.indexOf(terminator, hideStart);
    if (index >= 0 && (hideEnd === -1 || index < hideEnd)) {
      hideEnd = index;
    }
  }

  if (hideEnd === -1) {
    hideEnd = bundleText.indexOf("}]}", hideStart);
  }

  return hideEnd;
}

export function parseCommandNavEntries(bundleText) {
  if (typeof bundleText !== "string" || !bundleText.includes(COMMAND_VIEW_PREFIX)) {
    return [];
  }

  const entries = [];
  let match;

  while ((match = COMMAND_NAV_ENTRY_START.exec(bundleText))) {
    const hideStart = COMMAND_NAV_ENTRY_START.lastIndex;
    const hideEnd = findHideExprEnd(bundleText, hideStart);
    if (hideEnd === -1) continue;

    const hideExpr = bundleText.slice(hideStart, hideEnd);
    const permissions = [
      ...new Set([...hideExpr.matchAll(/perm\)\("([^"]+)"\)/g)].map((part) => part[1])),
    ];

    if (permissions.length === 0) continue;

    entries.push({
      titleKey: match[1],
      link: match[2] || match[3] || "",
      permissions,
    });
  }

  return entries;
}

export function buildDirectoryMenuRows(bundleText, directoryTranslations) {
  const byAuthLink = new Map();

  for (const entry of parseCommandNavEntries(bundleText)) {
    const menuPath = commandViewTitleToPath(entry.titleKey, directoryTranslations);
    if (!menuPath) continue;

    const row = {
      path: menuPath,
      authorize: permissionsToAuthorize(entry.permissions),
      link: entry.link,
      titleKey: entry.titleKey,
      menuSource: "directory-command-nav",
    };

    const dedupeKey = `${row.authorize}\0${row.link}`;
    const existing = byAuthLink.get(dedupeKey);
    if (!existing || directoryTitleKeyRank(row.titleKey) > directoryTitleKeyRank(existing.titleKey)) {
      byAuthLink.set(dedupeKey, row);
    }
  }

  return [...byAuthLink.values()].sort((a, b) => a.path.localeCompare(b.path));
}

async function fetchText(url, label) {
  const response = await fetch(url, {
    headers: { Accept: "*/*", "User-Agent": "cxascode-gui-menu-paths" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${label} fetch failed ${response.status} ${response.statusText}\n${text}`);
  }
  return response.text();
}

export async function discoverDirectoryAssets(directoryBase) {
  const base = String(directoryBase || "").replace(/\/$/, "");
  const html = await fetchText(`${base}/directory/`, "Directory index");
  const bundlePath = html.match(
    /\/directory\/build-assets\/[\d.-]+\/assets\/web-directory-[a-f0-9]+\.js/
  )?.[0];

  if (!bundlePath) {
    throw new Error(`Could not discover web-directory bundle under ${base}/directory/`);
  }

  const version = bundlePath.match(/\/directory\/build-assets\/([\d.-]+)\//)?.[1];
  if (!version) {
    throw new Error(`Could not parse directory build version from ${bundlePath}`);
  }

  return {
    bundleUrl: `${base}${bundlePath}`,
    translationsUrl: `${base}/directory/build-assets/${version}/translations/en-us.json`,
    buildVersion: version,
  };
}

function isRemoteSource(source) {
  return /^https?:\/\//i.test(source);
}

export async function loadDirectoryCommandNav({
  bundleSource = "",
  translationsSource = "",
  directoryBase = "",
  readJson,
  readText,
}) {
  let bundleText = "";
  let translations = null;
  let bundleResolved = bundleSource;
  let translationsResolved = translationsSource;

  if (!bundleResolved && !translationsResolved && directoryBase) {
    const discovered = await discoverDirectoryAssets(directoryBase);
    bundleResolved = discovered.bundleUrl;
    translationsResolved = discovered.translationsUrl;
  } else if (!bundleResolved && directoryBase) {
    const discovered = await discoverDirectoryAssets(directoryBase);
    bundleResolved = discovered.bundleUrl;
    if (!translationsResolved) {
      translationsResolved = discovered.translationsUrl;
    }
  } else if (!translationsResolved && bundleResolved) {
    const version = String(bundleResolved).match(
      /\/directory\/build-assets\/([\d.-]+)\//
    )?.[1];
    if (version) {
      const base = isRemoteSource(bundleResolved)
        ? new URL(bundleResolved).origin
        : directoryBase.replace(/\/$/, "");
      translationsResolved = `${base}/directory/build-assets/${version}/translations/en-us.json`;
    }
  }

  if (bundleResolved) {
    bundleText = isRemoteSource(bundleResolved)
      ? await fetchText(bundleResolved, "Directory bundle")
      : await readText(bundleResolved);
  }

  if (translationsResolved) {
    translations = isRemoteSource(translationsResolved)
      ? JSON.parse(await fetchText(translationsResolved, "Directory translations"))
      : await readJson(translationsResolved);
  }

  if (!bundleText || !translations) {
    return {
      menuRows: [],
      commandNavEntryCount: 0,
      sources: {
        bundle: bundleResolved || null,
        translations: translationsResolved || null,
      },
    };
  }

  const parsedEntries = parseCommandNavEntries(bundleText);
  const menuRows = buildDirectoryMenuRows(bundleText, translations);

  return {
    menuRows,
    commandNavEntryCount: parsedEntries.length,
    sources: {
      bundle: bundleResolved,
      translations: translationsResolved,
    },
  };
}
