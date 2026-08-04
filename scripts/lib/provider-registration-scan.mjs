import fs from "node:fs";
import path from "node:path";
import { SKIP_PACKAGES } from "./tf-export-block-label.mjs";
import { readPackageGoFiles } from "./provider-schema-scan.mjs";

const TYPE_CONST_PATTERN = /const\s+(\w*ResourceType)\s*=\s*"([^"]+)"/g;
const REGISTER_RESOURCE_PATTERN = /RegisterResource\(\s*(\w+)\s*,/g;
const REGISTER_EXPORTER_PATTERN = /RegisterExporter\(\s*(\w+)\s*,/g;
const GET_RESOURCES_FUNC_PATTERN = /GetResourcesFunc\s*:/;

function buildPackageTypeConstants(files) {
  const constants = new Map();

  for (const file of files) {
    for (const match of file.content.matchAll(TYPE_CONST_PATTERN)) {
      constants.set(match[1], match[2]);
    }
  }

  return constants;
}

function resolveRegisteredTypes(content, pattern, constants) {
  const types = new Set();

  for (const match of content.matchAll(pattern)) {
    const constName = match[1];
    const resourceType = constants.get(constName);
    if (resourceType) types.add(resourceType);
  }

  return types;
}

function scanPackageExporterSupport(files) {
  const constants = buildPackageTypeConstants(files);
  const resources = new Set();
  const exporters = new Set();
  const exportersWithoutGetResources = new Set();

  for (const file of files) {
    for (const type of resolveRegisteredTypes(
      file.content,
      REGISTER_RESOURCE_PATTERN,
      constants
    )) {
      resources.add(type);
    }

    for (const type of resolveRegisteredTypes(
      file.content,
      REGISTER_EXPORTER_PATTERN,
      constants
    )) {
      exporters.add(type);
    }
  }

  for (const file of files) {
    if (!/Exporter\(\)/.test(file.content)) continue;

    const constantsInFile = buildPackageTypeConstants([file]);
    for (const [constName, resourceType] of constantsInFile.entries()) {
      if (!exporters.has(resourceType)) continue;
      if (!GET_RESOURCES_FUNC_PATTERN.test(file.content)) {
        exportersWithoutGetResources.add(resourceType);
      }
    }
  }

  return { resources, exporters, exportersWithoutGetResources };
}

/** Managed resource and exporter registration from provider SetRegistrar blocks. */
export function scanProviderRegistrations(providerRoot) {
  const resources = new Set();
  const exporters = new Set();
  const exportersWithoutGetResources = new Set();

  for (const packageName of fs.readdirSync(providerRoot).sort()) {
    if (SKIP_PACKAGES.has(packageName)) continue;

    const packageDir = path.join(providerRoot, packageName);
    if (!fs.statSync(packageDir).isDirectory()) continue;

    const files = readPackageGoFiles(packageDir);
    if (files.length === 0) continue;

    const scanned = scanPackageExporterSupport(files);
    for (const type of scanned.resources) resources.add(type);
    for (const type of scanned.exporters) exporters.add(type);
    for (const type of scanned.exportersWithoutGetResources) {
      exportersWithoutGetResources.add(type);
    }
  }

  return {
    resources: [...resources].sort((a, b) => a.localeCompare(b)),
    exporters: [...exporters].sort((a, b) => a.localeCompare(b)),
    exportersWithoutGetResources: [...exportersWithoutGetResources].sort((a, b) =>
      a.localeCompare(b)
    ),
  };
}
