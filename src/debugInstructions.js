const BASE = import.meta.env.BASE_URL;

export const DEBUG_INSTRUCTIONS_MARKDOWN_URL = `${BASE}debugging.md`;

export function parseDebuggingMarkdown(raw) {
  const withoutTitle = String(raw || "").replace(/^## Debugging\s*\n+/, "");
  const match = withoutTitle.match(/^([^\n]+)\n+([\s\S]*)$/);

  if (!match) {
    return { description: "", body: withoutTitle.trim() };
  }

  return {
    description: match[1].trim(),
    body: match[2].trim(),
  };
}

export async function fetchDebuggingInstructionsMarkdown() {
  const res = await fetch(DEBUG_INSTRUCTIONS_MARKDOWN_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch debugging instructions: ${res.status} ${res.statusText}`);
  }
  return res.text();
}
