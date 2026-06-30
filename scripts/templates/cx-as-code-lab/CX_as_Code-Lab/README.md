# CX as Code Lab

## Overview

This repository contains examples and lab exercises for working with the Genesys Cloud Terraform Provider and CX as Code workflows.

The examples progress from basic Terraform concepts through exporting, importing, state management, filtering, and pipeline-based automation.

---

## Suggested Learning Path

1. **terraform.tfvars**
   - Configure OAuth client credentials and region for your org (see [terraform.tfvars](#terraformtfvars))

2. **hello-world**
   - Learn Terraform fundamentals and provider configuration

3. **exportall**
   - Export an entire organization and explore generated Terraform

4. **exportpipeline**
   - Automate exports using CI/CD pipelines and dependency resolution

5. **filter-builder-template.xlsx**
   - Build and validate export filters for large environments

6. **export**
   - Export selected Genesys Cloud resources into Terraform configuration

7. **import**
   - Deploy Terraform configuration into Genesys Cloud using `terraform apply`

8. **exportstate**
   - Generate Terraform state and configuration from an existing environment

9. **importstate**
   - Adopt existing resources into Terraform state using `terraform import`

---

## Prerequisites

### Software

- Terraform 1.5+
- Access to a Genesys Cloud organization
- Genesys Cloud OAuth Client Credentials
- Git
- VS Code or another editor

### Provider Version

```text
genesyscloud ~> 1.60.0
```

Configure your OAuth client and region in each lab folder's `terraform.tfvars` (see [terraform.tfvars](#terraformtfvars) below).

### OAuth and permissions

Labs that connect to Genesys Cloud need an OAuth client with enough permissions for the exercise (exports, applies, and so on). A common failure mode is correct `terraform.tfvars` credentials but a client that lacks the right policies.

The [CX as Code explorer](https://cxascode.github.io) publishes starting-point **role templates** (read/write and read-only `.tf` files) generated from the provider permission catalog. Download a template from the header **Download Role Template** links, adjust it for your org, apply it to create a role, then assign that role to the OAuth client whose credentials you put in `terraform.tfvars`.

Role templates are available for provider versions **1.76.0** and later. Example share link: [read/write role (latest)](https://cxascode.github.io/roles/read-write/latest).

---

## terraform.tfvars

Most lab folders include a `terraform.tfvars` file alongside the `.tf` configuration. It supplies values for the Genesys Cloud provider variables (`genesyscloud_oauthclient_id`, `genesyscloud_oauthclient_secret`, and `genesyscloud_region`) so you can connect to **your** organization without editing the Terraform source.

Fill in your OAuth client credentials and AWS region before starting **hello-world** or any other exercise. Terraform loads `terraform.tfvars` automatically when you run commands from that lab folder.

Keep real secrets out of the `.tf` files and out of version control. Use the blank template in the lab package as a starting point; add `terraform.tfvars` to `.gitignore` once it contains credentials.

Complete [OAuth and permissions](#oauth-and-permissions) setup (role template + OAuth client) before you fill in credentials.

---

## Understanding the Examples

One of the most common areas of confusion when getting started with CX as Code is understanding the difference between Export, Export All, Export State, Import, and Import State.

### Export

Export selected Genesys Cloud resources into Terraform configuration.

```text
Genesys Cloud Resources
          ↓
       Export
          ↓
Terraform Configuration
```

### Export All

Export all supported resources from an organization.

```text
Entire Organization
          ↓
      Export All
          ↓
 Large Terraform Configuration
```

### Export State

Generate Terraform state and configuration from existing resources.

```text
Existing Resources
          ↓
     Export State
          ↓
Terraform State + Configuration
```

### Import

Deploy Terraform configuration into Genesys Cloud.

```text
Terraform Configuration
          ↓
    terraform apply
          ↓
     Genesys Cloud
```

Relationship to Export:

```text
Genesys Cloud  --Export--> Terraform HCL
Terraform HCL --Apply-->  Genesys Cloud
```

### Import State

Bring existing resources into Terraform state without recreating them.

```text
Existing Resource
          ↓
   terraform import
          ↓
    Terraform State
```

### Which One Should I Use?

| Scenario | Recommended Example |
|-----------|-------------------|
| New to Terraform | hello-world |
| Export one thing | export |
| Export an entire org | exportall |
| Deploy configuration into Genesys Cloud | import |
| Generate state from an existing org | exportstate |
| Adopt existing resources into Terraform state | importstate |
| Automate exports in CI/CD | exportpipeline |

---

## Repository Structure

### hello-world/

Introduction to Terraform and the Genesys Cloud provider.

**Learning Objectives**

- Terraform fundamentals
- Provider configuration
- Authentication
- Resource lifecycle
- Plan and apply workflows

When you reach the provider and permissions steps (rename `2-provider-hello-world.tf.bak` and `3-provider-close-the-loop.tf.bak` as needed), use an OAuth client backed by a suitable role. If `terraform apply` fails with permission errors on the wrap-up code exercise, review [OAuth and permissions](#oauth-and-permissions) and the role templates on [cxascode.github.io](https://cxascode.github.io).

---

### exportall/

Export all supported resources.

**Best For**

- Environment inventory
- Organization baselines
- Discovery exercises

---

### exportpipeline/

Pipeline-oriented export example.

**Demonstrates**

- CI/CD automation
- Dependency resolution
- Data source replacement
- Repeatable exports

---

### filter-builder-template.xlsx

Helps generate export filters without manually building regular expressions. Use this after **exportpipeline** and before targeted **export** exercises when you need to build or refine filter expressions.

---

### export/

Export selected resources into Terraform configuration.

**Best For**

- Learning exports
- Small proof-of-concepts
- Resource-specific examples

---

### import/

Deploy Terraform-managed configuration into Genesys Cloud.

**Best For**

- New resource creation
- Environment promotion
- Configuration deployment
- CI/CD pipelines

**Typical Workflow**

```text
Terraform Configuration
          ↓
    terraform apply
          ↓
     Genesys Cloud
```

---

### exportstate/

Generate Terraform state from existing resources.

**Best For**

- Brownfield adoption
- Existing organizations
- State creation workflows

---

### importstate/

Bring existing resources into Terraform state.

**Best For**

- Brownfield adoption
- Existing environments
- State management training
- Drift reconciliation exercises

**Typical Workflow**

1. Create Terraform configuration
2. Identify resource ID
3. Run terraform import
4. Inspect Terraform state
5. Reconcile configuration drift
6. Achieve a clean Terraform plan

**Example**

```bash
terraform import genesyscloud_routing_queue.sales <queue-id>
terraform state show genesyscloud_routing_queue.sales
terraform plan
```

---

## Common Terraform Commands

```bash
terraform init
terraform validate
terraform plan
terraform apply
terraform destroy
```

---

## Disclaimer

This repository is intended for learning, experimentation, and proof-of-concept activities.

Always review generated Terraform before applying changes to a production environment.
