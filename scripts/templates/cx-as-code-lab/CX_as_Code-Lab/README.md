# CX as Code Lab

## Overview

This repository contains examples and lab exercises for working with the Genesys Cloud Terraform Provider and CX as Code workflows.

The examples progress from basic Terraform concepts through exporting, importing, state management, filtering, and pipeline-based automation.

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

## Prerequisites

### Software

- Terraform 1.5+
- Access to a Genesys Cloud organization
- Genesys Cloud OAuth Client Credentials
- Git
- VS Code or another editor

### Provider Version

```text
genesyscloud ~> 1.68.0
```

### Required Credentials

```text
GENESYSCLOUD_OAUTHCLIENT_ID
GENESYSCLOUD_OAUTHCLIENT_SECRET
GENESYSCLOUD_REGION
```

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

---

### export/

Export selected resources into Terraform configuration.

**Best For**

- Learning exports
- Small proof-of-concepts
- Resource-specific examples

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

### exportstate/

Generate Terraform state from existing resources.

**Best For**

- Brownfield adoption
- Existing organizations
- State creation workflows

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

## Supporting Files

### filter-builder-template.xlsx

Helps generate export filters without manually building regular expressions.

---

## Suggested Learning Path

1. **hello-world**
   - Learn Terraform fundamentals and provider configuration

2. **export**
   - Export selected Genesys Cloud resources into Terraform configuration

3. **import**
   - Deploy Terraform configuration into Genesys Cloud using `terraform apply`

4. **exportall**
   - Export an entire organization and explore generated Terraform

5. **exportstate**
   - Generate Terraform state and configuration from an existing environment

6. **exportpipeline**
   - Automate exports using CI/CD pipelines and dependency resolution

7. **filter-builder-template.xlsx**
   - Build and validate export filters for large environments

8. **importstate**
   - Adopt existing resources into Terraform state using `terraform import`

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
