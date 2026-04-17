---
title: AWS IAM
description: AWS Identity and Access Management — users, roles, policies, trust relationships, and least-privilege patterns
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, iam, roles, policies, permissions, security, least-privilege]
estimatedMinutes: 30
---

# AWS IAM

<DifficultyBadge level="intermediate" />

IAM controls **who** can do **what** on **which** AWS resources. It's the security foundation for every AWS account.

---

## Core Concepts

```
Principal (who)
  └── User / Role / Service / Federated Identity
      └── has attached Policies (what they can do)
          └── Policy evaluates to Allow or Deny on Resources
```

| Concept | Description |
|---------|-------------|
| **User** | Long-term identity (human or service). Has access keys or console password. |
| **Group** | Collection of users that share policies. |
| **Role** | Temporary identity assumed by a user, service, or another account. |
| **Policy** | JSON document defining permissions (Allow/Deny + Actions + Resources). |
| **Trust Policy** | Attached to a Role — defines who can assume the role. |
| **Permission Boundary** | Sets the maximum permissions a user/role can have. |

---

## Policy Structure

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowS3ReadOnOrders",
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::my-orders-bucket",
        "arn:aws:s3:::my-orders-bucket/*"
      ],
      "Condition": {
        "StringEquals": {
          "s3:prefix": ["orders/"]
        }
      }
    }
  ]
}
```

**Policy evaluation order:**
1. Explicit **Deny** → always wins
2. Explicit **Allow** → grants access
3. Implicit **Deny** → default (no matching Allow)

---

## Policy Types

| Type | Attached To | Purpose |
|------|------------|---------|
| **AWS Managed** | Users/Groups/Roles | AWS-maintained, broad common permissions |
| **Customer Managed** | Users/Groups/Roles | Your reusable policies |
| **Inline** | Single user/role | One-off, tightly coupled policies |
| **Resource-Based** | S3, SQS, Lambda… | Who can access this resource (cross-account) |
| **Permission Boundary** | Users/Roles | Maximum ceiling of permissions |
| **SCP (Service Control Policy)** | AWS Organizations | Account-level guardrails |

---

## IAM Roles

Roles are the preferred mechanism for granting permissions — they use **temporary credentials** (STS tokens) with an expiry.

### EC2 Instance Role

```json
// Trust policy (who can assume this role)
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

```bash
# EC2 instance automatically gets credentials via metadata service
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/MyRole
```

### Cross-Account Role Assumption

```json
// Role in Account B, trusting Account A
{
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "AWS": "arn:aws:iam::111122223333:root" },
    "Action": "sts:AssumeRole"
  }]
}
```

```bash
# From Account A, assume the role in Account B
aws sts assume-role \
  --role-arn "arn:aws:iam::444455556666:role/ReadOnlyRole" \
  --role-session-name "my-session"
```

### Lambda Execution Role

```json
// Lambda needs a role to call other AWS services
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:eu-west-1:123456789012:my-queue"
    }
  ]
}
```

---

## Least Privilege Patterns

```bash
# Use IAM Access Analyzer to find overly broad policies
aws accessanalyzer list-findings --analyzer-name my-analyzer

# Generate a policy based on CloudTrail activity (last 90 days)
aws iam generate-service-last-accessed-details --arn arn:aws:iam::123456789:role/MyRole
```

**Best practices:**
- Never use root account for day-to-day operations
- Never use long-term access keys for services (use roles)
- Enable MFA for all IAM users with console access
- Use `aws:RequestedRegion` conditions to restrict to specific regions
- Rotate access keys regularly; prefer IAM Identity Center (SSO) for humans

---

## IAM Identity Center (SSO)

AWS IAM Identity Center (formerly AWS SSO) federates enterprise identity (Active Directory, MS Entra, Okta) with AWS accounts and permission sets.

```
MS Entra / Okta
    ↓ (SAML 2.0 / OIDC)
IAM Identity Center
    ↓ assigns Permission Sets
AWS Account 1 → Role
AWS Account 2 → Role
```

---

## Common IAM ARN Formats

```
arn:aws:iam::123456789012:user/alice
arn:aws:iam::123456789012:group/developers
arn:aws:iam::123456789012:role/LambdaExecutionRole
arn:aws:iam::aws:policy/AmazonS3ReadOnlyAccess     ← AWS managed
arn:aws:iam::123456789012:policy/MyCustomPolicy
```

---

## Interview Quick-Fire

**Q: What's the difference between an IAM User and a Role?**
Users have long-term credentials (passwords, access keys). Roles have temporary credentials (STS tokens with TTL). Roles are preferred for services — no long-lived secrets to manage or rotate.

**Q: What happens when both an identity policy and a resource policy grant access?**
For same-account access, either an identity Allow OR a resource Allow is sufficient. Cross-account requires both sides to allow the action.

**Q: What is a Permission Boundary?**
A guardrail that sets the maximum permissions a user or role can have. Even if an identity policy grants more, the effective permissions are the intersection with the boundary. Used to safely delegate IAM creation to developers.

**Q: Why should you never use the root account?**
Root has unrestricted access and can't be limited by SCPs or permission boundaries. A compromised root account is catastrophic. Create an admin IAM user or use IAM Identity Center instead.

<RelatedTopics :topics="['/aws/', '/aws/lambda', '/security/auth-protocols']" />

[→ Back to AWS Overview](/aws/)
