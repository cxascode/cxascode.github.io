import fs from "node:fs";
import path from "node:path";

export const SKIP_PACKAGES = new Set([
  "resource_exporter",
  "tfexporter",
  "bcp_tf_exporter",
  "provider",
  "provider_registrar",
  "util",
  "consistency_checker",
  "mrmo",
  "dependent_consumers",
]);

const FIELD_LABELS = {
  Email: "email",
  Title: "document title",
  DisplayName: "display name",
  Id: "id",
  StartNumber: "start number",
  Term: "term",
  VarType: "type",
  Pattern: "route pattern",
  Category: "category",
  SystemPresence: "system presence",
  Dialect: "dialect",
  AuthorityName: "authority name",
  Language: "language code",
  FirstName: "first name",
  LastName: "last name",
};

const IDENT_LABELS = {
  knowledgeBase: "knowledge base",
  knowledgeDocument: "document",
  knowledgeDoc: "document",
  knowledgeCategory: "category",
  knowledgeLabel: "label",
  knowledgeDocumentVariation: "variation",
  tableMeta: "datatable",
  grammar: "grammar",
  worktype: "worktype",
  status: "status",
  queue: "queue",
  site: "site",
  route: "route",
  integration: "integration",
  action: "action",
  guide: "guide",
  flow: "flow",
  domain: "domain",
  inboundRoute: "route",
  extensionPool: "extension pool",
  parentLocation: "parent location",
  location: "location",
  externalOrg: "external org",
  externalOrganization: "external org",
  user: "user",
  segment: "segment",
  response: "response",
  library: "library",
  keyStr: "row key",
  domainId: "email domain id",
  userIdentifier: "user email or name or id",
  t: "topic",
};

const NESTED_NAME_CONTEXT = {
  Grammar: "grammar",
  GrammarLanguage: "language",
};

const SHORT_NAME_PARENTS = new Set(["flow", "action"]);

/** Plain *x.Name resources that still deserve a specific placeholder label. */
const NAME_PRIMARY_ALLOWLIST = new Set(["genesyscloud_guide_version"]);

function camelToWords(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .toLowerCase();
}

function wrap(label) {
  return `<${label}>`;
}

function formatPlaceholder(parts, separator = "_") {
  return parts.map((part) => wrap(part)).join(separator);
}

function normalizeExpr(expr) {
  return expr
    .trim()
    .replace(/^util\.StringOrNil\((.+)\)$/, "$1")
    .replace(/^\*(.+)$/, "$1");
}

function humanizeRef(ref) {
  const normalized = normalizeExpr(ref);

  if (normalized === "keyStr") return "row key";
  if (normalized === "domainId") return "email domain id";
  if (normalized === "userIdentifier") return "user email or name or id";
  if (normalized.includes("GenerateComputedName")) return "language label";
  if (normalized === "ResourceType") return null;

  const parts = normalized.split(".");
  const field = parts[parts.length - 1];
  const parent = parts.length > 1 ? parts[parts.length - 2] : parts[0];

  if (field === "Id" && parent === "domain") {
    return "domain id";
  }

  if (FIELD_LABELS[field]) {
    const mapped = FIELD_LABELS[field];
    if (field === "VarType" || field === "Email" || field === "DisplayName" || field === "Id") {
      return mapped;
    }
    if (field === "Title") return mapped;
    if (field === "Term") return mapped;
    if (field === "StartNumber") return mapped;
    if (field === "Pattern") return mapped;
    if (field === "Category") return mapped;
    if (field === "SystemPresence") return mapped;
    if (field === "Dialect") return mapped;
    if (field === "AuthorityName") return mapped;
    if (field === "Language") return mapped;
    if (field === "FirstName" || field === "LastName") return mapped;
  }

  if (field === "Name") {
    if (SHORT_NAME_PARENTS.has(parent)) return "name";
    if (parts.length > 2 && NESTED_NAME_CONTEXT[parent]) {
      return `${NESTED_NAME_CONTEXT[parent]} name`;
    }
    const ident = IDENT_LABELS[parent];
    if (ident) return `${ident} name`;
    return "name";
  }

  const ident = IDENT_LABELS[parent] || IDENT_LABELS[normalized];
  if (ident) return `${ident} name`;

  return camelToWords(field || normalized);
}

function parseLiteral(token) {
  const match = token.trim().match(/^"([^"]*)"$/);
  return match ? match[1] : null;
}

function splitConcat(expr) {
  const tokens = [];
  let current = "";
  let inString = false;

  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (ch === '"') {
      inString = !inString;
      current += ch;
      continue;
    }

    if (!inString && expr.slice(i, i + 3) === " + ") {
      if (current.trim()) tokens.push(current.trim());
      current = "";
      i += 2;
      continue;
    }

    current += ch;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
}

export function parseBlockLabelExpression(expr) {
  const trimmed = expr.trim();

  const literal = parseLiteral(trimmed);
  if (literal !== null) return literal;

  if (trimmed === "ResourceType") return null;

  if (trimmed.startsWith("fmt.Sprintf(")) {
    return parseFmtSprintf(trimmed);
  }

  if (trimmed.includes(" + ")) {
    return parseConcatExpression(trimmed);
  }

  const single = humanizeRef(trimmed);
  return single ? wrap(single) : null;
}

function parseConcatExpression(expr) {
  const tokens = splitConcat(expr);
  let result = "";

  for (const token of tokens) {
    const literal = parseLiteral(token);
    if (literal !== null) {
      result += literal;
      continue;
    }

    const label = humanizeRef(token);
    if (label) result += wrap(label);
  }

  return result || null;
}

function parseFmtSprintf(expr) {
  const match = expr.match(/^fmt\.Sprintf\("([^"]*)"\s*,\s*(.+)\)$/s);
  if (!match) return null;

  const [, format, argsSource] = match;
  const args = splitFmtArgs(argsSource);
  const parts = [];
  let argIndex = 0;
  let literal = "";

  for (let i = 0; i < format.length; i += 1) {
    if (format[i] === "%" && (format[i + 1] === "s" || format[i + 1] === "d")) {
      if (literal) {
        if (parts.length > 0) parts[parts.length - 1] += literal;
        else parts.push(literal);
        literal = "";
      }
      const arg = args[argIndex++];
      if (format[i + 1] === "d") {
        parts.push("id");
      } else {
        parts.push(humanizeRef(arg) || camelToWords(arg));
      }
      i += 1;
      continue;
    }
    literal += format[i];
  }

  if (literal) {
    if (parts.length > 0) parts[parts.length - 1] += literal;
    else parts.push(literal);
  }

  return parts.map((part) => (part.startsWith("<") ? part : wrap(part))).join("");
}

function splitFmtArgs(source) {
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '"') inString = !inString;
    if (!inString) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        args.push(current.trim());
        current = "";
        continue;
      }
    }
    current += ch;
  }

  if (current.trim()) args.push(current.trim());
  return args;
}

function extractExporterFunctionBodies(content) {
  const bodies = [];
  const pattern = /func\s+(get(?:All)?\w+)\([^)]*\)\s*\([^)]*ResourceIDMetaMap[^)]*\)\s*\{/g;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    let depth = 1;
    let i = match.index + match[0].length;
    let body = "";

    while (i < content.length && depth > 0) {
      const ch = content[i];
      if (ch === "{") depth += 1;
      if (ch === "}") depth -= 1;
      if (depth > 0) body += ch;
      i += 1;
    }

    bodies.push(body);
  }

  return bodies;
}

function traceBlockLabelVariable(getAllBodies) {
  const body = getAllBodies.join("\n");

  const appendParts = [
    ...body.matchAll(/blockLabelParts\s*=\s*append\(blockLabelParts,\s*([^)]+)\)/g),
  ].map((match) => humanizeRef(match[1].trim()));

  if (appendParts.length > 0) {
    return formatPlaceholder(appendParts);
  }

  if (body.includes("userIdentifier") && body.includes("AuthorityName")) {
    return formatPlaceholder(["user email or name or id", "authority name"]);
  }

  if (body.includes("parentLocation") && body.includes("*location.Name")) {
    return formatPlaceholder(["parent location name", "location name"]);
  }

  if (body.includes("library.Name") && body.includes("*response.Name")) {
    return formatPlaceholder(["library name", "response name"]);
  }

  if (body.includes("t.Name") && body.includes("t.Dialect")) {
    return formatPlaceholder(["topic name", "dialect"]);
  }

  if (
    body.includes("util.StringOrNil(knowledgeBase.Name)") &&
    body.includes("util.StringOrNil(knowledgeDoc.Title)") &&
    body.includes("knowledgeDocumentVariation.Name")
  ) {
    return formatPlaceholder([
      "knowledge base name",
      "document title",
      "variation name",
    ]);
  }

  if (body.includes("SystemPresence") && body.includes("GenerateComputedName")) {
    return formatPlaceholder(["system presence", "language label"]);
  }

  if (body.includes("DisplayName") && body.includes("blockLabel")) {
    return wrap("display name");
  }

  if (
    body.includes("externalOrganization.Name") ||
    body.includes("evaluationForm.Name")
  ) {
    return null;
  }

  return null;
}

function isSimpleNameExpression(expr) {
  if (!expr || expr.startsWith("__traced__:") || expr === "blockLabel" || expr === "ResourceType") {
    return false;
  }
  if (expr.includes(" + ") || expr.startsWith("fmt.Sprintf")) return false;
  if (parseLiteral(expr.trim()) !== null) return false;
  return /^[\w.]+\.Name$/.test(normalizeExpr(expr.trim()));
}

function isNamePrimaryPlaceholder(resourceType, placeholder, expressions) {
  if (NAME_PRIMARY_ALLOWLIST.has(resourceType)) return false;
  if (placeholder === wrap("name")) return true;
  if (!/^<[^>]+ name>$/.test(placeholder)) return false;

  const meaningful = expressions.filter(
    (item) => item.expr !== "blockLabel" && !item.expr.includes("OVERRIDE_BCP")
  );
  if (meaningful.length === 0) return true;

  return meaningful.every((item) => {
    if (item.expr.startsWith("__traced__:")) return false;
    return isSimpleNameExpression(item.expr);
  });
}

function isResourceImplementationFile(entry) {
  return (
    entry.endsWith(".go") &&
    !entry.endsWith("_test.go") &&
    !entry.endsWith("_proxy.go") &&
    !entry.endsWith("_utils.go") &&
    entry.startsWith("resource_")
  );
}

function isSchemaFile(entry) {
  return entry.endsWith(".go") && !entry.endsWith("_test.go") && entry.includes("_schema");
}

function readPackageFiles(packageDir) {
  const entries = fs.readdirSync(packageDir);
  const allFiles = entries
    .filter((entry) => entry.endsWith(".go") && !entry.endsWith("_test.go"))
    .map((entry) => ({
      name: entry,
      content: fs.readFileSync(path.join(packageDir, entry), "utf8"),
    }));

  return {
    allFiles,
    resourceFiles: allFiles.filter((file) => isResourceImplementationFile(file.name)),
  };
}

export function packageResourceType(allFiles) {
  for (const file of allFiles) {
    const match = file.content.match(/ResourceType\s*=\s*"([^"]+)"/);
    if (match) return match[1];
  }
  return null;
}

function collectResourceMetaBlockLabels(content) {
  const expressions = [];

  for (const match of content.matchAll(
    /ResourceMeta\{[\s\S]*?BlockLabel:\s*([^,\n}]+)/g
  )) {
    const expr = match[1].trim();
    if (expr && !expr.includes("BlockLabel string")) {
      expressions.push(expr);
    }
  }

  return expressions;
}

function collectBlockLabelExpressions(resourceFiles) {
  const expressions = [];

  for (const file of resourceFiles) {
    const getAllBodies = extractExporterFunctionBodies(file.content);

    for (const body of getAllBodies) {
      for (const expr of collectResourceMetaBlockLabels(body)) {
        expressions.push({ expr, priority: 2, source: "exporter" });
      }

      const traced = traceBlockLabelVariable([body]);
      if (traced) {
        expressions.push({ expr: `__traced__:${traced}`, priority: 3, source: "traced" });
      }
    }

    for (const expr of collectResourceMetaBlockLabels(file.content)) {
      expressions.push({ expr, priority: 1, source: "file" });
    }
  }

  return expressions;
}

function resolveExpression(expr, resourceType) {
  if (expr.startsWith("__traced__:")) {
    return expr.slice("__traced__:".length);
  }

  if (expr === "ResourceType") return resourceType;

  if (expr === "blockLabel") return null;

  return parseBlockLabelExpression(expr);
}

function chooseBestExpression(expressions, resourceType) {
  const ranked = [...expressions].sort((a, b) => b.priority - a.priority);

  for (const item of ranked) {
    if (item.expr === "blockLabel") continue;
    if (item.expr.includes("OVERRIDE_BCP") || item.expr === "*flow.Name") continue;

    const resolved = resolveExpression(item.expr, resourceType);
    if (resolved) return resolved;
  }

  for (const item of ranked) {
    if (item.expr === "blockLabel") {
      const traced = item.expr.startsWith("__traced__:")
        ? item.expr.slice("__traced__:".length)
        : null;
      if (traced) return traced;
      continue;
    }

    const resolved = resolveExpression(item.expr, resourceType);
    if (resolved) return resolved;
  }

  return null;
}

export function derivePackageBlockLabel(packageDir) {
  const { allFiles, resourceFiles } = readPackageFiles(packageDir);
  if (resourceFiles.length === 0) return null;

  const resourceType = packageResourceType(allFiles);
  if (!resourceType) return null;

  const expressions = collectBlockLabelExpressions(resourceFiles);
  if (expressions.length === 0) return null;

  const tracedOnly = expressions
    .filter((item) => item.expr.startsWith("__traced__:"))
    .map((item) => item.expr.slice("__traced__:".length));
  if (tracedOnly.length > 0) {
    return { resourceType, placeholder: tracedOnly[0] };
  }

  const placeholder = chooseBestExpression(expressions, resourceType);
  if (!placeholder || isNamePrimaryPlaceholder(resourceType, placeholder, expressions)) {
    return null;
  }

  return { resourceType, placeholder };
}

export function scanProviderBlockLabels(providerRoot) {
  const results = {};

  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    const derived = derivePackageBlockLabel(packageDir);
    if (derived) {
      results[derived.resourceType] = derived.placeholder;
    }
  }

  return results;
}
