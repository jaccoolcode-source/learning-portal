---
title: Docker
description: Docker fundamentals — images, containers, layers, registry, and core CLI commands every developer needs day-to-day
category: docker
pageClass: layout-docker
difficulty: intermediate
tags: [docker, containers, images, registry, cli]
related:
  - /docker/dockerfile
  - /docker/compose
  - /gcp/compute
estimatedMinutes: 20
---

# Docker

<DifficultyBadge level="intermediate" />

Docker packages your application and its dependencies into a portable, self-contained unit called a **container**. The same image runs identically on a developer laptop, CI server, and production cluster.

---

## Core Concepts

```
Dockerfile  ──build──▶  Image  ──run──▶  Container
                          │
                        push/pull
                          │
                       Registry
                   (Docker Hub, GCR, ECR,
                    Artifact Registry...)
```

| Concept | Description |
|---------|-------------|
| **Image** | Read-only template built from a Dockerfile. Composed of layers. |
| **Container** | A running instance of an image. Isolated process with its own filesystem, network, and PID space. |
| **Layer** | Each Dockerfile instruction adds a read-only layer. Layers are cached and shared between images. |
| **Registry** | Storage for images. Docker Hub is the default public registry. |
| **Tag** | Version label for an image (`myapp:1.2.3`, `myapp:latest`). |
| **Volume** | Persistent storage mounted into containers. Survives container restarts. |
| **Network** | Virtual network connecting containers. |

---

## How Layers Work

```
Image: my-java-app:1.0

Layer 5: COPY app.jar /app.jar          ← your code (changes often)
Layer 4: RUN mvn dependency:resolve     ← dependencies (changes less often)
Layer 3: COPY pom.xml .                 ← project descriptor
Layer 2: RUN apt-get install -y curl    ← tools
Layer 1: FROM eclipse-temurin:21-jre    ← base image (rarely changes)

Each layer is content-addressed (SHA256). If a layer didn't change,
Docker reuses the cached version — no rebuild, no re-download.
```

---

## Essential CLI Commands

### Images

```bash
# Build an image from Dockerfile in current directory
docker build -t myapp:1.0 .
docker build -t myapp:1.0 -f path/to/Dockerfile .

# Build with build arguments
docker build --build-arg JAR_FILE=target/myapp.jar -t myapp:1.0 .

# List local images
docker images
docker image ls

# Remove image
docker rmi myapp:1.0
docker image prune        # remove all dangling (untagged) images
docker image prune -a     # remove all unused images

# Pull from registry
docker pull eclipse-temurin:21-jre

# Push to registry
docker tag myapp:1.0 myregistry.io/myapp:1.0
docker push myregistry.io/myapp:1.0

# Inspect image layers
docker history myapp:1.0
docker inspect myapp:1.0
```

### Containers

```bash
# Run a container
docker run myapp:1.0

# Run detached (background)
docker run -d myapp:1.0

# Run with name, port mapping, env var, volume
docker run -d \
  --name my-app \
  -p 8080:8080 \                          # host:container
  -e SPRING_PROFILES_ACTIVE=prod \
  -e DB_PASSWORD=secret \
  -v /host/data:/app/data \               # bind mount
  -v mydata:/var/lib/data \               # named volume
  --network my-network \
  --restart unless-stopped \
  myapp:1.0

# List running containers
docker ps
docker ps -a    # all including stopped

# Stop / start / restart
docker stop my-app
docker start my-app
docker restart my-app

# Remove container
docker rm my-app
docker rm -f my-app    # force (stops first)

# Remove all stopped containers
docker container prune

# Logs
docker logs my-app
docker logs -f my-app          # follow
docker logs --tail 100 my-app  # last 100 lines
docker logs --since 10m my-app # last 10 minutes

# Execute command in running container
docker exec -it my-app /bin/bash
docker exec -it my-app /bin/sh    # if bash not available
docker exec my-app java -version

# Copy files to/from container
docker cp my-app:/app/logs/app.log ./app.log
docker cp ./config.yml my-app:/app/config.yml

# Resource stats
docker stats
docker stats my-app

# Inspect running container (IP, mounts, env, config)
docker inspect my-app

# See processes inside container
docker top my-app
```

### System

```bash
# Disk usage
docker system df

# Remove everything unused (images, containers, networks, build cache)
docker system prune
docker system prune -a --volumes  # also remove volumes and all images
```

---

## Port Mapping

```bash
# -p hostPort:containerPort
docker run -p 8080:8080 myapp     # localhost:8080 → container:8080
docker run -p 9090:8080 myapp     # localhost:9090 → container:8080
docker run -p 127.0.0.1:8080:8080 myapp  # bind to loopback only
docker run -P myapp               # auto-assign random host ports for all EXPOSE'd ports

# Check port mappings
docker port my-app
```

---

## Environment Variables

```bash
# Inline
docker run -e DB_HOST=postgres -e DB_PORT=5432 myapp

# From a file
docker run --env-file .env myapp

# .env file format:
DB_HOST=postgres
DB_PORT=5432
DB_PASSWORD=secret
SPRING_PROFILES_ACTIVE=prod
```

---

## Image Naming Convention

```
[registry/][namespace/]name[:tag][@digest]

Examples:
  myapp                                         → Docker Hub library/myapp:latest
  myorg/myapp:1.2.3                             → Docker Hub myorg/myapp:1.2.3
  ghcr.io/myorg/myapp:1.2.3                     → GitHub Container Registry
  europe-docker.pkg.dev/proj/repo/myapp:1.2.3   → GCP Artifact Registry
  123456789.dkr.ecr.eu-west-1.amazonaws.com/myapp:1.2.3  → AWS ECR
```

::: tip Tag Strategy
Never rely on `latest` in production — it changes silently. Tag with:
- Semantic version: `myapp:1.2.3`
- Git SHA: `myapp:a1b2c3d`
- Both: `myapp:1.2.3-a1b2c3d`
:::

---

## What's Covered in This Section

| Page | Contents |
|------|----------|
| [Dockerfile](/docker/dockerfile) | Multi-stage builds, layer caching, Java/Spring Boot Dockerfiles, health checks |
| [Networking & Volumes](/docker/networking-volumes) | Bridge/host/overlay networks, named volumes, bind mounts, Docker DNS |
| [Docker Compose](/docker/compose) | Multi-container stacks, depends_on, healthchecks, profiles, env config |
| [Production Patterns](/docker/production) | Image optimisation, non-root user, `.dockerignore`, distroless, secrets, scanning |

<RelatedTopics :topics="['/docker/dockerfile', '/docker/compose', '/gcp/compute']" />
