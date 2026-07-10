import fs from "node:fs";
import path from "node:path";
import { SKIP_PACKAGES } from "./tf-export-block-label.mjs";

const RESOURCE_FUNC_PATTERN = /func\s+(Resource\w+)\(\)\s*\*schema\.Resource\s*\{/g;
const SCHEMA_MAP_MARKER = "Schema: map[string]*schema.Schema{";
const FORCE_NEW_PATTERN = /ForceNew:\s*true\b/;
const ATTRIBUTE_KEY_PATTERN = /^(?:"([^"]+)"|`([^`]+)`)\s*:\s*\{/;

function readPackageGoFiles(packageDir) {
  return fs
    .readdirSync(packageDir)
    .filter((entry) => entry.endsWith(".go") && !entry.endsWith("_test.go"))
    .map((entry) => ({
      name: entry,
      content: fs.readFileSync(path.join(packageDir, entry), "utf8"),
    }));
}

export function packageResourceType(allFiles) {
  for (const file of allFiles) {
    const match = file.content.match(/ResourceType\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

function readBalancedBraces(source, openIndex) {
  if (source[openIndex] !== "{") {
    throw new Error(`Expected "{" at index ${openIndex}`);
  }

  let depth = 0;
  let inString = false;
  let stringQuote = "";
  let escaped = false;

  for (let i = openIndex; i < source.length; i += 1) {
    const ch = source[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === stringQuote) {
        inString = false;
        stringQuote = "";
      }
      continue;
    }

    if (ch === '"' || ch === "`") {
      inString = true;
      stringQuote = ch;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(openIndex + 1, i),
          endIndex: i,
        };
      }
    }
  }

  return null;
}

function extractResourceSchemaBody(content) {
  RESOURCE_FUNC_PATTERN.lastIndex = 0;

  let match;
  while ((match = RESOURCE_FUNC_PATTERN.exec(content)) !== null) {
    const funcOpenIndex = match.index + match[0].length - 1;
    const funcBody = readBalancedBraces(content, funcOpenIndex);
    if (!funcBody) continue;

    const returnIndex = funcBody.body.indexOf("return &schema.Resource");
    if (returnIndex === -1) continue;

    const resourceOpenIndex = funcBody.body.indexOf("{", returnIndex);
    if (resourceOpenIndex === -1) continue;

    const resourceBody = readBalancedBraces(funcBody.body, resourceOpenIndex);
    if (!resourceBody) continue;

    const schemaIndex = resourceBody.body.indexOf(SCHEMA_MAP_MARKER);
    if (schemaIndex === -1) continue;

    const schemaOpenIndex = schemaIndex + SCHEMA_MAP_MARKER.length - 1;
    const schemaBody = readBalancedBraces(resourceBody.body, schemaOpenIndex);
    if (!schemaBody) continue;

    return schemaBody.body;
  }

  return null;
}

function parseTopLevelSchemaAttributes(schemaBody) {
  const attributes = [];
  let index = 0;

  while (index < schemaBody.length) {
    while (index < schemaBody.length && /[\s,]/.test(schemaBody[index])) {
      index += 1;
    }
    if (index >= schemaBody.length) break;

    const remainder = schemaBody.slice(index);
    const keyMatch = remainder.match(ATTRIBUTE_KEY_PATTERN);
    if (!keyMatch) break;

    const attribute = (keyMatch[1] || keyMatch[2] || "").trim();
    const openBraceIndex = index + keyMatch[0].length - 1;
    const attributeBlock = readBalancedBraces(schemaBody, openBraceIndex);
    if (!attributeBlock) break;

    if (attribute && FORCE_NEW_PATTERN.test(attributeBlock.body)) {
      attributes.push(attribute);
    }

    index = attributeBlock.endIndex + 1;
  }

  return attributes;
}

export function derivePackageForceNewAttributes(packageDir) {
  const files = readPackageGoFiles(packageDir);
  if (files.length === 0) return null;

  const resourceType = packageResourceType(files);
  if (!resourceType) return null;

  const attributes = [];

  for (const file of files) {
    const schemaBody = extractResourceSchemaBody(file.content);
    if (!schemaBody) continue;

    for (const attribute of parseTopLevelSchemaAttributes(schemaBody)) {
      if (!attributes.includes(attribute)) {
        attributes.push(attribute);
      }
    }
  }

  if (attributes.length === 0) return null;

  attributes.sort((a, b) => a.localeCompare(b));
  return { resourceType, attributes };
}

/** Resource types with schema attributes marked ForceNew: true in provider source. */
export function scanProviderForceNewAttributes(providerRoot) {
  const results = {};

  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    const derived = derivePackageForceNewAttributes(packageDir);
    if (derived) {
      results[derived.resourceType] = derived.attributes;
    }
  }

  return results;
}
