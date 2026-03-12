---
title: IAM & Workload Identity
description: Google Cloud IAM — roles, service accounts, policies, least privilege, Workload Identity Federation for GKE and CI/CD, and Java authentication patterns
category: gcp
pageClass: layout-gcp
difficulty: intermediate
tags: [iam, gcp, service-accounts, workload-identity, security, authentication, java]
related:
  - /gcp/compute
  - /security/auth-protocols
  - /security/secure-coding
estimatedMinutes: 30
---

# IAM & Workload Identity

<DifficultyBadge level="intermediate" />

IAM (Identity and Access Management) controls **who** can do **what** on **which** GCP resource. Getting IAM right is fundamental — misconfigured permissions are one of the most common causes of cloud security incidents.

---

## Core IAM Model

```
Principal  +  Role  →  granted on →  Resource
```

| Term | Description |
|------|-------------|
| **Principal** | Who: a Google Account, Group, Service Account, or federated identity |
| **Role** | What: a collection of permissions |
| **Permission** | Atomic action: `bigquery.tables.getData`, `pubsub.topics.publish` |
| **Policy** | Binding of (principal, role) on a resource. Policies are inherited down the hierarchy. |

---

## Role Types

### Primitive Roles (avoid in production)

| Role | Scope |
|------|-------|
| `roles/owner` | Full control + billing |
| `roles/editor` | Read + write most resources |
| `roles/viewer` | Read-only most resources |

::: danger
Primitive roles are coarse-grained and violate least privilege. Never assign `roles/editor` or `roles/owner` to service accounts or CI/CD pipelines.
:::

### Predefined Roles (preferred)

Curated by Google, scoped to a specific service:

| Role | Service | What It Allows |
|------|---------|---------------|
| `roles/bigquery.dataViewer` | BigQuery | Read table data, metadata |
| `roles/bigquery.dataEditor` | BigQuery | Read + write table data |
| `roles/bigquery.jobUser` | BigQuery | Run query jobs (required to query!) |
| `roles/bigquery.admin` | BigQuery | Full BigQuery control |
| `roles/pubsub.publisher` | Pub/Sub | Publish messages to topics |
| `roles/pubsub.subscriber` | Pub/Sub | Create subscriptions, pull messages |
| `roles/pubsub.admin` | Pub/Sub | Full Pub/Sub control |
| `roles/storage.objectViewer` | Cloud Storage | Read objects |
| `roles/storage.objectCreator` | Cloud Storage | Create (not delete) objects |
| `roles/storage.admin` | Cloud Storage | Full bucket + object control |
| `roles/compute.instanceAdmin` | Compute Engine | Manage VM instances |
| `roles/container.developer` | GKE | Deploy workloads to clusters |
| `roles/run.invoker` | Cloud Run | Invoke Cloud Run services |
| `roles/iam.serviceAccountTokenCreator` | IAM | Generate tokens for service accounts |

::: tip BigQuery gotcha
A principal needs **both** `bigquery.dataViewer` (or higher) AND `bigquery.jobUser` to query data. `dataViewer` alone is not enough to run queries.
:::

### Custom Roles

When predefined roles are still too broad:

```bash
# Create custom role from YAML
gcloud iam roles create bigQueryReadOnlyQuerier \
  --project=my-project \
  --file=custom-role.yaml
```

```yaml
# custom-role.yaml
title: BigQuery Read-Only Querier
description: Can query but not modify BigQuery data
stage: GA
includedPermissions:
  - bigquery.datasets.get
  - bigquery.tables.get
  - bigquery.tables.getData
  - bigquery.tables.list
  - bigquery.jobs.create
```

---

## Policy Inheritance

Policies bind principals to roles at a specific resource level and are inherited downward:

```
Organisation policy
  └── Folder policy (inherits org)
        └── Project policy (inherits folder + org)
              └── Resource policy (inherits project + folder + org)
```

**Effective permissions = union of all policies up the hierarchy.** A binding at a higher level cannot be removed by a lower-level policy — IAM is additive only (no deny, except Deny policies which are a newer feature).

### IAM Deny Policies (newer feature)

```bash
# Deny a specific permission even if granted by another role
gcloud iam policies create deny-bq-delete \
  --attachment-point=cloudresourcemanager.googleapis.com/projects/my-project \
  --policy-file=deny-policy.json
```

---

## Service Accounts

A **service account** is an identity for a workload (VM, container, pipeline) rather than a human user.

```
Human user:       user@example.com
Service account:  my-service@my-project.iam.gserviceaccount.com
```

### Service Account Key Files (Use Sparingly)

```bash
# Create a key file
gcloud iam service-accounts keys create key.json \
  --iam-account=my-service@my-project.iam.gserviceaccount.com

# Set for ADC
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

::: danger Key File Risks
Key files are long-lived credentials. If leaked (committed to git, exposed in logs), they're valid until manually rotated. Prefer **Workload Identity** when running on GCP. Use key files only for local development or external systems without WIF support.
:::

### Attaching a Service Account to a VM / Cloud Run

```bash
# VM — service account attached at creation
gcloud compute instances create my-vm \
  --service-account=my-service@my-project.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/cloud-platform

# Cloud Run — attach service account
gcloud run deploy my-service \
  --service-account=my-service@my-project.iam.gserviceaccount.com
```

When a service account is attached to a compute resource, the workload gets credentials automatically via the **metadata server** — no key files needed.

### Service Account Impersonation

```java
// Create credentials that impersonate a service account
ServiceAccountCredentials impersonated = ImpersonatedCredentials.newBuilder()
    .setSourceCredentials(GoogleCredentials.getApplicationDefault())
    .setTargetPrincipal("target-sa@project.iam.gserviceaccount.com")
    .setScopes(List.of("https://www.googleapis.com/auth/cloud-platform"))
    .setLifetime(300)  // seconds
    .build();

BigQuery bq = BigQueryOptions.newBuilder()
    .setCredentials(impersonated)
    .build()
    .getService();
```

Requires `roles/iam.serviceAccountTokenCreator` on the target SA.

---

## Workload Identity Federation

**The problem with key files:** They're static, long-lived, and hard to rotate. If code runs on GKE, GitHub Actions, or AWS, you don't want to manage key files.

**Workload Identity Federation** lets external identities (GKE pods, GitHub Actions OIDC tokens, AWS roles) authenticate to GCP without a key file.

### Workload Identity for GKE

```
GKE Pod (Kubernetes Service Account)
  ↓ Bound to
GCP Service Account
  ↓ Via Workload Identity binding
GCP APIs (BigQuery, Pub/Sub, etc.)
```

```bash
# 1. Enable Workload Identity on the cluster
gcloud container clusters update my-cluster \
  --workload-pool=my-project.svc.id.goog

# 2. Create GCP service account
gcloud iam service-accounts create my-app-sa

# 3. Grant GCP service account the permissions it needs
gcloud projects add-iam-policy-binding my-project \
  --member="serviceAccount:my-app-sa@my-project.iam.gserviceaccount.com" \
  --role="roles/bigquery.dataViewer"

# 4. Allow the Kubernetes SA to impersonate the GCP SA
gcloud iam service-accounts add-iam-policy-binding my-app-sa@my-project.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:my-project.svc.id.goog[my-namespace/my-k8s-sa]"

# 5. Annotate the Kubernetes service account
kubectl annotate serviceaccount my-k8s-sa \
  --namespace=my-namespace \
  iam.gke.io/gcp-service-account=my-app-sa@my-project.iam.gserviceaccount.com
```

```yaml
# Pod spec — use the annotated Kubernetes SA
apiVersion: v1
kind: Pod
spec:
  serviceAccountName: my-k8s-sa   # ← annotated KSA
  containers:
    - name: app
      image: my-app:latest
      # No GOOGLE_APPLICATION_CREDENTIALS needed — ADC uses metadata server
```

### Workload Identity Federation for GitHub Actions

```yaml
# GitHub Actions workflow
- name: Authenticate to Google Cloud
  uses: google-github-actions/auth@v2
  with:
    workload_identity_provider: 'projects/123/locations/global/workloadIdentityPools/github-pool/providers/github-provider'
    service_account: 'my-app-sa@my-project.iam.gserviceaccount.com'
    # No secrets needed — GitHub OIDC token exchanged for GCP credentials
```

```bash
# One-time setup: create the WIF pool and provider
gcloud iam workload-identity-pools create github-pool \
  --location=global \
  --display-name="GitHub Actions Pool"

gcloud iam workload-identity-pools providers create-oidc github-provider \
  --location=global \
  --workload-identity-pool=github-pool \
  --issuer-uri=https://token.actions.githubusercontent.com \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository=='my-org/my-repo'"

# Bind the provider to the service account
gcloud iam service-accounts add-iam-policy-binding my-app-sa@my-project.iam.gserviceaccount.com \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/github-pool/attribute.repository/my-org/my-repo"
```

---

## Java Authentication Patterns

### ADC (Recommended)

```java
// No code needed — all GCP client libraries use ADC automatically
BigQuery bq = BigQueryOptions.getDefaultInstance().getService();
Publisher publisher = Publisher.newBuilder(topicName).build();
```

### Explicit Credentials (when ADC isn't available)

```java
// From environment variable pointing to key file
GoogleCredentials credentials = GoogleCredentials
    .fromStream(new FileInputStream(System.getenv("GOOGLE_APPLICATION_CREDENTIALS")))
    .createScoped("https://www.googleapis.com/auth/cloud-platform");

BigQuery bq = BigQueryOptions.newBuilder()
    .setCredentials(credentials)
    .setProjectId("my-project")
    .build()
    .getService();
```

### Scoped Credentials

```java
// Limit credentials to specific API scopes
GoogleCredentials scoped = GoogleCredentials.getApplicationDefault()
    .createScoped(
        "https://www.googleapis.com/auth/bigquery",
        "https://www.googleapis.com/auth/pubsub"
    );
```

---

## Least Privilege Checklist

| Principle | Practice |
|-----------|----------|
| One SA per service | Don't share service accounts between different services |
| Grant at resource level | `dataset.orders` not the whole project when possible |
| No primitive roles | Use predefined or custom roles |
| No unused permissions | Audit with IAM Recommender (`gcloud recommender recommendations list`) |
| No key files on GCP | Use Workload Identity instead |
| Short-lived credentials | Prefer impersonation + short lifetime over static keys |
| Regular audit | `gcloud asset search-all-iam-policies` |

---

## IAM Recommender

Google automatically analyses IAM policies and suggests which permissions are actually used:

```bash
# List recommendations for a project
gcloud recommender recommendations list \
  --project=my-project \
  --location=global \
  --recommender=google.iam.policy.Recommender

# Typical output:
# "Replace roles/bigquery.admin with roles/bigquery.dataEditor + roles/bigquery.jobUser
#  (principal used only these permissions in the last 90 days)"
```

---

## Interview Quick-Fire

**Q: What's the difference between a primitive and predefined role?**
Primitive roles (owner/editor/viewer) are coarse-grained and apply broadly. Predefined roles are curated per-service with fine-grained permissions. Always prefer predefined or custom roles in production.

**Q: Why avoid service account key files on GCP?**
They're long-lived static credentials — if leaked they're valid until manually rotated, and rotation requires code changes. Workload Identity uses short-lived OIDC tokens exchanged automatically — no secrets to manage or leak.

**Q: How does Workload Identity work on GKE?**
A Kubernetes Service Account is annotated and bound to a GCP Service Account. When a pod uses that KSA, the GKE metadata server provides GCP credentials transparently via ADC. No key file is mounted.

**Q: What is IAM policy inheritance?**
Policies are additive down the hierarchy (Org → Folder → Project → Resource). A binding at a higher level can't be removed by a lower-level policy. Effective permissions are the union of all applicable policies.

**Q: How do you grant BigQuery query access?**
A principal needs both `bigquery.dataViewer` (to read table data) AND `bigquery.jobUser` (to create query jobs). Missing either one results in a permission error.

<RelatedTopics :topics="['/gcp/compute', '/gcp/pubsub', '/security/auth-protocols']" />

[→ Back to GCP Overview](/gcp/)
