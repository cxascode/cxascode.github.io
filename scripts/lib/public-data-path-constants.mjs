export const PUBLIC_DIR_NAME = "public";

/** Generated menu catalog + path index; bundled with the app (not served as a static URL). */
export const GUI_MENU_PATHS_JSON = "gui-menu-paths.json";
export const GUI_MENU_PATHS_RELATIVE_PATH = `src/${GUI_MENU_PATHS_JSON}`;

export const DEPENDENCY_TREE_DIR = "dependency-tree-json";
export const DEPENDENCY_TREE_MERGED_DIR = "dependency-tree-merged-json";
export const RESOURCE_PERMISSIONS_JSON_DIR = "resource-permissions-json";
export const RESOURCE_PERMISSIONS_TF_DIR = "resource-permissions-tf";
export const SPREADSHEET_TEMPLATES_DIR = "spreadsheet-templates";
export const SUPPORTED_RESOURCES_TEMPLATES_DIR = "supported-resources-templates";
export const TF_EXPORT_RESOURCE_NAMES_DIR = "tf-export-resource-names";
export const TF_EXPORT_SINGLETONS_DIR = "tf-export-singletons";
export const SCHEMA_FORCE_NEW_DIR = "schema-force-new";
export const LAB_PACKAGES_DIR = "lab-packages";

/** Oldest provider release with dependency_tree.json on GitHub releases. */
export const MIN_DEPENDENCY_TREE_VERSION = "1.60.0";

/** Alias / merged JSON filenames in dependency-tree-json/, not semver provider releases. */
export const DEPENDENCY_TREE_NON_VERSION_JSON_FILES = new Set([
  "index.json",
  "latest.json",
  "latest-merged.json",
]);

/** Version ids that must not appear in dependency-tree-json/index.json. */
export const DEPENDENCY_TREE_NON_VERSION_IDS = new Set([
  "index",
  "latest",
  "latest-merged",
]);

export function isDependencyTreeVersionJsonFilename(filename) {
  return (
    typeof filename === "string" &&
    filename.endsWith(".json") &&
    !DEPENDENCY_TREE_NON_VERSION_JSON_FILES.has(filename)
  );
}

export function isDependencyTreeVersionId(version) {
  const bare = String(version || "")
    .trim()
    .replace(/^v/i, "");
  return Boolean(bare) && !DEPENDENCY_TREE_NON_VERSION_IDS.has(bare);
}

export function filterDependencyTreeVersionIds(versions) {
  if (!Array.isArray(versions)) return [];
  return versions.filter((entry) => isDependencyTreeVersionId(entry));
}

/** Oldest provider release with resource_permissions JSON and role TF downloads. */
export const MIN_RESOURCE_PERMISSIONS_VERSION = "1.76.0";

/** Generated alongside dependency-tree-json (same version list, overrides applied). */
export const MIN_DEPENDENCY_TREE_MERGED_VERSION = MIN_DEPENDENCY_TREE_VERSION;

/** Generated alongside dependency-tree-json (same version list). */
export const MIN_TF_EXPORT_RESOURCE_NAMES_VERSION = MIN_DEPENDENCY_TREE_VERSION;

/** Provider release that introduced ResourceExporter.IsSingleton. */
export const MIN_SINGLETON_FLAG_VERSION = "1.78.0";

/** Versioned generated artifacts under public/ (reserved from resource permalinks). */
export const GENERATED_PUBLIC_DATA_DIRS = [
  DEPENDENCY_TREE_DIR,
  DEPENDENCY_TREE_MERGED_DIR,
  RESOURCE_PERMISSIONS_JSON_DIR,
  RESOURCE_PERMISSIONS_TF_DIR,
  SPREADSHEET_TEMPLATES_DIR,
  SUPPORTED_RESOURCES_TEMPLATES_DIR,
  TF_EXPORT_RESOURCE_NAMES_DIR,
  TF_EXPORT_SINGLETONS_DIR,
  SCHEMA_FORCE_NEW_DIR,
  LAB_PACKAGES_DIR,
];
