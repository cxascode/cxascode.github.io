import fs from "node:fs";
import path from "node:path";
import { packageResourceType, SKIP_PACKAGES } from "./tf-export-block-label.mjs";

const RESOURCE_FUNC_PATTERN = /func\s+(Resource\w+)\(\)\s*\*schema\.Resource\s*\{/g;
const SCHEMA_MAP_MARKER = "Schema: map[string]*schema.Schema{";
const ATTRIBUTE_KEY_PATTERN = /^(?:"([^"]+)"|`([^`]+)`)\s*:\s*\{/;

const FORCE_NEW_PATTERN = /ForceNew:\s*true\b/;

export function readPackageGoFiles(packageDir) {
  return fs
    .readdirSync(packageDir)
    .filter((entry) => entry.endsWith(".go") && !entry.endsWith("_test.go"))
    .map((entry) => ({
      name: entry,
      content: fs.readFileSync(path.join(packageDir, entry), "utf8"),
    }));
}

export function* iterateProviderPackages(providerRoot) {
  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    yield packageDir;
  }
}

export function readBalancedBraces(source, openIndex) {
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

export function extractResourceSchemaBody(content) {
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

/** Top-level resource schema attributes from a parsed Schema map body. */
export function parseTopLevelAttributeBlocks(schemaBody) {
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

    if (attribute) {
      attributes.push({ attribute, body: attributeBlock.body });
    }

    index = attributeBlock.endIndex + 1;
  }

  return attributes;
}

function mergeAttributeBlocks(existing, incoming) {
  const merged = [...existing];

  for (const block of incoming) {
    if (!merged.some((entry) => entry.attribute === block.attribute)) {
      merged.push(block);
    }
  }

  return merged;
}

/**
 * Yield each managed resource's parsed top-level schema attribute blocks.
 * Scans all non-test Go files in the package (schema may live outside *_schema.go).
 */
export function* iterateProviderResourceSchemas(providerRoot) {
  for (const packageDir of iterateProviderPackages(providerRoot)) {
    const files = readPackageGoFiles(packageDir);
    if (files.length === 0) continue;

    const resourceType = packageResourceType(files);
    if (!resourceType) continue;

    let attributeBlocks = [];

    for (const file of files) {
      const schemaBody = extractResourceSchemaBody(file.content);
      if (!schemaBody) continue;
      attributeBlocks = mergeAttributeBlocks(
        attributeBlocks,
        parseTopLevelAttributeBlocks(schemaBody)
      );
    }

    if (attributeBlocks.length === 0) continue;

    yield { resourceType, attributeBlocks };
  }
}

export function attributeHasForceNew(attributeBlockBody) {
  return FORCE_NEW_PATTERN.test(attributeBlockBody);
}

function selectAttributes(attributeBlocks, predicate) {
  return attributeBlocks
    .filter(({ body }) => predicate(body))
    .map(({ attribute }) => attribute)
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Extensible schema harvest catalog. Add new keys here when pulling additional
 * schema flags alongside forceNewAttributes.
 */
export function scanProviderSchemaAttributeCatalog(providerRoot) {
  const forceNewAttributes = {};

  for (const { resourceType, attributeBlocks } of iterateProviderResourceSchemas(
    providerRoot
  )) {
    const forceNew = selectAttributes(attributeBlocks, attributeHasForceNew);
    if (forceNew.length > 0) {
      forceNewAttributes[resourceType] = forceNew;
    }
  }

  return { forceNewAttributes };
}

/** Resource types with schema attributes marked ForceNew: true in provider source. */
export function scanProviderForceNewAttributes(providerRoot) {
  return scanProviderSchemaAttributeCatalog(providerRoot).forceNewAttributes;
}
