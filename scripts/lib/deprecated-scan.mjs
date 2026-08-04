import fs from "node:fs";
import path from "node:path";
import { SKIP_PACKAGES } from "./tf-export-block-label.mjs";
import { readBalancedBraces, readPackageGoFiles } from "./provider-schema-scan.mjs";
import {
  deriveResourceTypeFromContent,
  resolveResourceTypeForFile,
} from "./provider-resource-type.mjs";

const MANAGED_RESOURCE_FUNC_PATTERN = /func\s+(Resource\w+)\(\)\s*\*schema\.Resource\s*\{/g;
const DEPRECATION_MESSAGE_PATTERN =
  /DeprecationMessage:\s*(?:"([^"]*)"|`([^`]*)`)/;

function extractDeprecationMessage(resourceBody) {
  const match = resourceBody.match(DEPRECATION_MESSAGE_PATTERN);
  if (!match) return null;
  return (match[1] || match[2] || "").trim();
}

function scanFileForDeprecatedResources(file, filesByName, packageDefaultType) {
  const results = [];

  for (const match of file.content.matchAll(MANAGED_RESOURCE_FUNC_PATTERN)) {
    const openBraceIndex = match.index + match[0].length - 1;
    const funcBody = readBalancedBraces(file.content, openBraceIndex);
    if (!funcBody) continue;

    const message = extractDeprecationMessage(funcBody.body);
    if (!message) continue;

    const resourceType = resolveResourceTypeForFile(file, filesByName, packageDefaultType);
    if (!resourceType) continue;

    results.push({
      resourceType,
      functionName: match[1],
      deprecationMessage: message,
    });
  }

  return results;
}

/**
 * Resource types whose managed schema sets DeprecationMessage in provider source.
 */
export function scanProviderDeprecatedResources(providerRoot) {
  const byType = new Map();

  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    const files = readPackageGoFiles(packageDir);
    if (files.length === 0) continue;

    const filesByName = new Map(files.map((file) => [file.name, file]));
    const combined = files.map((file) => file.content).join("\n");
    const packageDefaultType = deriveResourceTypeFromContent(combined);

    for (const file of files) {
      for (const entry of scanFileForDeprecatedResources(
        file,
        filesByName,
        packageDefaultType
      )) {
        if (!byType.has(entry.resourceType)) {
          byType.set(entry.resourceType, entry);
        }
      }
    }
  }

  const deprecatedResourceTypes = [...byType.keys()].sort((a, b) => a.localeCompare(b));
  const details = Object.fromEntries(
    [...byType.entries()].map(([resourceType, entry]) => [
      resourceType,
      {
        functionName: entry.functionName,
        deprecationMessage: entry.deprecationMessage,
      },
    ])
  );

  return { deprecatedResourceTypes, details };
}
