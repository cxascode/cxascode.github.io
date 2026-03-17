import fs from "node:fs/promises";
import path from "node:path";

const INPUT_DIR = path.resolve("public/resource-permissions-json");
const OUTPUT_DIR = path.resolve("public/resource-permissions-tf");
const DEFAULT_OVERRIDES_PATH = path.resolve("public/overrides.json");

const READ_ONLY_ACTIONS = new Set(["view", "search"]);
const ACTION_ORDER = ["add", "assign", "delete", "edit", "view", "search", "manage"];
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

  // Ignore permissions that are not in "domain:entity:action" format.
  // Upstream may include bare tokens like "admin", which are redundant here
  // because the generator only emits fully qualified permissions.
  if (parts.length !== 3) return null;

  const [domain, entityName, action] = parts;
  if (!domain || !entityName || !action) return null;

  return { domain, entityName, action };
}

function shouldSkipDomain(domain) {
  return SKIP_DOMAINS.has(String(domain).trim().toLowerCase());
}

function getResourceType(resource) {
  const candidates = [
    resource?.resourceType,
    resource?.resource_type,
    resource?.type,
    resource?.name,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function normalizeOverrideMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function emptyOverrides() {
  return {
    addReadOnlyPermissions: {},
    addReadWritePermissions: {},
  };
}

async function loadOverrides() {
  const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);
  console.log(`Loading overrides from ${overridesPath}`);

  try {
    const raw = await fs.readFile(overridesPath, "utf8");
    const parsed = JSON.parse(raw);

    return {
      addReadOnlyPermissions: normalizeOverrideMap(parsed?.addReadOnlyPermissions),
      addReadWritePermissions: normalizeOverrideMap(parsed?.addReadWritePermissions),
    };
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.log("No overrides file found, continuing without overrides.");
      return emptyOverrides();
    }
    throw err;
  }
}

function getOverridePermissions(resourceType, overrides) {
  if (!resourceType) {
    return {
      readOnlyPermissions: [],
      readWritePermissions: [],
    };
  }

  return {
    readOnlyPermissions: Array.isArray(overrides?.addReadOnlyPermissions?.[resourceType])
      ? overrides.addReadOnlyPermissions[resourceType]
      : [],
    readWritePermissions: Array.isArray(overrides?.addReadWritePermissions?.[resourceType])
      ? overrides.addReadWritePermissions[resourceType]
      : [],
  };
}

function addPermissionToMap({ permission, map, skippedDomains }) {
  const parsed = parsePermission(permission);
  if (!parsed) return null;

  if (shouldSkipDomain(parsed.domain)) {
    const key = `${parsed.domain}:${parsed.entityName}`;
    skippedDomains.set(key, (skippedDomains.get(key) || 0) + 1);
    return null;
  }

  const key = `${parsed.domain}:${parsed.entityName}`;

  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(parsed.action);

  return {
    domain: parsed.domain,
    entityName: parsed.entityName,
    action: parsed.action,
    key,
  };
}

function buildPolicyMaps(json, overrides) {
  const rw = new Map();
  const ro = new Map();

  const resources = Array.isArray(json?.resources) ? json.resources : [];
  const skippedDomains = new Map();
  const injectedOverrides = [];

  for (const resource of resources) {
    const permissions = Array.isArray(resource?.permissions) ? resource.permissions : [];
    const resourceType = getResourceType(resource);

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

    if (!resourceType) continue;

    const { readOnlyPermissions, readWritePermissions } = getOverridePermissions(
      resourceType,
      overrides
    );

    for (const perm of readOnlyPermissions) {
      const added = addPermissionToMap({
        permission: perm,
        map: ro,
        skippedDomains,
      });

      if (added) {
        injectedOverrides.push({
          resourceType,
          permission: perm,
          target: "read-only",
        });
      }
    }

    for (const perm of readWritePermissions) {
      const added = addPermissionToMap({
        permission: perm,
        map: rw,
        skippedDomains,
      });

      if (added) {
        injectedOverrides.push({
          resourceType,
          permission: perm,
          target: "read-write",
        });
      }
    }
  }

  return { rw, ro, skippedDomains, injectedOverrides };
}

function renderRole(resourceName, roleName, version, policies) {
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
  description = "v${version}"

${blocks}
}
`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function getLatestArg() {
  return getArgValue("latest");
}

async function main() {
  await ensureDir(INPUT_DIR);
  await ensureDir(OUTPUT_DIR);

  const latest = getLatestArg();
  const overrides = await loadOverrides();

  const entries = await fs.readdir(INPUT_DIR, { withFileTypes: true });
  const jsonFiles = entries
    .filter(
      (e) =>
        e.isFile() &&
        e.name.endsWith(".json") &&
        e.name !== "overrides.json"
    )
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  for (const file of jsonFiles) {
    const version = file.replace(/\.json$/, "");
    const inputPath = path.join(INPUT_DIR, file);

    const raw = await fs.readFile(inputPath, "utf8");
    const json = JSON.parse(raw);

    const { rw, ro, skippedDomains, injectedOverrides } = buildPolicyMaps(
      json,
      overrides
    );

    const rwTf = renderRole(
      "CX_as_Code_Read_Write",
      "CX as Code Read/Write",
      version,
      rw
    );

    const roTf = renderRole(
      "CX_as_Code_Read_Only",
      "CX as Code Read Only",
      version,
      ro
    );

    const rwOut = path.join(OUTPUT_DIR, `${version}-read-write-role.tf`);
    const roOut = path.join(OUTPUT_DIR, `${version}-read-only-role.tf`);

    await fs.writeFile(rwOut, rwTf, "utf8");
    await fs.writeFile(roOut, roTf, "utf8");

    console.log(`Generated Terraform role files for ${version}`);

    if (injectedOverrides.length > 0) {
      console.log(`Applied override permissions for ${version}:`);
      for (const item of injectedOverrides.sort((a, b) => {
        const resourceCmp = a.resourceType.localeCompare(b.resourceType);
        if (resourceCmp !== 0) return resourceCmp;

        const targetCmp = a.target.localeCompare(b.target);
        if (targetCmp !== 0) return targetCmp;

        return a.permission.localeCompare(b.permission);
      })) {
        console.log(
          `  - ${item.resourceType} [${item.target}] -> ${item.permission}`
        );
      }
    }

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