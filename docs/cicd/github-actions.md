---
title: GitHub Actions
description: GitHub Actions — workflows, triggers, jobs, steps, matrix builds, secrets and environments, reusable workflows, caching, OIDC cloud auth, and complete Java/Spring Boot pipeline examples
category: cicd
pageClass: layout-cicd
difficulty: intermediate
tags: [github-actions, ci-cd, workflows, matrix, secrets, oidc, caching, reusable-workflows]
related:
  - /cicd/index
  - /docker/production
  - /kubernetes/production
  - /gcp/iam
estimatedMinutes: 40
---

# GitHub Actions

<DifficultyBadge level="intermediate" />

GitHub Actions is an event-driven CI/CD platform built into GitHub. Workflows run in response to repository events and execute on managed (or self-hosted) runners.

---

## Core Concepts

```
Repository event (push, PR, schedule…)
  ↓
Workflow (.github/workflows/build.yml)
  ↓
Job 1 ──────────────────────────────────────── runs on a runner
  Step 1: actions/checkout@v4
  Step 2: actions/setup-java@v4
  Step 3: Run mvn package

Job 2 (depends on Job 1) ───────────────────── runs on a runner
  Step 1: Build Docker image
  Step 2: Push to registry
```

| Concept | Description |
|---------|-------------|
| **Workflow** | YAML file in `.github/workflows/`. Triggered by events. |
| **Event** | What triggers the workflow (push, pull_request, schedule, workflow_dispatch…) |
| **Job** | A set of steps running on one runner. Jobs run in parallel by default. |
| **Step** | A single task — either an Action or a shell command. Steps run sequentially. |
| **Action** | Reusable unit of automation (from Marketplace or local). |
| **Runner** | The machine that executes jobs. GitHub-hosted (`ubuntu-latest`, `windows-latest`, `macos-latest`) or self-hosted. |
| **Context** | Runtime data — `github`, `env`, `secrets`, `steps`, `matrix`, `runner`, `job`. |

---

## Workflow Syntax

```yaml
name: Build and Test                  # displayed in GitHub UI

on:                                   # triggers
  push:
    branches: [main, develop]
    paths-ignore:
      - 'docs/**'
      - '*.md'
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
  schedule:
    - cron: '0 2 * * 1'              # every Monday at 02:00 UTC
  workflow_dispatch:                  # manual trigger from GitHub UI
    inputs:
      environment:
        description: 'Target environment'
        required: true
        default: staging
        type: choice
        options: [staging, production]

env:                                  # workflow-level env vars
  JAVA_VERSION: '21'
  REGISTRY: europe-docker.pkg.dev
  IMAGE_NAME: my-project/my-repo/order-service

jobs:
  build:
    name: Build and Test
    runs-on: ubuntu-latest            # GitHub-hosted runner

    permissions:                      # least-privilege token permissions
      contents: read
      checks: write
      pull-requests: write

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          fetch-depth: 0              # full history (needed for SonarQube)

      - name: Set up JDK ${{ env.JAVA_VERSION }}
        uses: actions/setup-java@v4
        with:
          java-version: ${{ env.JAVA_VERSION }}
          distribution: temurin
          cache: maven                # cache ~/.m2 automatically

      - name: Build and test
        run: mvn verify -B            # -B = batch mode (no interactive prompts)

      - name: Publish test report
        uses: dorny/test-reporter@v1
        if: always()                  # run even if previous step failed
        with:
          name: JUnit Tests
          path: target/surefire-reports/*.xml
          reporter: java-junit
```

---

## Triggers (on:)

```yaml
on:
  # Push to specific branches or tags
  push:
    branches: [main, 'release/**']
    tags: ['v*.*.*']
    paths:
      - 'src/**'
      - 'pom.xml'
    paths-ignore:
      - '**.md'

  # Pull requests
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened, ready_for_review]

  # Scheduled (cron)
  schedule:
    - cron: '0 0 * * *'    # daily at midnight UTC

  # Manual trigger with inputs
  workflow_dispatch:
    inputs:
      dry-run:
        type: boolean
        default: false

  # Triggered by another workflow
  workflow_call:
    inputs:
      image-tag:
        type: string
        required: true
    secrets:
      registry-token:
        required: true

  # Repository events
  release:
    types: [published]

  issues:
    types: [opened]
```

---

## Jobs and Dependencies

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: echo "running tests"

  build:
    runs-on: ubuntu-latest
    needs: test               # waits for 'test' to succeed
    steps:
      - run: echo "building image"

  deploy-staging:
    runs-on: ubuntu-latest
    needs: [test, build]      # waits for both
    steps:
      - run: echo "deploying to staging"

  deploy-prod:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment: production   # requires manual approval gate
    steps:
      - run: echo "deploying to production"
```

### Job Outputs (pass data between jobs)

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.tags }}
      version: ${{ steps.version.outputs.value }}
    steps:
      - name: Get version
        id: version
        run: echo "value=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)" >> $GITHUB_OUTPUT

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha
            type=semver,pattern={{version}}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - run: echo "Deploying ${{ needs.build.outputs.image-tag }}"
```

---

## Matrix Builds

Run a job across multiple configurations in parallel.

```yaml
jobs:
  test:
    strategy:
      matrix:
        java: ['17', '21']
        os: [ubuntu-latest, windows-latest]
        include:
          # Extra config only for this combination
          - java: '21'
            os: ubuntu-latest
            experimental: true
        exclude:
          # Skip this combination
          - java: '17'
            os: windows-latest
      fail-fast: false          # don't cancel other matrix jobs on one failure
      max-parallel: 4

    runs-on: ${{ matrix.os }}
    name: Test on Java ${{ matrix.java }} / ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: ${{ matrix.java }}
          distribution: temurin
      - run: mvn test -B
```

---

## Secrets and Variables

```yaml
# Secrets — encrypted, never logged
env:
  DB_PASSWORD: ${{ secrets.DB_PASSWORD }}

steps:
  - name: Authenticate
    run: echo "${{ secrets.REGISTRY_TOKEN }}" | docker login -u _json_key --password-stdin
```

```bash
# Set secrets via GitHub CLI
gh secret set DB_PASSWORD --body "supersecret"
gh secret set REGISTRY_TOKEN < key.json

# Environment-scoped secrets (only available to that environment's jobs)
gh secret set PROD_DB_PASSWORD --env production --body "prod-secret"
```

### Variables (non-secret config)

```yaml
# Repository or environment variables (visible in logs)
env:
  REGISTRY: ${{ vars.REGISTRY_URL }}
  JAVA_VERSION: ${{ vars.JAVA_VERSION }}
```

### GitHub Context Values

```yaml
steps:
  - run: |
      echo "Repo: ${{ github.repository }}"
      echo "Branch: ${{ github.ref_name }}"
      echo "SHA: ${{ github.sha }}"
      echo "Short SHA: ${{ github.sha }}"
      echo "Actor: ${{ github.actor }}"
      echo "Event: ${{ github.event_name }}"
      echo "Run number: ${{ github.run_number }}"
```

---

## Environments and Approval Gates

```yaml
jobs:
  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment:
      name: production
      url: https://api.myapp.com     # shown in GitHub deployment UI

    steps:
      - name: Deploy to production
        run: ./deploy.sh production
```

Configure in GitHub Settings → Environments:
- **Required reviewers** — specific people or teams must approve
- **Wait timer** — enforce a delay before deployment
- **Deployment branches** — only `main` can deploy to `production`
- **Environment secrets** — secrets scoped to this environment only

---

## Caching

```yaml
# Method 1: actions/setup-java built-in cache (Maven/Gradle)
- uses: actions/setup-java@v4
  with:
    java-version: '21'
    distribution: temurin
    cache: maven               # caches ~/.m2/repository

# Method 2: Manual cache (more control)
- name: Cache Maven packages
  uses: actions/cache@v4
  with:
    path: ~/.m2/repository
    key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
    restore-keys: |
      ${{ runner.os }}-maven-

# Docker layer cache
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build and push
  uses: docker/build-push-action@v5
  with:
    context: .
    push: true
    tags: ${{ steps.meta.outputs.tags }}
    cache-from: type=gha          # GitHub Actions cache
    cache-to: type=gha,mode=max
```

---

## OIDC — Keyless Cloud Authentication

Instead of storing long-lived cloud credentials as secrets, use GitHub's OIDC token to assume cloud roles at runtime. Works with AWS, GCP, Azure.

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    permissions:
      id-token: write      # required for OIDC token request
      contents: read

    steps:
      # GCP — Workload Identity Federation (no service account key files)
      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.WIF_SA }}

      - name: Configure Docker for Artifact Registry
        run: gcloud auth configure-docker europe-docker.pkg.dev --quiet

      # AWS — assume IAM role via OIDC
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/github-actions-role
          aws-region: eu-west-1
```

---

## Reusable Workflows

Extract common pipeline logic into a reusable workflow called from multiple repositories.

```yaml
# .github/workflows/reusable-build.yml (in a shared repo or same repo)
name: Reusable Build

on:
  workflow_call:
    inputs:
      java-version:
        type: string
        default: '21'
      image-name:
        type: string
        required: true
      push-image:
        type: boolean
        default: false
    secrets:
      registry-token:
        required: false
    outputs:
      image-tag:
        value: ${{ jobs.build.outputs.image-tag }}

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ steps.meta.outputs.version }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: ${{ inputs.java-version }}
          distribution: temurin
          cache: maven
      - run: mvn verify -B
      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ inputs.image-name }}
          tags: type=sha,prefix=
      - name: Build image
        uses: docker/build-push-action@v5
        with:
          push: ${{ inputs.push-image }}
          tags: ${{ steps.meta.outputs.tags }}
```

```yaml
# Calling workflow
name: CI
on:
  push:
    branches: [main]

jobs:
  build:
    uses: my-org/shared-workflows/.github/workflows/reusable-build.yml@main
    with:
      image-name: europe-docker.pkg.dev/my-project/my-repo/order-service
      push-image: true
    secrets:
      registry-token: ${{ secrets.REGISTRY_TOKEN }}
```

---

## Composite Actions

Package multiple steps into a local reusable action.

```yaml
# .github/actions/setup-java-maven/action.yml
name: Setup Java and Maven
description: Checkout, setup JDK, restore cache

inputs:
  java-version:
    default: '21'

runs:
  using: composite
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-java@v4
      with:
        java-version: ${{ inputs.java-version }}
        distribution: temurin
        cache: maven
```

```yaml
# Using the composite action
steps:
  - uses: ./.github/actions/setup-java-maven
    with:
      java-version: '21'
```

---

## Complete Java / Spring Boot Pipeline

```yaml
# .github/workflows/ci-cd.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  REGISTRY: europe-docker.pkg.dev
  IMAGE: europe-docker.pkg.dev/${{ vars.GCP_PROJECT }}/my-repo/order-service

jobs:
  # ─── Job 1: Test ──────────────────────────────────────────────────────────
  test:
    name: Build & Test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
          cache: maven

      - name: Run tests and quality checks
        run: mvn verify -B checkstyle:check

      - name: OWASP Dependency Check
        run: mvn org.owasp:dependency-check-maven:check -DfailBuildOnCVSS=7

      - name: Publish test results
        uses: dorny/test-reporter@v1
        if: always()
        with:
          name: JUnit Tests
          path: target/surefire-reports/*.xml
          reporter: java-junit

      - name: Upload coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          file: target/site/jacoco/jacoco.xml

  # ─── Job 2: Build & Push Image (main branch only) ─────────────────────────
  build-image:
    name: Build & Push Image
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    permissions:
      contents: read
      id-token: write       # OIDC

    outputs:
      image-tag: ${{ steps.meta.outputs.version }}
      image-digest: ${{ steps.build.outputs.digest }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: temurin
          cache: maven

      - name: Package JAR
        run: mvn package -DskipTests -B

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.WIF_SA }}

      - name: Configure Docker
        run: gcloud auth configure-docker europe-docker.pkg.dev --quiet

      - name: Docker metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.IMAGE }}
          tags: |
            type=sha,prefix=,format=short
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      - name: Set up Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      - name: Scan image for CVEs
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: ${{ env.IMAGE }}:${{ steps.meta.outputs.version }}
          severity: HIGH,CRITICAL
          exit-code: 1
          format: sarif
          output: trivy-results.sarif

      - name: Upload scan results
        uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: trivy-results.sarif

  # ─── Job 3: Deploy to Staging ─────────────────────────────────────────────
  deploy-staging:
    name: Deploy to Staging
    needs: build-image
    runs-on: ubuntu-latest
    environment:
      name: staging
      url: https://staging-api.myapp.com
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.WIF_SA }}

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: my-cluster
          location: europe-west1

      - name: Deploy to staging
        run: |
          kubectl set image deployment/order-service \
            app=${{ env.IMAGE }}:${{ needs.build-image.outputs.image-tag }} \
            -n staging
          kubectl rollout status deployment/order-service -n staging --timeout=5m

      - name: Run smoke tests
        run: |
          curl -f https://staging-api.myapp.com/actuator/health || exit 1

  # ─── Job 4: Deploy to Production (manual approval) ────────────────────────
  deploy-production:
    name: Deploy to Production
    needs: [build-image, deploy-staging]
    runs-on: ubuntu-latest
    environment:
      name: production
      url: https://api.myapp.com
    permissions:
      id-token: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.WIF_SA }}

      - name: Get GKE credentials
        uses: google-github-actions/get-gke-credentials@v2
        with:
          cluster_name: my-cluster
          location: europe-west1

      - name: Deploy to production
        run: |
          kubectl set image deployment/order-service \
            app=${{ env.IMAGE }}:${{ needs.build-image.outputs.image-tag }} \
            -n production
          kubectl rollout status deployment/order-service -n production --timeout=10m

      - name: Verify deployment
        run: |
          curl -f https://api.myapp.com/actuator/health || \
            (kubectl rollout undo deployment/order-service -n production && exit 1)
```

---

## Useful Patterns

### Conditional Steps

```yaml
steps:
  # Only on push to main (not PRs)
  - name: Push image
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    run: docker push ...

  # Run even if previous steps failed
  - name: Cleanup
    if: always()
    run: docker system prune -f

  # Run only on failure
  - name: Notify on failure
    if: failure()
    uses: slackapi/slack-github-action@v1
    with:
      payload: '{"text":"Pipeline failed on ${{ github.ref }}"}'
```

### Dynamic Image Tag from POM Version

```yaml
- name: Get project version
  id: version
  run: |
    VERSION=$(mvn help:evaluate -Dexpression=project.version -q -DforceStdout)
    echo "value=${VERSION}" >> $GITHUB_OUTPUT

- name: Build image
  run: docker build -t myapp:${{ steps.version.outputs.value }} .
```

### Skip CI

```bash
# Add to commit message to skip the workflow entirely
git commit -m "chore: update README [skip ci]"
# or
git commit -m "docs: typo fix [no ci]"
```

### Concurrency — Cancel Outdated Runs

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true   # cancel previous run on same branch when new commit pushed
```

---

## Interview Quick-Fire

**Q: What's the difference between a workflow, a job, and a step?**
A workflow is the top-level YAML file triggered by an event. It contains jobs. Jobs run on separate runners (VMs) in parallel by default. Each job contains steps, which run sequentially on the same runner. Steps share the same filesystem within a job; jobs don't share state unless you use outputs or artifacts.

**Q: How does OIDC authentication work in GitHub Actions?**
GitHub's OIDC provider issues a short-lived JWT for the workflow run. The cloud provider (GCP, AWS) is configured to trust GitHub's OIDC tokens for a specific repo/branch. The workflow exchanges the JWT for cloud credentials at runtime — no long-lived secrets stored in GitHub.

**Q: What are reusable workflows and why use them?**
A reusable workflow is called by other workflows via `workflow_call`. It centralises common pipeline logic (build, test, scan) so all teams in an org share one definition. Changes propagate automatically; teams don't copy-paste YAML. Composite actions are similar but for steps, not full jobs.

**Q: What is the `concurrency` key used for?**
It prevents redundant runs. With `cancel-in-progress: true`, pushing a new commit to a PR cancels the previous workflow run for that branch — avoiding wasted runner time on outdated code.

**Q: How do environment secrets differ from repository secrets?**
Repository secrets are available to all jobs in all workflows. Environment secrets are scoped to a named environment (staging, production) and only available to jobs that reference that environment — which also triggers any approval gates defined for that environment.

<RelatedTopics :topics="['/cicd/index', '/cicd/gitlab-ci', '/cicd/jenkins', '/docker/production', '/kubernetes/production']" />

[→ Back to CI/CD Overview](/cicd/)
