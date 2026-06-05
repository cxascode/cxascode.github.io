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

`src/overrides.json` patches release data and export templates. It is imported at build time and bundled into the app (not served as a separate download). Rebuild and redeploy after editing it.

- `addDependencies` / `replaceDependencies` — adjust dependency trees from the provider release JSON
- `tfExportResourceNames` — per resource type, set the Genesys Cloud name used in `include_filter_resources` instead of the `<name>` placeholder
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
"tfExportResourceNames": {
  "genesyscloud_flow": "Customer Callback"
},
"tfExportNote": "**Tip:** replace `<name>` with the Genesys Cloud resource name before export.",
"guiMenuPaths": {
  "genesyscloud_routing_language": "User Management > ACD Skills and Languages > Languages"
},
"dependencyNotes": {
  "genesyscloud_flow": "**Export tip:** one flow at a time.\n\n- Match the Architect name\n- Use `tfExportResourceNames` for the filter name"
}
```
