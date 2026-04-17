---
title: AWS Overview
description: Amazon Web Services — core services, global infrastructure, shared responsibility model, and learning path
category: aws
pageClass: layout-aws
difficulty: beginner
tags: [aws, cloud, regions, availability-zones, shared-responsibility]
estimatedMinutes: 15
---

# AWS Overview

<DifficultyBadge level="beginner" />

Amazon Web Services (AWS) is the world's largest cloud platform, offering 200+ services across compute, storage, networking, databases, AI, and more.

---

## Global Infrastructure

```
Region (e.g. eu-west-1 Ireland)
  └── Availability Zone A  (1+ data centers, isolated power/networking)
  └── Availability Zone B
  └── Availability Zone C
```

| Concept | Description |
|---------|-------------|
| **Region** | Geographic area with 3+ AZs. Choose based on latency, compliance, cost. |
| **Availability Zone (AZ)** | One or more data centers with redundant power, networking, cooling. |
| **Edge Location** | CloudFront CDN PoP — caches content close to users (~400+ worldwide). |
| **Local Zone** | Extension of a Region to metro areas for ultra-low latency workloads. |

---

## Shared Responsibility Model

```
AWS Responsibility ("security OF the cloud"):
  Physical infrastructure, hardware, hypervisor, managed service internals

Customer Responsibility ("security IN the cloud"):
  OS patching, network config, IAM policies, encryption, application security
```

The boundary shifts depending on service type:
- **IaaS (EC2):** You manage OS, runtime, data
- **PaaS (RDS, Lambda):** AWS manages runtime; you manage data and access
- **SaaS (S3 buckets):** AWS manages everything except your data and access policies

---

## Core Service Categories

| Category | Key Services |
|----------|-------------|
| **Compute** | EC2, Lambda, ECS, EKS, Fargate |
| **Storage** | S3, EBS, EFS, Glacier |
| **Database** | RDS, Aurora, DynamoDB, ElastiCache, Redshift |
| **Networking** | VPC, Route 53, API Gateway, CloudFront, ELB |
| **Messaging** | SQS, SNS, EventBridge, Kinesis |
| **Search** | OpenSearch (Elasticsearch) |
| **Observability** | CloudWatch, X-Ray, CloudTrail |
| **Security & IAM** | IAM, Cognito, Secrets Manager, KMS |
| **Orchestration** | Step Functions |
| **IaC** | CloudFormation, CDK |

---

## Well-Architected Framework (5 Pillars)

| Pillar | Key Principle |
|--------|--------------|
| **Operational Excellence** | Automate, monitor, learn from failures |
| **Security** | Least privilege, encryption everywhere, audit logs |
| **Reliability** | Multi-AZ, auto-scaling, circuit breakers |
| **Performance Efficiency** | Right-size resources, use managed services |
| **Cost Optimization** | Reserved capacity, turn off idle resources |

---

## Interview Quick-Fire

**Q: What's the difference between a Region and an AZ?**
A Region is a geographic area with multiple, isolated Availability Zones. An AZ is one or more discrete data centers with independent power and networking. High-availability architectures span multiple AZs within a Region.

**Q: What does the shared responsibility model mean in practice?**
AWS secures the physical infrastructure and managed services; you secure your data, access controls, OS patches (for EC2), and application code. Misconfigurations (open S3 buckets, overly broad IAM) are the customer's responsibility.

<RelatedTopics :topics="['/aws/iam', '/aws/lambda', '/aws/ecs-eks']" />
