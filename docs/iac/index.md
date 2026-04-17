---
title: Infrastructure as Code
description: IaC overview — declarative vs imperative, Terraform vs CloudFormation vs CDK, and when to use each
category: iac
pageClass: layout-iac
difficulty: beginner
tags: [iac, terraform, cloudformation, cdk, infrastructure, devops]
estimatedMinutes: 10
---

# Infrastructure as Code

<DifficultyBadge level="beginner" />

Infrastructure as Code (IaC) manages cloud resources (servers, networks, databases) through machine-readable configuration files rather than manual UI clicks or ad-hoc scripts.

---

## Why IaC?

| Without IaC | With IaC |
|-------------|----------|
| Manual clicks in console | Version-controlled config files |
| "Snowflake" servers | Reproducible, identical environments |
| Hard to audit changes | Git history = full change log |
| Environment drift between dev/prod | Identical environments from same code |
| Disaster recovery = rebuild manually | `terraform apply` → infra restored |

---

## IaC Tools Comparison

| Tool | Cloud | Language | State | Best For |
|------|-------|----------|-------|----------|
| **Terraform** | Multi-cloud | HCL | Remote (S3/Terraform Cloud) | Any cloud, multi-cloud |
| **CloudFormation** | AWS only | JSON/YAML | AWS managed | AWS-native teams |
| **CDK** | AWS (primarily) | TypeScript/Python/Java | CloudFormation under the hood | Developers preferring code over config |
| **Pulumi** | Multi-cloud | TypeScript/Python/Go | Pulumi Cloud or self-hosted | Developers who dislike DSLs |
| **Ansible** | Any | YAML | Agentless, stateless | Configuration management, not provisioning |

---

## Declarative vs Imperative

```
Declarative (Terraform, CloudFormation):
  "I want 3 EC2 instances, an RDS, and an ALB"
  → Tool figures out the HOW (create, update, delete to reach desired state)

Imperative (Bash scripts, Ansible tasks):
  "Run this sequence of commands"
  → YOU define every step; idempotency is your responsibility
```

Declarative is preferred for infrastructure — it handles drift correction, dependency ordering, and parallel provisioning automatically.

---

## GitOps Workflow

```
Developer → PR with infra changes
    ↓
CI pipeline:  terraform plan  (shows what will change, no actual changes)
    ↓
PR review: team reviews the plan output
    ↓
Merge to main
    ↓
CD pipeline:  terraform apply  (applies changes)
    ↓
Cloud resources updated
```

---

## Sections

- [Terraform](./terraform) — HCL, providers, state, modules, workspaces
- [CloudFormation](./cloudformation) — Templates, stacks, change sets, CDK overview
