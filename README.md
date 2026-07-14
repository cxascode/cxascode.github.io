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
- `public/dependency-tree-json/latest.json`
- `public/resource-permissions-tf/latest-read-write-role.tf`
- `public/resource-permissions-tf/latest-read-only-role.tf`

Versioned assets are stored in:

- `public/dependency-tree-json/`
- `public/dependency-tree-merged-json/` (raw trees + `overrides.json`, for external consumers)
- `public/resource-permissions-json/`
- `public/resource-permissions-tf/`

If you hit GitHub API rate limits, set a token in your shell first:

```bash
export GH_TOKEN=your_token_here
npm run bootstrap-local-dev
npm run dev
```

See [npm scripts](#npm-scripts) for all commands, flags, and when to use each generator.

## npm scripts

Reference for `package.json` scripts. CI behavior is described in [Deploy workflow (GitHub Actions)](#deploy-workflow-github-actions).

### App

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start the Vite dev server (hot reload). |
| `npm run build` | Run `scripts/write-sitemap.mjs` (writes `public/sitemap.xml`, `public/seo/sitemap.xml`, `public/sitemap.txt`, `public/.nojekyll` from latest dependency tree + site updates), `scripts/write-merged-dependency-tree.mjs` (writes `public/dependency-tree-merged-json/`), then Vite production build to `dist/`. |
| `npm run preview` | Serve the production build locally after `npm run build`. |
| `npm run lint` | Run ESLint on the repo. |

### Upstream data

| Script | What it does |
|--------|----------------|
| `npm run bootstrap-local-dev` | **Lightweight local setup.** Downloads the **latest** `dependency_tree-*.json` and `resource_permissions-*.json` from `MyPureCloud/terraform-provider-genesyscloud` (when present), refreshes `public/dependency-tree-json/index.json` and `latest.json`, then runs all generators below. Optional `--latest=X.Y.Z` to pin the version. Use `GH_TOKEN` or `GITHUB_TOKEN` to avoid API rate limits. |
| `npm run download-provider-versions` | **Full version history**, like CI bootstrap. Downloads every cached provider version ≥ min versions into `public/dependency-tree-json/` and `public/resource-permissions-json/`. Skips files that already exist and validate. Environment variables: `DOWNLOAD_PERMISSIONS=false` (dependency trees only), `RUN_GENERATORS=false` (download only), `MIN_DEP_VERSION`, `MIN_PERM_VERSION`, `GH_TOKEN`. When `RUN_GENERATORS=true` (default), runs permissions TF, tf-export, verify, spreadsheet, supported-resources spreadsheet, and lab generators for the latest version. |

**When to use which:** `bootstrap-local-dev` is enough for day-to-day app work. Use `download-provider-versions` when you need the full multi-version cache locally (spreadsheet/lab artifacts for older provider versions, or debugging version-specific output).

### Generators

All generators read `public/overrides.json` unless `--overrides=` is passed (spreadsheet only). Spreadsheet, supported-resources spreadsheet, and lab scripts support **`--incremental`** (skip unchanged versions) and **`--force`** (rebuild all). CI passes `--incremental`; add `--force` locally to match `force_deploy`.

| Script | Output | Common flags |
|--------|--------|--------------|
| `npm run generate-spreadsheet-template` | `public/spreadsheet-templates/{version}-cx-as-code-template.xlsx`, `latest-cx-as-code-template.xlsx` | `--latest=X.Y.Z`, `--incremental`, `--force`, `--overrides=path` |
| `npm run generate-supported-resources-spreadsheet` | `public/supported-resources-templates/{version}-supported-resources.xlsx`, `latest-supported-resources.xlsx` | `--latest=X.Y.Z`, `--incremental`, `--force` |
| `npm run generate-lab-package` | `public/lab-packages/{version}-cx-as-code-lab.zip`, `latest-cx-as-code-lab.zip` | `--latest=X.Y.Z`, `--incremental`, `--force` |
| `npm run generate-tf-export-resource-names` | `public/tf-export-resource-names/{version}.json` | No args: all cached versions. `--version=X.Y.Z`, `--latest=X.Y.Z`, `--provider=path`, `--verify`, `--stdout` |
| `npm run generate-tf-export-singletons` | `public/tf-export-singletons/{version}.json` | Same pattern as tf-export resource names |
| `npm run generate-schema-force-new` | `public/schema-force-new/{version}.json` | Same pattern as tf-export resource names |
| `npm run generate-gui-menu-paths` | `public/gui-menu-paths.json` (slim), `.cache-meta/gui-menu-paths-debug.json` (full catalog) | Genesys Cloud `admin/menu.json` plus Directory command-nav. `--latest=X.Y.Z`, `--union-permissions` (default in CI), `--no-union-permissions`, `--menu=`, `--permissions=`, `--directory-base=`, `--directory-bundle=`, `--directory-translations=`, `--no-directory-nav`, `--stdout` (full JSON). |
| `npm run verify-tf-export-env-vars` | Updates `public/provider-env-vars.json` | `--version=X.Y.Z`, `--latest=X.Y.Z`. Auto-appends new provider env vars; **exits non-zero** until each is triaged (`export-template` or `providerEnvVarsIgnore`). Runs in CI after upstream refresh. |
| `npm run generate-site-updates` | `public/site-updates-data/` | `--base`, `--head`, `--date=YYYY-MM-DD`, `--dry-run`, `--force`, `--scrub`. Normally CI-only on push to `main`; use locally to preview changelog entries from a commit range. `--scrub` re-filters auto-generated entries using `scripts/lib/site-feature-policy.mjs`. |

### Site feature policy (hidden vs public)

**Single registry:** `scripts/lib/site-feature-policy.mjs`

When you add a download permalink or other feature that should **not** appear in Site updates, add one entry to `SITE_FEATURES` with:

- `visibility`: `hidden` (private permalink like `/spreadsheet`, `/labfiles`, `/supported-resources`), `shareable` (link-only like `/roles/...`), `semi-public`, or `public`
- `siteUpdates.commitKeywords` — git commit subjects to ignore
- `siteUpdates.scrubKeywords` — text to strip from auto-generated site-update markdown
- `siteUpdates.dataOnlyPaths` — paths that never trigger “user-visible change” on their own

Site updates, sitemap dialog paths, and scrub logic derive from this file. Add new build consumers here instead of one-off regexes elsewhere.

### Related scripts (no npm alias)

`scripts/generate-resource-permissions-tf.mjs` writes `public/resource-permissions-tf/{version}-read-write-role.tf` and `{version}-read-only-role.tf`, plus `latest-*` aliases. Invoked by `bootstrap-local-dev`, `download-provider-versions`, and CI — not exposed as its own npm script. Flags: `--latest=X.Y.Z`.

`scripts/write-merged-dependency-tree.mjs` writes `public/dependency-tree-merged-json/{version}.json`, `index.json`, and `latest.json` by applying `overrides.json` to each cached raw tree in `public/dependency-tree-json/`. Invoked by `bootstrap-local-dev`, `download-provider-versions`, and `npm run build`.

### Typical local workflows

```bash
# First-time or after pulling generator changes
npm ci
npm run bootstrap-local-dev
npm run dev
```

```bash
# After editing public/overrides.json (menu paths, hidden types, scope prefixes, …)
npm run generate-spreadsheet-template -- --incremental
npm run generate-lab-package -- --incremental
```

```bash
# Rebuild everything locally (ignore incremental stamps)
npm run generate-spreadsheet-template -- --force
npm run generate-lab-package -- --force
```

```bash
# Mirror CI’s full version cache + generators
npm run download-provider-versions
```

## overrides.json

`public/overrides.json` patches release data served by the site:

- `addDependencies` / `replaceDependencies` — adjust dependency trees from the provider release JSON. At build time these patches are baked into `public/dependency-tree-merged-json/` (published as `https://cxascode.github.io/dependency-tree-merged-json/{version}.json`, with `latest.json` and `index.json`) for external consumers; the app still merges at runtime from the raw tree + `overrides.json`.
- `tfExportResourceNames` — optional per-type override for **genesyscloud_tf_export template** filter placeholders; wins over the generated map in `tf-export-resource-names.json`
- `tfExportNote` — default Markdown note (GFM) shown in the **genesyscloud_tf_export template** panel when a resource type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `dependencyNotes` — per resource type, Markdown note (GFM) shown at the bottom of Resource Type Details when that type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `guiMenuPaths` — optional per-type override for Genesys Cloud admin menu paths shown in Resource Type Details and the GUI list view; wins over `public/gui-menu-paths.json`
- `hiddenResourceTypes` — resource types omitted from the left-hand list (still appear in Depends on / Dependency for when referenced)
- `supportedResourcesAdminExclusionKeywords` — link substrings that exclude admin routes from the supported-resources spreadsheet; see `public/overrides.json`
- `supportedResourcesFeatureToggleKeywords` — feature-toggle name substrings that bypass preview exclusion (unmapped toggle-gated paths continue through the funnel); see `public/overrides.json`
- `spreadsheetTemplates` — spreadsheet program layer: `out` (out-of-scope types; column 5 label `"out"`, cols 7–8 blank), `repoAssignments` (repo → comma-separated resource types for column 8), `repoDeployOrder` (ordered repo names → Priority column 1-based deploy wave). Unassigned in-scope types show `TBD` in column 8. Rows sort by priority, then alpha; `TBD` before out-of-scope. Also the source of truth for `exclude_filter_resources` in the lab `exportpipeline/main.tf` (minus any types listed in that file's `replace_with_datasource` block, and minus `nonExportableResourceTypes`).
- **Division aware** — badge when **Depends on** includes `genesyscloud_auth_division`; list filter **Division Aware** → *Yes* / *No* (blank = all types; same heuristic)
- `deprecatedResourceTypes` — **Deprecated** badge in resource details; **Notes** column in spreadsheet templates (`Deprecated`)
- `nonExportableResourceTypes` — **Cannot be exported** badge in resource details; **Notes** column in spreadsheet templates (`Cannot be exported`); omitted from lab `exclude_filter_resources` (cannot be exported, so exclusion is unnecessary)
- **Singleton** — badge in resource details; **Notes** column in spreadsheet templates (`Only one per org`)
- **Changing these attributes recreates the resource** — detail row in resource details; **Recreate attributes** column in spreadsheet templates (`group_ids, user_ids`)

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
| `MIN_DEPENDENCY_TREE_MERGED_VERSION` | `1.60.0` | Merged dependency trees (`dependency-tree-merged-json/`) |
| `MIN_RESOURCE_PERMISSIONS_VERSION` | `1.76.0` | Role TF downloads |
| `MIN_SINGLETON_FLAG_VERSION` | `1.78.0` | Singleton badge (`IsSingleton`; older versions use fixed export names) |

CI (`deploy-pages.yml`, `download-provider-versions.sh`) uses `MIN_DEP_VERSION` / `MIN_PERM_VERSION` env vars to gate **downloading** `dependency_tree` and `resource_permissions` release assets — keep those in sync with `MIN_DEPENDENCY_TREE_VERSION` and `MIN_RESOURCE_PERMISSIONS_VERSION`. `MIN_SINGLETON_FLAG_VERSION` is app-only (badge logic); singleton JSON is generated from provider source for every cached dependency-tree version, not downloaded from releases.

## Deploy workflow (GitHub Actions)

The [`deploy-pages.yml`](.github/workflows/deploy-pages.yml) workflow builds the site and publishes to GitHub Pages. It restores a cache of upstream JSON and generated artifacts (dependency trees, permissions TF, spreadsheets, lab zips, tf-export catalogs, and input fingerprints in `.cache-meta/`).

### Triggers

| Trigger | When |
|---------|------|
| **Push to `main`** | Any merge except changes confined to `public/release-notes-data/**` |
| **Scheduled** | Daily (22:17 UTC) — checks for a new Genesys Cloud provider release |
| **Manual** (`workflow_dispatch`) | Run from the Actions tab; optional checkboxes below |
| **Keep-alive** | Same schedule, separate job on the **1st of each month** — commits `.automation/keep_alive.txt` with `[skip ci]` so GitHub does not disable the repo; does **not** deploy |

### Does it deploy?

Every run compares the latest `MyPureCloud/terraform-provider-genesyscloud` release to the cached version in `.cache-meta/latest.txt`.

| Situation | Deploy? |
|-----------|---------|
| Push to `main` | **Yes** — repo code may have changed |
| New provider version (or cache not bootstrapped) | **Yes** |
| Scheduled run, provider unchanged, cache warm | **No** |
| Manual run, provider unchanged, no checkboxes | **No** |
| Manual + **`force_deploy`** | **Yes** |
| Manual + **`force_refresh_upstream`** | **Yes** (also re-downloads upstream JSON) |

### Upstream data (when deploy runs)

**Bootstrap** — first run, or **`force_refresh_upstream`**: downloads all cached `dependency_tree-*.json` and `resource_permissions-*.json` from provider releases (from min versions above), then regenerates permissions TF and tf-export catalogs for every cached version.

**Incremental upstream** — normal deploy with a warm cache: only downloads the latest provider version’s JSON if missing, then regenerates permissions TF and tf-export catalogs for every cached version.

### Generated artifacts

| Step | Push (UI only) | Push (`overrides.json`) | New provider version | `force_deploy` / `force_refresh` |
|------|----------------|-------------------------|----------------------|----------------------------------|
| `npm run build` (React app) | Yes | Yes | Yes | Yes |
| Site updates auto-commit | Yes (push only) | Yes | Yes if push | Yes if push |
| Spreadsheet templates | Skip unchanged versions | Regenerate all | Regenerate new version only | Regenerate all |
| Lab packages | Skip unchanged versions | Regenerate all | Regenerate new version only | Regenerate all |
| Permissions TF / tf-export / **schema-force-new** / **gui-menu-paths** | All cached versions / union permissions + live nav | Same | Same | Same |

Spreadsheet templates and lab packages use **`--incremental`** in CI. Each provider version gets a fingerprint in `.cache-meta/artifact-stamps/`. A version is skipped when its output file exists and inputs are unchanged. A version is rebuilt when output is missing, its inputs changed, or CI passed **`--force`** (via **`force_deploy`** / **`force_refresh_upstream`**).

| Trigger | Spreadsheet / lab behavior |
|---------|----------------------------|
| **`force_deploy`** or **`force_refresh_upstream`** | Regenerate **all** cached versions (`--incremental --force`) |
| **New cx-as-code release** (incremental deploy) | Regenerate **only the new version** (and any version whose dependency tree, tf-export catalog, overrides, or menu paths changed) |
| **Push to `main`** with no input changes | Skip unchanged versions |

Permissions TF and tf-export generators do not use incremental skip yet — they still run for every cached version on each deploy. `schema-force-new` follows the same pattern as tf-export singletons.

### Manual workflow options

| Checkbox | Effect |
|----------|--------|
| *(none)* | Deploy only if the provider version changed |
| **`force_deploy`** | Deploy anyway; rebuild the site; force-regenerate all spreadsheet templates and lab packages from cached upstream JSON |
| **`force_refresh_upstream`** | Same as `force_deploy`, plus re-download all upstream JSON and clear the provider source cache |

### Local regeneration flags

Generator scripts accept the same incremental flags CI uses:

```bash
npm run generate-spreadsheet-template -- --incremental
npm run generate-lab-package -- --incremental
```

Add **`--force`** to rebuild every version regardless of fingerprints. Without `--incremental`, local runs regenerate everything (default). See [npm scripts](#npm-scripts) for the full command reference.

## tf-export-resource-names/

`public/tf-export-resource-names/` is **generated** from provider exporter `BlockLabel` logic, **one JSON file per provider version** (same version list as `dependency-tree-json/`). The version picker loads the matching file for **genesyscloud_tf_export template** placeholders. Types not listed default to `<name>`.

`overrides.json` → `tfExportResourceNames` overrides the generated value for any type you list there (hand-edited exceptions only).

See [Deploy workflow (GitHub Actions)](#deploy-workflow-github-actions) for when CI regenerates this and other generated artifacts.

**Local:** `npm run generate-tf-export-resource-names` (all cached versions). One version from a local provider checkout:

```bash
node scripts/generate-tf-export-resource-names.mjs --version=1.82.0 --provider=/path/to/genesyscloud
```

## tf-export-singletons/

`public/tf-export-singletons/` is **generated** from provider exporter `IsSingleton: true`, **one JSON file per provider version** (same version list as `dependency-tree-json/`). The version picker loads the matching file for the **Singleton** badge in resource details on **v1.78.0+**. Older provider versions fall back to fixed tf-export block labels from `tf-export-resource-names` (no `IsSingleton` in source yet).

**Local:** `npm run generate-tf-export-singletons`

`tfExportNote` in `overrides.json` is still the hand-edited Markdown note shown below the export template block.

## schema-force-new/

`public/schema-force-new/` is **generated** from provider schema `ForceNew: true` attributes in `*_schema.go` (and inline resource schema), **one JSON file per provider version** (same version list as `dependency-tree-json/`). Harvest logic lives in `scripts/lib/provider-schema-scan.mjs` (shared schema parser; `schema-force-new-scan.mjs` re-exports the ForceNew selector). The version picker loads the matching file for the **Changing these attributes recreates the resource** detail row in resource details.

**Local:** `npm run generate-schema-force-new`

```bash
node scripts/generate-schema-force-new.mjs --provider=/path/to/genesyscloud --stdout
```

## gui-menu-paths.json

`public/gui-menu-paths.json` is the **slim generated** GUI menu path map shipped to the site (~15 KB). The app and spreadsheet generator load `guiMenuPaths` from this file and apply `overrides.json` → `guiMenuPaths` on top (same pattern as `tfExportResourceNames`).

The full mapping catalog (~200 KB) is written to **`.cache-meta/gui-menu-paths-debug.json`** (Actions cache only, not deployed). Use `--stdout` for the full JSON locally.

**Generate:** `npm run generate-gui-menu-paths -- --latest=X.Y.Z --union-permissions` (CI, bootstrap, and `download-provider-versions.sh` pass `--union-permissions` so paths cover every resource type that ever appeared in cached `resource_permissions-*.json` since **1.76.0**, while still fetching live Genesys nav each run).

**Public file fields:** `guiMenuPaths`, `menuCatalog`, `generatedAt`, `permissionsSource`, `permissionsUnion`.

- **`menuCatalog`** — Directory command-nav destinations in nav order. Each entry has `includeInSupportedResources` and, when excluded, `skipReason` explaining which funnel rule applied (see [supported-resources-templates](#supported-resources-templates)). Rules are configured in `overrides.json` → `supportedResourcesAdminExclusionKeywords` and baked at `generate-gui-menu-paths` time.

- **`--union-permissions`** — merge all cached `public/resource-permissions-json/*.json` from `1.76.0` through `--latest` (newer file wins per resource type). Omit for a single `--permissions=` file or add `--no-union-permissions` with `--latest` for latest-only mapping.
- **`guiMenuPaths`** — lookup map (`resource_type` → menu path). Same shape as `overrides.json` → `guiMenuPaths`. Types removed from **latest** permissions but mapped via the union are kept; debug catalog entries for those show `retired: true`.

**Debug file only** (`.cache-meta/gui-menu-paths-debug.json`):

- **`guiMenuPathCatalog`** — per-type detail: `permissions`, matched `menuPath` / `menuLeaf` / `menuAuthorize` / `matchScore` / `matchMethod`, optional `overrideMenuPath` / `overrideMatches`, or `unmappedReason`.
- **`menuRows`** — flattened admin menu plus Directory command-nav rows (`path`, `authorize`). Grows over time; removed rows are retained across runs.
- **`directoryNavSource`** / **`directoryCommandNavEntries`** — where the Directory bundle and translations were loaded from, and how many command-nav entries were parsed.
- **`guiMenuPathsIgnore`** — resource types to skip during auto-mapping (hand-edited, preserved across runs).

Match methods (in priority order):

1. **`permission`** — menu `authorize` policy overlap using resource-type primary entities (admin menu and Directory command-nav).
2. **`path-affinity`** — disambiguates rows that share generic policies such as `telephony:plugin:all`, using the resource type tail (e.g. `did_pool` → DID Numbers).
3. **`translation-*`** — falls back to menu translation keys (`translation-entity`, `translation-scope`, `translation-resource-type`, `translation-resource`) when permission join is absent or ambiguous.

Directory command-nav is fetched from `{region}/directory/` (same host as `--menu=` when remote). Override bundle or translations with `--directory-bundle=` / `--directory-translations=` (local path or URL). Skip with `--no-directory-nav`.

Additional Genesys surfaces not yet ingested (needed for a few remaining resource types):

| Surface | URL pattern | Would unlock |
|---------|-------------|--------------|
| **Architect app** | `{region}/architect/` → `build-assets/*/build/main.bundle.js` + localized strings | Grammars sub-nav (`Orchestration > Architect > Grammars`) |
| **Journey Management app** | `{region}/journey-management/` (external link in directory bundle) | Journey views / schedules vs Outcomes disambiguation |
| **Agent UI / Greetings** | `{region}/agent-ui-settings/` or agent-greeting iframe routes | `greeting`, `group_greeting` (not in directory command-nav today) |

Some overrides use legacy labels (`Case Management > Caseplan`) where Directory search now shows `Orchestration > Work Automation > Caseplans` — the generator follows current search breadcrumbs.

Unmapped types still appear in the catalog with `unmappedReason`; the app shows an empty menu path until covered by generated output or `overrides.json` → `guiMenuPaths`.

## provider-env-vars.json

`public/provider-env-vars.json` is the hand-edited source for provider environment variables (like release notes — not derived site output).

- **`providerEnvVars`** — full catalog (`name`, `valueHint`, `description`, `export-template`). New provider vars must be added here first.
- **`providerEnvVarsIgnore`** — names you have decided not to use in export templates.

CI syncs the catalog automatically, then fails when triage is still needed:

1. **Auto-catalog** — new provider vars are appended to **`providerEnvVars`** in `public/provider-env-vars.json` (with a placeholder description and empty `export-template`).
2. **Triage required** — build fails until each new var has either **`export-template`** resource types assigned or its name added to **`providerEnvVarsIgnore`**.

When the build fails, commit `public/provider-env-vars.json` along with your triage (`export-template` or `providerEnvVarsIgnore`).

## resource-permissions-tf/

`public/resource-permissions-tf/` is **generated** from `public/resource-permissions-json/`, **one read/write and one read-only role `.tf` file per provider version** (from `1.76.0` upward — same version list as cached `resource_permissions-*.json`). Each file defines a starting-point `genesyscloud_auth_role` with permission policies derived from the provider release JSON, plus any overrides from `public/overrides.json`.

**Local:** regenerated by `bootstrap-local-dev` and `download-provider-versions` (via `scripts/generate-resource-permissions-tf.mjs`).

### Shareable permalinks

Primary way to download and share role templates (same pattern as `/spreadsheet` and `/labfiles`). The explorer header **Download Role Template** links use these; right-click → **Copy Link** to share.

- `https://cxascode.github.io/roles/read-write` or `.../roles/read-write/latest` — latest read/write role
- `https://cxascode.github.io/roles/read-write/v1.84.0` — read/write role for that provider version
- `https://cxascode.github.io/roles/read-only` or `.../roles/read-only/v1.84.0` — read-only role

Opening a permalink loads the app, downloads the matching versioned file, then returns to the explorer.

### Static files (generated cache)

Versioned `.tf` files live under `resource-permissions-tf/` on disk (what the permalinks download). Useful for `curl` without the app; not the primary share URL:

- `https://cxascode.github.io/resource-permissions-tf/latest-read-write-role.tf`
- `https://cxascode.github.io/resource-permissions-tf/1.84.0-read-write-role.tf`

## lab-packages/

`public/lab-packages/` is **generated** from `scripts/templates/cx-as-code-lab/`, **one zip per provider version** (same version list as `dependency-tree-json/`). Each zip pins `version = "~> X.Y.Z"` in every lab `.tf` file that declares a provider constraint, refreshes `filter-builder-template.xlsx` with that version's resource types (column **B** dropdown via Excel data validation on the hidden **validation** sheet), and writes `exportpipeline/main.tf` `exclude_filter_resources` from `spreadsheetTemplates.out` in `public/overrides.json` (skipping types in that file's `replace_with_datasource` block and `nonExportableResourceTypes`). Resource types honor `replaceDependencies`, `addDependencies`, and `hiddenResourceTypes` the same way as the explorer and spreadsheet generator.

The static lab source lives under `scripts/templates/cx-as-code-lab/CX_as_Code-Lab/`. Update that tree when lab exercises change; re-run the generator to rebuild versioned zips.

CI regeneration behavior is described in [Deploy workflow (GitHub Actions)](#deploy-workflow-github-actions).

**Local:** `npm run generate-lab-package` (optionally `-- --incremental` or `-- --force`; see [npm scripts](#npm-scripts)).

Hidden permalink download (same pattern as `/spreadsheet` and `/roles/...`):

- `/labfiles/latest`
- `/labfiles/v1.82.0`

## supported-resources-templates/

`public/supported-resources-templates/` is **generated** from `public/gui-menu-paths.json` `menuCatalog` and each cached `dependency-tree-json/{version}.json`. It lists Directory config destinations (menu path, supported yes/no, mapped resource types) for configuration coverage review — separate from the deploy `/spreadsheet` template.

**Supported-resources funnel** (applied at `generate-gui-menu-paths`; excluded rows record the matching rule in `menuCatalog` → `skipReason`):

1. **Mapped** — known resource-type mappings always win → on sheet
2. **Preview toggle** — unmapped feature toggles → off sheet (`skipReason` mentions feature toggle), unless the toggle name contains a `supportedResourcesFeatureToggleKeywords` entry → continue through steps 3–5
3. **Non-admin** — link does not contain `"admin"` → off sheet (`skipReason` mentions non-admin)
4. **Admin exclusion** — admin link matches `supportedResourcesAdminExclusionKeywords` → off sheet
5. **Admin config** — remaining admin links → on sheet

Included rows have `includeInSupportedResources: true` and no `skipReason`.

**Local:** `npm run generate-supported-resources-spreadsheet` (optionally `-- --incremental` or `-- --force`; see [npm scripts](#npm-scripts)). Also runs from `bootstrap-local-dev` and CI.

Hidden permalink download (same pattern as `/spreadsheet` and `/labfiles`):

- `/supported-resources/latest`
- `/supported-resources/v1.84.2`
