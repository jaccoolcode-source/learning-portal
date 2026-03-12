---
title: GitLab CI/CD
description: GitLab CI/CD reference — .gitlab-ci.yml syntax, stages, jobs, runners, caching, artifacts, environments, Docker builds, and a complete Spring Boot pipeline
category: cicd
pageClass: layout-cicd
difficulty: intermediate
tags: [gitlab, cicd, pipeline, runners, artifacts, environments, docker, spring-boot]
related:
  - /cicd/
  - /cicd/github-actions
  - /cicd/jenkins
  - /docker/production
estimatedMinutes: 25
---

# GitLab CI/CD

<DifficultyBadge level="intermediate" />

GitLab CI/CD is built into GitLab — no separate service needed. Every project gets a `.gitlab-ci.yml` at the root that defines the full pipeline. GitLab's tight Git integration, built-in container registry, and environments make it popular for self-hosted enterprise setups.

---

## Core Concepts

```
.gitlab-ci.yml
  └── Stages (ordered list)
        └── Jobs (run within a stage, possibly in parallel)
              ├── script (commands)
              ├── image (Docker image for the runner)
              ├── rules / only / except (conditions)
              ├── artifacts (files to pass between jobs)
              └── cache (files to reuse between pipeline runs)
```

| Concept | Description |
|---------|-------------|
| **Pipeline** | One complete run of all stages for a commit/MR |
| **Stage** | Logical group — all jobs in a stage run in parallel; next stage waits |
| **Job** | The unit of work — runs a `script` inside a runner |
| **Runner** | An agent that executes jobs (shared, group, or project-specific) |
| **Artifact** | Files produced by a job, passed to subsequent jobs or downloadable |
| **Cache** | Files restored between pipeline runs (build dependencies) |
| **Environment** | Named deployment target (staging, production) with deployment tracking |

---

## Minimal Example

```yaml
# .gitlab-ci.yml
stages:
  - build
  - test
  - deploy

build-job:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn package -DskipTests
  artifacts:
    paths:
      - target/*.jar

test-job:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn test

deploy-staging:
  stage: deploy
  script:
    - echo "Deploy to staging"
  environment:
    name: staging
```

---

## Stages

Stages are executed in order. Jobs within the same stage run in parallel.

```yaml
stages:
  - validate    # lint, compile
  - test        # unit, integration
  - build       # Docker image
  - scan        # security scanning
  - deploy      # staging then production
  - verify      # smoke tests
```

If any job in a stage fails, subsequent stages don't run (unless `allow_failure: true`).

---

## Jobs

### Basic Job Structure

```yaml
job-name:
  stage: test
  image: eclipse-temurin:21-jdk
  before_script:
    - echo "Setup commands"
  script:
    - mvn test
  after_script:
    - echo "Cleanup commands"
  tags:
    - linux         # runner tag — only runners with this tag pick up the job
  allow_failure: false  # default; true = pipeline continues even if job fails
  timeout: 10 minutes
```

### Parallel Jobs

```yaml
unit-tests:
  stage: test
  parallel: 4     # GitLab splits tests across 4 parallel jobs (CI_NODE_INDEX / CI_NODE_TOTAL)
  script:
    - mvn test -pl module-$CI_NODE_INDEX
```

### Job Dependencies

```yaml
# Job-level dependencies (which artifacts to download)
deploy-job:
  stage: deploy
  needs:           # don't wait for all of the previous stage — only these jobs
    - build-image
    - run-tests
  script:
    - ./deploy.sh
```

`needs` enables DAG (Directed Acyclic Graph) pipelines — a job can start as soon as its specific dependencies finish, without waiting for the whole stage.

---

## Rules, Only, and Except

### `rules` (recommended — replaces `only`/`except`)

```yaml
deploy-production:
  script: ./deploy-prod.sh
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual      # require manual trigger on main
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
      when: never       # skip on MRs
    - when: never       # default: skip everything else

build:
  script: mvn package
  rules:
    - if: '$CI_COMMIT_TAG'                    # run only on tags
    - if: '$CI_COMMIT_BRANCH == "main"'       # or on main
    - changes:                                # or when these files change
        - src/**/*
        - pom.xml
```

### `when` Values

| Value | Behaviour |
|-------|-----------|
| `on_success` | Run if all previous stages passed (default) |
| `on_failure` | Run only if a previous stage failed |
| `always` | Always run (including after failures) |
| `manual` | Require manual trigger in UI |
| `never` | Never run |
| `delayed` | Run after a delay (`start_in: 1 hour`) |

---

## Variables

```yaml
variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2"
  DOCKER_IMAGE: "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  APP_VERSION: "1.0.0"

build:
  script:
    - echo "Building $DOCKER_IMAGE"
    - mvn package $MAVEN_OPTS
```

### Predefined Variables (most useful)

| Variable | Value |
|----------|-------|
| `CI_COMMIT_SHA` | Full commit hash |
| `CI_COMMIT_SHORT_SHA` | First 8 chars of commit hash |
| `CI_COMMIT_BRANCH` | Branch name (not on tags) |
| `CI_COMMIT_TAG` | Tag name (only on tag pipelines) |
| `CI_COMMIT_REF_NAME` | Branch or tag name |
| `CI_PROJECT_NAME` | Repository name |
| `CI_PROJECT_PATH` | `group/project` |
| `CI_REGISTRY` | GitLab Container Registry URL |
| `CI_REGISTRY_IMAGE` | Full image path in registry |
| `CI_REGISTRY_USER` | Username for registry login |
| `CI_REGISTRY_PASSWORD` | Token for registry login |
| `CI_ENVIRONMENT_NAME` | Current environment name |
| `CI_PIPELINE_SOURCE` | What triggered the pipeline (`push`, `merge_request_event`, `schedule`, etc.) |

### CI/CD Variables (secrets)

Set in **Settings → CI/CD → Variables**. Mark as:
- **Protected** — only available on protected branches/tags
- **Masked** — hidden in job logs
- **Expanded** — allow `$VARIABLE` expansion in value

```yaml
deploy:
  script:
    - kubectl config set-credentials ci --token=$K8S_TOKEN   # from CI/CD Variables
```

---

## Artifacts

Files produced by a job that are:
1. Passed to downstream jobs in the same pipeline
2. Downloadable from the GitLab UI

```yaml
build:
  stage: build
  script:
    - mvn package -DskipTests
  artifacts:
    paths:
      - target/*.jar
      - target/surefire-reports/
    reports:
      junit: target/surefire-reports/TEST-*.xml    # GitLab shows test results in MR
      coverage_report:
        coverage_format: cobertura
        path: target/site/jacoco/cobertura.xml
    expire_in: 1 week    # auto-delete after 1 week
    when: always          # keep artifacts even if job fails
```

### Artifact Reports

GitLab natively renders specific report types in the UI:

| Report Type | Trigger |
|-------------|---------|
| `junit` | Test results in MR widget |
| `coverage_report` | Coverage % in MR and pipeline |
| `sast` | Security findings in MR |
| `dependency_scanning` | Dependency CVEs in MR |
| `container_scanning` | Image CVE report |
| `terraform` | Terraform plan summary |

---

## Cache

Reuse files (e.g., Maven `.m2`, npm `node_modules`) across pipeline runs to speed up builds.

```yaml
# Global cache — applies to all jobs
cache:
  key: "$CI_COMMIT_REF_SLUG"    # separate cache per branch
  paths:
    - .m2/repository

# Per-job cache (overrides global)
build:
  cache:
    key:
      files:
        - pom.xml               # cache key derived from file hash — invalidated when pom.xml changes
    paths:
      - .m2/repository
    policy: pull-push           # default: restore before job, save after
    # policy: pull              # read-only (faster for test jobs that don't add deps)
    # policy: push              # write-only (only save, don't restore)
```

**Cache vs Artifacts:**
- **Cache** — optional performance optimization, between pipeline runs, not guaranteed
- **Artifacts** — reliable file passing between jobs in the same pipeline

---

## Environments and Deployments

```yaml
deploy-staging:
  stage: deploy
  script:
    - ./deploy.sh staging
  environment:
    name: staging
    url: https://staging.myapp.com
    on_stop: stop-staging          # job to call when stopping env

stop-staging:
  stage: deploy
  script:
    - ./teardown.sh staging
  environment:
    name: staging
    action: stop
  when: manual

deploy-production:
  stage: deploy
  script:
    - ./deploy.sh production
  environment:
    name: production
    url: https://myapp.com
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual                 # manual approval gate
```

- **Environments** tab in GitLab shows deployment history, who deployed, when
- **Protected environments** — require specific approval groups before deployment proceeds
- **Deployment freeze** — block deployments during scheduled windows (holidays, etc.)

---

## Docker Image Builds

### Using GitLab Container Registry

```yaml
build-image:
  stage: build
  image: docker:24
  services:
    - docker:24-dind        # Docker-in-Docker daemon
  variables:
    DOCKER_TLS_CERTDIR: "/certs"
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker build -t $CI_REGISTRY_IMAGE:latest .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
    - docker push $CI_REGISTRY_IMAGE:latest
```

### Using Kaniko (no Docker daemon — safer)

```yaml
build-image:
  stage: build
  image:
    name: gcr.io/kaniko-project/executor:v1.21.0-debug
    entrypoint: [""]
  script:
    - /kaniko/executor
      --context "$CI_PROJECT_DIR"
      --dockerfile "$CI_PROJECT_DIR/Dockerfile"
      --destination "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
      --destination "$CI_REGISTRY_IMAGE:latest"
      --cache=true
      --cache-repo "$CI_REGISTRY_IMAGE/cache"
```

Kaniko runs without a Docker daemon — better for shared runners without `--privileged`.

---

## Runners

A **Runner** is the agent that executes jobs.

### Runner Types

| Type | Scope | Use Case |
|------|-------|----------|
| Shared | All GitLab projects | General jobs — provided by GitLab.com |
| Group | Group of projects | Teams sharing a pool |
| Project | Single project | Specific hardware/config needed |

### Runner Executors

| Executor | Jobs run in | Common for |
|----------|-------------|------------|
| `shell` | Host OS directly | Fast, no isolation |
| `docker` | Docker container (image per job) | Most common — clean env per job |
| `kubernetes` | K8s Pod | Cloud-native auto-scaling |
| `docker+machine` | Docker on autoscaled VMs | GitLab.com shared runners |

### Tagging Runners

```yaml
# Tag a runner: linux, large-runner, gpu
# Target via job tags:
integration-test:
  tags:
    - linux
    - large-runner
  script:
    - mvn verify
```

### Register a Runner (self-hosted)

```bash
# Install GitLab Runner
curl -L --output /usr/local/bin/gitlab-runner \
  https://gitlab-runner-downloads.s3.amazonaws.com/latest/binaries/gitlab-runner-linux-amd64
chmod +x /usr/local/bin/gitlab-runner

# Register (interactive or non-interactive)
gitlab-runner register \
  --url https://gitlab.com/ \
  --registration-token <TOKEN> \
  --executor docker \
  --docker-image eclipse-temurin:21-jdk \
  --description "My build runner" \
  --tag-list linux,build
```

---

## Pipeline Types

### Branch Pipeline

Triggered on every push to a branch.

```yaml
build:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "push"'
```

### Merge Request Pipeline

Runs when a Merge Request is opened or updated. Shows results in the MR widget.

```yaml
test:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
```

### Merge Trains

Queue of MRs that are merged and tested together before hitting main — prevents broken main even with many concurrent MRs.

### Scheduled Pipelines

```yaml
# Set up in UI: CI/CD → Schedules
nightly-full-test:
  rules:
    - if: '$CI_PIPELINE_SOURCE == "schedule"'
  script:
    - mvn verify -P integration-tests
```

### Tag Pipelines (Release)

```yaml
release:
  rules:
    - if: '$CI_COMMIT_TAG =~ /^v[0-9]+\.[0-9]+\.[0-9]+$/'
  script:
    - ./release.sh $CI_COMMIT_TAG
```

---

## Includes and Templates

### Reuse Configuration with `include`

```yaml
# .gitlab-ci.yml
include:
  - local: '.gitlab/ci/test.yml'            # file in same repo
  - project: 'mygroup/shared-ci-templates'  # file from another project
    file: '/templates/docker-build.yml'
    ref: main
  - template: 'Security/SAST.gitlab-ci.yml' # GitLab built-in template

stages:
  - test
  - build
  - scan
```

### Extends (DRY)

```yaml
.java-base:          # hidden job (starts with .) — used as template
  image: maven:3.9-eclipse-temurin-21
  cache:
    key: "$CI_COMMIT_REF_SLUG"
    paths:
      - .m2/repository

unit-tests:
  extends: .java-base
  stage: test
  script:
    - mvn test

integration-tests:
  extends: .java-base
  stage: test
  script:
    - mvn verify -P integration
```

### YAML Anchors

```yaml
.default-cache: &default-cache
  key: "$CI_COMMIT_REF_SLUG"
  paths:
    - .m2/repository

build:
  cache:
    <<: *default-cache      # merge anchor
  script: mvn package

test:
  cache:
    <<: *default-cache
    policy: pull            # override one field
  script: mvn test
```

---

## Security Scanning (GitLab Ultimate)

GitLab ships built-in scanners via `include: template:`:

```yaml
include:
  - template: Security/SAST.gitlab-ci.yml
  - template: Security/Dependency-Scanning.gitlab-ci.yml
  - template: Security/Container-Scanning.gitlab-ci.yml
  - template: Security/Secret-Detection.gitlab-ci.yml
  - template: DAST.gitlab-ci.yml

variables:
  SAST_EXCLUDED_PATHS: "target, node_modules"
  CS_IMAGE: $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA    # image to scan
```

Results appear in:
- MR Security widget
- Security Dashboard (group/project level)
- Vulnerability Report

---

## Complete Spring Boot → GKE Pipeline

```yaml
# .gitlab-ci.yml
stages:
  - validate
  - test
  - build
  - scan
  - deploy-staging
  - verify
  - deploy-production

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2 -Xmx512m"
  IMAGE: "$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA"
  GKE_CLUSTER: my-cluster
  GKE_ZONE: europe-west1
  GKE_PROJECT: my-gcp-project

# ─── Shared base ───────────────────────────────────────────────────────────────

.maven-cache:
  cache:
    key:
      files:
        - pom.xml
    paths:
      - .m2/repository
    policy: pull

# ─── Validate ──────────────────────────────────────────────────────────────────

compile:
  extends: .maven-cache
  stage: validate
  image: maven:3.9-eclipse-temurin-21
  cache:
    policy: pull-push   # populate cache on validate stage
  script:
    - mvn compile checkstyle:check

# ─── Test ──────────────────────────────────────────────────────────────────────

unit-tests:
  extends: .maven-cache
  stage: test
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn test
  artifacts:
    reports:
      junit: target/surefire-reports/TEST-*.xml
      coverage_report:
        coverage_format: cobertura
        path: target/site/jacoco/cobertura.xml
    expire_in: 1 week

integration-tests:
  extends: .maven-cache
  stage: test
  image: maven:3.9-eclipse-temurin-21
  services:
    - postgres:16
    - redis:7
  variables:
    POSTGRES_DB: testdb
    POSTGRES_USER: test
    POSTGRES_PASSWORD: test
    SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/testdb
    SPRING_DATASOURCE_USERNAME: test
    SPRING_DATASOURCE_PASSWORD: test
  script:
    - mvn verify -P integration

# ─── Build ─────────────────────────────────────────────────────────────────────

build-jar:
  extends: .maven-cache
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn package -DskipTests
  artifacts:
    paths:
      - target/*.jar
    expire_in: 1 hour
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'

build-image:
  stage: build
  needs: [build-jar]
  image:
    name: gcr.io/kaniko-project/executor:v1.21.0-debug
    entrypoint: [""]
  script:
    - /kaniko/executor
      --context "$CI_PROJECT_DIR"
      --dockerfile "$CI_PROJECT_DIR/Dockerfile"
      --destination "$IMAGE"
      --cache=true
      --cache-repo "$CI_REGISTRY_IMAGE/cache"
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'

# ─── Scan ──────────────────────────────────────────────────────────────────────

trivy-scan:
  stage: scan
  needs: [build-image]
  image:
    name: aquasec/trivy:latest
    entrypoint: [""]
  before_script:
    - docker login -u $CI_REGISTRY_USER -p $CI_REGISTRY_PASSWORD $CI_REGISTRY
  script:
    - trivy image --exit-code 1 --severity HIGH,CRITICAL $IMAGE
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'

include:
  - template: Security/SAST.gitlab-ci.yml

# ─── Deploy Staging ────────────────────────────────────────────────────────────

deploy-staging:
  stage: deploy-staging
  needs: [trivy-scan]
  image: google/cloud-sdk:alpine
  before_script:
    - echo "$GCP_SA_KEY" | gcloud auth activate-service-account --key-file=-
    - gcloud container clusters get-credentials $GKE_CLUSTER --zone $GKE_ZONE --project $GKE_PROJECT
  script:
    - kubectl set image deployment/order-service app=$IMAGE -n staging
    - kubectl rollout status deployment/order-service -n staging --timeout=5m
  environment:
    name: staging
    url: https://staging.myapp.com
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'

# ─── Verify Staging ────────────────────────────────────────────────────────────

smoke-tests:
  stage: verify
  needs: [deploy-staging]
  image: curlimages/curl:latest
  script:
    - curl -f https://staging.myapp.com/actuator/health
    - curl -f https://staging.myapp.com/actuator/health/readiness
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'

# ─── Deploy Production ─────────────────────────────────────────────────────────

deploy-production:
  stage: deploy-production
  needs: [smoke-tests]
  image: google/cloud-sdk:alpine
  before_script:
    - echo "$GCP_SA_KEY" | gcloud auth activate-service-account --key-file=-
    - gcloud container clusters get-credentials $GKE_CLUSTER --zone $GKE_ZONE --project $GKE_PROJECT
  script:
    - kubectl set image deployment/order-service app=$IMAGE -n production
    - kubectl rollout status deployment/order-service -n production --timeout=10m
  environment:
    name: production
    url: https://myapp.com
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
      when: manual        # require approval
```

---

## GitLab vs GitHub Actions Comparison

| Feature | GitLab CI | GitHub Actions |
|---------|-----------|----------------|
| Config file | `.gitlab-ci.yml` | `.github/workflows/*.yml` |
| Runners | Self-hosted or GitLab shared | Self-hosted or GitHub-hosted |
| Artifact sharing | `artifacts:` | `actions/upload-artifact` |
| Job dependencies | `needs:` (DAG) | `needs:` |
| Reuse | `extends`, `include` | Reusable workflows, composite actions |
| Built-in scanning | Yes (Ultimate) | Via marketplace actions |
| Container registry | Built-in | GitHub Packages / GHCR |
| Environments | Built-in + approvals | Environments + protection rules |
| Scheduling | Built-in UI scheduler | `on: schedule: cron:` |
| Self-hosted | GitLab CE/EE | GitHub Enterprise Server |

---

## Interview Quick-Fire

**Q: What is the difference between `cache` and `artifacts` in GitLab CI?**
Artifacts are for passing files between jobs in the same pipeline — they're reliable and tracked. Cache is an optional performance optimization to reuse files (e.g., Maven dependencies) across separate pipeline runs — it's not guaranteed to be present and should never be used for critical file passing.

**Q: What does `needs:` do and how does it differ from stage ordering?**
`needs:` creates explicit job-level dependencies independent of stages, enabling DAG pipelines. A job with `needs:` can start as soon as its named dependencies complete — even if other jobs in the previous stage haven't finished. This parallelises the pipeline beyond stage boundaries.

**Q: What is the difference between a shared runner and a project runner?**
Shared runners are available to all projects on the GitLab instance (or GitLab.com), managed by the platform. Project runners are registered specifically for one project — useful when you need specific hardware, security isolation, or runner configuration not available on shared runners.

**Q: Why would you use Kaniko instead of Docker-in-Docker?**
Kaniko builds Docker images without a Docker daemon — no need for `--privileged` mode. DinD requires privileged containers, which is a security risk on shared runners. Kaniko executes as an unprivileged container, making it safer for multi-tenant environments.

**Q: How do you protect secrets in GitLab CI?**
Store secrets in **Settings → CI/CD → Variables**, mark them as **Protected** (only accessible on protected branches/tags) and **Masked** (hidden in job logs). Never hardcode secrets in `.gitlab-ci.yml`. For external secrets, use Vault integration or cloud provider secret managers (AWS Secrets Manager, GCP Secret Manager).

<RelatedTopics :topics="['/cicd/', '/cicd/github-actions', '/cicd/jenkins', '/docker/production', '/kubernetes/production']" />

[→ Back to CI/CD Overview](/cicd/)
