---
title: Google Cloud Platform
description: GCP overview for Java developers — service map, core concepts, authentication patterns, and when to use each product
category: gcp
pageClass: layout-gcp
difficulty: intermediate
tags: [gcp, google-cloud, bigquery, pubsub, iam, gke, cloud-run]
related:
  - /architecture/microservices
  - /databases/nosql
  - /security/auth-protocols
estimatedMinutes: 15
---

# Google Cloud Platform

<DifficultyBadge level="intermediate" />

GCP is Google's public cloud. This section focuses on the services most relevant to Java backend and data engineering work: analytics, messaging, identity, and compute — with Java SDK examples throughout.

---

## Service Map (Topics Covered)

| Service | Category | What It Does |
|---------|----------|--------------|
| **BigQuery** | Analytics / Data Warehouse | Serverless SQL analytics at petabyte scale |
| **Analytics Hub** | Data Sharing | Cross-org dataset discovery and subscription |
| **Looker Studio** | BI / Visualisation | Dashboard and report builder on top of BigQuery |
| **Pub/Sub** | Messaging | Durable asynchronous message delivery (push & pull) |
| **IAM** | Identity & Access | Who can do what on which resource |
| **Workload Identity** | Auth | Keyless auth for workloads running on GCP |
| **Compute Engine** | IaaS | Virtual machines (VMs) |
| **GKE** | Container orchestration | Managed Kubernetes |
| **Cloud Run** | Serverless containers | Run containers without managing nodes |
| **Cloud Storage** | Object storage | Buckets for blobs, BigQuery external tables, GKE artefacts |

---

## GCP Resource Hierarchy

```
Organisation
  └── Folder (optional grouping)
        └── Project  ← IAM, billing, APIs are scoped here
              ├── Resources (VMs, BigQuery datasets, Pub/Sub topics…)
              └── Service Accounts
```

- **Project** is the fundamental unit — all resources belong to a project.
- IAM policies are inherited downward (Org → Folder → Project → Resource).
- Billing is per-project.

---

## Authentication in Java (ADC)

**Application Default Credentials (ADC)** is the standard pattern. The client library searches for credentials in this order:

```
1. GOOGLE_APPLICATION_CREDENTIALS env var → path to service account key JSON
2. gcloud auth application-default login  → developer credentials
3. Metadata server (running on GCP)       → attached service account / Workload Identity
```

```java
// All GCP client libraries use ADC automatically — no explicit config needed
BigQuery bigQuery = BigQueryOptions.getDefaultInstance().getService();

// Explicit project override
BigQuery bigQuery = BigQueryOptions.newBuilder()
    .setProjectId("my-project-id")
    .build()
    .getService();
```

```xml
<!-- Core BOM — manages all GCP library versions -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.google.cloud</groupId>
      <artifactId>libraries-bom</artifactId>
      <version>26.37.0</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

---

## When to Use Which Compute Option

| | VM (Compute Engine) | GKE | Cloud Run |
|-|---------------------|-----|-----------|
| **Abstraction** | Machine | Container / Pod | Container |
| **Scaling** | Manual / MIG | HPA / Cluster Autoscaler | Automatic (0→N) |
| **Startup time** | Minutes | Seconds | Milliseconds |
| **Cost model** | Per second (always on) | Per node (always on) | Per request |
| **Best for** | Legacy apps, custom OS, GPU | Stateful services, complex orchestration | Stateless HTTP services, event-driven |

## When to Use BigQuery vs Other Databases

| Scenario | Use |
|----------|-----|
| OLAP — aggregate millions of rows | **BigQuery** |
| OLTP — transactional writes, low latency lookups | Cloud SQL / Spanner |
| Document store | Firestore |
| Cache / session | Memorystore (Redis) |
| Event streaming | **Pub/Sub** → BigQuery subscription |
| Blob / file storage | Cloud Storage |

---

## Key Interview Concepts

**What is a GCP project?** The unit of billing, API enablement, and IAM. All resources live inside a project.

**What is ADC?** Application Default Credentials — a credential chain that lets the same code work locally (gcloud login) and on GCP (metadata server) without changing code.

**Difference between Pub/Sub and Kafka?** Pub/Sub is fully managed, serverless, no brokers to operate. Kafka gives more control (consumer groups, log compaction, exactly-once semantics) but requires operational overhead. Pub/Sub supports exactly-once via Dataflow.

**What is Workload Identity Federation?** Lets workloads on GKE (or external providers like GitHub Actions, AWS) authenticate to GCP APIs using their own identity tokens instead of downloaded service account key files.

<RelatedTopics :topics="['/gcp/bigquery', '/gcp/pubsub', '/gcp/iam', '/gcp/compute']" />
