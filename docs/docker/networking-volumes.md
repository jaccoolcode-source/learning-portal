---
title: Networking & Volumes
description: Docker networking — bridge, host, overlay, none networks, container DNS, port publishing — and volumes — named volumes, bind mounts, tmpfs, lifecycle management
category: docker
pageClass: layout-docker
difficulty: intermediate
tags: [docker, networking, volumes, bridge, overlay, bind-mount, named-volume, dns]
related:
  - /docker/compose
  - /docker/index
estimatedMinutes: 25
---

# Networking & Volumes

<DifficultyBadge level="intermediate" />

Understanding Docker networking and storage is essential for connecting containers together and persisting data correctly. These are the two areas most developers get wrong first.

---

## Networking

### Network Drivers

| Driver | Description | Use Case |
|--------|-------------|----------|
| **bridge** | Software bridge on the host. Default for standalone containers. | Multi-container on one host |
| **host** | Container shares host's network namespace. No isolation. | Maximum performance, port conflicts possible |
| **overlay** | Multi-host network (Docker Swarm / cross-host). Needs key-value store. | Distributed clusters |
| **none** | No networking at all. Completely isolated. | Security-critical batch jobs |
| **macvlan** | Container gets its own MAC address on the LAN. | Legacy apps expecting physical network |

---

### Bridge Networks

The default driver. Docker creates a `docker0` virtual bridge; containers get a private IP in `172.17.0.0/16`.

```bash
# Default bridge network (docker0) — containers can only talk by IP, no DNS
docker run -d --name app1 myapp
docker run -d --name app2 myapp
# app2 cannot reach app1 by name on the default bridge

# ─── User-defined bridge network (recommended) ────────────────────────────────
# Containers on the same user-defined bridge can reach each other by container name
docker network create my-network

docker run -d --name postgres --network my-network postgres:16
docker run -d --name my-app   --network my-network \
  -e DB_HOST=postgres \   # ← resolve by container name
  myapp:1.0

# my-app can connect to postgres:5432 — Docker's embedded DNS resolves "postgres"
```

::: tip Always Use User-Defined Bridge Networks
The default `bridge` network has no automatic DNS. User-defined networks give you container name resolution, better isolation, and the ability to connect/disconnect containers at runtime.
:::

### Network Commands

```bash
# Create
docker network create my-network
docker network create --driver bridge --subnet 172.20.0.0/16 my-network

# List
docker network ls

# Inspect (shows connected containers, subnet, gateway)
docker network inspect my-network

# Connect a running container to a network
docker network connect my-network my-container

# Disconnect
docker network disconnect my-network my-container

# Remove
docker network rm my-network
docker network prune    # remove all unused networks
```

---

### Container DNS

Docker runs an embedded DNS server at `127.0.0.11` inside every container on a user-defined network.

```
Container: my-app
  DB_HOST=postgres
  DB_PORT=5432

  postgres → 127.0.0.11 (Docker DNS) → 172.20.0.3 (postgres container IP)
```

**What Docker DNS resolves:**
- Container names: `postgres`, `redis`, `kafka`
- Service names in Compose: `db`, `cache`, `broker`
- Network aliases: `docker run --network-alias db mycontainer`

```bash
# Verify DNS resolution from inside a container
docker exec -it my-app nslookup postgres
docker exec -it my-app curl http://backend-service:8081/health
```

---

### Host Network

```bash
# Container uses host's network stack directly — no NAT, no port mapping needed
docker run --network host myapp

# my-app listens on :8080 → directly accessible at host:8080
# Cannot run two containers both using host network and same port
```

Use for: performance-critical apps where NAT overhead matters, or apps that need to bind to specific host interfaces.

---

### Port Publishing

```bash
# Map host port → container port
docker run -p 8080:8080 myapp      # all interfaces
docker run -p 127.0.0.1:8080:8080 myapp  # loopback only (safer for dev)
docker run -p 9090:8080 myapp      # remap: host:9090 → container:8080

# Auto-assign random host port for each EXPOSE'd port
docker run -P myapp
docker port myapp   # see mappings
```

---

### Connecting Containers — Patterns

```bash
# Pattern 1: Same user-defined network (most common)
docker network create app-net
docker run -d --name redis   --network app-net redis:7
docker run -d --name my-app  --network app-net -e REDIS_HOST=redis myapp

# Pattern 2: Multiple networks (isolate traffic)
docker network create frontend-net
docker network create backend-net

docker run -d --name nginx   --network frontend-net nginx
docker run -d --name my-app  --network frontend-net --network backend-net myapp
docker run -d --name postgres --network backend-net postgres:16
# nginx ↔ my-app (frontend-net) ✓
# my-app ↔ postgres (backend-net) ✓
# nginx ↔ postgres ✗ (different networks, isolated)
```

---

## Volumes

Containers are ephemeral — their filesystem is destroyed when the container is removed. Volumes provide persistent storage.

### Volume Types

| Type | Syntax | Managed by | Use Case |
|------|--------|-----------|----------|
| **Named volume** | `-v mydata:/var/lib/data` | Docker | Databases, persistent app state |
| **Bind mount** | `-v /host/path:/container/path` | Host OS | Dev: live code reload, config injection |
| **tmpfs** | `--tmpfs /tmp` | Memory (RAM) | Ephemeral scratch space, secrets |
| **Anonymous volume** | `-v /container/path` | Docker (unnamed) | Temporary data, avoid writing to container layer |

---

### Named Volumes

```bash
# Create
docker volume create mydata

# Use
docker run -d \
  -v mydata:/var/lib/postgresql/data \   # named volume
  --name postgres \
  postgres:16

# List
docker volume ls

# Inspect (shows mount point on host, usually /var/lib/docker/volumes/)
docker volume inspect mydata

# Remove
docker volume rm mydata
docker volume prune    # remove all unused volumes (careful!)
```

Named volumes:
- Survive container removal (`docker rm postgres` keeps the volume)
- Are managed by Docker (`/var/lib/docker/volumes/mydata/_data` on Linux)
- Portable: can be backed up, restored, migrated

```bash
# Backup a named volume
docker run --rm \
  -v mydata:/source:ro \
  -v $(pwd):/backup \
  alpine tar czf /backup/mydata-backup.tar.gz -C /source .

# Restore
docker run --rm \
  -v mydata:/target \
  -v $(pwd):/backup \
  alpine tar xzf /backup/mydata-backup.tar.gz -C /target
```

---

### Bind Mounts

```bash
# Mount host directory into container
docker run -d \
  -v $(pwd)/config:/app/config:ro \    # read-only bind mount
  -v $(pwd)/src:/app/src \             # read-write (live reload)
  myapp

# Absolute path required (or $(pwd))
docker run -v /home/user/logs:/app/logs myapp
```

**Use cases:**
- **Local development**: mount source code so changes reflect without rebuild
- **Config injection**: mount production config files at startup
- **Log collection**: mount a host directory to access container logs directly

::: warning Bind Mounts in Production
Bind mounts couple containers to the host filesystem layout. In production, prefer named volumes or inject config via environment variables / secrets.
:::

---

### tmpfs Mounts

```bash
# Mount RAM filesystem — data never written to disk
docker run --tmpfs /tmp:size=64m,mode=1777 myapp

# Use cases:
# - Sensitive temporary files (decrypted secrets, session tokens)
# - High-speed scratch space for processing
# - Avoiding writes to container layer (performance)
```

---

### Volume in Dockerfile

```dockerfile
VOLUME /app/logs
VOLUME /var/lib/data
```

Declaring `VOLUME` in Dockerfile creates an anonymous volume automatically if the user doesn't specify one at `docker run`. This ensures the directory is not written to the container's writable layer (which is slow and lost on removal).

::: tip
Prefer explicit named volumes in `docker run` / Compose over Dockerfile `VOLUME` — you get control and easy cleanup.
:::

---

### Volume Permissions

```dockerfile
# Ensure non-root user can write to the volume mount point
RUN mkdir -p /app/data && chown appuser:appgroup /app/data
VOLUME /app/data
USER appuser
```

```bash
# Fix ownership at runtime (if volume pre-populated with wrong owner)
docker run --user root myapp chown -R appuser:appgroup /app/data
```

---

## Common Patterns

### Database with Named Volume

```bash
docker run -d \
  --name postgres \
  --network app-net \
  -v postgres-data:/var/lib/postgresql/data \
  -e POSTGRES_DB=mydb \
  -e POSTGRES_USER=myuser \
  -e POSTGRES_PASSWORD=secret \
  postgres:16
```

### App + Sidecar Sharing a Volume

```bash
docker volume create shared-logs

docker run -d --name my-app \
  -v shared-logs:/app/logs myapp

docker run -d --name log-shipper \
  -v shared-logs:/logs:ro \   # read-only — sidecar reads, doesn't write
  log-shipper-image
```

### Dev: Live Reload with Bind Mount

```bash
docker run -d \
  --name dev-app \
  -v $(pwd)/src:/app/src \          # source on host → inside container
  -v $(pwd)/target:/app/target \    # build output back to host
  -p 8080:8080 \
  -p 5005:5005 \                    # remote debug port
  -e SPRING_DEVTOOLS_RESTART_ENABLED=true \
  myapp-dev:latest
```

---

## Interview Quick-Fire

**Q: What's the difference between a bind mount and a named volume?**
A bind mount maps a specific host path into the container — you control the location. A named volume is managed by Docker — it has no direct host path coupling, is portable, and is the preferred way to persist container data in production.

**Q: Why can't containers on the default bridge network reach each other by name?**
The default bridge network doesn't have an embedded DNS server. User-defined bridge networks do — Docker automatically resolves container names and service names to their IP addresses.

**Q: When would you use a tmpfs mount?**
When you need fast, ephemeral storage that must never hit disk — processing decrypted secrets, session tokens, or high-speed temporary files. Data in tmpfs lives in RAM and is lost when the container stops.

**Q: What happens to a named volume when you `docker rm` a container?**
The volume is not removed — it persists until explicitly deleted with `docker volume rm`. This is intentional so database data survives container recreation.

**Q: What does `--network host` do and when is it useful?**
The container shares the host's network namespace — no virtual bridge, no NAT, no port mapping. The container's process binds directly to host ports. Useful for maximum network performance or when the app needs access to host network interfaces. The downside is no isolation — port conflicts are possible.

<RelatedTopics :topics="['/docker/compose', '/docker/dockerfile', '/docker/index']" />

[→ Back to Docker Overview](/docker/)
