---
title: Production Patterns
description: Docker production best practices — image size optimisation, non-root users, .dockerignore, distroless images, secrets management, image scanning, and CI/CD integration
category: docker
pageClass: layout-docker
difficulty: advanced
tags: [docker, production, security, distroless, dockerignore, image-scanning, secrets, non-root]
related:
  - /docker/dockerfile
  - /security/secure-coding
  - /gcp/compute
estimatedMinutes: 25
---

# Production Patterns

<DifficultyBadge level="advanced" />

Running containers in production requires more than `docker run`. This page covers the practices that separate a quick prototype from a production-grade container.

---

## .dockerignore

`.dockerignore` excludes files from the build context sent to the Docker daemon. A large context means a slow build — even if files are never `COPY`'d.

```dockerignore
# Version control
.git
.gitignore

# Build output (should be built inside Docker, not outside)
target/
build/
out/

# IDE files
.idea/
*.iml
.vscode/
*.code-workspace

# OS files
.DS_Store
Thumbs.db

# Docker files (no need to copy these into the image)
Dockerfile
Dockerfile.*
docker-compose*.yml
.dockerignore

# Secrets and env files — NEVER send to Docker daemon
.env
.env.*
*.key
*.pem
*.p12
secrets/

# Logs and temp files
*.log
logs/
tmp/

# Node (if mixed project)
node_modules/
npm-debug.log
```

::: danger
Even if a file is not `COPY`'d, it's still sent in the build context if not in `.dockerignore`. Secrets in `.env` files could be exposed via `docker history` if accidentally `COPY`'d, or logged by CI systems that print context size.
:::

---

## Non-Root User

By default, containers run as root. A compromised container running as root can escalate to host root in some configurations.

```dockerfile
FROM eclipse-temurin:21-jre-alpine

# Create a system group + user with no home directory and no shell
RUN addgroup --system --gid 1001 appgroup && \
    adduser  --system --uid 1001 --ingroup appgroup \
             --no-create-home --shell /sbin/nologin appuser

WORKDIR /app

# Set ownership before switching user
COPY --chown=appuser:appgroup target/myapp.jar app.jar

# Create directories the app needs to write to
RUN mkdir -p /app/logs /app/tmp && \
    chown -R appuser:appgroup /app/logs /app/tmp

EXPOSE 8080

USER appuser   # switch to non-root for runtime

ENTRYPOINT ["java", "-jar", "app.jar"]
```

```bash
# Verify the container runs as non-root
docker run --rm myapp whoami   # → appuser

# Override user at runtime if needed (e.g., to fix permissions)
docker run --user root myapp chown -R appuser /app/data
```

For Kubernetes, enforce non-root via `securityContext`:

```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop: ["ALL"]
```

---

## Image Size Optimisation

| Technique | Impact |
|-----------|--------|
| Multi-stage build | Biggest — eliminates build tools from final image |
| Alpine base image | ~80–90 MB → ~20–40 MB reduction vs Debian |
| Distroless base image | Eliminates shell, package manager, OS utilities |
| Combine `RUN` commands | Fewer layers, smaller image |
| Clean package manager cache | Prevents cached packages bloating image |
| `.dockerignore` | Faster builds, nothing extra copied in |
| Spring Boot layered JAR | Cache-efficient layers for CI/CD |

```dockerfile
# Combine RUN commands — each RUN creates a layer
# BAD — 3 layers, apt cache left in layer 1
RUN apt-get update
RUN apt-get install -y curl wget
RUN rm -rf /var/lib/apt/lists/*

# GOOD — 1 layer, cache cleaned in same command
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl wget && \
    rm -rf /var/lib/apt/lists/*
```

```bash
# Measure image size
docker image ls myapp
docker history myapp:1.0    # per-layer sizes

# Dive — interactive image layer explorer
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive myapp:1.0
```

---

## Distroless Images

Distroless images contain only the runtime (JRE) — no shell, no package manager, no OS utilities. Smaller attack surface and better security posture.

```dockerfile
FROM eclipse-temurin:21-jre-alpine AS builder
WORKDIR /app
COPY target/myapp.jar app.jar
RUN java -Djarmode=layertools -jar app.jar extract

# Distroless Java runtime — no shell available
FROM gcr.io/distroless/java21-debian12:nonroot AS runtime

WORKDIR /app
COPY --from=builder /app/dependencies/          ./
COPY --from=builder /app/spring-boot-loader/    ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/           ./

EXPOSE 8080

ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
# Note: USER already set to nonroot by the distroless image
```

```bash
# You cannot exec into a distroless container with /bin/sh — no shell exists
docker exec -it myapp /bin/sh   # fails

# Debug distroless with debug tag (includes busybox shell)
docker run --rm -it gcr.io/distroless/java21:debug /busybox/sh
```

### Distroless Variants

| Image | Description |
|-------|-------------|
| `gcr.io/distroless/java21-debian12` | Runs as root |
| `gcr.io/distroless/java21-debian12:nonroot` | Runs as uid 65532 |
| `gcr.io/distroless/java21-debian12:debug` | Includes busybox shell for debugging |
| `gcr.io/distroless/java21-debian12:debug-nonroot` | Debug + non-root |

---

## Secrets Management

Never bake secrets into images. These approaches all appear in `docker history`:

```dockerfile
# WRONG — secret visible in image history
ENV DB_PASSWORD=supersecret
ARG DB_PASSWORD=supersecret
RUN curl -H "Authorization: Bearer ${TOKEN}" https://vault/secret
```

### Runtime Environment Variables

```bash
# Inject at runtime — not stored in image
docker run -e DB_PASSWORD="${DB_PASSWORD}" myapp

# From a file (file not committed to git)
docker run --env-file .env.prod myapp
```

### Docker Secrets (Swarm / Compose)

```yaml
# compose.yml
services:
  app:
    image: myapp:1.0
    secrets:
      - db_password
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password  # app reads from file

secrets:
  db_password:
    file: ./secrets/db_password.txt   # local dev
    # OR in Swarm:
    # external: true  # managed by docker secret create
```

```java
// Read secret from file (Docker mounts secrets at /run/secrets/<name>)
String passwordFile = System.getenv("DB_PASSWORD_FILE");
if (passwordFile != null) {
    String password = Files.readString(Path.of(passwordFile)).trim();
}
```

### BuildKit Secret (Build-time secrets, not persisted in image)

```dockerfile
# syntax=docker/dockerfile:1
FROM maven:3.9-eclipse-temurin-21 AS build

# Secret mounted at /run/secrets/maven_settings — not in any layer
RUN --mount=type=secret,id=maven_settings \
    mvn package -s /run/secrets/maven_settings -DskipTests
```

```bash
# Pass secret at build time
DOCKER_BUILDKIT=1 docker build \
  --secret id=maven_settings,src=./settings.xml \
  -t myapp:1.0 .
```

---

## Image Scanning

Scan images for known CVEs before pushing to a registry.

### Trivy (most popular, free)

```bash
# Scan local image
trivy image myapp:1.0

# Fail build on high/critical CVEs (for CI)
trivy image --exit-code 1 --severity HIGH,CRITICAL myapp:1.0

# Scan filesystem (e.g., in CI before build)
trivy fs --security-checks vuln,config .

# JSON output for integration
trivy image -f json -o results.json myapp:1.0
```

### Docker Scout (built into Docker Desktop)

```bash
docker scout cves myapp:1.0
docker scout recommendations myapp:1.0
```

### In CI (GitHub Actions)

```yaml
- name: Scan image
  uses: aquasecurity/trivy-action@master
  with:
    image-ref: myapp:${{ github.sha }}
    format: sarif
    output: trivy-results.sarif
    severity: HIGH,CRITICAL
    exit-code: 1

- name: Upload scan results to GitHub Security tab
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: trivy-results.sarif
```

---

## CI/CD Pipeline Pattern

```yaml
# GitHub Actions — build, scan, push to Artifact Registry
name: Build and Push

on:
  push:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up JDK 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Maven packages
        uses: actions/cache@v4
        with:
          path: ~/.m2
          key: ${{ runner.os }}-m2-${{ hashFiles('**/pom.xml') }}

      - name: Build JAR
        run: mvn package -DskipTests

      - name: Authenticate to GCP
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.WIF_SA }}

      - name: Configure Docker auth
        run: gcloud auth configure-docker europe-docker.pkg.dev

      - name: Build Docker image
        run: |
          docker build \
            --build-arg APP_VERSION=${{ github.sha }} \
            -t europe-docker.pkg.dev/${{ vars.GCP_PROJECT }}/myrepo/myapp:${{ github.sha }} \
            -t europe-docker.pkg.dev/${{ vars.GCP_PROJECT }}/myrepo/myapp:latest \
            .

      - name: Scan image for CVEs
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: europe-docker.pkg.dev/${{ vars.GCP_PROJECT }}/myrepo/myapp:${{ github.sha }}
          severity: HIGH,CRITICAL
          exit-code: 1

      - name: Push image
        run: |
          docker push europe-docker.pkg.dev/${{ vars.GCP_PROJECT }}/myrepo/myapp:${{ github.sha }}
          docker push europe-docker.pkg.dev/${{ vars.GCP_PROJECT }}/myrepo/myapp:latest
```

---

## Resource Limits

```bash
# Limit CPU and memory at runtime
docker run \
  --memory=1g \           # max RAM (OOMKill if exceeded)
  --memory-reservation=512m \  # soft limit (scheduling hint)
  --cpus=1.5 \            # max 1.5 CPU cores
  --pids-limit=100 \      # max processes (prevents fork bombs)
  myapp
```

In Docker Compose:

```yaml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '1.5'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

::: tip Memory and JVM
Set `--memory` to the container limit, then configure `MaxRAMPercentage` so the JVM's heap stays within the container's memory. Without this, the JVM reads host memory, sets a large heap, and gets OOMKilled.
```
-XX:MaxRAMPercentage=75 → 75% of 1G limit = 768 MB heap
```
:::

---

## Read-Only Root Filesystem

Preventing writes to the container filesystem limits what an attacker can do if they compromise the container.

```bash
docker run --read-only \
  --tmpfs /tmp \            # app can write temp files here
  -v app-logs:/app/logs \  # writable named volume for logs
  myapp
```

```yaml
# Kubernetes securityContext
securityContext:
  readOnlyRootFilesystem: true
```

The app must write only to explicitly mounted volumes or tmpfs. This is easiest to enforce when you control the app — ensure log paths, temp dirs, and caches are all configurable mount points.

---

## Production Checklist

| Area | Check |
|------|-------|
| **Base image** | Pinned to specific digest, not just tag |
| **Non-root** | `USER appuser` in Dockerfile |
| **Secrets** | No secrets in image layers or history |
| **Size** | Multi-stage build, Alpine or distroless base |
| **Scanning** | CVE scan in CI, fail on HIGH/CRITICAL |
| **.dockerignore** | Excludes `.env`, `target/`, `.git`, secrets |
| **Resource limits** | `--memory` and `--cpus` set |
| **Health check** | `HEALTHCHECK` in Dockerfile |
| **Read-only FS** | `readOnlyRootFilesystem: true` in K8s |
| **Signal handling** | Exec form CMD/ENTRYPOINT (not shell form) |
| **JVM container-awareness** | `MaxRAMPercentage` or explicit `-Xmx` |
| **Tag strategy** | SHA or semver tag, never rely on `latest` |
| **Logging** | Log to stdout/stderr, not files (let orchestrator handle) |

---

## Interview Quick-Fire

**Q: Why run containers as non-root?**
A compromised process running as root inside a container may be able to escape the container or access host resources depending on kernel version and configuration. Non-root minimises the blast radius — the attacker's process has no elevated capabilities.

**Q: What's the difference between distroless and Alpine images?**
Alpine is a minimal Linux distribution (~5 MB) — it has a shell (`/bin/sh`), package manager (`apk`), and basic OS utilities, just fewer than Debian. Distroless has none of that — just the runtime (JRE) and its direct dependencies. Distroless is smaller and has a smaller attack surface but is harder to debug.

**Q: How do you pass a secret to a container without putting it in the image?**
Inject via `-e` at runtime (from a secure CI secret store), use `--env-file` with a gitignored file locally, or use Docker secrets (mounted at `/run/secrets/`). For Kubernetes, use a Secret object mounted as a volume or env var. Never use `ARG` or `ENV` for secrets — they persist in image metadata.

**Q: What does `--read-only` do and what do you need to make it work?**
It mounts the container's root filesystem as read-only. The app can't write to the container layer. You need to explicitly provide writable paths via tmpfs (`--tmpfs /tmp`) or named volumes for any paths the app writes to (logs, temp files, caches).

**Q: Why does the CMD exec form matter for signal handling?**
Shell form (`CMD java -jar app.jar`) runs `/bin/sh -c java -jar app.jar`. Java is a child of the shell — PID 1 is the shell, not Java. When Docker sends `SIGTERM` for graceful shutdown, the shell may not forward it to Java, preventing graceful shutdown. Exec form (`CMD ["java", "-jar", "app.jar"]`) makes Java PID 1, so it receives signals directly.

<RelatedTopics :topics="['/docker/dockerfile', '/docker/networking-volumes', '/security/secure-coding']" />

[→ Back to Docker Overview](/docker/)
