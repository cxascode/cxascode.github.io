const BASE = import.meta.env.BASE_URL;

export function toReleaseNotesVersion(version) {
  if (!version || version === "latest") return "";
  const trimmed = String(version).trim();
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

export function fromReleaseNotesVersion(version) {
  return String(version).trim().replace(/^v/i, "");
}

export function releaseNotesMarkdownUrl(version) {
  const v = toReleaseNotesVersion(version);
  if (!v) return "";
  return `${BASE}release-notes/versions/${v}.md`;
}

export async function fetchReleaseNotesMarkdown(version) {
  const url = releaseNotesMarkdownUrl(version);
  if (!url) return "";

  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 404) return "";
  if (!res.ok) {
    throw new Error(`Failed to fetch release notes: ${res.status} ${res.statusText}`);
  }

  return res.text();
}

export function extractResourceReleaseNotesMarkdown(markdown, resourceType) {
  const type = (resourceType || "").trim();
  if (!type || !markdown) return "";

  const lines = markdown.split("\n");
  const sections = [];
  let currentH3 = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("### ")) {
      currentH3 = line;
      i += 1;
      continue;
    }

    if (line.startsWith("#### ")) {
      const headerType = line.slice(5).trim();

      if (headerType === type) {
        const blockLines = [currentH3, "", line];
        i += 1;

        while (i < lines.length && !lines[i].startsWith("#### ") && !lines[i].startsWith("### ")) {
          blockLines.push(lines[i]);
          i += 1;
        }

        sections.push(blockLines.join("\n").trimEnd());
        continue;
      }

      i += 1;
      while (i < lines.length && !lines[i].startsWith("#### ") && !lines[i].startsWith("### ")) {
        i += 1;
      }
      continue;
    }

    if (currentH3 && line.startsWith("- ")) {
      const match = line.match(/^- `([^`]+)`/);
      if (match?.[1] === type) {
        sections.push(`${currentH3}\n\n${line}`);
      }
    }

    i += 1;
  }

  return sections.join("\n\n");
}
