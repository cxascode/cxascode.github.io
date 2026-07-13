import fs from "node:fs/promises";
import path from "node:path";

import { PUBLIC_SITEMAP_DIALOG_PATHS } from "./lib/site-feature-policy.mjs";

const SITE_ORIGIN = "https://cxascode.github.io";
const PUBLIC_DIR = path.resolve("public");
const ROOT_DIR = path.resolve(".");
const lastmod = new Date().toISOString().slice(0, 10);

const DIALOG_PATHS = PUBLIC_SITEMAP_DIALOG_PATHS;

async function loadResourcePaths() {
  const [latestRaw, overridesRaw] = await Promise.all([
    fs.readFile(path.join(PUBLIC_DIR, "dependency-tree-json/latest.json"), "utf8"),
    fs.readFile(path.join(PUBLIC_DIR, "overrides.json"), "utf8"),
  ]);

  const latest = JSON.parse(latestRaw);
  const overrides = JSON.parse(overridesRaw);
  const hidden = new Set(
    Array.isArray(overrides.hiddenResourceTypes) ? overrides.hiddenResourceTypes : []
  );

  return (latest.resources || [])
    .map((resource) => resource?.type)
    .filter((type) => typeof type === "string" && type.trim() && !hidden.has(type))
    .sort()
    .map((type) => `/${encodeURIComponent(type.trim())}`);
}

function buildSitemap(urls) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (loc) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`
  )
  .join("\n")}
</urlset>
`;

  const txt = `${urls.join("\n")}\n`;
  return { xml, txt };
}

async function loadSiteUpdatesPaths() {
  try {
    const raw = await fs.readFile(
      path.join(PUBLIC_DIR, "site-updates-data/index.json"),
      "utf8"
    );
    const index = JSON.parse(raw);
    if (!Array.isArray(index)) return [];

    return index
      .map((entry) => entry?.version)
      .filter((version) => typeof version === "string" && /^\d{4}-\d{2}-\d{2}$/.test(version))
      .map((version) => `/site-updates/${version}`);
  } catch {
    return [];
  }
}

async function write() {
  const [resourcePaths, siteUpdatesPaths] = await Promise.all([
    loadResourcePaths(),
    loadSiteUpdatesPaths(),
  ]);
  const urls = [
    `${SITE_ORIGIN}/`,
    ...DIALOG_PATHS.map((p) => `${SITE_ORIGIN}${p}`),
    ...siteUpdatesPaths.map((p) => `${SITE_ORIGIN}${p}`),
    ...resourcePaths.map((p) => `${SITE_ORIGIN}${p}`),
  ];
  const { xml, txt } = buildSitemap(urls);

  await fs.mkdir(path.join(PUBLIC_DIR, "seo"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(PUBLIC_DIR, "sitemap.xml"), xml, "utf8"),
    fs.writeFile(path.join(PUBLIC_DIR, "seo", "sitemap.xml"), xml, "utf8"),
    fs.writeFile(path.join(PUBLIC_DIR, "sitemap.txt"), txt, "utf8"),
    fs.writeFile(path.join(PUBLIC_DIR, ".nojekyll"), "", "utf8"),
  ]);

  console.log(
    `Wrote sitemaps (lastmod=${lastmod}, urls=${urls.length}, resources=${resourcePaths.length}, siteUpdates=${siteUpdatesPaths.length})`
  );
}

write();
