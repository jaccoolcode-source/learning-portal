---
title: Dockerfile
description: Writing efficient Dockerfiles for Java and Spring Boot — instructions, multi-stage builds, layer caching, build args, ENTRYPOINT vs CMD, and health checks
category: docker
pageClass: layout-docker
difficulty: intermediate
tags: [dockerfile, docker, multi-stage, layer-caching, java, spring-boot, healthcheck]
related:
  - /docker/index
  - /docker/production
  - /docker/compose
estimatedMinutes: 30
---

# Dockerfile

<DifficultyBadge level="intermediate" />

A Dockerfile is a text file containing instructions to build a Docker image. Writing it well determines image size, build speed, and runtime security.

---

## Instruction Reference

```dockerfile
# Base image
FROM eclipse-temurin:21-jre-alpine

# Set working directory (created if it doesn't exist)
WORKDIR /app

# Environment variable (available at build time AND runtime)
ENV JAVA_OPTS="-Xmx512m -Xms256m"

# Build argument (available at build time only, not persisted in image)
ARG JAR_FILE=target/myapp.jar

# Copy files (from build context → image filesystem)
COPY ${JAR_FILE} app.jar
COPY --chown=appuser:appuser src/ /app/src/

# Run command during build (creates a new layer)
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Expose documentation (doesn't actually open ports — just metadata)
EXPOSE 8080

# Volume mount point declaration (creates anonymous volume if not mounted)
VOLUME /app/logs

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8080/actuator/health || exit 1

# Default user
USER appuser

# Default command — can be overridden at docker run
CMD ["java", "-jar", "app.jar"]

# Entrypoint — fixed executable, CMD becomes default arguments
ENTRYPOINT ["java", "-jar", "app.jar"]
```

---

## ENTRYPOINT vs CMD

| | `ENTRYPOINT` | `CMD` |
|-|-------------|-------|
| Purpose | Fixed executable | Default arguments |
| Overridable? | Only with `--entrypoint` flag | Yes, by appending to `docker run` |
| Combined | `ENTRYPOINT` runs, `CMD` passed as args | — |

```dockerfile
# Pattern 1 — CMD only (common, simple)
CMD ["java", "-jar", "app.jar"]
# docker run myapp                    → java -jar app.jar
# docker run myapp /bin/sh            → /bin/sh  (replaces CMD entirely)

# Pattern 2 — ENTRYPOINT + CMD (exec wrapper pattern)
ENTRYPOINT ["java"]
CMD ["-jar", "app.jar"]
# docker run myapp                    → java -jar app.jar
# docker run myapp -jar other.jar     → java -jar other.jar

# Pattern 3 — shell script entrypoint (inject env vars, signal handling)
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["java", "-jar", "app.jar"]
```

::: tip Use exec form, not shell form
```dockerfile
# Exec form (recommended) — process gets PID 1, receives signals correctly
CMD ["java", "-jar", "app.jar"]

# Shell form — spawns /bin/sh -c, Java process is child of shell
# Signals (SIGTERM) won't reach Java → graceful shutdown broken
CMD java -jar app.jar
```
:::

---

## Layer Caching

Docker reuses cached layers until it finds a change. Everything after the first change is rebuilt.

```dockerfile
# BAD — COPY . invalidates cache on any file change,
# so Maven dependencies are re-downloaded every build
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY . .
RUN mvn package -DskipTests
CMD ["java", "-jar", "target/myapp.jar"]

# GOOD — copy pom.xml first, resolve dependencies (slow, cached)
# then copy source (fast rebuild when only code changed)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .                          # ← cached unless pom.xml changes
RUN mvn dependency:go-offline -B        # ← download deps once, cache layer
COPY src ./src                          # ← only invalidates cache on src change
RUN mvn package -DskipTests
```

**Caching rules:**
1. Cache is invalidated at the first changed instruction and all subsequent layers rebuild
2. `COPY` and `ADD` check file checksums — any changed file invalidates the layer
3. `RUN` caches based on the instruction string — code change doesn't invalidate it (only the instruction text)

---

## Multi-Stage Builds

Multi-stage builds separate the build environment from the runtime image, producing a smaller, cleaner final image.

```dockerfile
# ─── Stage 1: Build ───────────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app

# Cache dependency resolution separately from source compilation
COPY pom.xml .
RUN mvn dependency:go-offline -B

COPY src ./src
RUN mvn package -DskipTests

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

# Security: run as non-root
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

# Copy only the built artifact from the build stage
COPY --from=build --chown=appuser:appgroup /app/target/myapp.jar app.jar

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1

USER appuser

ENTRYPOINT ["java", "-jar", "app.jar"]
```

**Result:**
```
maven:3.9-eclipse-temurin-21  → ~500 MB (build stage, discarded)
eclipse-temurin:21-jre-alpine → ~85 MB (runtime only)
```

---

## Spring Boot Layered JAR (Optimised Caching)

Spring Boot 2.3+ supports layered JARs — splits the JAR into layers so dependencies are cached separately from application code.

```dockerfile
# ─── Stage 1: Extract layers ──────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS builder
WORKDIR /app
COPY target/myapp.jar app.jar
# Extract layered JAR into separate directories
RUN java -Djarmode=layertools -jar app.jar extract

# ─── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
WORKDIR /app

# Copy layers in order of change frequency (least→most changed)
COPY --from=builder /app/dependencies/          ./
COPY --from=builder /app/spring-boot-loader/    ./
COPY --from=builder /app/snapshot-dependencies/ ./
COPY --from=builder /app/application/           ./

EXPOSE 8080
USER appuser

ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

```bash
# Inspect layers in a Spring Boot JAR
java -Djarmode=layertools -jar target/myapp.jar list
# dependencies
# spring-boot-loader
# snapshot-dependencies
# application
```

**Why this matters:** When you change only application code, only the `application` layer (a few KB) is pushed/pulled — not the full 80 MB dependency layer.

---

## Buildpacks (No Dockerfile)

Spring Boot's `spring-boot:build-image` uses Buildpacks — no Dockerfile needed.

```bash
./mvnw spring-boot:build-image \
  -Dspring-boot.build-image.imageName=myapp:1.0.0

# With custom builder (Paketo)
./mvnw spring-boot:build-image \
  -Dspring-boot.build-image.imageName=myapp:1.0.0 \
  -Dspring-boot.build-image.builder=paketobuildpacks/builder:base
```

Advantages: automatic security updates, non-root by default, optimised layers. Disadvantage: less control than Dockerfile, slower first build.

---

## Build Arguments

```dockerfile
ARG APP_VERSION=dev
ARG JAR_FILE=target/myapp.jar
ARG BUILD_DATE

LABEL version="${APP_VERSION}"
LABEL build-date="${BUILD_DATE}"

COPY ${JAR_FILE} app.jar
```

```bash
# Pass at build time
docker build \
  --build-arg APP_VERSION=1.2.3 \
  --build-arg JAR_FILE=target/myapp-1.2.3.jar \
  --build-arg BUILD_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ) \
  -t myapp:1.2.3 .
```

::: danger ARG vs ENV for Secrets
Never pass secrets via `ARG` or `ENV` — they are visible in `docker history` and image metadata. Use runtime secrets injection instead (Docker secrets, Kubernetes secrets, env at runtime).
:::

---

## Health Checks

```dockerfile
# HTTP health check (Spring Boot Actuator)
HEALTHCHECK \
  --interval=30s \      # check every 30s
  --timeout=5s \        # fail if no response in 5s
  --start-period=40s \  # don't fail during initial startup window
  --retries=3 \         # mark unhealthy after 3 consecutive failures
  CMD curl -f http://localhost:8080/actuator/health || exit 1

# wget alternative (smaller footprint than curl)
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:8080/actuator/health || exit 1

# TCP port check (no HTTP client needed)
HEALTHCHECK --interval=10s --timeout=3s \
  CMD nc -z localhost 8080 || exit 1
```

Health check states: `starting` → `healthy` / `unhealthy`. Docker Compose and Swarm use this; Kubernetes uses its own probes (liveness/readiness) instead.

---

## JVM Flags in Docker

Java pre-JDK 10 didn't respect container memory limits — it read host memory and set heap accordingly, causing OOMKill.

```dockerfile
# JDK 11+ — container-aware by default
# MaxRAMPercentage: set heap to 75% of container memory limit
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 \
  -XX:InitialRAMPercentage=50 \
  -XX:+UseContainerSupport \
  -XX:+ExitOnOutOfMemoryError \
  -Djava.security.egd=file:/dev/./urandom"

# For explicit limits (when you know the container size)
ENV JAVA_TOOL_OPTIONS="-Xmx512m -Xms256m -XX:+ExitOnOutOfMemoryError"
```

```bash
# Verify container-aware JVM settings
docker run --memory=1g myapp java -XX:+PrintFlagsFinal -version 2>&1 | grep -i heap
```

---

## Common Base Images for Java

| Image | Size | Notes |
|-------|------|-------|
| `eclipse-temurin:21-jre` | ~220 MB | Debian-based, full JRE |
| `eclipse-temurin:21-jre-alpine` | ~85 MB | Alpine-based, smaller |
| `eclipse-temurin:21-jre-jammy` | ~220 MB | Ubuntu 22.04 |
| `gcr.io/distroless/java21` | ~75 MB | No shell, minimal attack surface |
| `amazoncorretto:21-alpine` | ~90 MB | AWS Corretto on Alpine |
| `azul/zulu-openjdk-alpine:21-jre` | ~80 MB | Zulu JRE on Alpine |

::: tip For Production
Use `eclipse-temurin` (Adoptium) or `amazoncorretto` — both are well-maintained, enterprise-grade. Prefer `-alpine` or `distroless` for smaller images and reduced attack surface.
:::

---

## Interview Quick-Fire

**Q: What's the difference between `CMD` and `ENTRYPOINT`?**
`ENTRYPOINT` defines the fixed executable — it can only be overridden with `--entrypoint`. `CMD` provides default arguments that can be replaced by anything appended to `docker run`. Combined: `ENTRYPOINT` is the process, `CMD` is its default args.

**Q: Why use multi-stage builds?**
Build tools (Maven, JDK compiler) are large and not needed at runtime. Multi-stage builds compile in a full JDK image and copy only the JAR to a lean JRE image, reducing final image size by 60–80% and attack surface significantly.

**Q: Why does layer order matter?**
Layers are cached. Docker rebuilds from the first changed layer downward. Putting frequently-changing layers (source code) after rarely-changing ones (dependencies) maximises cache hits — most builds only rebuild the last 1–2 layers.

**Q: What is `JAVA_TOOL_OPTIONS` and why use `MaxRAMPercentage`?**
`JAVA_TOOL_OPTIONS` sets JVM flags picked up automatically. `MaxRAMPercentage` tells the JVM to use a percentage of the container memory limit for heap, instead of reading host memory. Without this, a 512 MB container with a 16 GB host may set an 8 GB heap and immediately get OOMKilled.

<RelatedTopics :topics="['/docker/production', '/docker/compose', '/docker/index']" />

[→ Back to Docker Overview](/docker/)
