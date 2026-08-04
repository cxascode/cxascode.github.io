import fs from "node:fs";
import path from "node:path";
import { SKIP_PACKAGES } from "./tf-export-block-label.mjs";
import { readPackageGoFiles } from "./provider-schema-scan.mjs";
import {
  deriveResourceTypeFromContent,
  resolveResourceTypeForFile,
} from "./provider-resource-type.mjs";

const DELETE_FUNC_PATTERN =
  /func\s+(delete\w+)\([^)]*\)\s+diag\.Diagnostics\s*\{([\s\S]*?)\n\}/g;
const CANNOT_BE_DELETED_PATTERN = /cannot be deleted|can't be deleted|outcomes cannot be deleted/i;
const NO_LONGER_MANAGE_PATTERN = /no longer manage/i;
const NO_DELETE_API_PATTERN = /no delete(?:\s+operation|\s+API|-version API)/i;
const DEACTIVATION_DELETE_PATTERN =
  /\/\/\s*A delete for this api is actually just a deactivation|deactivates on destroy/i;

const DESTROY_BEHAVIOR = {
  NON_DELETABLE: "nonDeletable",
  STATE_ONLY_DESTROY: "stateOnlyDestroy",
  DEACTIVATES_ON_DESTROY: "deactivatesOnDestroy",
};

function isNoOpDeleteBody(body) {
  const meaningfulLines = body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("//"));

  if (meaningfulLines.length === 0) return false;

  return meaningfulLines.every(
    (line) =>
      /^return nil(?:\s*\/\/.*)?$/.test(line) ||
      /^log\.Printf\(/.test(line)
  );
}

function findNoOpDeleteFunctions(content) {
  const matches = [];
  for (const match of content.matchAll(DELETE_FUNC_PATTERN)) {
    if (isNoOpDeleteBody(match[2])) {
      matches.push(match[2]);
    }
  }
  return matches;
}

function classifyDeleteBehavior(content) {
  const hasNoOpDelete = findNoOpDeleteFunctions(content).length > 0;

  if (
    DEACTIVATION_DELETE_PATTERN.test(content) &&
    !hasNoOpDelete &&
    /func\s+delete\w+\(/.test(content)
  ) {
    return DESTROY_BEHAVIOR.DEACTIVATES_ON_DESTROY;
  }

  if (!hasNoOpDelete) return null;

  if (CANNOT_BE_DELETED_PATTERN.test(content)) {
    return DESTROY_BEHAVIOR.NON_DELETABLE;
  }

  if (NO_LONGER_MANAGE_PATTERN.test(content) || NO_DELETE_API_PATTERN.test(content)) {
    return DESTROY_BEHAVIOR.STATE_ONLY_DESTROY;
  }

  return DESTROY_BEHAVIOR.STATE_ONLY_DESTROY;
}

function classifyPackage(packageDir) {
  const files = readPackageGoFiles(packageDir);
  if (files.length === 0) return [];

  const filesByName = new Map(files.map((file) => [file.name, file]));
  const combined = files.map((file) => file.content).join("\n");
  const packageDefaultType = deriveResourceTypeFromContent(combined);
  const classified = [];
  const seen = new Set();

  for (const file of files) {
    const behavior = classifyDeleteBehavior(file.content);
    if (!behavior) continue;

    const resourceType = resolveResourceTypeForFile(file, filesByName, packageDefaultType);
    if (!resourceType) continue;

    const key = `${resourceType}:${behavior}`;
    if (seen.has(key)) continue;
    seen.add(key);

    classified.push({ resourceType, behavior });
  }

  return classified;
}

/**
 * Scan provider packages for destroy behavior that should use the
 * "Cannot be destroyed" badge (merged non-deletable, state-only, deactivates).
 */
export function scanProviderCannotBeDestroyed(providerRoot) {
  const byType = new Map();

  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    for (const { resourceType, behavior } of classifyPackage(packageDir)) {
      if (!byType.has(resourceType)) {
        byType.set(resourceType, behavior);
      }
    }
  }

  const cannotBeDestroyedResourceTypes = [...byType.keys()].sort((a, b) =>
    a.localeCompare(b)
  );

  const details = Object.fromEntries(
    [...byType.entries()].map(([resourceType, behavior]) => [resourceType, { behavior }])
  );

  return { cannotBeDestroyedResourceTypes, details };
}

/** @deprecated Use scanProviderCannotBeDestroyed */
export function scanProviderNonDeletable(providerRoot) {
  const { cannotBeDestroyedResourceTypes, details } =
    scanProviderCannotBeDestroyed(providerRoot);

  const result = {
    nonDeletableResourceTypes: [],
    stateOnlyDestroyResourceTypes: [],
    deactivatesOnDestroyResourceTypes: [],
  };

  for (const [resourceType, { behavior }] of Object.entries(details)) {
    if (behavior === DESTROY_BEHAVIOR.NON_DELETABLE) {
      result.nonDeletableResourceTypes.push(resourceType);
    } else if (behavior === DESTROY_BEHAVIOR.DEACTIVATES_ON_DESTROY) {
      result.deactivatesOnDestroyResourceTypes.push(resourceType);
    } else {
      result.stateOnlyDestroyResourceTypes.push(resourceType);
    }
  }

  for (const key of Object.keys(result)) {
    result[key].sort((a, b) => a.localeCompare(b));
  }

  result.cannotBeDestroyedResourceTypes = cannotBeDestroyedResourceTypes;
  return result;
}
