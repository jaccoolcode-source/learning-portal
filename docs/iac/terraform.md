---
title: Terraform
description: Terraform — HCL syntax, providers, state management, modules, workspaces, and AWS infrastructure patterns
category: iac
pageClass: layout-iac
difficulty: intermediate
tags: [terraform, iac, hcl, aws, state, modules, workspaces, plan-apply]
estimatedMinutes: 35
---

# Terraform

<DifficultyBadge level="intermediate" />

Terraform is the most widely used IaC tool. It uses HCL (HashiCorp Configuration Language) to define infrastructure declaratively across any cloud provider.

---

## Core Concepts

```
Provider    — Plugin connecting Terraform to a cloud API (AWS, GCP, Azure)
Resource    — A cloud infrastructure object (EC2, S3, RDS…)
Data Source — Read-only reference to existing infrastructure
Variable    — Input parameters
Output      — Values exported after apply
Module      — Reusable group of resources
State       — JSON file tracking what Terraform has created
```

---

## Workflow

```bash
terraform init      # download providers and modules
terraform plan      # show what will change (dry run)
terraform apply     # create/update/delete resources
terraform destroy   # tear down all resources
terraform fmt       # format .tf files
terraform validate  # syntax check
```

---

## HCL Syntax

```hcl
# provider.tf
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.6"

  # Remote state in S3 (always use remote state in teams)
  backend "s3" {
    bucket         = "my-terraform-state"
    key            = "prod/main.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"   # state locking
  }
}

provider "aws" {
  region = var.aws_region
}
```

```hcl
# variables.tf
variable "aws_region" {
  type        = string
  default     = "eu-west-1"
  description = "AWS region to deploy into"
}

variable "environment" {
  type    = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "instance_count" {
  type    = number
  default = 2
}
```

```hcl
# main.tf
data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "app" {
  name        = "${var.environment}-app-sg"
  description = "Security group for app servers"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_tags
}

resource "aws_lambda_function" "order_processor" {
  function_name = "${var.environment}-order-processor"
  role          = aws_iam_role.lambda_exec.arn
  handler       = "com.mycompany.OrderHandler::handleRequest"
  runtime       = "java21"
  memory_size   = 512
  timeout       = 30
  filename      = "order-processor.jar"

  environment {
    variables = {
      ENVIRONMENT = var.environment
      DB_HOST     = aws_rds_cluster.main.endpoint
    }
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_logs]
}
```

```hcl
# outputs.tf
output "lambda_function_arn" {
  value       = aws_lambda_function.order_processor.arn
  description = "ARN of the order processor Lambda"
}

output "api_endpoint" {
  value = aws_apigatewayv2_stage.prod.invoke_url
}
```

---

## Locals

```hcl
locals {
  common_tags = {
    Environment = var.environment
    Project     = "learning-portal"
    ManagedBy   = "terraform"
  }

  lambda_name = "${var.environment}-${var.service_name}"
}

resource "aws_lambda_function" "service" {
  function_name = local.lambda_name
  tags          = local.common_tags
}
```

---

## Loops and Conditionals

```hcl
# count — create N identical resources
resource "aws_sqs_queue" "queues" {
  count = 3
  name  = "${var.environment}-queue-${count.index}"
}

# for_each — create resources from a map or set
variable "services" {
  default = {
    orders       = { memory = 512, timeout = 30 }
    notifications = { memory = 256, timeout = 10 }
  }
}

resource "aws_lambda_function" "services" {
  for_each    = var.services
  function_name = "${var.environment}-${each.key}"
  memory_size   = each.value.memory
  timeout       = each.value.timeout
}

# Conditional resource (create only in prod)
resource "aws_cloudwatch_metric_alarm" "errors" {
  count      = var.environment == "prod" ? 1 : 0
  alarm_name = "prod-lambda-errors"
  # ...
}
```

---

## Modules

```hcl
# modules/lambda-service/main.tf  (reusable module)
variable "name" {}
variable "memory" { default = 256 }
variable "environment_vars" { type = map(string) }

resource "aws_lambda_function" "this" {
  function_name = var.name
  memory_size   = var.memory
  environment { variables = var.environment_vars }
}

output "arn" { value = aws_lambda_function.this.arn }
```

```hcl
# root main.tf — consume the module
module "order_service" {
  source = "./modules/lambda-service"
  name   = "order-service"
  memory = 512
  environment_vars = {
    ENV = var.environment
  }
}

# Remote module from Terraform Registry
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "prod-vpc"
  cidr    = "10.0.0.0/16"
  azs     = ["eu-west-1a", "eu-west-1b", "eu-west-1c"]
}
```

---

## State Management

```bash
# List resources in state
terraform state list

# Show details of a specific resource
terraform state show aws_lambda_function.order_processor

# Import existing resource into state (bring under Terraform management)
terraform import aws_s3_bucket.existing my-existing-bucket

# Remove from state without destroying (unmanage without deleting)
terraform state rm aws_s3_bucket.old_bucket

# Move resource in state (after renaming)
terraform state mv aws_lambda_function.old aws_lambda_function.new
```

---

## Workspaces

```bash
# Different state files per workspace (dev/staging/prod)
terraform workspace new staging
terraform workspace select prod
terraform workspace list

# Use workspace name in resources
resource "aws_lambda_function" "service" {
  function_name = "${terraform.workspace}-order-processor"
}
```

::: tip Workspaces vs separate directories
For simple environment differences, workspaces work. For significantly different configs per environment (different modules, backends), use separate directories or Terragrunt.
:::

---

## Interview Quick-Fire

**Q: What is Terraform state and why does it need to be remote?**
State is a JSON file mapping Terraform resource configs to real cloud resources. Without state, Terraform doesn't know what already exists. Remote state (S3 + DynamoDB lock) allows teams to share state safely, prevents concurrent applies from corrupting it, and survives local machine loss.

**Q: What's the difference between `count` and `for_each`?**
`count` creates N identical resources indexed by integer — brittle when you add/remove elements (indices shift). `for_each` iterates a map/set — resources are keyed by name, so adding/removing doesn't affect other resources. Prefer `for_each` for any non-trivial collections.

**Q: What does `terraform plan` do and why is it important?**
It computes the diff between current state and desired config, showing exactly what will be created, updated, or destroyed — without making any changes. In CI/CD, plan output is reviewed in PR before apply, giving the team visibility into infrastructure changes.

<RelatedTopics :topics="['/iac/cloudformation', '/aws/', '/cicd/gitlab-ci']" />

[→ Back to IaC Overview](/iac/)
