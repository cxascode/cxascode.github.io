import fs from "node:fs/promises";
import path from "node:path";

const SITE_ORIGIN = "https://cxascode.github.io";
const PUBLIC_DIR = path.resolve("public");
const lastmod = new Date().toISOString().slice(0, 10);

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_ORIGIN}/</loc>
    <lastmod>${lastmod}</lastmod>
  </url>
</urlset>
`;

const txt = `${SITE_ORIGIN}/\n`;

async function write() {
  await fs.mkdir(path.join(PUBLIC_DIR, "seo"), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(PUBLIC_DIR, "sitemap.xml"), xml, "utf8"),
    fs.writeFile(path.join(PUBLIC_DIR, "seo", "sitemap.xml"), xml, "utf8"),
    fs.writeFile(path.join(PUBLIC_DIR, "sitemap.txt"), txt, "utf8"),
    fs.writeFile(path.join(PUBLIC_DIR, ".nojekyll"), "", "utf8"),
  ]);
  console.log(`Wrote sitemaps (lastmod=${lastmod})`);
}

write();
