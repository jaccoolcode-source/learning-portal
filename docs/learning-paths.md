---
title: Learning Paths
description: Structured learning tracks for different goals — Java interview prep, Spring developer, senior engineer, cloud/DevOps, and Kotlin
---

<script setup>
const track1 = `flowchart TD
    A([Start]) --> B[OOP and SOLID]
    B --> C[Java Core and Maven]
    C --> D[Collections Framework]
    D --> E[HashMap Internals]
    E --> F[JVM and Memory]
    F --> G[Concurrency]
    G --> H[Modern Java 8-21]
    H --> I[Design Patterns]
    I --> J[TDD]
    J --> K[Spring and Databases]
    K --> L([Interview Ready])
    style A fill:#22c55e,color:#fff
    style L fill:#3b82f6,color:#fff`

const track2 = `flowchart TD
    A([Start]) --> B[Java Core Refresher]
    B --> C[OOP and SOLID Principles]
    C --> D[Design Patterns]
    D --> E[Spring IoC and DI]
    E --> F[Bean Lifecycle and Scopes]
    F --> G[Spring Boot]
    G --> H[Spring Data JPA]
    H --> I[Spring Security]
    I --> J[Spring Testing and TDD]
    J --> K([Spring Developer])
    style A fill:#22c55e,color:#fff
    style K fill:#16a34a,color:#fff`

const track3 = `flowchart TD
    A([Start]) --> B[All Java Tracks Complete]
    B --> C[Concurrency Deep Dive]
    C --> D[JVM Tuning and Profiling]
    D --> E[Database Advanced]
    E --> F[Microservices]
    F --> G[Architecture Patterns]
    G --> H[Observability]
    H --> I[Kafka and Messaging]
    I --> J[Security]
    J --> K[Networking Fundamentals]
    K --> L[System Design]
    L --> M([Senior Engineer])
    style A fill:#22c55e,color:#fff
    style M fill:#7c3aed,color:#fff`

const track4 = `flowchart TD
    A([Start]) --> B[Networking Fundamentals]
    B --> C[Docker]
    C --> D[Kubernetes]
    D --> E[AWS Core - IAM and Lambda]
    E --> F[AWS Services - SQS DynamoDB etc]
    F --> G[IaC - Terraform]
    G --> H[CI/CD - GitLab]
    H --> I[Observability - CloudWatch]
    I --> J([Cloud Engineer])
    style A fill:#22c55e,color:#fff
    style J fill:#ea580c,color:#fff`

const track5 = `flowchart TD
    A([Java Dev]) --> B[Kotlin Basics]
    B --> C[Kotlin vs Java]
    C --> D[Coroutines]
    D --> E[Spring Boot with Kotlin]
    E --> F[TDD in Kotlin]
    F --> G([Kotlin Developer])
    style A fill:#22c55e,color:#fff
    style G fill:#7c3aed,color:#fff`
</script>

# Learning Paths

Choose a structured path based on your goal. Each track builds on the previous topic.

---

## Track 1 — Java Interview Preparation

Optimized for clearing Java backend interviews in 6–8 weeks.

<MermaidDiagram :code="track1" />

### Suggested Weekly Schedule

| Week | Topics | Time |
|------|--------|------|
| 1 | OOP & SOLID + Java Core + Maven | 8–10 hrs |
| 2 | Collections + HashMap Internals | 8–10 hrs |
| 3 | JVM Memory + Concurrency | 8–10 hrs |
| 4 | Modern Java + Design Patterns | 10–12 hrs |
| 5 | TDD + Testing | 8–10 hrs |
| 6–7 | Spring Framework + Databases | 12–15 hrs |
| 8 | Java Core Quiz + Modern Java Quiz + Mixed Review | 6–8 hrs |

---

## Track 2 — Spring Developer

For developers building production Spring Boot applications.

<MermaidDiagram :code="track2" />

---

## Track 3 — Senior Engineer / Architect

For engineers moving into senior/lead roles or system design interviews.

<MermaidDiagram :code="track3" />

---

## Track 4 — Cloud / DevOps Engineer

For developers targeting AWS, infrastructure, and platform engineering roles.

> **Prerequisite:** Comfortable with at least one backend language (Java, Python, etc.)

<MermaidDiagram :code="track4" />

### Suggested Weekly Schedule

| Week | Topics | Time |
|------|--------|------|
| 1 | Networking (IP, subnetting, DNS, TCP) + Docker | 8–10 hrs |
| 2 | Kubernetes (workloads, networking, scaling) | 10–12 hrs |
| 3 | AWS Core — IAM, Lambda, ECS/EKS, API Gateway | 10–12 hrs |
| 4 | AWS Services — SQS, SNS, EventBridge, DynamoDB, ElastiCache | 10–12 hrs |
| 5 | IaC — Terraform + CloudFormation | 8–10 hrs |
| 6 | CI/CD (GitLab) + Observability (CloudWatch) | 8–10 hrs |

---

## Track 5 — Kotlin Developer

For Java developers adding Kotlin to their skillset. Estimated: **1–2 weeks**.

> **Prerequisite:** Complete Track 1 or have solid Java experience.

<MermaidDiagram :code="track5" />

---

## Topic Dependencies

```
OOP & SOLID
  └── Java Core (equals, hashCode, Strings)
        └── Collections (interfaces → implementations)
              └── HashMap Internals
              └── equals & hashCode contract
        └── Generics
              └── Collections (type safety)
        └── Maven (build, dependency management)
  └── Design Patterns
        └── Spring Framework (uses Factory, Proxy, Template Method, Observer)
              └── Spring Boot
              └── Spring Data / JPA
              └── Spring Security
              └── Spring Testing

JVM & Memory
  └── Concurrency (thread stacks, heap sharing)

Modern Java (8–21)
  └── Streams & Lambdas
  └── Records & Sealed Classes
  └── Virtual Threads (Java 21)

TDD
  └── JUnit 5 + Mockito (tooling prerequisite)
  └── Spring Testing (integration TDD)

Databases
  └── JPA / Hibernate (uses Spring Data)

Architecture
  └── Microservices (uses Spring Boot, Databases)
  └── DDD · CQRS · Event Sourcing

Kafka
  └── Messaging concepts
  └── Spring Kafka (Spring integration)

Networking
  └── AWS (VPC, security groups, Route 53, CIDR)
  └── Docker / Kubernetes (networking layer)

Kotlin
  └── Java Core (prerequisite)
        └── Kotlin Basics (null safety, data classes)
              └── Coroutines (async / Flow)
              └── Spring Boot with Kotlin

AWS
  └── Networking (IP addressing, subnets, CIDR)
  └── IAM (security foundation for all services)
        └── Lambda · ECS · EKS (compute)
        └── SQS · SNS · EventBridge (messaging)
        └── DynamoDB · OpenSearch · ElastiCache (data)
        └── API Gateway · Route 53 (networking)
        └── CloudWatch · Step Functions (operations)
  └── IaC / Terraform (provision and manage AWS resources)
  └── CI/CD → GitLab (deploy to AWS)
```
