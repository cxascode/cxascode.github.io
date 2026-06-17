# CX as Code Explorer

This is the source code for the https://cxascode.github.io website.

## Local development

Bootstrap the latest upstream release assets, then start the dev server:

```bash
npm ci
npm run bootstrap-local-dev
npm run dev
```

The bootstrap step downloads the latest `dependency_tree-*.json` release asset and, when available, the latest `resource_permissions-*.json` asset from `MyPureCloud/terraform-provider-genesyscloud`.

It then regenerates these local development assets:

- `public/dependency-tree-json/index.json`
- `public/dependency_tree.json`
- `public/read-write-role.tf`
- `public/read-only-role.tf`

Versioned assets are stored in:

- `public/dependency-tree-json/`
- `public/resource-permissions-json/`
- `public/resource-permissions-tf/`

If you hit GitHub API rate limits, set a token in your shell first:

```bash
export GH_TOKEN=your_token_here
npm run bootstrap-local-dev
npm run dev
```

## overrides.json

`public/overrides.json` patches release data served by the site:

- `addDependencies` / `replaceDependencies` — adjust dependency trees from the provider release JSON
- `tfExportResourceNames` — optional per-type override for **genesyscloud_tf_export template** filter placeholders; wins over the generated map in `tf-export-resource-names.json`
- `tfExportNote` — default Markdown note (GFM) shown in the **genesyscloud_tf_export template** panel when a resource type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `dependencyNotes` — per resource type, Markdown note (GFM) shown at the bottom of Resource Type Details when that type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `guiMenuPaths` — per resource type, Genesys Cloud admin menu path shown in Resource Type Details (segments separated by ` > `)
- `hiddenResourceTypes` — resource types omitted from the left-hand list (still appear in Depends on / Dependency for when referenced)
- `spreadsheetScopePrefixes` — prefix labels in generated spreadsheet templates (e.g. `"out"` for out-of-scope types). Also the source of truth for `exclude_filter_resources` in the lab `exportpipeline/main.tf` (minus any types listed in that file's `replace_with_datasource` block).
- **Division aware** — badge when **Depends on** includes `genesyscloud_auth_division`; list filter **Division Aware** → *Yes* / *No* (blank = all types; same heuristic)
- **Singleton** — badge in resource details; **Notes** column in spreadsheet templates (`Org-wide singleton`)

Examples:

```json
"hiddenResourceTypes": [
  "genesyscloud_bcp_tf_exporter"
],
"tfExportResourceNames": {
  "genesyscloud_flow": "<type>_<name>"
},
"tfExportNote": "**Tip:** replace `<name>` with the Genesys Cloud resource name before export.",
"guiMenuPaths": {
  "genesyscloud_routing_language": "User Management > ACD Skills and Languages > Languages"
},
"dependencyNotes": {
  "genesyscloud_flow": "**Export tip:** one flow at a time.\n\n- Match the Architect name\n- Use the generated export filter placeholder for the resource name"
}
```

## Generated public data paths

Directory names and **oldest supported provider versions** live in `scripts/lib/public-data-path-constants.mjs`. The app imports these via `src/publicDataPaths.js`, which also builds fetch URLs.

| Constant | Value | Used for |
|----------|-------|----------|
| `MIN_DEPENDENCY_TREE_VERSION` | `1.60.0` | Dependency explorer, tf-export resource names |
| `MIN_RESOURCE_PERMISSIONS_VERSION` | `1.76.0` | Role TF downloads |
| `MIN_SINGLETON_FLAG_VERSION` | `1.78.0` | Singleton badge (`IsSingleton`; older versions use fixed export names) |

CI (`deploy-pages.yml`, `download-provider-versions.sh`) uses `MIN_DEP_VERSION` / `MIN_PERM_VERSION` env vars to gate **downloading** `dependency_tree` and `resource_permissions` release assets — keep those in sync with `MIN_DEPENDENCY_TREE_VERSION` and `MIN_RESOURCE_PERMISSIONS_VERSION`. `MIN_SINGLETON_FLAG_VERSION` is app-only (badge logic); singleton JSON is generated from provider source for every cached dependency-tree version, not downloaded from releases.

## tf-export-resource-names/

`public/tf-export-resource-names/` is **generated** from provider exporter `BlockLabel` logic, **one JSON file per provider version** (same version list as `dependency-tree-json/`). The version picker loads the matching file for **genesyscloud_tf_export template** placeholders. Types not listed default to `<name>`.

`overrides.json` → `tfExportResourceNames` overrides the generated value for any type you list there (hand-edited exceptions only).

**Deploy workflow:** when a deploy runs (new provider version, push to main, or manual **`force_deploy`**), CI regenerates permissions TF, spreadsheets, and tf-export resource names for all cached versions. The daily scheduled run skips when nothing changed.

**Local regeneration** (after `npm run bootstrap-local-dev`):

```bash
npm run generate-tf-export-resource-names
```

Generate one version from a local checkout:

```bash
node scripts/generate-tf-export-resource-names.mjs --version=1.82.0 --provider=/path/to/genesyscloud
```

## tf-export-singletons/

`public/tf-export-singletons/` is **generated** from provider exporter `IsSingleton: true`, **one JSON file per provider version** (same version list as `dependency-tree-json/`). The version picker loads the matching file for the **Singleton** badge in resource details on **v1.78.0+**. Older provider versions fall back to fixed tf-export block labels from `tf-export-resource-names` (no `IsSingleton` in source yet).

```bash
npm run generate-tf-export-singletons
```

`tfExportNote` in `overrides.json` is still the hand-edited Markdown note shown below the export template block.

## provider-env-vars.json

`public/provider-env-vars.json` is the hand-edited source for provider environment variables (like release notes — not derived site output).

- **`providerEnvVars`** — full catalog (`name`, `valueHint`, `description`, `export-template`). New provider vars must be added here first.
- **`providerEnvVarsIgnore`** — names you have decided not to use in export templates.

CI syncs the catalog automatically, then fails when triage is still needed:

1. **Auto-catalog** — new provider vars are appended to **`providerEnvVars`** in `public/provider-env-vars.json` (with a placeholder description and empty `export-template`).
2. **Triage required** — build fails until each new var has either **`export-template`** resource types assigned or its name added to **`providerEnvVarsIgnore`**.

When the build fails, commit `public/provider-env-vars.json` along with your triage (`export-template` or `providerEnvVarsIgnore`).

## lab-packages/

`public/lab-packages/` is **generated** from `scripts/templates/cx-as-code-lab/`, **one zip per provider version** (same version list as `dependency-tree-json/`). Each zip pins `version = "~> X.Y.Z"` in every lab `.tf` file that declares a provider constraint, refreshes `filter-builder-template.xlsx` with that version's resource types (column **B** dropdown via Excel data validation on the hidden **validation** sheet), and writes `exportpipeline/main.tf` `exclude_filter_resources` from `spreadsheetScopePrefixes.out` in `public/overrides.json` (skipping types in that file's `replace_with_datasource` block). Resource types honor `replaceDependencies`, `addDependencies`, and `hiddenResourceTypes` the same way as the explorer and spreadsheet generator.

The static lab source lives under `scripts/templates/cx-as-code-lab/CX_as_Code-Lab/`. Update that tree when lab exercises change; re-run the generator to rebuild versioned zips.

**Local regeneration** (after `npm run bootstrap-local-dev`):

```bash
npm run generate-lab-package
```

Hidden permalink download (same pattern as `/spreadsheet`):

- `/labfiles/latest`
- `/labfiles/v1.82.0`
