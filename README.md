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
- `tfExportNote` — default Markdown note (GFM) shown in the **genesyscloud_tf_export template** panel when a resource type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `dependencyNotes` — per resource type, Markdown note (GFM) shown at the bottom of Resource Type Details when that type is selected. Use `\n` in JSON for line breaks (not `\\n`).
- `guiMenuPaths` — per resource type, Genesys Cloud admin menu path shown in Resource Type Details (segments separated by ` > `)
- `hiddenResourceTypes` — resource types omitted from the left-hand list (still appear in Depends on / Dependency for when referenced)
- **Division aware** — badge when **Depends on** includes `genesyscloud_auth_division`; list filter **Division Aware** → *Yes* / *No* (blank = all types; same heuristic)

Examples:

```json
"hiddenResourceTypes": [
  "genesyscloud_bcp_tf_exporter"
],
"tfExportNote": "**Tip:** replace `<name>` with the Genesys Cloud resource name before export.",
"guiMenuPaths": {
  "genesyscloud_routing_language": "User Management > ACD Skills and Languages > Languages"
},
"dependencyNotes": {
  "genesyscloud_flow": "**Export tip:** one flow at a time.\n\n- Match the Architect name\n- Use the generated export filter placeholder for the resource name"
}
```

## tf-export-resource-names.json

`public/tf-export-resource-names.json` is **generated** from the provider exporter `BlockLabel` logic. The site reads this file directly for **genesyscloud_tf_export template** placeholders (`include_filter_resources` filter names). Types not listed default to `<name>`.

This file is separate from `overrides.json` — nothing is merged at runtime.

**Deploy workflow (option A):** `deploy-pages.yml` downloads the provider release source `.tar.gz` at `latest_tag`, extracts `genesyscloud/`, and regenerates this file before each site build. The deployed site always reflects the latest release exporter logic.

**Local regeneration:**

```bash
npm run generate-tf-export-resource-names
```

By default the script reads `../terraform-provider-genesyscloud/genesyscloud`. Override with `--provider=/path/to/genesyscloud` or `TF_EXPORT_PROVIDER_ROOT`.

Verify a file against a provider checkout:

```bash
npm run verify-tf-export-resource-names
```

`tfExportNote` in `overrides.json` is still the hand-edited Markdown note shown below the export template block.
