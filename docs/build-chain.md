# Build chain & rerun guide

Operational reference: what runs in what order, and **what to rerun when a step fails**.

## Pipelines (four repos)

| # | Repo | Workflow / trigger | Writes to |
|---|------|-------------------|-----------|
| 1 | `scheblein/releasenotes` | Daily 21:37 UTC + manual | `cxascode.github.io` → `public/release-notes-data/**` |
| 2 | `cxascode/cxascode.github.io` | Push to `main` (except release-notes-only), daily 22:17 UTC, manual | GitHub Pages `dist/` + generated `public/**` |
| 3 | `cxascode/exportbuilder` | Push to `main` | `cxascode.github.io/exportbuilder/` |
| 4 | `scheblein-genesys/splitter` | Push to `main` | Splitter Pages site (runtime fetch from cxascode) |

**Schedule:** release notes (~21:37 UTC) run before the site deploy check (~22:17 UTC).

**Quirk:** commits that touch **only** `public/release-notes-data/**` do **not** trigger `deploy-pages.yml`. Release notes land in git immediately but go **live** on the next deploy that actually runs.

---

## Step 1 — Release notes (`scheblein/releasenotes`)

**Workflow:** `CX as Code Release Notes` (`.github/workflows/release-notes.yml`)

**What it does:** diffs consecutive `terraform-provider-genesyscloud` source tarballs → per-version markdown/JSON → `resource-attribute-index.*` → commits to the website repo.

| If this failed… | Do this |
|-----------------|---------|
| Entire workflow (agent timeout, bad diff, missing secrets) | Re-run **Actions → CX as Code Release Notes → Run workflow**. Optional: set `release_tag`, check **force_regenerate**. Needs `CURSOR_API_KEY` + `CXASCODE_SITE_REPO_TOKEN`. |
| One version half-written | Same, with `release_tag` pinned to that version + **force_regenerate**. |
| Notes committed but site still shows old content | Release-notes-only push skipped deploy. Run **Deploy to GitHub Pages** on `cxascode.github.io` with **`force_deploy`**. |

No local npm equivalent — fix and re-run the GitHub workflow.

---

## Step 2 — Site build (`cxascode.github.io`)

**Workflow:** `Deploy to GitHub Pages` (`.github/workflows/deploy-pages.yml`)

### CI recovery (fastest path)

| Situation | GitHub Actions rerun |
|-----------|---------------------|
| Transient failure (network, GitHub API, npm) | Re-run **failed jobs** only. |
| Stale/missing upstream JSON or provider source cache | **Run workflow** → **`force_refresh_upstream`**. |
| Generators OK but need full artifact rebuild (overrides, spreadsheets, lab) | **Run workflow** → **`force_deploy`**. |
| New provider release not picked up on schedule | Wait for next schedule, or manual run (no checkbox if version actually changed). |
| Any code/overrides fix pushed to `main` | Push triggers deploy automatically (unless only `release-notes-data/**`). |

### Generator order (same in bootstrap, incremental update, and local bootstrap)

Run downstream steps only after upstream steps succeed.

```
1. Download dependency_tree + resource_permissions JSON   (CI bootstrap/incremental only)
2. generate-resource-permissions-tf.mjs
3. generate-gui-menu-paths.mjs --union-permissions
4. generate-tf-export-resource-names.mjs                  (also tf-export-block-label-history)
5. generate-tf-export-singletons.mjs
6. generate-schema-force-new.mjs
7. generate-resource-classification.mjs
8. verify-tf-export-env-vars.mjs
9. verify-overrides-advisory.mjs
10. build-dependency-trees.mjs
11. generate-spreadsheet-template.mjs --incremental       (CI; --force with force_deploy)
12. generate-supported-resources-spreadsheet.mjs --incremental
13. generate-lab-package.mjs --incremental
14. generate-site-updates.mjs                               (push events only)
15. npm run build                                         (re-runs 10, sitemap, verify, Vite)
16. verify-tf-export-env-vars + verify-overrides-advisory   (post-build gate)
```

### If this step failed → fix → rerun locally

Replace `{latest}` with the provider version (e.g. `1.86.0`).

| Failed step | Likely cause | Fix, then rerun |
|-------------|--------------|-----------------|
| **Bootstrap / download** | Missing release asset, bad token, `MIN_DEP_VERSION` / `MIN_PERM_VERSION` | Check [provider release assets](https://github.com/MyPureCloud/terraform-provider-genesyscloud/releases). CI: **`force_refresh_upstream`**. Local: `npm run download-provider-versions` or `npm run bootstrap-local-dev`. |
| **generate-resource-permissions-tf** | Missing `resource-permissions-json/{version}.json` | Download permissions JSON for that version, then rerun this script. |
| **generate-gui-menu-paths** | Genesys nav fetch failed or permissions union empty | Retry (transient). Local: `npm run generate-gui-menu-paths -- --latest={latest} --union-permissions`. |
| **generate-tf-export-resource-names** | Provider source cache missing/corrupt | Local: `npm run generate-tf-export-resource-names`. CI: **`force_refresh_upstream`** clears `.cache/provider-source`. |
| **generate-tf-export-singletons** | Same as tf-export names | `npm run generate-tf-export-singletons` |
| **generate-schema-force-new** | Same as tf-export names | `npm run generate-schema-force-new` |
| **generate-resource-classification** | Provider scan error or disk | `npm run generate-resource-classification` |
| **verify-tf-export-env-vars** | New provider env var not triaged | Edit `public/provider-env-vars.json`: add `export-template` **or** `providerEnvVarsIgnore` for each new name. Commit, push. Script auto-appends placeholders on run. |
| **verify-overrides-advisory** | `resource-classification` stale **or** `overrides.json` missing new deprecated/non-deletable types | 1) `npm run generate-resource-classification` 2) Update `public/overrides.json` (`deprecatedResourceTypes`, `cannotBeDestroyedResourceTypes`) per scan output. Advisory: `npm run scan-overrides-advisory`. |
| **build-dependency-trees** | Missing raw tree JSON or provider source for flow merge | Ensure `public/dependency-tree-json/{version}.json` exists. Rerun `node scripts/build-dependency-trees.mjs` (or `npm run build`). |
| **Spreadsheet / supported-resources / lab** | Missing merged trees or fingerprint mismatch | Run `node scripts/build-dependency-trees.mjs` first. Then the failed generator with `--latest={latest} --force`. |
| **generate-site-updates** | Git fetch / diff range | Usually re-run by pushing again. Local preview: `npm run generate-site-updates -- --base=... --head=...` |
| **npm run build** (Vite / sitemap / verify) | Same as verify-overrides-advisory or missing merged JSON | Fix underlying generator, then `npm run build`. |
| **Deploy Pages job** | Artifact upload / Pages config | Re-run deploy job after build succeeds. |

### Local “replay CI” shortcuts

```bash
# Day-to-day: latest provider JSON + all generators for latest
npm run bootstrap-local-dev

# Full multi-version cache (matches CI bootstrap)
npm run download-provider-versions

# After editing overrides.json only
node scripts/build-dependency-trees.mjs
npm run generate-spreadsheet-template -- --incremental --force
npm run generate-supported-resources-spreadsheet -- --incremental --force
npm run generate-lab-package -- --incremental --force
npm run build

# After editing overrides classification keys (deprecated, cannot destroy)
npm run generate-resource-classification
# update public/overrides.json if verify still fails
npm run verify-overrides-advisory
npm run build
```

Commit generated `public/**` and `src/gui-menu-paths.json` changes before pushing (CI cache holds them between runs, but git is the source of truth for overrides-driven regen).

---

## Step 3 — Downstream consumers

These **read** cxascode output at runtime (or sync a fallback at build). They do **not** run the cxascode generator chain.

### Export Builder (`cxascode/exportbuilder`)

| If this failed… | Do this |
|-----------------|---------|
| **`verify-public-data`** on Export Builder CI | Fix **cxascode** deploy first (`dependency-tree-merged-json`, `resource-classification`, `overrides.json` must be live). Then re-run Export Builder workflow. Local: `npm run verify-public-data` in exportbuilder. |
| **Export Builder build** (Vite) | Re-run failed job. `prebuild` runs `sync-resources-fallback.mjs` from live cxascode URLs. |
| App shows stale catalog offline | Run `npm run build` in exportbuilder after cxascode deploy (refreshes bundled fallback). |

**Live URLs it expects:** `dependency-tree-merged-json/`, `resource-classification/`, `overrides.json`.

### Splitter (`scheblein-genesys/splitter`)

| If this failed… | Do this |
|-----------------|---------|
| Splitter CI / build | Re-run workflow — no cxascode sync step. |
| Wrong/missing resource types in UI | Fix cxascode deploy, hard-refresh browser (fetches live merged tree + classification). |

### Stagehand (`cxascode/stagehand`)

**Cadence:** only when you ship Stagehand features or bugfixes — sync then so it picks up the latest cxascode `gui-menu-paths` at release time (no daily/scheduled sync).

| If this failed… | Do this |
|-----------------|---------|
| Export registry out of date after menu changes | After cxascode **`generate-gui-menu-paths`** deploys: `python3 scripts/sync-gui-menu-paths.py` then regenerate export registry / cut extension release (see stagehand README). |

---

## What depends on what (minimal)

```
provider releases (JSON + source)
        ↓
cxascode generators → merged trees, classification, tf-export catalogs, spreadsheets, lab, …
        ↓
GitHub Pages (explorer + static JSON URLs)
        ↓
Export Builder / Splitter (runtime fetch) · Stagehand (vendored gui-menu-paths)

releasenotes repo → public/release-notes-data/** → explorer (needs deploy to go live)
```

**Rule of thumb:** if **verify-** scripts or **classification / merged-tree** generators fail, fix data in **cxascode.github.io** and redeploy there before chasing Export Builder or Splitter.
