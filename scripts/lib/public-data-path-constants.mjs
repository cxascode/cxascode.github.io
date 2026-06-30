export const PUBLIC_DIR_NAME = "public";

export const DEPENDENCY_TREE_DIR = "dependency-tree-json";
export const DEPENDENCY_TREE_MERGED_DIR = "dependency-tree-merged-json";
export const RESOURCE_PERMISSIONS_JSON_DIR = "resource-permissions-json";
export const RESOURCE_PERMISSIONS_TF_DIR = "resource-permissions-tf";
export const SPREADSHEET_TEMPLATES_DIR = "spreadsheet-templates";
export const TF_EXPORT_RESOURCE_NAMES_DIR = "tf-export-resource-names";
export const TF_EXPORT_SINGLETONS_DIR = "tf-export-singletons";
export const LAB_PACKAGES_DIR = "lab-packages";

/** Oldest provider release with dependency_tree.json on GitHub releases. */
export const MIN_DEPENDENCY_TREE_VERSION = "1.60.0";

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
  TF_EXPORT_RESOURCE_NAMES_DIR,
  TF_EXPORT_SINGLETONS_DIR,
  LAB_PACKAGES_DIR,
];
