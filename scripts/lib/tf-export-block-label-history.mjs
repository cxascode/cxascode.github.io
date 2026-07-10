export const TF_EXPORT_BLOCK_LABEL_HISTORY_FILENAME = "tf-export-block-label-history.json";

export const TF_EXPORT_DEFAULT_PLACEHOLDER = "<name>";

export const ATTRIBUTE_INDEX_TYPE_EXPORT_BLOCK_LABEL = "export_block_label";

export const EXPORT_BLOCK_LABEL_ATTRIBUTE = "genesyscloud_tf_export.include_filter_resources";

/** Release-note / legacy names → Terraform resource type for include_filter_resources. */
export const EXPORT_RESOURCE_NAME_TYPE_ALIASES = {
  genesyscloud_architect_flow: "genesyscloud_flow",
};

export function resolveExportResourceNameType(resourceType) {
  const trimmed = (resourceType || "").trim();
  return EXPORT_RESOURCE_NAME_TYPE_ALIASES[trimmed] || trimmed;
}

export function exportResourceNameTypesForMatching(resourceType) {
  const trimmed = (resourceType || "").trim();
  const resolved = resolveExportResourceNameType(trimmed);
  const types = new Set([trimmed, resolved]);

  for (const [alias, target] of Object.entries(EXPORT_RESOURCE_NAME_TYPE_ALIASES)) {
    if (alias === trimmed || target === trimmed || target === resolved) {
      types.add(alias);
      types.add(target);
    }
  }

  return types;
}

function templatePlaceholderChangeKeys(blockLabelChanges) {
  const keys = new Set();
  if (!Array.isArray(blockLabelChanges)) return keys;

  for (const change of blockLabelChanges) {
    const resource = (change?.resource || "").trim();
    if (!resource) continue;

    keys.add(blockLabelHistoryLookupKey(change.version, resource));

    for (const alias of exportResourceNameTypesForMatching(resource)) {
      keys.add(blockLabelHistoryLookupKey(change.version, alias));
    }
  }

  return keys;
}

function templateChangesForResource(blockLabelChanges, resourceType) {
  if (!Array.isArray(blockLabelChanges)) return [];

  const types = exportResourceNameTypesForMatching(resourceType);
  return blockLabelChanges.filter((change) =>
    types.has((change?.resource || "").trim())
  );
}

/** Release notes that announce bulk export adopting an already-documented placeholder pattern. */
export function isTemplateAdoptionNamingAnnouncement(summary) {
  const normalized = String(summary || "").trim().toLowerCase();
  if (!normalized.includes("bulk export block label")) return false;
  if (normalized.includes("may include") || normalized.includes("uniqueness hash")) return false;

  return normalized.includes("now use") || normalized.includes("now prefix");
}

function hasSameVersionTemplatePlaceholderChange(row, blockLabelChanges) {
  const keys = templatePlaceholderChangeKeys(blockLabelChanges);
  const rowResource = (row?.resource || "").trim();
  const rowVersion = row?.version;
  if (!rowResource || !rowVersion) return false;

  for (const resource of exportResourceNameTypesForMatching(rowResource)) {
    if (keys.has(blockLabelHistoryLookupKey(rowVersion, resource))) return true;
  }

  return false;
}

function hasPriorTemplatePlaceholderChange(row, blockLabelChanges) {
  const rowVersion = row?.version;
  if (!rowVersion) return false;

  return templateChangesForResource(blockLabelChanges, row.resource).some(
    (change) => compareTfExportVersionsAsc(change.version, rowVersion) <= 0
  );
}

export function isReplacedByTemplatePlaceholderChange(row, blockLabelChanges) {
  if (!isExportResourceNamingBehaviorRow(row)) return false;

  if (hasSameVersionTemplatePlaceholderChange(row, blockLabelChanges)) return true;

  if (
    isTemplateAdoptionNamingAnnouncement(row?.summary) &&
    hasPriorTemplatePlaceholderChange(row, blockLabelChanges)
  ) {
    return true;
  }

  return false;
}

export function normalizeTfExportVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "");
}

export function toTfExportVersionLabel(value) {
  const bare = normalizeTfExportVersion(value);
  return bare ? `v${bare}` : "";
}

export function compareTfExportVersionsAsc(a, b) {
  const pa = normalizeTfExportVersion(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = normalizeTfExportVersion(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(pa.length, pb.length);

  for (let i = 0; i < length; i += 1) {
    const av = pa[i] ?? 0;
    const bv = pb[i] ?? 0;
    if (av !== bv) return av - bv;
  }

  return 0;
}

export function effectiveTfExportPlaceholder(resourceNames, resourceType) {
  const value = resourceNames?.[resourceType];
  if (typeof value === "string" && value.trim()) return value.trim();
  return TF_EXPORT_DEFAULT_PLACEHOLDER;
}

export function collectFirstVersionPlaceholderIntroductions(versionMaps) {
  if (!Array.isArray(versionMaps) || versionMaps.length === 0) return [];

  const sorted = [...versionMaps].sort((a, b) =>
    compareTfExportVersionsAsc(a.version, b.version)
  );
  const first = sorted[0];
  const firstMap = first?.map && typeof first.map === "object" ? first.map : {};
  const introductions = [];

  for (const resource of Object.keys(firstMap).sort()) {
    const after = effectiveTfExportPlaceholder(firstMap, resource);
    if (after === TF_EXPORT_DEFAULT_PLACEHOLDER) continue;

    introductions.push({
      version: toTfExportVersionLabel(first.version),
      resource,
      before: TF_EXPORT_DEFAULT_PLACEHOLDER,
      after,
    });
  }

  return introductions;
}

function blockLabelChangeKey(change) {
  return `${normalizeTfExportVersion(change?.version)}:${(change?.resource || "").trim()}`;
}

export function combineTfExportBlockLabelChanges(versionMaps) {
  const diffChanges = diffTfExportBlockLabelChanges(versionMaps);
  const introductions = collectFirstVersionPlaceholderIntroductions(versionMaps);
  const seen = new Set(diffChanges.map(blockLabelChangeKey));
  const combined = [...diffChanges];

  for (const introduction of introductions) {
    const key = blockLabelChangeKey(introduction);
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(introduction);
  }

  return combined.sort((a, b) => {
    const versionCompare = compareTfExportVersionsAsc(a.version, b.version);
    if (versionCompare !== 0) return versionCompare;
    return String(a.resource || "").localeCompare(String(b.resource || ""));
  });
}

export function diffTfExportBlockLabelChanges(versionMaps) {
  if (!Array.isArray(versionMaps) || versionMaps.length < 2) return [];

  const sorted = [...versionMaps].sort((a, b) =>
    compareTfExportVersionsAsc(a.version, b.version)
  );
  const changes = [];

  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1];
    const current = sorted[i];
    const previousMap = previous?.map && typeof previous.map === "object" ? previous.map : {};
    const currentMap = current?.map && typeof current.map === "object" ? current.map : {};
    const resourceTypes = new Set([...Object.keys(previousMap), ...Object.keys(currentMap)]);

    for (const resource of resourceTypes) {
      const before = effectiveTfExportPlaceholder(previousMap, resource);
      const after = effectiveTfExportPlaceholder(currentMap, resource);
      if (before === after) continue;

      changes.push({
        version: toTfExportVersionLabel(current.version),
        resource,
        before,
        after,
      });
    }
  }

  return changes;
}

export function formatExportBlockLabelSummary(before, after) {
  return `Changed from ${before} to ${after}.`;
}

/** Release-note naming rows reclassified as Export resource name with customer-facing placeholder text. */
const RELEASE_NOTE_EXPORT_RESOURCE_NAME_PRESENTATIONS = {
  "1.63.0:genesyscloud_integration": {
    before: "<name>",
    after: "<name>_<uniqueness hash>",
    summary: "May append <uniqueness hash> when names collide.",
  },
  "1.63.0:genesyscloud_integration_action": {
    before: "<name>",
    after: "<name>_<uniqueness hash>",
    summary: "May append <uniqueness hash> when names collide.",
  },
  "1.63.0:genesyscloud_flow": {
    before: "<name>",
    after: "<name>_<uniqueness hash>",
    summary: "May append <uniqueness hash> when names collide.",
  },
  "1.63.0:genesyscloud_user": {
    before: "<name>",
    after: "<name>_<uniqueness hash>",
    summary: "May append <uniqueness hash> when names collide.",
  },
  "1.63.0:genesyscloud_knowledge_document": {
    before: "<name>",
    after: "<name>_<category-based uniqueness hash>",
    summary: "May append <category-based uniqueness hash> when names collide.",
  },
  "1.64.0:genesyscloud_routing_sms_address": {
    before: "<name>",
    after: "<postal code>",
    summary: "Changed from <name> to <postal code> when name is absent.",
  },
  "1.65.0:genesyscloud_architect_ivr": {
    before: "<open-hours flow name>_<IVR name>",
    after: "<IVR name>",
    summary: "Changed from <open-hours flow name>_<IVR name> to <IVR name>.",
  },
  "1.69.0:genesyscloud_externalcontacts_organization": {
    before: "<name>",
    after: "<organization name>",
    summary:
      "Changed from <name> to <organization name>, then <external system url>, otherwise <organization id>.",
  },
  "1.82.0:genesyscloud_integration_action": {
    before: "<name>",
    after: "<integration name>_<name>",
    summary: "Changed from <name> to <integration name>_<name> for static data actions.",
  },
};

export function resolveReleaseNoteExportResourceNamePresentation(row) {
  const key = blockLabelHistoryLookupKey(row?.version, row?.resource);
  const configured = RELEASE_NOTE_EXPORT_RESOURCE_NAME_PRESENTATIONS[key];
  if (configured) return configured;

  const normalized = String(row?.summary || "").trim().toLowerCase();
  if (normalized.includes("uniqueness hash")) {
    return {
      before: "<name>",
      after: "<name>_<uniqueness hash>",
      summary: "May append <uniqueness hash> when names collide.",
    };
  }

  return {
    before: "",
    after: "",
    summary: String(row?.summary || "").trim(),
  };
}

export function convertExportNamingBehaviorToBlockLabelRow(row, historyIndex = 0) {
  const presentation = resolveReleaseNoteExportResourceNamePresentation(row);

  return {
    type: ATTRIBUTE_INDEX_TYPE_EXPORT_BLOCK_LABEL,
    resource: row.resource,
    attribute: EXPORT_BLOCK_LABEL_ATTRIBUTE,
    status: row.status || "Active",
    introduced: row.introduced || "Unknown",
    version: row.version,
    change: row.change || "updated",
    summary: presentation.summary,
    historyIndex,
    placeholderBefore: presentation.before,
    placeholderAfter: presentation.after,
    source: "release_note_export_resource_name",
  };
}

export function blockLabelChangeToHistoryRow(change, historyIndex = 0) {
  return {
    type: ATTRIBUTE_INDEX_TYPE_EXPORT_BLOCK_LABEL,
    resource: change.resource,
    attribute: EXPORT_BLOCK_LABEL_ATTRIBUTE,
    status: "Active",
    introduced: "Unknown",
    version: change.version,
    change: "updated",
    summary: formatExportBlockLabelSummary(change.before, change.after),
    historyIndex,
    placeholderBefore: change.before,
    placeholderAfter: change.after,
  };
}

export function blockLabelHistoryLookupKey(version, resource) {
  return `${normalizeTfExportVersion(version)}:${(resource || "").trim()}`;
}

export function isExportResourceNamingBehaviorSummary(summary) {
  const normalized = String(summary || "").trim().toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes("block label") ||
    normalized.includes("block labels") ||
    normalized.includes("resource block label") ||
    normalized.includes("bulk export block label")
  );
}

export function isExportResourceNamingBehaviorRow(row) {
  if (row?.type !== "export_behavior") return false;
  if ((row?.attribute || "").trim() !== "general export behavior") return false;
  return isExportResourceNamingBehaviorSummary(row?.summary);
}

export function mergeExportBlockLabelHistoryRows(rows, blockLabelChanges) {
  if (!Array.isArray(rows)) return [];
  if (!Array.isArray(blockLabelChanges) || blockLabelChanges.length === 0) return rows;

  const convertedReleaseNoteRows = [];
  const filtered = [];

  for (const row of rows) {
    if (isExportResourceNamingBehaviorRow(row)) {
      if (isReplacedByTemplatePlaceholderChange(row, blockLabelChanges)) continue;
      convertedReleaseNoteRows.push(
        convertExportNamingBehaviorToBlockLabelRow(row, convertedReleaseNoteRows.length)
      );
      continue;
    }

    filtered.push(row);
  }

  const templateRows = blockLabelChanges.map((change, historyIndex) =>
    blockLabelChangeToHistoryRow(change, convertedReleaseNoteRows.length + historyIndex)
  );

  return [...filtered, ...convertedReleaseNoteRows, ...templateRows];
}
