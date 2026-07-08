export const SPREADSHEET_REPO_TBD = "TBD";

function parseRepoAssignmentList(value) {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => typeof entry === "string" && entry.trim())
      .map((entry) => entry.trim());
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

export function getRepoAssignments(overrides) {
  const raw = overrides?.spreadsheetTemplates?.repoAssignments;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return new Map();
  }

  const map = new Map();
  for (const [repo, value] of Object.entries(raw)) {
    const repoName = String(repo || "").trim();
    if (!repoName) continue;

    for (const type of parseRepoAssignmentList(value)) {
      map.set(type, repoName);
    }
  }

  return map;
}

export function getRepoDeployOrder(overrides) {
  const raw = overrides?.spreadsheetTemplates?.repoDeployOrder;
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((group) => typeof group === "string" && group.trim())
    .map((group) => group.trim());
}

export function getRepoDeployOrderIndex(overrides) {
  return new Map(getRepoDeployOrder(overrides).map((group, index) => [group, index + 1]));
}

export function resolveRepoPriority(repoName, orderIndex) {
  const name = String(repoName || "").trim();
  if (!name || name === SPREADSHEET_REPO_TBD) return null;
  return orderIndex.get(name) ?? null;
}

export function getSpreadsheetOutResourceTypes(overrides) {
  const fromTemplates = overrides?.spreadsheetTemplates?.out;
  if (Array.isArray(fromTemplates)) {
    return [
      ...new Set(
        fromTemplates
          .filter((entry) => typeof entry === "string" && entry.trim())
          .map((entry) => entry.trim())
      ),
    ];
  }

  const legacy = overrides?.spreadsheetScopePrefixes?.out;
  if (!Array.isArray(legacy)) return [];

  return [
    ...new Set(
      legacy
        .filter((entry) => typeof entry === "string" && entry.trim())
        .map((entry) => entry.trim())
    ),
  ];
}

export function getSpreadsheetOutResourceTypesSet(overrides) {
  return new Set(getSpreadsheetOutResourceTypes(overrides));
}

export function getSkippedResourceTypes(overrides) {
  const hidden = overrides?.hiddenResourceTypes;
  if (!Array.isArray(hidden)) return new Set();
  return new Set(hidden.filter((type) => typeof type === "string" && type.trim()).map((type) => type.trim()));
}

export function resolveSpreadsheetRepoName(resourceType, { skipped, out, assignments }) {
  const type = String(resourceType || "").trim();

  if (!type || skipped.has(type) || out?.has(type)) {
    return null;
  }

  const repoMap = assignments instanceof Map ? assignments : getRepoAssignments(assignments);
  return repoMap.get(type) ?? SPREADSHEET_REPO_TBD;
}

export function compareSpreadsheetRows(a, b) {
  const aOut = a.scopePrefix === "out";
  const bOut = b.scopePrefix === "out";
  if (aOut !== bOut) return aOut ? 1 : -1;

  const aTbd = a.repoName === SPREADSHEET_REPO_TBD;
  const bTbd = b.repoName === SPREADSHEET_REPO_TBD;
  if (aTbd !== bTbd) return aTbd ? 1 : -1;

  const aPriority = a.priority ?? Number.MAX_SAFE_INTEGER;
  const bPriority = b.priority ?? Number.MAX_SAFE_INTEGER;
  if (aPriority !== bPriority) return aPriority - bPriority;

  return a.resourceType.localeCompare(b.resourceType);
}
