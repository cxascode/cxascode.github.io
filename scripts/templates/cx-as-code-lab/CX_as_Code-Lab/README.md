# CX as Code Lab

## Overview

This repository contains examples and lab exercises for working with the Genesys Cloud Terraform Provider and CX as Code workflows.

The examples progress from basic Terraform concepts through exporting, importing, state management, and pipeline-based automation.

### How to use this README

- **First time here?** Follow the [Suggested Learning Path](#suggested-learning-path) in order.
- **Know what you need?** Use [Which One Should I Use?](#which-one-should-i-use) and jump to the matching [scenario steps](#scenario-steps).
- **Something failed?** See [debugging.md](./debugging.md) for provider and API logging.

Unzip the lab package, open one folder at a time, and run Terraform commands from that folder (`cd hello-world/`, then `terraform init`, and so on).

---

## Suggested Learning Path

Follow this order on your **first pass**. The [scenario table](#which-one-should-i-use) lists the same folders if you want to jump ahead later.

1. **terraform.tfvars** and [OAuth and permissions](#oauth-and-permissions)
   - Configure credentials before any Genesys Cloud exercise

2. **hello-world**
   - Learn Terraform fundamentals and provider configuration

3. **exportall**
   - Export your org and **browse** `./genesyscloud/` to see what Terraform can represent (discovery — read the output, do not apply it back)

4. **export**
   - Narrow to a small set of resources; learn `include_filter_resources` (use [Export builder](https://cxascode.github.io/exportbuilder/) if filter syntax is new)

5. **[Export builder](https://cxascode.github.io/exportbuilder/)** *(optional)*
   - Same as above — skip if you are comfortable with filters

6. **exportstate**
   - Export configuration **and** state (`include_state_file = true`)

7. **import** — **Create**
   - Copy a source [`export/`](#export--export-one-thing) into `import/`, use **target** org credentials, and `apply`

8. **importstate** — **Update**
   - Reuse source export, run [`exportstate/`](#exportstate--generate-state-from-an-existing-org) on the **target** org, combine in `importstate/`, then `plan` / `apply`

9. **exportpipeline** *(optional)*
   - CI/CD export automation — skip on first pass if you prefer

---

## Prerequisites

### Software

- Terraform 1.5+
- Genesys Cloud OAuth client credentials with export and apply permissions (see [OAuth and permissions](#oauth-and-permissions))
- Git
- VS Code or another editor

---

### Provider Version

```text
genesyscloud ~> 1.60.0
```

Configure your OAuth client and region in each lab folder's `terraform.tfvars` (see [terraform.tfvars](#terraformtfvars) below).

### OAuth and permissions

Labs that connect to Genesys Cloud need an OAuth client with enough permissions for the exercise (exports, applies, and so on). A common failure mode is correct `terraform.tfvars` credentials but a client that lacks the right policies.

The [CX as Code explorer](https://cxascode.github.io) publishes starting-point **role templates** (read/write and read-only `.tf` files) generated from the provider permission catalog. Download a template from the header **Download Role Template** links, adjust it for your org, apply it to create a role, then assign that role to the OAuth client whose credentials you put in `terraform.tfvars`.

Role templates are available for provider versions **1.76.0** and later (newer than the lab package pin — use a current template and adjust the `version` constraint in your `.tf` files if needed). Example share link: [read/write role (latest)](https://cxascode.github.io/roles/read-write/latest).

---

## terraform.tfvars

Most lab folders include a `terraform.tfvars` file alongside the `.tf` configuration. It supplies values for the Genesys Cloud provider variables (`genesyscloud_oauthclient_id`, `genesyscloud_oauthclient_secret`, and `genesyscloud_region`) so you can connect to **your** organization without editing the Terraform source.

Fill in your OAuth client credentials and AWS region before starting **hello-world** or any other exercise. Terraform loads `terraform.tfvars` automatically when you run commands from that lab folder.

For [`import/`](#import--create) and [`importstate/`](#importstate--update), use **source** org credentials when running `export/` and **target** org credentials in `import/` and `importstate/` (and when re-running `exportstate/` on the target). Only one org's credentials are active per folder at a time.

Keep real secrets out of the `.tf` files and out of version control. Use the blank template in the lab package as a starting point; add `terraform.tfvars` to `.gitignore` once it contains credentials.

Complete [OAuth and permissions](#oauth-and-permissions) setup (role template + OAuth client) before you fill in credentials.

---

## Key terms

| Term | Meaning in this lab |
|------|---------------------|
| **HCL** | HashiCorp Configuration Language — the `.tf` files Terraform uses |
| **Terraform state** | A record of which real-world resources Terraform manages (often `terraform.tfstate`) |
| **Resource block** | A `resource "genesyscloud_..." "name" { ... }` stanza in a `.tf` file |
| **`genesyscloud_tf_export`** | A special Terraform resource that **exports** from Genesys Cloud into local files |
| **`./genesyscloud/`** | Output directory where export exercises write generated `.tf` files (and sometimes state) |
| **Brownfield** | Your org already has configuration you want to bring under Terraform |
| **Drift** | When live Genesys Cloud settings no longer match your Terraform configuration |

---

## Understanding the Examples

One of the most common areas of confusion when getting started with CX as Code is understanding the difference between the lab folders — especially export vs **create** (`import/`) vs **update** (`importstate/`). The subsections below follow the [Suggested Learning Path](#suggested-learning-path) order (skipping optional Export builder).

### Hello World

Learn Terraform basics and Genesys Cloud provider authentication before any export or apply exercise. Folder: `hello-world/`.

### Export All

Export all supported resources from an organization — your first look at what Terraform can represent in your org.

```text
Entire Organization
          ↓
      Export All
          ↓
 Large Terraform Configuration
```

Folder: `exportall/`. Browse the output in `./genesyscloud/` — **read-only discovery** in the org you exported from. Promoting that HCL to another org is [`import/`](#import--create), not `apply` in this folder.

### Export

Export selected Genesys Cloud resources into Terraform configuration.

```text
Genesys Cloud Resources
          ↓
       Export
          ↓
Terraform Configuration
```

Folder: `export/`.

### Export State

Generate Terraform state and configuration from existing resources.

```text
Existing Resources
          ↓
     Export State
          ↓
Terraform State + Configuration
```

Folder: `exportstate/`. Exports HCL **and** `terraform.tfstate`.

**Export folders are export-only:** in `export/`, `exportall/`, `exportstate/`, and `exportpipeline/`, `terraform apply` runs `genesyscloud_tf_export` and writes files under `./genesyscloud/`. Do **not** run `terraform import` or follow-up `plan` / `apply` on the exported resource blocks in those folders — copy output to [`import/`](#import--create) or [`importstate/`](#importstate--update) for create and update work.

**If you only ran `export/`** (HCL, no state file): re-run `exportstate/` with the same filters to produce a state file.

### Create vs update (`import/` vs `importstate/`)

The lab uses two folders for **source → target** promotion. These are **not** the `terraform import` CLI.

| | **Create** | **Update** |
|---|------------|------------|
| **Folder** | `import/` | `importstate/` |
| **When** | Resource does **not** exist in the target org yet | Resource **already exists** in the target org |
| **Commands** | Copy source export into `import/`, then `plan` → `apply` | Combine source export + target exportstate in `importstate/`, then `plan` → `apply` |
| **Plan shows** | `create` | **update** |
| **Typical start** | [`export/`](#export--export-one-thing) from source → copy HCL into `import/` | [`export/`](#export--export-one-thing) from source + [`exportstate/`](#exportstate--generate-state-from-an-existing-org) from target → combine in `importstate/` |

### Import (Create)

**Create** on the target org: take configuration exported from the source org and apply it. Folder: `import/`.

```text
Source org  --export-->  HCL           (export/)
          ↓
   copy into import/  (target credentials)
          ↓
    plan → apply
          ↓
  New resources on target org
```

### Import State (Update)

**Update** the target org by promoting configuration from a source export while using the target's exported state as your local backend. Folder: `importstate/`. Do this **after** [`import/`](#import--create) so the target already has the resources you promoted.

```text
Source org  --export-->       desired HCL          (export/)
Target org  --exportstate-->  HCL + state          (exportstate/)
          ↓
   combine in importstate/
          ↓
    plan → apply  (target org credentials)
          ↓
  Updated target org
```

### Export Pipeline

Automate exports in CI/CD with dependency resolution and data-source replacement patterns. Folder: `exportpipeline/`.

Relationship between export, create, and update:

```text
Genesys Cloud  --export-->  Terraform HCL          (export/, exportall/)
Genesys Cloud  --exportstate-->  HCL + local state (exportstate/ — export only; copy to importstate/)
Source export  --apply-->   target org             (import/ — create on target)
Source + target exports --combine-->  plan/apply   (importstate/ — update on target)
```

### Which One Should I Use?

Same order as the [Suggested Learning Path](#suggested-learning-path) (minus optional Export builder):

| Scenario | Folder |
|-----------|--------|
| New to Terraform | `hello-world/` |
| Export an entire org | `exportall/` |
| Export one thing | `export/` |
| Generate state from an existing org | `exportstate/` |
| **Create** on target org | `import/` |
| **Update** on target org | `importstate/` |
| Automate exports in CI/CD | `exportpipeline/` |

Each row maps to one lab folder. Use the [Export builder](https://cxascode.github.io/exportbuilder/) to draft `include_filter_resources` when needed.

#### Create vs update — `import/` vs `importstate/`

See [Create vs update](#create-vs-update-import-vs-importstate) for the full comparison. In short: **`import/` = apply source export to target (create)**, **`importstate/` = combine exports and update target using local state**.

#### Export exercises: what `terraform apply` does here

In `export/`, `exportall/`, `exportstate/`, and `exportpipeline/`, **`terraform apply` runs the `genesyscloud_tf_export` resource** in `main.tf`. That reads from Genesys Cloud and writes files under `./genesyscloud/`. You are **not** creating or updating the exported Genesys Cloud resources themselves — only triggering an export.

Do **not** use `terraform import` or run follow-up `plan` / `apply` on exported resource blocks in these folders. Copy output to [`import/`](#import--create) or [`importstate/`](#importstate--update) when you are ready to create or update resources.

### Scenario steps

Run every exercise from its lab folder (for example `cd export/`). Fill in `terraform.tfvars` in that folder before `terraform init`. See [terraform.tfvars](#terraformtfvars) and [OAuth and permissions](#oauth-and-permissions).

#### `hello-world/` — New to Terraform

Only **one** exercise file should end in `.tf` at a time; keep the others as `.bak` until you activate the next step.

1. Complete [OAuth and permissions](#oauth-and-permissions), then `cd hello-world/` and fill in `terraform.tfvars`.
2. Confirm only `1-terraform-hello-world.tf` is active (files `2` and `3` should still be `.bak`).
3. Run `terraform init`, then `terraform plan` and `terraform apply`.
4. Deactivate exercise 1: rename `1-terraform-hello-world.tf` → `1-terraform-hello-world.tf.bak`. Activate exercise 2: rename `2-provider-hello-world.tf.bak` → `2-provider-hello-world.tf`. Run `terraform plan` and `terraform apply`.
5. Deactivate exercise 2: rename `2-provider-hello-world.tf` → `2-provider-hello-world.tf.bak`. Activate exercise 3: rename `3-provider-close-the-loop.tf.bak` → `3-provider-close-the-loop.tf`. Run `terraform plan` and `terraform apply`.
6. If apply fails with permission errors, review [OAuth and permissions](#oauth-and-permissions). For other failures, see [debugging.md](./debugging.md).

#### `exportall/` — Export an entire org

Best **first export** after `hello-world/`: see what is already in your org before working with filters or state.

1. `cd exportall/` and fill in `terraform.tfvars`.
2. Review `main.tf`: `exclude_filter_resources` may pre-filter types for your lab package version. An empty list exports all supported types. No filter editing required for this exercise.
3. Run `terraform init`, then `terraform apply` (runs the export — see [above](#export-exercises-what-terraform-apply-does-here)). This may take a while on a large org.
4. Browse `./genesyscloud/` — file names, resource types, and naming patterns. This is **read-only discovery**; promoting configuration to another org is [`import/`](#import--create), not `apply` in this folder.

#### `export/` — Export one thing

After [`exportall/`](#exportall--export-an-entire-org), use this folder to export a **small, focused** set of resources.

1. `cd export/` and fill in `terraform.tfvars`.
2. Edit `main.tf`: add entries to `include_filter_resources` (format `"resource_type::Resource name regex"`). Use the [Export builder](https://cxascode.github.io/exportbuilder/) if filter syntax is new. For [`import/`](#import--create), export something safe to promote (for example a wrap-up code from `hello-world/`).
3. Optionally tune `exclude_attributes`, `replace_with_datasource`, and other `genesyscloud_tf_export` arguments.
4. Run `terraform init`, then `terraform apply` (this runs the export — see [above](#export-exercises-what-terraform-apply-does-here)).
5. Inspect generated files under `./genesyscloud/`. Output is **configuration only** (`include_state_file = false`). This is the **source** export you copy into [`import/`](#import--create) (and reuse in [`importstate/`](#importstate--update)).

#### `exportstate/` — Generate state from an existing org

Use when resources **already exist** in Genesys Cloud and you want Terraform configuration **and** a local `terraform.tfstate` in one export step.

1. `cd exportstate/` and fill in `terraform.tfvars`.
2. Edit `main.tf`: set `include_filter_resources` to the resources you want (or leave empty for a broader export). This folder sets `include_state_file = true`.
3. Run `terraform init`, then `terraform apply` (runs the export — see [above](#export-exercises-what-terraform-apply-does-here)).
4. Inspect `./genesyscloud/` for generated `.tf` files and `terraform.tfstate`. Stop here — do not run follow-up `plan` / `apply` or `terraform import` in this folder.

**Before [`importstate/`](#importstate--update):** you will run `exportstate/` **again** with **target** org credentials and the same filters as your source [`export/`](#export--export-one-thing), then copy the target state file into `importstate/`.

#### `import/` — Create

Apply a **source** export to a **target** org. Resources should **not** exist yet on the target — the plan should show **create**.

1. **Source export:** complete [`export/`](#export--export-one-thing) with **source** org credentials. Keep files under `export/genesyscloud/`.
2. `cd import/` and set `terraform.tfvars` to **target** org credentials.
3. Copy files from the source export into `import/` using this checklist:

   | Copy | Do **not** copy |
   |------|------------------|
   | Resource `.tf` files from `export/genesyscloud/` (for example `genesyscloud_routing_wrapupcode.tf`) | `export/main.tf` (the `genesyscloud_tf_export` block — that only runs exports) |
   | | Source `terraform.tfstate` (create path starts with empty state in `import/`) |
   | | Duplicate `provider` / `terraform` blocks if the export included them — `import/` already has `providers.tf` and `terraform.tf` |

4. Run `terraform init`, then `terraform plan` and confirm the plan shows **create** actions only.
5. Run `terraform apply`.

Do [`importstate/`](#importstate--update) next. Keep the source `export/genesyscloud/` output.

#### `importstate/` — Update

Combine **source** desired configuration with **target** exported state, then apply to the **target** org. Do this **after** [`import/`](#import--create) so the target already has the resources you promoted.

**A. Source export (desired configuration)**

Reuse `export/genesyscloud/` from [`import/`](#import--create) step 1. Edit a resource attribute in those files if you want a visible **update** in step C (for example change a wrap-up code `description` on the source copy you will merge).

**B. Target exportstate (local backend)**

1. `cd exportstate/` and set `terraform.tfvars` to **target** org credentials.
2. Use the **same** `include_filter_resources` as the source export.
3. Run `terraform init`, then `terraform apply`.
4. Keep `exportstate/genesyscloud/*.tf` and the target `terraform.tfstate` file the export produced.

**C. Combine and apply in `importstate/`**

1. `cd importstate/` and set `terraform.tfvars` to **target** org credentials.
2. Copy the **target** `terraform.tfstate` from step B into this folder (this is your local backend — it knows what already exists on the target).
3. Copy **source** resource `.tf` files from step A into this folder (resource files only — same rules as the [`import/`](#import--create) copy table).
4. **Merge rule:** each `resource "genesyscloud_..." "<name>"` block must use the **same Terraform resource name** (second label) as in the target state — check with `terraform state list`. If you see create/destroy in the plan, stop and fix resource names or state mismatch before applying.
5. Run `terraform init`, then `terraform plan`. Expect **update** on the attributes you changed (not create/destroy).
6. Review the plan, then `terraform apply`.

**Worked example (wrap-up code promoted earlier):**

```text
# After import/ created genesyscloud_routing_wrapupcode.hello_world on the target:

# 1. Target exportstate (step B) — state lists:
#    genesyscloud_routing_wrapupcode.hello_world

# 2. In source export/genesyscloud/genesyscloud_routing_wrapupcode.tf you change:
#    description = "..."  →  description = "Updated from source export"

# 3. Copy that .tf file into importstate/ (keep target terraform.tfstate from step B)

# 4. terraform plan  →  ~ update genesyscloud_routing_wrapupcode.hello_world
# 5. terraform apply
```

Run this when the target **already has** the resources from [`import/`](#import--create), or when aligning an existing target to a revised source export.

#### `exportpipeline/` — Automate exports in CI/CD *(optional on first pass)*

Skip until you have finished [`importstate/`](#importstate--update) unless you need CI/CD export automation now.

1. `cd exportpipeline/` and fill in `terraform.tfvars`.
2. Review `main.tf`: note `enable_dependency_resolution = true`, sample `replace_with_datasource` entries, and `exclude_filter_resources`.
3. Run `terraform init`, then `terraform apply` locally to validate the export (see [above](#export-exercises-what-terraform-apply-does-here)).
4. Inspect `./genesyscloud/`, then wire the same Terraform into your pipeline (`terraform init` → `terraform apply` on schedule or on demand). Treat `./genesyscloud/` as generated artifact output.

---

## Repository Structure

Quick index of lab folders. **Steps and commands** are in [Scenario steps](#scenario-steps) above — start there.

### `hello-world/`

Introduction to Terraform and the Genesys Cloud provider.

**Learning Objectives**

- Terraform fundamentals
- Provider configuration
- Authentication
- Resource lifecycle
- Plan and apply workflows

See [`hello-world/` steps](#hello-world--new-to-terraform).

---

### `exportall/`

Export all supported resources — best **first look** at your org after credentials work.

**Best For**

- Org discovery and inventory
- Understanding export output layout before using filters
- Organization baselines

See [`exportall/` steps](#exportall--export-an-entire-org).

---

### `export/`

Export selected resources into Terraform configuration.

**Best For**

- Learning export filters after browsing a full export
- Small proof-of-concepts
- Resource-specific examples

See [`export/` steps](#export--export-one-thing).

---

### `exportstate/`

Generate Terraform configuration **and** local state from resources that already exist — **export only** in this folder. Copy the state file and HCL into [`importstate/`](#importstate--update) for update workflows.

**Best For**

- Learning `include_state_file = true`
- Target org baseline (state file) before combining in [`importstate/`](#importstate--update)

See [`exportstate/` steps](#exportstate--generate-state-from-an-existing-org).

---

### `import/`

**Create** on the target org — copy a source [`export/`](#export--export-one-thing) into this folder and apply with **target** credentials.

**Best For**

- Source → target promotion when resources do not exist on the target yet (plan shows **create**)
- First apply of exported configuration to a new org or sandbox

Provider scaffolding and `terraform.tf` are included. Copy **resource** `.tf` files only from `export/genesyscloud/` — see the copy checklist in [`import/` steps](#import--create).

See [`import/` steps](#import--create).

---

### `importstate/`

**Update** — combine source export HCL with target `exportstate/` output (local state), then `plan` / `apply`. See merge rules and worked example in [`importstate/` steps](#importstate--update).

**Best For**

- Source → target promotion when resources already exist on the target
- Learning update plans (not creates) from combined exports
- Environment drift correction when desired config lives in another export

See [`importstate/` steps](#importstate--update).

---

### `exportpipeline/`

Pipeline-oriented export example. **Optional** on first pass — see learning path step 9.

**Demonstrates**

- CI/CD automation
- Dependency resolution
- Data source replacement
- Repeatable exports

See [`exportpipeline/` steps](#exportpipeline--automate-exports-in-cicd).

---

## Common Terraform commands

Run these from the active lab folder during exercises (after `terraform init`):

```bash
terraform init
terraform plan
terraform apply
```

If a command fails, see [debugging.md](./debugging.md).

---

## Lab cleanup (`terraform destroy`)

Use **`terraform destroy`** when you are done with an exercise and want to **remove Genesys Cloud resources this lab created or changed** under Terraform management. Run it from the **same folder** (and same `terraform.tfvars` org) you used for `terraform apply`.

```bash
terraform destroy
```

Review the destroy plan carefully — it shows what will be deleted in Genesys Cloud.

| After you finished… | Run destroy from… | What it cleans up |
|---------------------|-------------------|-------------------|
| `hello-world/` exercise 3 (wrap-up code) | `hello-world/` | The wrap-up code (and any other resources still in that folder's state) |
| [`import/`](#import--create) on the target org | `import/` (target credentials) | Resources **created** on the target during the create exercise |
| [`importstate/`](#importstate--update) apply on the target org | `importstate/` (target credentials) | Resources **managed** in that folder's state (including updates you applied) |

**Export-only folders** (`export/`, `exportall/`, `exportstate/`, `exportpipeline/`): `terraform apply` runs an export job (`genesyscloud_tf_export`). `terraform destroy` typically removes that Terraform resource from state; it does **not** undo a promotion you performed from [`import/`](#import--create) or [`importstate/`](#importstate--update). Clean those up in `import/` or `importstate/` instead.

**Local files:** deleting `./genesyscloud/` output or `terraform.tfstate` files is optional housekeeping on your machine; it does not remove anything from Genesys Cloud. Remove secrets from `terraform.tfvars` when you are finished.

---

## Disclaimer

This repository is intended for learning, experimentation, and proof-of-concept activities.

Always review generated Terraform before applying changes to a production environment.
