export {
  DEPENDENCY_TREE_DIR,
  GENERATED_PUBLIC_DATA_DIRS,
  MIN_DEPENDENCY_TREE_VERSION,
  MIN_RESOURCE_PERMISSIONS_VERSION,
  MIN_TF_EXPORT_RESOURCE_NAMES_VERSION,
  MIN_SINGLETON_FLAG_VERSION,
  RESOURCE_PERMISSIONS_JSON_DIR,
  RESOURCE_PERMISSIONS_TF_DIR,
  SPREADSHEET_TEMPLATES_DIR,
  TF_EXPORT_RESOURCE_NAMES_DIR,
  TF_EXPORT_SINGLETONS_DIR,
  LAB_PACKAGES_DIR,
} from "../scripts/lib/public-data-path-constants.mjs";

const BASE = import.meta.env.BASE_URL;

export function publicDataUrl(segment, ...parts) {
  const suffix = parts.filter(Boolean).join("/");
  if (!segment) {
    return `${BASE}${suffix}`;
  }
  return `${BASE}${segment}${suffix ? `/${suffix}` : ""}`;
}

export function indexJsonUrl(segment) {
  return publicDataUrl(segment, "index.json");
}

export function latestJsonUrl(segment) {
  return publicDataUrl(segment, "latest.json");
}

export function versionedJsonUrl(segment, version) {
  return publicDataUrl(segment, `${version}.json`);
}
