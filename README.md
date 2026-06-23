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

See [npm scripts](#npm-scripts) for all commands, flags, and when to use each generator.

## npm scripts

Reference for `package.json` scripts. CI behavior is described in [Deploy workflow (GitHub Actions)](#deploy-workflow-github-actions).

### App

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start the Vite dev server (hot reload). |
| `npm run build` | Run `scripts/write-sitemap.mjs` (writes `public/sitemap.xml`, `public/seo/sitemap.xml`, `public/sitemap.txt`, `public/.nojekyll` from latest dependency tree + site updates), then Vite production build to `dist/`. |
| `npm run preview` | Serve the production build locally after `npm run build`. |
| `npm run lint` | Run ESLint on the repo. |

### Upstream data

| Script | What it does |
|--------|----------------|
| `npm run bootstrap-local-dev` | **Lightweight local setup.** Downloads the **latest** `dependency_tree-*.json` and `resource_permissions-*.json` from `MyPureCloud/terraform-provider-genesyscloud` (when present), refreshes `public/dependency-tree-json/index.json` and `latest.json`, then runs all generators below. Optional `--latest=X.Y.Z` to pin the version. Use `GH_TOKEN` or `GITHUB_TOKEN` to avoid API rate limits. |
| `npm run download-provider-versions` | **Full version history**, like CI bootstrap. Downloads every cached provider version ≥ min versions into `public/dependency-tree-json/` and `public/resource-permissions-json/`. Skips files that already exist and validate. Environment variables: `DOWNLOAD_PERMISSIONS=false` (dependency trees only), `RUN_GENERATORS=false` (download only), `MIN_DEP_VERSION`, `MIN_PERM_VERSION`, `GH_TOKEN`. When `RUN_GENERATORS=true` (default), runs permissions TF, tf-export, verify, spreadsheet, and lab generators for the latest version. |

**When to use which:** `bootstrap-local-dev` is enough for day-to-day app work. Use `download-provider-versions` when you need the full multi-version cache locally (spreadsheet/lab artifacts for older provider versions, or debugging version-specific output).

### Generators

All generators read `public/overrides.json` unless `--overrides=` is passed (spreadsheet only). Spreadsheet and lab scripts support **`--incremental`** (skip unchanged versions) and **`--force`** (rebuild all). CI passes `--incremental`; add `--force` locally to match `force_deploy`.

| Script | Output | Common flags |
|--------|--------|--------------|
| `npm run generate-spreadsheet-template` | `public/spreadsheet-templates/{version}-cx-as-code-template.xlsx`, `latest-cx-as-code-template.xlsx` | `--latest=X.Y.Z`, `--incremental`, `--force`, `--overrides=path` |
| `npm run generate-lab-package` | `public/lab-packages/{version}-cx-as-code-lab.zip`, `latest-cx-as-code-lab.zip` | `--latest=X.Y.Z`, `--incremental`, `--force` |
| `npm run generate-tf-export-resource-names` | `public/tf-export-resource-names/{version}.json` | No args: all cached versions. `--version=X.Y.Z`, `--latest=X.Y.Z`, `--provider=path`, `--verify`, `--stdout` |
| `npm run generate-tf-export-singletons` | `public/tf-export-singletons/{version}.json` | Same pattern as tf-export resource names |
| `npm run verify-tf-export-env-vars` | Updates `public/provider-env-vars.json` | `--version=X.Y.Z`, `--latest=X.Y.Z`. Auto-appends new provider env vars; **exits non-zero** until each is triaged (`export-template` or `providerEnvVarsIgnore`). Runs in CI after upstream refresh. |
| `npm run generate-site-updates` | `public/site-updates-data/` | `--base`, `--head`, `--date=YYYY-MM-DD`, `--dry-run`, `--force`. Normally CI-only on push to `main`; use locally to preview changelog entries from a commit range. |

### Related script (no npm alias)

`scripts/generate-resource-permissions-tf.mjs` writes `public/resource-permissions-tf/{version}-read-write-role.tf` and `{version}-read-only-role.tf`. Invoked by `bootstrap-local-dev`, `download-provider-versions`, and CI — not exposed as its own npm script. Flags: `--latest=X.Y.Z`.

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

- `addDependencies` / `replaceDependencies` — adjust dependency trees from the provider release JSON
- `tfExportResourceNames` — optional per-type override for **genesyscloud_tf_export template** filter placeholders; wins over the generated map in `tf-export-resource-names.json`
- `tfExportNote` — default Markdown note (GFM) shown in the **genesyscloud_tf_export template** panel when a resource type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `dependencyNotes` — per resource type, Markdown note (GFM) shown at the bottom of Resource Type Details when that type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `guiMenuPaths` — per resource type, Genesys Cloud admin menu path shown in Resource Type Details (segments separated by ` > `)
- `hiddenResourceTypes` — resource types omitted from the left-hand list (still appear in Depends on / Dependency for when referenced)
- `spreadsheetScopePrefixes` — prefix labels in generated spreadsheet templates (e.g. `"out"` for out-of-scope types). Also the source of truth for `exclude_filter_resources` in the lab `exportpipeline/main.tf` (minus any types listed in that file's `replace_with_datasource` block, and minus `nonExportableResourceTypes`).
- **Division aware** — badge when **Depends on** includes `genesyscloud_auth_division`; list filter **Division Aware** → *Yes* / *No* (blank = all types; same heuristic)
- `deprecatedResourceTypes` — **Deprecated** badge in resource details; **Notes** column in spreadsheet templates (`Deprecated`)
- `nonExportableResourceTypes` — **Non-exportable** badge in resource details; **Notes** column in spreadsheet templates (`Non-exportable`); omitted from lab `exclude_filter_resources` (cannot be exported, so exclusion is unnecessary)
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
| Permissions TF / tf-export | All cached versions | All cached versions | All cached versions | All cached versions |

Spreadsheet templates and lab packages use **`--incremental`** in CI. Each provider version gets a fingerprint in `.cache-meta/artifact-stamps/`. A version is skipped when its output file exists and inputs are unchanged (dependency JSON, `overrides.json`, templates, generator libs). A version is rebuilt when output is missing, inputs changed, or CI passed **`--force`**.

Permissions TF and tf-export generators do not use incremental skip yet — they still run for every cached version on each deploy.

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

## provider-env-vars.json

`public/provider-env-vars.json` is the hand-edited source for provider environment variables (like release notes — not derived site output).

- **`providerEnvVars`** — full catalog (`name`, `valueHint`, `description`, `export-template`). New provider vars must be added here first.
- **`providerEnvVarsIgnore`** — names you have decided not to use in export templates.

CI syncs the catalog automatically, then fails when triage is still needed:

1. **Auto-catalog** — new provider vars are appended to **`providerEnvVars`** in `public/provider-env-vars.json` (with a placeholder description and empty `export-template`).
2. **Triage required** — build fails until each new var has either **`export-template`** resource types assigned or its name added to **`providerEnvVarsIgnore`**.

When the build fails, commit `public/provider-env-vars.json` along with your triage (`export-template` or `providerEnvVarsIgnore`).

## lab-packages/

`public/lab-packages/` is **generated** from `scripts/templates/cx-as-code-lab/`, **one zip per provider version** (same version list as `dependency-tree-json/`). Each zip pins `version = "~> X.Y.Z"` in every lab `.tf` file that declares a provider constraint, refreshes `filter-builder-template.xlsx` with that version's resource types (column **B** dropdown via Excel data validation on the hidden **validation** sheet), and writes `exportpipeline/main.tf` `exclude_filter_resources` from `spreadsheetScopePrefixes.out` in `public/overrides.json` (skipping types in that file's `replace_with_datasource` block and `nonExportableResourceTypes`). Resource types honor `replaceDependencies`, `addDependencies`, and `hiddenResourceTypes` the same way as the explorer and spreadsheet generator.

The static lab source lives under `scripts/templates/cx-as-code-lab/CX_as_Code-Lab/`. Update that tree when lab exercises change; re-run the generator to rebuild versioned zips.

CI regeneration behavior is described in [Deploy workflow (GitHub Actions)](#deploy-workflow-github-actions).

**Local:** `npm run generate-lab-package` (optionally `-- --incremental` or `-- --force`; see [npm scripts](#npm-scripts)).

Hidden permalink download (same pattern as `/spreadsheet`):

- `/labfiles/latest`
- `/labfiles/v1.82.0`
