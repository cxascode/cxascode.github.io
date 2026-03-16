import fs from "node:fs/promises";
import path from "node:path";

const INPUT_DIR = path.resolve("public/resource-permissions-json");
const OUTPUT_DIR = path.resolve("public/resource-permissions-tf");

const READ_ONLY_ACTIONS = new Set(["view", "search"]);
const ACTION_ORDER = ["add", "assign", "delete", "edit", "view", "search"];
const SKIP_DOMAINS = new Set(["relate"]);

function actionRank(action) {
  const idx = ACTION_ORDER.indexOf(action);
  return idx === -1 ? 999 : idx;
}

function sortActions(actions) {
  return [...actions].sort((a, b) => {
    const ra = actionRank(a);
    const rb = actionRank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

function hclStringArray(values) {
  return `[${values.map((v) => `"${v}"`).join(", ")}]`;
}

function parsePermission(permission) {
  const raw = String(permission).trim();
  const parts = raw.split(":");

  // Some upstream permissions may appear as bare tokens like "admin" instead of
  // the normal "domain:entity:action" shape.
  //
  // For resource_permissions-1.76.2.json, bare "admin" appears alongside the
  // fully qualified "directory:organization:admin", so we treat the bare token
  // as redundant and intentionally skip it.
  //
  // The generator only emits Terraform for permissions in the
  // "domain:entity:action" format.
  if (parts.length !== 3) return null;

  const [domain, entityName, action] = parts;
  if (!domain || !entityName || !action) return null;

  return { domain, entityName, action };
}

function shouldSkipDomain(domain) {
  return SKIP_DOMAINS.has(String(domain).trim().toLowerCase());
}

function buildPolicyMaps(json) {
  const rw = new Map();
  const ro = new Map();

  const resources = Array.isArray(json?.resources) ? json.resources : [];
  const skippedDomains = new Map();

  for (const resource of resources) {
    const permissions = Array.isArray(resource?.permissions)
      ? resource.permissions
      : [];

    for (const perm of permissions) {
      const parsed = parsePermission(perm);
      if (!parsed) continue;

      if (shouldSkipDomain(parsed.domain)) {
        const key = `${parsed.domain}:${parsed.entityName}`;
        skippedDomains.set(key, (skippedDomains.get(key) || 0) + 1);
        continue;
      }

      const key = `${parsed.domain}:${parsed.entityName}`;

      if (!rw.has(key)) rw.set(key, new Set());
      rw.get(key).add(parsed.action);

      if (READ_ONLY_ACTIONS.has(parsed.action)) {
        if (!ro.has(key)) ro.set(key, new Set());
        ro.get(key).add(parsed.action);
      }
    }
  }

  return { rw, ro, skippedDomains };
}

function renderRole(resourceName, roleName, policies) {
  const blocks = [...policies.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, actionSet]) => {
      const [domain, entityName] = key.split(":");
      const actions = sortActions(actionSet);

      return `  permission_policies {
    action_set  = ${hclStringArray(actions)}
    domain      = "${domain}"
    entity_name = "${entityName}"
  }`;
    })
    .join("\n\n");

  return `resource "genesyscloud_auth_role" "${resourceName}" {
  name        = "${roleName}"
  description = "Created by Genesys Professional Services"

${blocks}
}
`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function getLatestArg() {
  const arg = process.argv.find((a) => a.startsWith("--latest="));
  return arg ? arg.slice("--latest=".length) : "";
}

async function main() {
  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

  const latest = getLatestArg();

  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const file of jsonFiles) {
    const version = file.replace(/\.json$/, "");
    const inputPath = path.join(INPUT_DIR, file);

    const raw = await fs.readFile(inputPath, "utf8");
    const json = JSON.parse(raw);

    const { rw, ro, skippedDomains } = buildPolicyMaps(json);

    const rwTf = renderRole(
      "CX_as_Code_Read_Write",
      "CX as Code Read/Write",
      rw
    );

    const roTf = renderRole(
      "CX_as_Code_Read_Only",
      "CX as Code Read Only",
      ro
    );

    const rwOut = path.join(OUTPUT_DIR, `${version}-read-write-role.tf`);
    const roOut = path.join(OUTPUT_DIR, `${version}-read-only-role.tf`);

    await fs.writeFile(rwOut, rwTf, "utf8");
    await fs.writeFile(roOut, roTf, "utf8");

    console.log(`Generated Terraform role files for ${version}`);

    if (skippedDomains.size > 0) {
      console.log(`Skipped unsupported domains for ${version}:`);
      for (const [key, count] of [...skippedDomains.entries()].sort(([a], [b]) =>
        a.localeCompare(b)
      )) {
        console.log(`  - ${key} (${count})`);
      }
    }
  }

  if (latest) {
    const latestRw = path.join(OUTPUT_DIR, `${latest}-read-write-role.tf`);
    const latestRo = path.join(OUTPUT_DIR, `${latest}-read-only-role.tf`);
    const aliasRw = path.join(OUTPUT_DIR, "latest-read-write-role.tf");
    const aliasRo = path.join(OUTPUT_DIR, "latest-read-only-role.tf");

    await fs.copyFile(latestRw, aliasRw);
    await fs.copyFile(latestRo, aliasRo);

    console.log(`Updated latest Terraform aliases for ${latest}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});