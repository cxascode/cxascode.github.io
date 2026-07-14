import fs from "node:fs/promises";
import path from "node:path";
import { loadDirectoryCommandNav } from "./lib/directory-command-nav.mjs";
import { buildMenuCatalog, finalizeMenuCatalog } from "./lib/supported-resources-menu-destination.mjs";
import { attachResourceTypesToMenuCatalog } from "../src/guiMenuPaths.js";
import { MIN_RESOURCE_PERMISSIONS_VERSION } from "./lib/public-data-path-constants.mjs";

const PUBLIC_DIR = path.resolve("public");
const OUTPUT_PATH = path.join(PUBLIC_DIR, "gui-menu-paths.json");
const DEBUG_OUTPUT_PATH = path.resolve(".cache-meta/gui-menu-paths-debug.json");
const PERMISSIONS_DIR = path.join(PUBLIC_DIR, "resource-permissions-json");
const DEFAULT_OVERRIDES_PATH = path.join(PUBLIC_DIR, "overrides.json");
const DEFAULT_MENU_URL = "https://apps.usw2.pure.cloud/admin/menu.json";
const DEFAULT_DIRECTORY_BASE = "https://apps.usw2.pure.cloud";

const PATH_SEP = " > ";
const AUTH_SEP = " | ";

const MIN_TRANSLATION_FALLBACK_SCORE = 12;
const MIN_TRANSLATION_SCORE_MARGIN = 4;

// Penalize section-level translation keys when scoring resource-name tokens.
const GENERIC_TRANSLATION_KEYS = new Set([
  "ACCOUNT_SETTINGS",
  "ADMIN",
  "ADMIN_HOME",
  "ARCHITECT",
  "CONTACT_CENTER",
  "DIRECTORY",
  "INTEGRATIONS",
  "KNOWLEDGE",
  "MESSAGE",
  "OUTBOUND",
  "OVERVIEW",
  "PEOPLE_PERMISSIONS",
  "QUALITY",
  "ROUTING",
]);

// Permission entity -> preferred menu translation keys (fallback phase).
const ENTITY_TRANSLATION_KEYS = {
  "architect:flowLogLevel": ["ARCHITECT"],
  "architect:systemPrompt": ["ARCHITECT"],
  "architect:userPrompt": ["ARCHITECT"],
  "conversation:settings": ["GENERAL_INFO"],
  "directory:group": ["GROUPS", "GROUPS_V2"],
  "directory:location": ["LOCATIONS"],
  "directory:organization": ["GENERAL_INFO"],
  "externalContacts:contact": ["EXTERNAL_CONTACTS"],
  "externalContacts:externalOrganization": ["EXTERNAL_CONTACTS"],
  "messaging:setting": ["PLATFORM_CONFIGS"],
  "outbound:attemptLimits": ["OUTBOUND_LIST_MANAGEMENT"],
  "outbound:campaignRule": ["OUTBOUND_RULE_MANAGEMENT"],
  "outbound:campaignSequence": ["OUTBOUND_CAMPAIGN_MANAGEMENT"],
  "outbound:contact": ["OUTBOUND_LIST_MANAGEMENT"],
  "outbound:contactListFilter": ["OUTBOUND_LIST_MANAGEMENT"],
  "outbound:contactListTemplate": ["OUTBOUND_LIST_MANAGEMENT"],
  "outbound:dnc": ["OUTBOUND_LIST_MANAGEMENT"],
  "outbound:dncList": ["OUTBOUND_LIST_MANAGEMENT"],
  "outbound:digitalRuleSet": ["OUTBOUND_RULE_MANAGEMENT"],
  "outbound:fileSpecificationTemplate": ["OUTBOUND_LIST_MANAGEMENT"],
  "presence:presenceDefinition": ["GENERAL_INFO"],
  "journey:viewsSchedule": ["JOURNEY_ANALYTICS"],
  "journey:outcomepredictor": ["JOURNEY_OUTCOME_MICRO_UI"],
  "knowledge:category": ["CATEGORIES_LABELS", "KNOWLEDGE_CATEGORIES"],
  "knowledge:document": ["ARTICLES"],
  "knowledge:documentVersion": ["ARTICLES"],
  "knowledge:knowledgebase": ["ARTICLES"],
  "knowledge:label": ["CATEGORIES_LABELS", "KNOWLEDGE_LABELS"],
  "oauth:client": ["OAUTH"],
  "recording:retentionPolicy": ["RECORDING_POLICIES", "POLICIES"],
  "routing:skillGroup": ["ACD_SKILLS_LANGUAGES", "SKILLS"],
  "routing:skillgroup": ["ACD_SKILLS_LANGUAGES", "SKILLS"],
  "telephony:phone": ["PHONES", "PHONE_MANAGEMENT"],
  "telephony:sites": ["SITES"],
  "telephony:trunk": ["EXTERNAL_TRUNKS", "TRUNKS"],
  "workitems:flowRuleDateBased": ["WORKTYPES"],
  "workitems:flowRuleOnAttributeChange": ["WORKTYPES"],
  "workitems:flowRuleOnCreate": ["WORKTYPES"],
  "workitems:worktype": ["WORKTYPES"],
};

// Resource permission entities that should match a different menu authorize entity.
const MENU_ENTITY_ALIASES = {
  "journey:viewsSchedule": ["journey:views"],
  "journey:views": ["journey:viewsSchedule"],
  "responses:library": ["responses:response"],
  "responses:response": ["responses:library"],
  "architect:userPrompt": ["architect:ui"],
};

// Directory hide expressions that gate pages for broader Architect / queue resources.
const MENU_ENTITY_RESOURCE_ALIASES = {
  "architect:ui": [
    "architect:flow",
    "architect:job",
    "architect:flowLogLevel",
    "architect:dependencyTracking",
    "architect:userPrompt",
  ],
  "routing:queue": ["routing:queueMember"],
  "messaging:integration": [
    "messaging:appleIntegration",
    "messaging:openIntegration",
    "messaging:whatsappIntegration",
    "messaging:instagramIntegration",
  ],
};

// Directory titleKey leaf -> resource type suffix hints for generic-permission nav rows.
const DIRECTORY_TITLE_KEY_HINTS = {
  queues: [
    "routing_queue",
    "routing_queue_conditional_group_activation",
    "routing_queue_conditional_group_routing",
    "routing_queue_outbound_email_address",
  ],
  groups: ["group", "group_roles", "routing_skill_group"],
  rolesAndPermissions: ["auth_role"],
  users: ["user", "user_roles"],
  acdSkills: ["routing_skill", "routing_language"],
  dataActions: ["integration_action", "integration_custom_auth_action", "integration_action_draft"],
  speechAndTextConfig: ["routing_settings"],
  policies: ["recording_media_retention_policy"],
  ruleManagement: [
    "outbound_campaignrule",
    "outbound_digitalruleset",
    "outbound_ruleset",
  ],
  architect: ["flow", "flow_loglevel", "architect_user_prompt", "architect_grammar", "architect_grammar_language"],
  triggers: ["processautomation_trigger"],
  oauth: ["oauth_client"],
  oAuth: ["oauth_client"],
  clients: ["oauth_client"],
  singleSignon: [
    "idp_adfs",
    "idp_generic",
    "idp_gsuite",
    "idp_okta",
    "idp_onelogin",
    "idp_ping",
    "idp_salesforce",
  ],
  platformIntegrations: [
    "conversations_messaging_integrations_apple",
    "conversations_messaging_integrations_instagram",
    "conversations_messaging_integrations_open",
    "conversations_messaging_integrations_whatsapp",
    "integration_facebook",
  ],
  listManagement: [
    "outbound_attempt_limit",
    "outbound_contact_list",
    "outbound_contact_list_contact",
    "outbound_contact_list_template",
    "outbound_contactlistfilter",
    "outbound_dnclist",
    "outbound_filespecificationtemplate",
  ],
  contactableTimeSets: ["outbound_callabletimeset"],
  outboundSettings: ["outbound_settings"],
  locations: ["location"],
  sites: ["telephony_providers_edges_site", "telephony_providers_edges_site_outbound_route"],
  campaignManagement: ["outbound_campaign", "outbound_messagingcampaign", "outbound_sequence"],
  wrapupCodesMappings: ["outbound_wrapupcodemappings"],
  externalSources: ["externalcontacts_external_source"],
  externalContacts: ["externalcontacts_contact", "externalcontacts_organization"],
  cannedResponses: ["responsemanagement_response", "responsemanagement_library"],
  userPrompt: ["architect_user_prompt"],
  emergencyGroups: ["architect_emergencygroup"],
  operatingSchedules: ["architect_schedules"],
  operatingScheduleGroups: ["architect_schedulegroups"],
  edgeGroups: ["telephony_providers_edges_edge_group"],
  journeyManagement: ["journey_views", "journey_view_schedule"],
  usersRules: ["users_rules"],
  messengerConfigurations: ["webdeployments_configuration"],
  messengerDeployments: ["webdeployments_deployment"],
  callRouting: ["architect_ivr"],
  dataTables: ["architect_datatable", "architect_datatable_row"],
  flowMilestones: ["flow_milestone"],
  flowOutcomes: ["flow_outcome"],
  grammars: ["architect_grammar", "architect_grammar_language"],
  categoriesAndLabels: ["knowledge_category", "knowledge_label"],
  outcomes: ["journey_outcome", "journey_outcome_predictor"],
  platformConfigurations: [
    "conversations_messaging_settings",
    "conversations_messaging_settings_default",
  ],
  integrations: ["integration", "integration_credential"],
  organizationSettings: [
    "conversations_settings",
    "organization_authentication_settings",
    "organization_presence_definition",
  ],
  worktypes: [
    "task_management_worktype",
    "task_management_worktype_flow_datebased_rule",
    "task_management_worktype_flow_onattributechange_rule",
    "task_management_worktype_flow_oncreate_rule",
    "task_management_worktype_status",
    "task_management_worktype_status_transition",
  ],
  dictionarymanagement: ["speechandtextanalytics_dictionaryfeedback"],
  topics: ["speechandtextanalytics_topic"],
  phoneManagement: [
    "telephony_providers_edges_phone",
    "telephony_providers_edges_phonebasesettings",
  ],
  trunks: ["telephony_providers_edges_trunk", "telephony_providers_edges_trunkbasesettings"],
  externalMetricDefinitions: ["employeeperformance_externalmetrics_definitions"],
};

const DIRECTORY_TITLE_KEY_MATCH_BONUS = 250_000;
const ADMIN_MENU_SOURCE_PENALTY = 35_000;
const PRIMARY_POLICY_OVERLAP_WEIGHT = 120_000;

const DIRECTORY_MENU_SOURCE_BONUS = 60_000;
const MIN_DIRECTORY_TITLE_KEY_SCORE = 120;

// Qualified policies that appear on many unrelated menu rows.
const GENERIC_QUALIFIED_PERMISSIONS = new Set([
  "telephony:plugin:all",
  "directory:organization:admin",
]);

const MIN_PATH_AFFINITY_SCORE = 35;

// Resource-type tail tokens that should not drive menu path affinity (shared prefixes).
const PATH_AFFINITY_IGNORE_TOKENS = new Set([
  "activity",
  "edge",
  "edges",
  "genesyscloud",
  "knowledge",
  "management",
  "provider",
  "providers",
  "settings",
  "telephony",
]);

// Resource types whose Terraform name maps to a preferred menu translation key.
const RESOURCE_TYPE_TRANSLATION_KEYS = {
  group_roles: ["GROUPS", "GROUPS_V2"],
  user_roles: ["PEOPLE"],
};

const SCOPE_TRANSLATION_PREFIXES = {
  groups: ["GROUPS", "GROUPS_V2"],
  locations: ["LOCATIONS"],
  outbound: [
    "OUTBOUND_LIST_MANAGEMENT",
    "OUTBOUND_RULE_MANAGEMENT",
    "OUTBOUND_CAMPAIGN_MANAGEMENT",
    "OUTBOUND_CONTACTABLE_TIME_SETS",
  ],
  workitems: ["WORKTYPES"],
  messaging: ["PLATFORMS", "PLATFORM_CONFIGS", "SUPPORTED_CONTENT_PROFILES"],
  "external-contacts": ["EXTERNAL_CONTACTS", "CONTACTS"],
  conversations: ["GENERAL_INFO"],
  authorization: ["GENERAL_INFO", "DIVISIONS_IAM", "ROLES_PERMISSIONS_IAM"],
  organization: ["GENERAL_INFO"],
  presence: ["GENERAL_INFO"],
  routing: ["TAGS", "CALL_ROUTING"],
};

function getArgValue(name) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

function hasArgFlag(name) {
  return process.argv.includes(`--${name}`);
}

function compareVersionsDesc(a, b) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

function compareVersionsAsc(a, b) {
  return compareVersionsDesc(b, a);
}

function isVersionAtLeast(version, minVersion) {
  return compareVersionsAsc(version, minVersion) >= 0;
}

function normalizeOverrideMap(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function translateKey(key, translations) {
  const raw = String(key || "").trim();
  if (!raw) return "";
  const label = translations?.en?.[raw];
  return typeof label === "string" && label.trim() ? label.trim() : raw;
}

function collectAuthorize(node) {
  const values = [];

  const add = (entry) => {
    if (entry == null) return;
    if (Array.isArray(entry)) {
      entry.forEach(add);
      return;
    }
    if (typeof entry === "string" && entry.trim()) {
      values.push(entry.trim());
    }
  };

  add(node?.authorize);
  add(node?.attributes?.authorize);
  return [...new Set(values)].sort().join(AUTH_SEP);
}

function flattenMenu(menu, translations) {
  const rows = [];
  const seen = new Set();

  const pushRow = (menuPath, authorize) => {
    const normalizedPath = String(menuPath || "").trim();
    if (!normalizedPath) return;

    const normalizedAuthorize =
      typeof authorize === "string" ? authorize.trim() : collectAuthorize(authorize);

    const key = `${normalizedPath}\0${normalizedAuthorize}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ path: normalizedPath, authorize: normalizedAuthorize });
  };

  function walkTree(items, parentPath, children) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== "object") continue;

      if (item.section) {
        const sectionPath = `${parentPath}${PATH_SEP}${translateKey(item.section, translations)}`;
        pushRow(sectionPath, "");
        if (Array.isArray(item.children)) {
          walkTree(item.children, sectionPath, children);
        }
        continue;
      }

      if (item.link) {
        const child = children[item.link];
        if (!child || typeof child !== "object") continue;

        const childPath = `${parentPath}${PATH_SEP}${translateKey(item.link, translations)}`;
        pushRow(childPath, collectAuthorize(child));
        if (Array.isArray(item.children)) {
          walkTree(item.children, childPath, children);
        }
        continue;
      }

      if (Array.isArray(item.children)) {
        walkTree(item.children, parentPath, children);
      }
    }
  }

  for (const [sectionKey, sectionValue] of Object.entries(menu || {})) {
    if (!sectionValue || typeof sectionValue !== "object") continue;

    const sectionPath = translateKey(sectionKey, translations);
    pushRow(sectionPath, collectAuthorize(sectionValue));

    const children =
      sectionValue.children &&
      typeof sectionValue.children === "object" &&
      !Array.isArray(sectionValue.children)
        ? sectionValue.children
        : {};

    if (Array.isArray(sectionValue.tree) && sectionValue.tree.length > 0) {
      walkTree(sectionValue.tree, sectionPath, children);
      continue;
    }

    for (const [childKey, childValue] of Object.entries(children)) {
      if (!childValue || typeof childValue !== "object") continue;
      pushRow(
        `${sectionPath}${PATH_SEP}${translateKey(childKey, translations)}`,
        collectAuthorize(childValue)
      );
    }
  }

  return rows;
}

function normalizeMatchToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getResourceName(resource) {
  for (const value of [resource?.resource_name, resource?.resourceName]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getResourceScopes(resource) {
  if (!Array.isArray(resource?.scopes)) return [];
  return resource.scopes.map((scope) => String(scope || "").trim()).filter(Boolean);
}

function buildTranslationIndex(menu, translations) {
  const keyToPaths = new Map();
  const translationMap = translations?.en && typeof translations.en === "object" ? translations.en : {};

  const addPath = (key, menuPath) => {
    if (!key || !menuPath) return;
    if (!keyToPaths.has(key)) keyToPaths.set(key, new Set());
    keyToPaths.get(key).add(menuPath);
  };

  function walkTree(items, parentPath, children) {
    if (!Array.isArray(items)) return;

    for (const item of items) {
      if (!item || typeof item !== "object") continue;

      if (item.section) {
        const sectionPath = `${parentPath}${PATH_SEP}${translateKey(item.section, translations)}`;
        addPath(item.section, sectionPath);
        if (Array.isArray(item.children)) {
          walkTree(item.children, sectionPath, children);
        }
        continue;
      }

      if (item.link) {
        const childPath = `${parentPath}${PATH_SEP}${translateKey(item.link, translations)}`;
        addPath(item.link, childPath);
        if (Array.isArray(item.children)) {
          walkTree(item.children, childPath, children);
        }
        continue;
      }

      if (Array.isArray(item.children)) {
        walkTree(item.children, parentPath, children);
      }
    }
  }

  for (const [sectionKey, sectionValue] of Object.entries(menu || {})) {
    if (!sectionValue || typeof sectionValue !== "object") continue;

    const sectionPath = translateKey(sectionKey, translations);
    addPath(sectionKey, sectionPath);

    const children =
      sectionValue.children &&
      typeof sectionValue.children === "object" &&
      !Array.isArray(sectionValue.children)
        ? sectionValue.children
        : {};

    if (Array.isArray(sectionValue.tree) && sectionValue.tree.length > 0) {
      walkTree(sectionValue.tree, sectionPath, children);
      continue;
    }

    for (const [childKey] of Object.entries(children)) {
      addPath(childKey, `${sectionPath}${PATH_SEP}${translateKey(childKey, translations)}`);
    }
  }

  return { keyToPaths, translationMap };
}

function qualifiedEntities(permissions) {
  return [
    ...new Set(permissions.filter(isQualifiedPermission).map((permission) => permissionEntity(permission))),
  ];
}

function resourceNameTokens(resourceType, resourceName) {
  const tail = String(resourceType || "")
    .replace(/^genesyscloud_/, "")
    .split("_")
    .filter(Boolean);
  const nameParts = String(resourceName || "")
    .split("_")
    .filter(Boolean);
  const compounds = [];

  for (let start = 0; start < tail.length; start += 1) {
    for (let end = start + 1; end <= Math.min(start + 3, tail.length); end += 1) {
      compounds.push(tail.slice(start, end).join(""));
    }
  }

  return [...new Set([...compounds, ...tail, ...nameParts])].sort(
    (a, b) => b.length - a.length || a.localeCompare(b)
  );
}

function translationKeysFromScope(scope) {
  const base = String(scope || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
  if (!base) return [];
  return SCOPE_TRANSLATION_PREFIXES[base] || [];
}

function translationKeysFromEntity(entity, translationMap) {
  const keys = new Set(ENTITY_TRANSLATION_KEYS[entity] || []);
  const entityPart = entity.split(":")[1] || "";
  if (!entityPart) return [...keys];

  const snake = entityPart
    .replace(/([A-Z])/g, "_$1")
    .replace(/^_/, "")
    .toUpperCase();
  const variants = new Set([
    snake,
    `${snake}S`,
    entityPart.toUpperCase(),
    normalizeMatchToken(entityPart),
  ]);

  for (const key of Object.keys(translationMap)) {
    const normalizedKey = normalizeMatchToken(key);
    for (const variant of variants) {
      const normalizedVariant = normalizeMatchToken(variant);
      if (!normalizedVariant) continue;
      if (normalizedKey === normalizedVariant || normalizedKey.includes(normalizedVariant)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

function scoreTranslationKey(key, label, tokens) {
  let score = 0;
  const normalizedKey = normalizeMatchToken(key);
  const normalizedLabel = normalizeMatchToken(label);

  for (const token of tokens) {
    if (token.length < 4) continue;
    const normalizedToken = normalizeMatchToken(token);
    if (normalizedKey === normalizedToken || normalizedLabel === normalizedToken) score += 24;
    else if (normalizedKey.includes(normalizedToken) && normalizedToken.length >= 5) score += 10;
    else if (normalizedLabel.includes(normalizedToken) && normalizedToken.length >= 4) score += 8;
  }

  if (GENERIC_TRANSLATION_KEYS.has(key)) score -= 10;
  return score;
}

function pickMenuPathForTranslationKey(key, keyToPaths, menuRows) {
  const paths = [...(keyToPaths.get(key) || [])];
  if (paths.length === 0) return null;
  if (paths.length === 1) return preferDirectoryEquivalentPath(paths[0], menuRows);

  paths.sort((a, b) => {
    const depthDiff = b.split(PATH_SEP).length - a.split(PATH_SEP).length;
    if (depthDiff !== 0) return depthDiff;
    return a.localeCompare(b);
  });

  const menuRowByPath = new Map(menuRows.map((row) => [row.path, row]));
  const chosen = paths.find((candidate) => menuRowByPath.has(candidate)) || paths[0];
  return preferDirectoryEquivalentPath(chosen, menuRows);
}

function normalizeMenuLabel(label) {
  return String(label || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");
}

function preferDirectoryEquivalentPath(path, menuRows) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath) return path;

  const sourceRow = menuRows.find((row) => row.path === normalizedPath);
  if (!sourceRow?.authorize || sourceRow.menuSource === "directory-command-nav") {
    return normalizedPath;
  }

  const sourceLeafNorm = normalizeMenuLabel(normalizedPath.split(PATH_SEP).pop());
  const directoryRow = menuRows.find((row) => {
    if (row.menuSource !== "directory-command-nav") return false;
    if (row.authorize !== sourceRow.authorize) return false;
    if (row.path === normalizedPath) return false;
    const leafNorm = normalizeMenuLabel(row.path.split(PATH_SEP).pop());
    return leafNorm === sourceLeafNorm;
  });
  return directoryRow?.path || normalizedPath;
}

function translationKeysFromResourceType(resourceType) {
  const rest = resourceType.replace(/^genesyscloud_/, "");
  return RESOURCE_TYPE_TRANSLATION_KEYS[rest] || [];
}

function collectTranslationCandidates(resource, permissions, translationIndex) {
  const { keyToPaths, translationMap } = translationIndex;
  const resourceType = getResourceType(resource);
  const resourceName = getResourceName(resource);
  const primaryPermissions = primaryPermissionsForMatch(resourceType, permissions);
  const entities = qualifiedEntities(primaryPermissions);
  const tokens = significantTypeTokens(resourceType, resourceName);
  const scores = new Map();
  const sources = new Map();

  const addKey = (key, score, source) => {
    if (!key || !keyToPaths.has(key)) return;
    scores.set(key, (scores.get(key) || 0) + score);
    if (!sources.has(key)) sources.set(key, new Set());
    sources.get(key).add(source);
  };

  for (const key of translationKeysFromResourceType(resourceType)) {
    addKey(key, 220, "resource-type");
  }

  for (const entity of entities) {
    for (const key of translationKeysFromEntity(entity, translationMap)) {
      addKey(key, ENTITY_TRANSLATION_KEYS[entity]?.includes(key) ? 120 : 40, "entity");
    }
  }

  const hasWorkitemEntity = entities.some((entity) => entity.startsWith("workitems:workitem"));
  const hasTelephonyPrimary = entities.some((entity) => entity.startsWith("telephony:"));
  for (const scope of getResourceScopes(resource)) {
    const scopeBase = scope.split(":")[0].toLowerCase();
    if (hasWorkitemEntity && scopeBase === "workitems") continue;
    if (
      hasTelephonyPrimary &&
      ["authorization", "conversations", "organization", "presence"].includes(scopeBase)
    ) {
      continue;
    }
    for (const key of translationKeysFromScope(scope)) {
      addKey(key, SCOPE_TRANSLATION_PREFIXES[scope.split(":")[0].toLowerCase()]?.includes(key) ? 60 : 24, "scope");
    }
  }

  for (const key of Object.keys(translationMap)) {
    const tokenScore = scoreTranslationKey(key, translationMap[key], tokens);
    if (tokenScore <= 0) continue;
    if (GENERIC_TRANSLATION_KEYS.has(key) && tokenScore < 20) continue;
    addKey(key, tokenScore, "resource");
  }

  return [...scores.entries()]
    .map(([key, score]) => ({
      key,
      score,
      sources: [...(sources.get(key) || [])].sort(),
      path: pickMenuPathForTranslationKey(key, keyToPaths, []),
    }))
    .filter((entry) => entry.path)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

function bestTranslationFallbackMatch(resource, permissions, menuRows, translationIndex) {
  const candidates = collectTranslationCandidates(resource, permissions, translationIndex).map(
    (candidate) => ({
      ...candidate,
      path: pickMenuPathForTranslationKey(candidate.key, translationIndex.keyToPaths, menuRows),
    })
  ).filter((candidate) => candidate.path);

  if (candidates.length === 0) return null;

  const best = candidates[0];
  const second = candidates[1];
  const margin = second ? best.score - second.score : best.score;

  if (best.score < MIN_TRANSLATION_FALLBACK_SCORE) return null;
  if (
    second &&
    margin < MIN_TRANSLATION_SCORE_MARGIN &&
    !best.sources.includes("entity") &&
    !best.sources.includes("resource-type")
  ) {
    return null;
  }

  const resolvedPath = preferDirectoryEquivalentPath(best.path, menuRows);
  const menuRow =
    menuRows.find((row) => row.path === resolvedPath) ||
    menuRows.find((row) => row.path === best.path);
  const matchMethod = best.sources.includes("resource-type")
    ? "translation-resource-type"
    : best.sources.includes("entity")
      ? "translation-entity"
      : best.sources.includes("scope")
        ? "translation-scope"
        : "translation-resource";

  return {
    menuPath: resolvedPath,
    menuAuthorize: menuRow?.authorize || "",
    matchScore: best.score,
    matchMethod,
    translationKey: best.key,
    translationSources: best.sources,
    menuSource: menuRow?.menuSource,
    titleKey: menuRow?.titleKey,
    link: menuRow?.link,
  };
}

const SKIP_PERMISSION_DOMAINS = new Set(["relate"]);
const GENERIC_MENU_PERMISSIONS = new Set(["admin", "group_administration", "location_administration", "field_administration"]);

function isQualifiedPermission(permission) {
  const parts = String(permission || "").trim().split(":");
  if (parts.length !== 3) return false;
  if (!parts[0] || !parts[1] || !parts[2]) return false;
  if (SKIP_PERMISSION_DOMAINS.has(parts[0].toLowerCase())) return false;
  return true;
}

function permissionEntity(permission) {
  const parts = String(permission || "")
    .trim()
    .split(":");
  if (parts.length < 2) return String(permission || "").trim();
  return `${parts[0]}:${parts[1]}`;
}

function camelCasePrefixEntities(entity) {
  const [domain, name] = entity.split(":");
  if (!domain || !name) return [];

  const prefixes = [];
  const parts = name.split(/(?=[A-Z])/).filter(Boolean);
  for (let index = 1; index < parts.length; index += 1) {
    prefixes.push(`${domain}:${parts.slice(0, index).join("")}`);
  }
  return prefixes;
}

function resourceEntitiesForMenuMatch(resourceEntity) {
  return [
    ...new Set([
      resourceEntity,
      ...(MENU_ENTITY_ALIASES[resourceEntity] || []),
      ...camelCasePrefixEntities(resourceEntity),
    ]),
  ];
}

function menuEntityMatchesResourceEntity(resourceEntity, menuEntity) {
  if (resourceEntitiesForMenuMatch(resourceEntity).includes(menuEntity)) {
    return true;
  }

  const aliases = MENU_ENTITY_RESOURCE_ALIASES[menuEntity] || [];
  return aliases.includes(resourceEntity);
}

function entityMatchesMenuEntity(resourceEntity, menuEntity) {
  return menuEntityMatchesResourceEntity(resourceEntity, menuEntity);
}

function normalizeAuthorizeToken(token) {
  return String(token || "")
    .trim()
    .replace(/^policy=/, "")
    .replace(/^permission=/, "")
    .trim();
}

function parseMenuRowAuthorize(authorize) {
  const qualified = [];
  let hasGenericPermission = false;

  for (const token of String(authorize || "")
    .split(AUTH_SEP)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const normalized = normalizeAuthorizeToken(token);
    if (!normalized) continue;

    if (isQualifiedPermission(normalized)) {
      qualified.push(normalized);
      continue;
    }

    if (GENERIC_MENU_PERMISSIONS.has(normalized) || normalized === "admin") {
      hasGenericPermission = true;
    }
  }

  return { qualified, hasGenericPermission };
}

function policyMatchesResource(policy, resourcePermission) {
  if (policy === resourcePermission) return true;

  if (policy.endsWith(":*")) {
    const prefix = policy.slice(0, -2);
    return resourcePermission.startsWith(`${prefix}:`);
  }

  return false;
}

function countPolicyOverlap(menuPolicies, resourcePermissions) {
  let overlap = 0;
  for (const menuPolicy of menuPolicies) {
    for (const resourcePermission of resourcePermissions) {
      if (policyMatchesResource(menuPolicy, resourcePermission)) {
        overlap += 1;
        break;
      }
    }
  }
  return overlap;
}

function countEntityOverlap(menuPolicies, resourcePermissions) {
  const menuEntities = new Set(menuPolicies.map(permissionEntity));
  let overlap = 0;
  for (const resourcePermission of resourcePermissions) {
    const resourceEntity = permissionEntity(resourcePermission);
    for (const menuEntity of menuEntities) {
      if (entityMatchesMenuEntity(resourceEntity, menuEntity)) {
        overlap += 1;
        break;
      }
    }
  }
  return overlap;
}

function isGenericQualifiedPermission(permission) {
  if (!isQualifiedPermission(permission)) {
    const normalized = normalizeAuthorizeToken(permission);
    return GENERIC_MENU_PERMISSIONS.has(normalized) || normalized === "admin";
  }
  return GENERIC_QUALIFIED_PERMISSIONS.has(permission);
}

function entityMatchesResourceType(resourceType, entity) {
  const typeNorm = normalizeMatchToken(resourceType.replace(/^genesyscloud_/, ""));
  const [domain, entityName] = entity.split(":");
  if (!domain || !entityName) return false;

  const variants = [
    normalizeMatchToken(`${domain}${entityName}`),
    normalizeMatchToken(entityName),
    normalizeMatchToken(entity.replace(":", "")),
  ];

  return variants.some((variant) => variant.length >= 3 && typeNorm.includes(variant));
}

const TELEPHONY_EDGES_PREFIX = "telephony_providers_edges_";

function focusTypeParts(resourceType) {
  const rest = resourceType.replace(/^genesyscloud_/, "");
  if (rest.startsWith(TELEPHONY_EDGES_PREFIX)) {
    return rest.slice(TELEPHONY_EDGES_PREFIX.length).split("_").filter(Boolean);
  }
  return rest.split("_").filter(Boolean).slice(-2);
}

function significantTypeTokens(resourceType, resourceName = "") {
  const focusParts = focusTypeParts(resourceType);
  const tokens = new Set();

  for (let start = 0; start < focusParts.length; start += 1) {
    for (let end = start + 1; end <= focusParts.length; end += 1) {
      tokens.add(focusParts.slice(start, end).join(""));
    }
  }

  for (const part of focusParts) {
    tokens.add(part);
  }

  if (tokens.has("did") && tokens.has("pool")) {
    tokens.delete("pool");
  }

  return [...tokens]
    .filter(
      (token) => token.length >= 3 && !PATH_AFFINITY_IGNORE_TOKENS.has(normalizeMatchToken(token))
    )
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function entityMatchStrength(resourceType, entity) {
  const typeNorm = normalizeMatchToken(resourceType.replace(/^genesyscloud_/, ""));
  const entityNorm = normalizeMatchToken(entity.replace(":", ""));
  if (entityNorm.length >= 3 && typeNorm.includes(entityNorm)) return entityNorm.length;

  const entityName = entity.split(":")[1] || "";
  const nameNorm = normalizeMatchToken(entityName);
  if (nameNorm.length >= 3 && typeNorm.includes(nameNorm)) return nameNorm.length;

  return 0;
}

function primaryPermissionsForMatch(resourceType, permissions) {
  const qualified = permissions.filter(isQualifiedPermission);
  const entityMatched = qualified.filter((permission) =>
    entityMatchesResourceType(resourceType, permissionEntity(permission))
  );

  if (entityMatched.length > 0) {
    const rest = resourceType.replace(/^genesyscloud_/, "");
    const tailPart = rest.split("_").pop() || "";
    const tailNorm = normalizeMatchToken(tailPart);
    const tailEntityMatched = entityMatched.filter((permission) => {
      const entityName = permissionEntity(permission).split(":")[1] || "";
      return normalizeMatchToken(entityName) === tailNorm;
    });
    if (tailEntityMatched.length > 0) {
      return tailEntityMatched;
    }

    const bestStrength = Math.max(
      ...entityMatched.map((permission) => entityMatchStrength(resourceType, permissionEntity(permission)))
    );
    return entityMatched.filter(
      (permission) =>
        entityMatchStrength(resourceType, permissionEntity(permission)) === bestStrength
    );
  }

  const nonGeneric = qualified.filter((permission) => !isGenericQualifiedPermission(permission));
  if (nonGeneric.length > 0) return nonGeneric;

  return qualified;
}

function resourceTypeMatchesHintSuffix(resourceType, suffix) {
  const typeNorm = normalizeMatchToken(resourceType.replace(/^genesyscloud_/, ""));
  const suffixNorm = normalizeMatchToken(String(suffix).replace(/^genesyscloud_/, ""));
  return Boolean(suffixNorm) && typeNorm === suffixNorm;
}

function scoreDirectoryTitleKey(resourceType, titleKey) {
  if (!titleKey) return 0;

  const leaf = titleKey.split(".").pop() || "";

  for (const [hintLeaf, resourceSuffixes] of Object.entries(DIRECTORY_TITLE_KEY_HINTS)) {
    if (leaf !== hintLeaf) continue;
    if (resourceSuffixes.some((suffix) => resourceTypeMatchesHintSuffix(resourceType, suffix))) {
      return 180;
    }
  }

  return 0;
}

function primaryEntityPurityBonus(menuPolicies, primaryPermissions) {
  const primaryEntities = new Set(primaryPermissions.map(permissionEntity));
  if (primaryEntities.size === 0 || menuPolicies.length === 0) return 0;

  const allMenuPoliciesArePrimary = menuPolicies.every((policy) =>
    primaryEntities.has(permissionEntity(policy))
  );
  return allMenuPoliciesArePrimary ? 150_000 : 0;
}

function menuPolicyTightnessBonus(menuPolicies, primaryPermissions) {
  const primaryOverlap = countPolicyOverlap(menuPolicies, primaryPermissions);
  if (primaryOverlap === 0) return 0;

  const primaryEntities = new Set(primaryPermissions.map(permissionEntity));
  const focusedMenuPolicies = menuPolicies.filter((policy) =>
    primaryEntities.has(permissionEntity(policy))
  );
  const allMenuPoliciesArePrimary =
    focusedMenuPolicies.length > 0 && focusedMenuPolicies.length === menuPolicies.length;

  let bonus = Math.max(0, 12 - menuPolicies.length) * 4_000;
  if (allMenuPoliciesArePrimary) bonus += 90_000;
  return bonus;
}

function directorySourceBonus(resourceType, menuRow, menuPolicies, primaryPermissions) {
  if (menuRow.menuSource !== "directory-command-nav") return 0;
  if (entityAffinityBonus(resourceType, menuPolicies, primaryPermissions) > 0) {
    return DIRECTORY_MENU_SOURCE_BONUS;
  }
  if (scoreDirectoryTitleKey(resourceType, menuRow.titleKey) >= MIN_DIRECTORY_TITLE_KEY_SCORE) {
    return DIRECTORY_MENU_SOURCE_BONUS;
  }
  if (countPolicyOverlap(menuPolicies, primaryPermissions) > 0) {
    return DIRECTORY_MENU_SOURCE_BONUS;
  }
  return 0;
}

function broadMenuPolicyPenalty(menuPolicies, primaryPermissions) {
  if (menuPolicies.length <= 4) return 0;

  const overlap = countPolicyOverlap(menuPolicies, primaryPermissions);
  if (overlap === 0) return 0;

  return Math.max(0, menuPolicies.length - overlap * 3) * 3_000;
}

function tangentialMenuPolicyPenalty(resourceType, menuPolicies, primaryPermissions) {
  const primaryEntities = new Set(primaryPermissions.map(permissionEntity));
  let penalty = 0;

  for (const menuPolicy of menuPolicies) {
    const menuEntity = permissionEntity(menuPolicy);
    if (primaryEntities.has(menuEntity)) continue;
    if (primaryPermissions.some((permission) => menuEntityMatchesResourceEntity(permissionEntity(permission), menuEntity))) {
      continue;
    }
    if (entityMatchesResourceType(resourceType, menuEntity)) continue;
    penalty += 8_000;
  }

  return penalty;
}

function scorePathAffinity(resourceType, menuPath) {
  const typeTokens = significantTypeTokens(resourceType);
  const pathSegments = menuPath.split(PATH_SEP).map((segment) => normalizeMatchToken(segment));
  const pathNorm = pathSegments.join("");
  let score = 0;

  for (const token of typeTokens) {
    if (token.length < 3) continue;
    const normalizedToken = normalizeMatchToken(token);

    for (const segment of pathSegments) {
      if (segment === "edges" && normalizedToken.startsWith("edge")) continue;
      if (segment === normalizedToken) score += 80;
      else if (segment.includes(normalizedToken) && normalizedToken.length >= 3) score += 45;
      else if (normalizedToken.includes(segment) && segment.length >= 3) score += 35;
    }

    if (pathNorm.includes(normalizedToken) && normalizedToken.length >= 4) score += 12;
  }

  return score;
}

function entityAffinityBonus(resourceType, menuPolicies, resourcePermissions) {
  let bonus = 0;

  for (const menuPolicy of menuPolicies) {
    const menuEntity = permissionEntity(menuPolicy);
    for (const resourcePermission of resourcePermissions) {
      const resourceEntity = permissionEntity(resourcePermission);
      if (!menuEntityMatchesResourceEntity(resourceEntity, menuEntity)) continue;
      if (entityMatchesResourceType(resourceType, menuEntity)) {
        bonus += 50_000;
        break;
      }
    }
  }

  return bonus;
}

function isConfidentPermissionMatch(resourceType, menuRow, resourcePermissions, score) {
  const primaryPermissions = primaryPermissionsForMatch(resourceType, resourcePermissions).filter(
    isQualifiedPermission
  );
  const { qualified: menuPolicies } = parseMenuRowAuthorize(menuRow.authorize);
  const policyOverlap = countPolicyOverlap(menuPolicies, primaryPermissions);
  const pathAffinity = scorePathAffinity(resourceType, menuRow.path);
  const titleKeyScore = scoreDirectoryTitleKey(resourceType, menuRow.titleKey);

  if (
    menuRow.menuSource === "directory-command-nav" &&
    titleKeyScore >= MIN_DIRECTORY_TITLE_KEY_SCORE
  ) {
    return true;
  }

  if (
    entityAffinityBonus(resourceType, menuPolicies, primaryPermissions) > 0 ||
    (policyOverlap > 0 && pathAffinity >= MIN_PATH_AFFINITY_SCORE) ||
    pathAffinity >= MIN_PATH_AFFINITY_SCORE + 20
  ) {
    return true;
  }

  const typeNorm = normalizeMatchToken(resourceType.replace(/^genesyscloud_/, ""));
  const pathNorm = normalizeMatchToken(menuRow.path);

  if (typeNorm.includes("group") && typeNorm.includes("roles") && !pathNorm.includes("group")) {
    return false;
  }

  return score >= 20_000;
}

function scoreMenuMatch(resourceType, resourcePermissions, menuRow) {
  const { qualified: menuPolicies, hasGenericPermission } = parseMenuRowAuthorize(
    menuRow.authorize
  );
  if (menuPolicies.length === 0 && !hasGenericPermission) return -1;

  const primaryPermissions = primaryPermissionsForMatch(resourceType, resourcePermissions);
  const qualifiedPrimary = primaryPermissions.filter(isQualifiedPermission);
  if (qualifiedPrimary.length === 0) return -1;

  if (menuPolicies.length > 0) {
    const policyOverlap = countPolicyOverlap(menuPolicies, qualifiedPrimary);
    const entityOverlap = countEntityOverlap(menuPolicies, qualifiedPrimary);

    if (policyOverlap > 0 || entityOverlap > 0) {
      const primaryOverlap = countPolicyOverlap(menuPolicies, qualifiedPrimary);
      const menuEntitySet = new Set(menuPolicies.map(permissionEntity));
      const resourceEntitySet = new Set(qualifiedPrimary.map(permissionEntity));
      const allMenuEntitiesInResource = [...menuEntitySet].every((entity) =>
        resourceEntitySet.has(entity)
      );
      const allMenuPoliciesInResource =
        policyOverlap === menuPolicies.length &&
        menuPolicies.every((menuPolicy) =>
          qualifiedPrimary.some((resourcePermission) =>
            policyMatchesResource(menuPolicy, resourcePermission)
          )
        );

      let score =
        (primaryOverlap * PRIMARY_POLICY_OVERLAP_WEIGHT) / Math.max(1, menuPolicies.length);
      score += policyOverlap * 10_000 + entityOverlap * 1_000;
      score += entityAffinityBonus(resourceType, menuPolicies, qualifiedPrimary);
      score += scorePathAffinity(resourceType, menuRow.path) * 5;
      const titleKeyScore = scoreDirectoryTitleKey(resourceType, menuRow.titleKey);
      score += titleKeyScore * 25;
      if (
        titleKeyScore >= MIN_DIRECTORY_TITLE_KEY_SCORE &&
        menuRow.menuSource === "directory-command-nav"
      ) {
        score += DIRECTORY_TITLE_KEY_MATCH_BONUS;
      }
      score += menuRow.path.split(PATH_SEP).length * 250;

      if (allMenuPoliciesInResource) score += 50_000;
      if (allMenuEntitiesInResource) score += 20_000;
      if (hasGenericPermission) score -= 2_000;
      score -= tangentialMenuPolicyPenalty(resourceType, menuPolicies, qualifiedPrimary);
      score -= broadMenuPolicyPenalty(menuPolicies, qualifiedPrimary);
      score += directorySourceBonus(resourceType, menuRow, menuPolicies, qualifiedPrimary);
      score += menuPolicyTightnessBonus(menuPolicies, qualifiedPrimary);
      score += primaryEntityPurityBonus(menuPolicies, qualifiedPrimary);
      if (menuRow.menuSource === "admin-menu") score -= ADMIN_MENU_SOURCE_PENALTY;

      return score;
    }
  }

  if (menuRow.menuSource === "directory-command-nav") {
    const titleKeyScore = scoreDirectoryTitleKey(resourceType, menuRow.titleKey);
    const pathScore = scorePathAffinity(resourceType, menuRow.path);
    if (titleKeyScore >= MIN_DIRECTORY_TITLE_KEY_SCORE) {
      let score = titleKeyScore * 2_000 + pathScore * 800;
      score += menuRow.path.split(PATH_SEP).length * 250;
      score += DIRECTORY_MENU_SOURCE_BONUS;
      score += DIRECTORY_TITLE_KEY_MATCH_BONUS;
      if (hasGenericPermission) score += 5_000;
      return score;
    }
  }

  const allQualified = resourcePermissions.filter(isQualifiedPermission);
  const genericOnly =
    allQualified.length > 0 && allQualified.every(isGenericQualifiedPermission);
  const primaryHasGenericOnly =
    qualifiedPrimary.length > 0 &&
    qualifiedPrimary.every(isGenericQualifiedPermission);

  if (genericOnly || primaryHasGenericOnly) {
    const genericOverlap = countPolicyOverlap(menuPolicies, allQualified);
    if (genericOverlap === 0) return -1;

    const pathScore = scorePathAffinity(resourceType, menuRow.path);
    if (pathScore < MIN_PATH_AFFINITY_SCORE) return -1;

    return genericOverlap * 100 + pathScore * 500 + menuRow.path.split(PATH_SEP).length;
  }

  return -1;
}

function bestMenuMatch(resourceType, resourcePermissions, menuRows, translationIndex) {
  const scoredRows = [];

  for (const row of menuRows) {
    const score = scoreMenuMatch(resourceType, resourcePermissions, row);
    if (score < 0) continue;

    const primaryPermissions = primaryPermissionsForMatch(resourceType, resourcePermissions).filter(
      isQualifiedPermission
    );
    const primaryGenericOnly =
      primaryPermissions.length > 0 &&
      primaryPermissions.every(isGenericQualifiedPermission);
    const pathAffinity = scorePathAffinity(resourceType, row.path);

    scoredRows.push({
      row,
      score,
      pathAffinity,
      usedPathAffinity: primaryGenericOnly && pathAffinity >= MIN_PATH_AFFINITY_SCORE,
    });
  }

  if (scoredRows.length === 0) return null;

  const titleKeyHintRows = scoredRows
    .filter(
      (entry) =>
        scoreDirectoryTitleKey(resourceType, entry.row.titleKey) >= MIN_DIRECTORY_TITLE_KEY_SCORE
    )
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const depthDiff =
        b.row.path.split(PATH_SEP).length - a.row.path.split(PATH_SEP).length;
      if (depthDiff !== 0) return depthDiff;
      return b.pathAffinity - a.pathAffinity;
    });

  if (titleKeyHintRows.length > 0) {
    const winner = titleKeyHintRows[0];
    if (!isConfidentPermissionMatch(resourceType, winner.row, resourcePermissions, winner.score)) {
      return null;
    }

    return {
      menuPath: winner.row.path,
      menuAuthorize: winner.row.authorize,
      matchScore: winner.score,
      matchMethod: winner.usedPathAffinity ? "path-affinity" : "permission",
      pathAffinity: winner.pathAffinity,
      menuSource: winner.row.menuSource,
      titleKey: winner.row.titleKey,
      link: winner.row.link,
    };
  }

  scoredRows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const directoryDiff =
      (b.row.menuSource === "directory-command-nav" ? 1 : 0) -
      (a.row.menuSource === "directory-command-nav" ? 1 : 0);
    if (directoryDiff !== 0) return directoryDiff;
    const depthDiff =
      b.row.path.split(PATH_SEP).length - a.row.path.split(PATH_SEP).length;
    if (depthDiff !== 0) return depthDiff;
    return b.pathAffinity - a.pathAffinity;
  });

  const bestScore = scoredRows[0].score;
  const tiedRows = scoredRows
    .filter((entry) => entry.score === bestScore)
    .sort((a, b) => {
      const directoryDiff =
        (b.row.menuSource === "directory-command-nav" ? 1 : 0) -
        (a.row.menuSource === "directory-command-nav" ? 1 : 0);
      if (directoryDiff !== 0) return directoryDiff;
      const depthDiff =
        b.row.path.split(PATH_SEP).length - a.row.path.split(PATH_SEP).length;
      if (depthDiff !== 0) return depthDiff;
      return b.pathAffinity - a.pathAffinity;
    });

  const translationHint = pickTranslationHintForTie(
    resourceType,
    resourcePermissions,
    translationIndex,
    menuRows
  );
  const winner =
    translationHint && tiedRows.some((entry) => entry.row.path === translationHint)
      ? tiedRows.find((entry) => entry.row.path === translationHint)
      : tiedRows[0];

  if (!isConfidentPermissionMatch(resourceType, winner.row, resourcePermissions, winner.score)) {
    return null;
  }

  return {
    menuPath: winner.row.path,
    menuAuthorize: winner.row.authorize,
    matchScore: winner.score,
    matchMethod: winner.usedPathAffinity ? "path-affinity" : "permission",
    pathAffinity: winner.pathAffinity,
    menuSource: winner.row.menuSource,
    titleKey: winner.row.titleKey,
    link: winner.row.link,
  };
}

function pickDirectoryTitleKeyHint(resourceType, menuRows) {
  let bestPath = null;
  let bestScore = 0;

  for (const row of menuRows) {
    if (row.menuSource !== "directory-command-nav") continue;
    const titleKeyScore = scoreDirectoryTitleKey(resourceType, row.titleKey);
    if (titleKeyScore <= bestScore) continue;
    bestScore = titleKeyScore;
    bestPath = row.path;
  }

  return bestScore >= MIN_DIRECTORY_TITLE_KEY_SCORE ? bestPath : null;
}

function pickTranslationHintForTie(resourceType, resourcePermissions, translationIndex, menuRows) {
  const directoryHint = pickDirectoryTitleKeyHint(resourceType, menuRows);
  if (directoryHint) return directoryHint;

  const primaryEntities = qualifiedEntities(
    primaryPermissionsForMatch(resourceType, resourcePermissions)
  );

  for (const entity of primaryEntities) {
    for (const key of ENTITY_TRANSLATION_KEYS[entity] || []) {
      const path = pickMenuPathForTranslationKey(key, translationIndex.keyToPaths, menuRows);
      if (path) return path;
    }
  }

  for (const key of translationKeysFromResourceType(resourceType)) {
    const path = pickMenuPathForTranslationKey(key, translationIndex.keyToPaths, menuRows);
    if (path) return path;
  }

  return null;
}

function summarizeUnmappedReason(resourcePermissions) {
  const qualified = resourcePermissions.filter(isQualifiedPermission);
  if (qualified.length === 0) {
    return "no qualified permissions";
  }

  return `no menu authorize overlap (${[...new Set(qualified.map(permissionEntity))].sort().join(", ")})`;
}

function getResourceType(resource) {
  for (const value of [
    resource?.resourceType,
    resource?.resource_type,
    resource?.type,
    resource?.name,
  ]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function getResourcePermissions(resource) {
  if (!Array.isArray(resource?.permissions)) return [];
  return resource.permissions
    .map((permission) => String(permission || "").trim())
    .filter(Boolean)
    .filter((permission) => {
      const domain = permission.split(":")[0]?.toLowerCase();
      return domain && !SKIP_PERMISSION_DOMAINS.has(domain);
    });
}

function menuLeafFromPath(menuPath) {
  const parts = String(menuPath || "").split(PATH_SEP);
  return parts[parts.length - 1] || "";
}

function createCatalogEntry(resourceType, permissions, match, unmappedReason, overrideMenuPath) {
  const entry = {
    resourceType,
    permissions: [...permissions].sort((a, b) => a.localeCompare(b)),
  };

  if (match) {
    entry.menuPath = match.menuPath;
    entry.menuLeaf = menuLeafFromPath(match.menuPath);
    entry.menuAuthorize = match.menuAuthorize;
    entry.matchScore = match.matchScore;
    entry.matchMethod = match.matchMethod;
    if (match.pathAffinity != null) entry.pathAffinity = match.pathAffinity;
    if (match.menuSource) entry.menuSource = match.menuSource;
    if (match.titleKey) entry.titleKey = match.titleKey;
    if (match.link) entry.link = match.link;
    if (match.translationKey) entry.translationKey = match.translationKey;
    if (match.translationSources?.length) entry.translationSources = match.translationSources;
  } else {
    entry.unmappedReason = unmappedReason;
  }

  if (overrideMenuPath) {
    entry.overrideMenuPath = overrideMenuPath;
    entry.overrideMenuLeaf = menuLeafFromPath(overrideMenuPath);
    entry.overrideMatches =
      match?.menuPath === overrideMenuPath ||
      menuLeafFromPath(match?.menuPath) === menuLeafFromPath(overrideMenuPath);
  }

  return entry;
}

function buildMapping(
  menuJson,
  permissionsJson,
  permissionOverrides = {},
  guiMenuPathOverrides = {},
  ignoredTypes = new Set(),
  directoryMenuRows = []
) {
  const menu = menuJson?.menu;
  if (!menu || typeof menu !== "object") {
    throw new Error("menu.json is missing a menu object");
  }

  const translations = menuJson.translations;
  const adminMenuRows = flattenMenu(menu, translations).map((row) => ({
    ...row,
    menuSource: row.menuSource || "admin-menu",
  }));
  const menuRows = [...adminMenuRows, ...(directoryMenuRows || [])];
  const translationIndex = buildTranslationIndex(menu, translations);
  const resources = Array.isArray(permissionsJson?.resources) ? permissionsJson.resources : [];
  const guiMenuPaths = {};
  const guiMenuPathCatalog = [];
  const unmappedResourceTypes = {};
  const matchMethodCounts = {
    permission: 0,
    "path-affinity": 0,
    "translation-resource-type": 0,
    "translation-entity": 0,
    "translation-scope": 0,
    "translation-resource": 0,
  };
  const permissionOnly = hasArgFlag("permission-only");

  for (const resource of resources) {
    const resourceType = getResourceType(resource);
    if (!resourceType) continue;

    const permissions = [
      ...getResourcePermissions(resource),
      ...(Array.isArray(permissionOverrides[resourceType])
        ? permissionOverrides[resourceType]
        : []),
    ];
    const uniquePermissions = [...new Set(permissions)];

    const overrideMenuPath =
      typeof guiMenuPathOverrides[resourceType] === "string"
        ? guiMenuPathOverrides[resourceType].trim()
        : "";

    if (ignoredTypes.has(resourceType)) {
      guiMenuPathCatalog.push(
        createCatalogEntry(
          resourceType,
          uniquePermissions,
          null,
          "listed in guiMenuPathsIgnore",
          overrideMenuPath || undefined
        )
      );
      continue;
    }

    let match = bestMenuMatch(resourceType, uniquePermissions, menuRows, translationIndex);
    if (!match && !permissionOnly) {
      match = bestTranslationFallbackMatch(resource, uniquePermissions, menuRows, translationIndex);
    }

    if (match) {
      guiMenuPaths[resourceType] = match.menuPath;
      guiMenuPathCatalog.push(
        createCatalogEntry(resourceType, uniquePermissions, match, undefined, overrideMenuPath || undefined)
      );
      if (matchMethodCounts[match.matchMethod] != null) {
        matchMethodCounts[match.matchMethod] += 1;
      }
      continue;
    }

    const unmappedReason = permissionOnly
      ? summarizeUnmappedReason(uniquePermissions)
      : `${summarizeUnmappedReason(uniquePermissions)}; translation fallback: no confident match`;
    unmappedResourceTypes[resourceType] = unmappedReason;
    guiMenuPathCatalog.push(
      createCatalogEntry(
        resourceType,
        uniquePermissions,
        null,
        unmappedReason,
        overrideMenuPath || undefined
      )
    );
  }

  guiMenuPathCatalog.sort((a, b) => a.resourceType.localeCompare(b.resourceType));

  return { menuRows, guiMenuPaths, guiMenuPathCatalog, unmappedResourceTypes, matchMethodCounts };
}

function mergeMenuRows(previousRows, generatedRows) {
  const merged = [];
  const seen = new Set();

  // Generated rows win on key conflict so authorize stays current.
  for (const row of [...(generatedRows || []), ...(previousRows || [])]) {
    if (!row || typeof row.path !== "string") continue;
    const authorize = typeof row.authorize === "string" ? row.authorize : "";
    const key = `${row.path}\0${authorize}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const mergedRow = { path: row.path, authorize };
    if (typeof row.link === "string" && row.link.trim()) mergedRow.link = row.link.trim();
    if (typeof row.titleKey === "string" && row.titleKey.trim()) {
      mergedRow.titleKey = row.titleKey.trim();
    }
    if (typeof row.menuSource === "string" && row.menuSource.trim()) {
      mergedRow.menuSource = row.menuSource.trim();
    }
    if (Array.isArray(row.featureToggles) && row.featureToggles.length > 0) {
      mergedRow.featureToggles = [...row.featureToggles];
    }
    merged.push(mergedRow);
  }

  return merged;
}

function previousGuiMenuPathsIgnore(previous) {
  if (!previous || !Array.isArray(previous.guiMenuPathsIgnore)) return [];
  return previous.guiMenuPathsIgnore.filter(
    (resourceType) => typeof resourceType === "string" && resourceType.trim()
  );
}

function appendRetiredCatalogEntries(catalog, guiMenuPaths, permissionResourceTypes) {
  const catalogTypes = new Set(catalog.map((entry) => entry.resourceType));
  const retiredEntries = [];

  for (const [resourceType, menuPath] of Object.entries(guiMenuPaths)) {
    if (permissionResourceTypes.has(resourceType) || catalogTypes.has(resourceType)) continue;
    if (typeof menuPath !== "string" || !menuPath.trim()) continue;

    retiredEntries.push({
      resourceType,
      menuPath: menuPath.trim(),
      retired: true,
      description: "Retained from a prior run; not in current resource_permissions JSON",
    });
  }

  if (retiredEntries.length === 0) return catalog;

  return [...catalog, ...retiredEntries].sort((a, b) =>
    a.resourceType.localeCompare(b.resourceType)
  );
}

function previousGuiMenuPaths(previous) {
  if (!previous || typeof previous !== "object") return {};
  if (previous.guiMenuPaths && typeof previous.guiMenuPaths === "object") {
    return previous.guiMenuPaths;
  }
  if (previous.resourceTypes && typeof previous.resourceTypes === "object") {
    return previous.resourceTypes;
  }
  return {};
}

function sortGuiMenuPaths(guiMenuPaths) {
  return Object.fromEntries(
    Object.entries(guiMenuPaths).sort(([a], [b]) => a.localeCompare(b))
  );
}

function mergeGeneratedGuiMenuPaths(generated, previousPaths, permissionResourceTypes) {
  const merged = { ...generated };

  for (const [resourceType, menuPath] of Object.entries(previousPaths || {})) {
    if (permissionResourceTypes.has(resourceType)) continue;
    if (typeof menuPath !== "string" || !menuPath.trim()) continue;
    merged[resourceType] = menuPath.trim();
  }

  return sortGuiMenuPaths(merged);
}

async function loadMenuJson() {
  const source = getArgValue("menu") || DEFAULT_MENU_URL;

  if (/^https?:\/\//i.test(source)) {
    console.log(`Fetching menu JSON from ${source}`);
    const response = await fetch(source, {
      headers: { Accept: "application/json", "User-Agent": "cxascode-gui-menu-paths" },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Menu fetch failed ${response.status} ${response.statusText}\n${text}`);
    }
    return { json: await response.json(), source };
  }

  const menuPath = path.resolve(source);
  console.log(`Loading menu JSON from ${menuPath}`);
  return { json: await readJson(menuPath), source: menuPath };
}

async function listPermissionVersions() {
  const entries = await fs.readdir(PERMISSIONS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /^\d+\.\d+\.\d+\.json$/.test(entry.name))
    .map((entry) => entry.name.replace(/\.json$/, ""))
    .sort(compareVersionsAsc);
}

async function resolvePermissionsPath() {
  const explicit = getArgValue("permissions");
  if (explicit) return path.resolve(explicit);

  const latestArg = getArgValue("latest");
  if (latestArg) {
    return path.join(PERMISSIONS_DIR, `${latestArg}.json`);
  }

  const versions = await listPermissionVersions().catch((err) => {
    if (err?.code === "ENOENT") return [];
    throw err;
  });

  if (versions.length > 0) {
    return path.join(PERMISSIONS_DIR, `${versions[versions.length - 1]}.json`);
  }

  throw new Error(
    "No resource permissions JSON found. Run bootstrap-local-dev or pass --permissions=PATH or --latest=X.Y.Z"
  );
}

async function loadUnionPermissionsJson(minVersion = MIN_RESOURCE_PERMISSIONS_VERSION) {
  const versions = (await listPermissionVersions()).filter((version) =>
    isVersionAtLeast(version, minVersion)
  );

  if (versions.length === 0) {
    throw new Error(
      `No resource permissions JSON found >= ${minVersion}. Run download-provider-versions or bootstrap-local-dev.`
    );
  }

  const byType = new Map();

  for (const version of versions) {
    const filePath = path.join(PERMISSIONS_DIR, `${version}.json`);
    const json = await readJson(filePath);

    for (const resource of json.resources || []) {
      const resourceType = getResourceType(resource);
      if (resourceType) {
        byType.set(resourceType, resource);
      }
    }
  }

  return {
    json: {
      version: versions[versions.length - 1],
      resources: [...byType.values()].sort((a, b) =>
        getResourceType(a).localeCompare(getResourceType(b))
      ),
    },
    meta: {
      fromVersion: versions[0],
      toVersion: versions[versions.length - 1],
      fileCount: versions.length,
      resourceTypeCount: byType.size,
      minVersion,
    },
  };
}

function shouldUnionPermissions() {
  if (getArgValue("permissions")) return false;
  if (hasArgFlag("no-union-permissions")) return false;
  return hasArgFlag("union-permissions");
}

function unionPermissionsMinVersion() {
  return getArgValue("union-permissions") || MIN_RESOURCE_PERMISSIONS_VERSION;
}

async function loadOverridesDocument() {
  const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);

  try {
    return await readJson(overridesPath);
  } catch (err) {
    if (err?.code === "ENOENT") {
      return {};
    }
    throw err;
  }
}

async function loadGuiMenuPathOverrides() {
  const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);

  try {
    const parsed = await readJson(overridesPath);
    return normalizeOverrideMap(parsed?.guiMenuPaths);
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.log("No overrides file found; catalog will omit overrideMenuPath comparisons.");
      return {};
    }
    throw err;
  }
}

async function loadPermissionOverrides() {
  const overridesPath = path.resolve(getArgValue("overrides") || DEFAULT_OVERRIDES_PATH);

  try {
    const parsed = await readJson(overridesPath);
    const merged = {};

    for (const map of [
      normalizeOverrideMap(parsed?.addReadWritePermissions),
      normalizeOverrideMap(parsed?.addReadOnlyPermissions),
    ]) {
      for (const [resourceType, permissions] of Object.entries(map)) {
        if (!Array.isArray(permissions)) continue;
        merged[resourceType] = [...(merged[resourceType] || []), ...permissions];
      }
    }

    return merged;
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.log("No overrides file found; joining permissions without override injections.");
      return {};
    }
    throw err;
  }
}

function buildPublicOutput(fullOutput, overrides = null) {
  const menuCatalog = finalizeMenuCatalog(
    attachResourceTypesToMenuCatalog(fullOutput.menuCatalog, fullOutput.guiMenuPaths),
    overrides
  );

  return {
    generatedAt: fullOutput.generatedAt,
    permissionsSource: fullOutput.permissionsSource,
    permissionsUnion: fullOutput.permissionsUnion ?? null,
    menuCatalog,
  };
}

async function loadPreviousOutput() {
  for (const filePath of [DEBUG_OUTPUT_PATH, OUTPUT_PATH]) {
    try {
      return await readJson(filePath);
    } catch (err) {
      if (err?.code === "ENOENT") continue;
      throw err;
    }
  }

  return null;
}

async function writeGuiMenuPathOutputs(fullOutput, overrides = null) {
  const publicOutput = buildPublicOutput(fullOutput, overrides);

  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.mkdir(path.dirname(DEBUG_OUTPUT_PATH), { recursive: true });

  await Promise.all([
    fs.writeFile(OUTPUT_PATH, `${JSON.stringify(publicOutput, null, 2)}\n`, "utf8"),
    fs.writeFile(DEBUG_OUTPUT_PATH, `${JSON.stringify(fullOutput, null, 2)}\n`, "utf8"),
  ]);
}

function directoryBaseFromMenuSource(menuSource) {
  if (getArgValue("directory-base")) return getArgValue("directory-base");
  if (typeof menuSource === "string" && /^https?:\/\//i.test(menuSource)) {
    return new URL(menuSource).origin;
  }
  return DEFAULT_DIRECTORY_BASE;
}

async function loadDirectoryNav(menuSource) {
  if (hasArgFlag("no-directory-nav")) {
    console.log("Skipping directory command nav (--no-directory-nav).");
    return { menuRows: [], commandNavEntryCount: 0, sources: {} };
  }

  const bundleSource = getArgValue("directory-bundle");
  const translationsSource = getArgValue("directory-translations");
  const directoryBase = directoryBaseFromMenuSource(menuSource);

  if (bundleSource || translationsSource) {
    console.log(
      `Loading directory command nav${bundleSource ? "" : ` (discovering bundle from ${directoryBase})`}.`
    );
  } else {
    console.log(`Discovering directory command nav from ${directoryBase}`);
  }

  return loadDirectoryCommandNav({
    bundleSource,
    translationsSource,
    directoryBase: bundleSource && translationsSource ? "" : directoryBase,
    readJson,
    readText: (filePath) => fs.readFile(filePath, "utf8"),
  });
}

async function main() {
  const [{ json: menuJson, source: menuSource }, permissionOverrides, guiMenuPathOverrides, previous, overridesDoc] =
    await Promise.all([
      loadMenuJson(),
      loadPermissionOverrides(),
      loadGuiMenuPathOverrides(),
      loadPreviousOutput(),
      loadOverridesDocument(),
    ]);

  const directoryNav = await loadDirectoryNav(menuSource);

  const latestPermissionsPath = await resolvePermissionsPath();
  const latestPermissionsJson = await readJson(latestPermissionsPath);
  let permissionsJson = latestPermissionsJson;
  let permissionsUnion = null;

  if (shouldUnionPermissions()) {
    const minVersion = unionPermissionsMinVersion();
    const union = await loadUnionPermissionsJson(minVersion);
    permissionsJson = union.json;
    permissionsUnion = union.meta;
    console.log(
      `Loading union permissions from ${union.meta.fileCount} file(s) (${union.meta.fromVersion}..${union.meta.toVersion}, ${union.meta.resourceTypeCount} resource types; latest ${path.relative(process.cwd(), latestPermissionsPath)})`
    );
  } else {
    console.log(`Loading resource permissions from ${latestPermissionsPath}`);
  }

  const guiMenuPathsIgnore = previousGuiMenuPathsIgnore(previous);
  const ignoredTypes = new Set(guiMenuPathsIgnore);
  const generated = buildMapping(
    menuJson,
    permissionsJson,
    permissionOverrides,
    guiMenuPathOverrides,
    ignoredTypes,
    directoryNav.menuRows
  );

  const permissionResourceTypes = new Set(
    (latestPermissionsJson.resources || [])
      .map((resource) => getResourceType(resource))
      .filter(Boolean)
  );
  const guiMenuPaths = mergeGeneratedGuiMenuPaths(
    generated.guiMenuPaths,
    previousGuiMenuPaths(previous),
    permissionResourceTypes
  );
  const guiMenuPathCatalog = appendRetiredCatalogEntries(
    generated.guiMenuPathCatalog,
    guiMenuPaths,
    permissionResourceTypes
  );
  const menuRows = mergeMenuRows(previous?.menuRows, generated.menuRows);
  const menuCatalog = buildMenuCatalog(directoryNav.menuRows, overridesDoc);

  const unionResourceTypes = new Set(
    (permissionsJson.resources || []).map((resource) => getResourceType(resource)).filter(Boolean)
  );
  const totalResources = unionResourceTypes.size;
  const mappedCount = Object.keys(generated.guiMenuPaths).length;
  const unmappedCount = Object.keys(generated.unmappedResourceTypes).length;
  const translationMapped =
    generated.matchMethodCounts["translation-resource-type"] +
    generated.matchMethodCounts["translation-entity"] +
    generated.matchMethodCounts["translation-scope"] +
    generated.matchMethodCounts["translation-resource"];

  const output = {
    menuSource,
    directoryNavSource: directoryNav.sources,
    directoryCommandNavEntries: directoryNav.commandNavEntryCount,
    directoryMenuRows: directoryNav.menuRows,
    permissionsSource: path.relative(process.cwd(), latestPermissionsPath),
    permissionsUnion,
    generatedAt: new Date().toISOString(),
    guiMenuPaths,
    guiMenuPathCatalog,
    menuCatalog,
    menuRows,
    guiMenuPathsIgnore,
  };

  if (hasArgFlag("stdout")) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  await writeGuiMenuPathOutputs(output, overridesDoc);

  console.log(
    `Wrote ${path.relative(process.cwd(), OUTPUT_PATH)} (public, ${menuCatalog.length} menuCatalog entries, ${Object.keys(guiMenuPaths).length} mapped resource types) and ${path.relative(process.cwd(), DEBUG_OUTPUT_PATH)} (debug catalog, ${menuRows.length} menuRows, ${directoryNav.menuRows.length} directory command-nav rows, ${mappedCount}/${totalResources} mapped this run, ${permissionResourceTypes.size} in latest permissions, ${unmappedCount} unmapped)`
  );
  console.log(
    `Match methods: permission=${generated.matchMethodCounts.permission}, path-affinity=${generated.matchMethodCounts["path-affinity"]}, translation=${translationMapped} (resource-type=${generated.matchMethodCounts["translation-resource-type"]}, entity=${generated.matchMethodCounts["translation-entity"]}, scope=${generated.matchMethodCounts["translation-scope"]}, resource=${generated.matchMethodCounts["translation-resource"]})`
  );

  if (unmappedCount > 0) {
    console.log("Unmapped resource types:");
    for (const [resourceType, reason] of Object.entries(generated.unmappedResourceTypes).sort(
      ([a], [b]) => a.localeCompare(b)
    )) {
      console.log(`  ${resourceType}: ${reason}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
