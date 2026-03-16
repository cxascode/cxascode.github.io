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
