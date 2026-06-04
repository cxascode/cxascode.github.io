# CX as Code Dependency Explorer

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

`public/overrides.json` patches release data and export templates served by the site:

- `addDependencies` / `replaceDependencies` — adjust dependency trees from the provider release JSON
- `tfExportResourceNames` — per resource type, set the Genesys Cloud name used in `include_filter_resources` instead of the `<resource name>` placeholder
- `dependencyNotes` — per resource type, Markdown note (GFM) shown at the bottom of Dependency details when that type is selected. Use `\n` in JSON for line breaks (not `\\n`).

Examples:

```json
"tfExportResourceNames": {
  "genesyscloud_flow": "Customer Callback"
},
"dependencyNotes": {
  "genesyscloud_flow": "**Export tip:** one flow at a time.\n\n- Match the Architect name\n- Use `tfExportResourceNames` for the filter name"
}
```
