---
title: Scalability
description: Horizontal and vertical scaling, load balancing algorithms, consistent hashing, stateless design, CDN, and auto-scaling
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [scalability, load-balancing, consistent-hashing, cdn, stateless, auto-scaling]
related:
  - /system-design/caching
  - /system-design/database-scaling
  - /system-design/reliability
estimatedMinutes: 30
---

# Scalability

<DifficultyBadge level="advanced" />

Scalability is the ability of a system to handle increased load by adding resources. Understanding when and how to scale is core to every system design interview.

---

## Vertical vs Horizontal Scaling

| | Vertical (Scale Up) | Horizontal (Scale Out) |
|--|---------------------|----------------------|
| How | Bigger machine (more CPU/RAM) | More machines |
| Limit | Hardware ceiling | Virtually unlimited |
| Cost | Expensive at the top end | Commodity hardware |
| Failure | Single point of failure | Redundant |
| Complexity | Simple — no distribution | Requires load balancing, statelessness |
| When | Quick fix, DB servers, single-threaded bottlenecks | Web servers, microservices |

**Rule of thumb:** Scale vertically first (simpler, no code change). Reach for horizontal when you hit hardware limits or need high availability.

---

## Stateless Design

**Stateless services are the foundation of horizontal scaling.** If any server can handle any request, you can freely add or remove servers.

### Stateful Problem

```
Client → Server A → stores session in Server A's memory
Client → Server B → no session! Login required again.
```

### Stateless Solution

```
Client → Any Server → session data fetched from Redis
                       user data fetched from DB
```

```java
// Spring Boot — store sessions in Redis (not in-process memory)
// dependency: spring-session-data-redis

@Configuration
@EnableRedisHttpSession(maxInactiveIntervalInSeconds = 3600)
public class SessionConfig { }

// application.yml
spring:
  session:
    store-type: redis
  data:
    redis:
      host: redis.internal
      port: 6379
```

**What must move out of local memory:**
- HTTP sessions → Redis
- File uploads → Object storage (S3)
- WebSocket state → Redis Pub/Sub or sticky sessions (last resort)
- Scheduled job locks → distributed lock (Redis `SET NX`)

---

## Load Balancing

A load balancer distributes incoming requests across a pool of servers.

### L4 vs L7 Load Balancing

| | L4 (Transport Layer) | L7 (Application Layer) |
|--|---------------------|------------------------|
| Works on | TCP/UDP packets | HTTP/HTTPS content |
| Routing by | IP + port | URL path, headers, cookies |
| SSL termination | No | Yes |
| Performance | Faster (no packet inspection) | Slightly slower |
| Examples | AWS NLB, HAProxy (TCP) | AWS ALB, nginx, Envoy |

### Load Balancing Algorithms

```
Round Robin
  → Requests distributed sequentially: A, B, C, A, B, C...
  → Good when servers are identical

Weighted Round Robin
  → Server A (weight 3) → Server B (weight 1)
  → Useful when servers have different capacities

Least Connections
  → New request goes to server with fewest active connections
  → Best for requests with variable processing time

IP Hash (Sticky Sessions)
  → hash(client_ip) % server_count → always same server
  → Needed for WebSockets or stateful apps (avoid if possible)

Random
  → Simple, works well at high scale (law of large numbers)

Resource-Based (Adaptive)
  → Load balancer polls servers for CPU/memory → routes to least loaded
  → Accurate but adds overhead
```

### Health Checks

```yaml
# nginx load balancer config
upstream backend {
    server app1.internal:8080;
    server app2.internal:8080;
    server app3.internal:8080;

    keepalive 32;
}

server {
    location /api/ {
        proxy_pass http://backend;
        proxy_connect_timeout 1s;
        proxy_read_timeout 10s;
    }

    location /health {
        proxy_pass http://backend/actuator/health;
    }
}
```

```java
// Spring Boot Actuator — health endpoint for load balancer
// GET /actuator/health → 200 OK (server is up) or 503 (server is down)

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      show-details: when-authorized
```

### Active-Active vs Active-Passive

```
Active-Active:   LB → [Server A]  ← both handle traffic
                 LB → [Server B]

Active-Passive:  LB → [Server A]  ← only A handles traffic
                      [Server B]  ← standby, takes over on A failure

Active-Active: higher throughput, harder consistency
Active-Passive: simpler failover, wasted standby capacity
```

---

## Consistent Hashing

### The Problem with Simple Hashing

```
3 servers: server_index = hash(key) % 3

Add a 4th server: server_index = hash(key) % 4
→ Almost ALL keys now map to different servers
→ Cache miss storm, DB overwhelmed
```

### Consistent Hashing Solution

Keys and servers are both placed on a **hash ring** (0 to 2³² − 1). A key is assigned to the first server clockwise on the ring.

```
         0
        /  \
  Server C   Server A
      |           |
  Server B -------
        \  /
       2^32-1

Key X → hash(X) → find next server clockwise → Server A
Key Y → hash(Y) → find next server clockwise → Server B
```

**When a server is added or removed:** only the keys between the new server and its predecessor need to move — typically `1/N` of all keys (N = server count), not all of them.

### Virtual Nodes

A single server is given multiple positions on the ring (virtual nodes). This prevents uneven distribution when servers are sparse.

```
Server A → positions: hash("A#1"), hash("A#2"), hash("A#3")
Server B → positions: hash("B#1"), hash("B#2"), hash("B#3")

With 150 virtual nodes per server:
→ Distribution error < 5%
```

**Where consistent hashing is used:**
- Distributed caches (Redis Cluster, Memcached)
- Distributed databases (Cassandra, DynamoDB)
- CDN edge node routing
- Load balancing (sticky sessions without IP hash limitations)

---

## Content Delivery Networks (CDN)

A CDN is a geographically distributed network of servers that caches content close to users.

```
Without CDN: User in Tokyo → Origin in Virginia → 150ms
With CDN:    User in Tokyo → CDN edge in Tokyo → 5ms
```

### What CDNs Cache

- Static assets: HTML, CSS, JS, images, videos
- API responses (with `Cache-Control` headers)
- Streaming media (HLS segments)

### Pull CDN vs Push CDN

| | Pull CDN | Push CDN |
|--|----------|----------|
| How | CDN fetches from origin on first request, caches result | You upload content to CDN proactively |
| Good for | Frequently accessed, unpredictable traffic | Large files, predictable content (video uploads) |
| TTL | Controlled by `Cache-Control: max-age=3600` | You control expiry at upload time |
| Origin load | Hit on first request per edge node | No origin hit after upload |
| Example | CloudFront, Cloudflare | AWS CloudFront with S3 pre-upload |

### Cache-Control Headers for CDN

```http
# Cache for 1 hour at CDN and browser
Cache-Control: public, max-age=3600

# Don't cache (dynamic, user-specific)
Cache-Control: private, no-store

# Cache at CDN, but always revalidate
Cache-Control: public, no-cache

# Cache-busting: embed hash in filename
<script src="/app.a3f8b92.js"></script>
→ Cache-Control: public, max-age=31536000, immutable
```

---

## Auto-Scaling

Auto-scaling automatically adjusts the number of server instances based on load.

```
Scale out trigger: CPU > 70% for 3 minutes → add instances
Scale in trigger:  CPU < 30% for 10 minutes → remove instances

Cooldown period: 300 seconds (prevents oscillation)
Min instances: 2 (always available)
Max instances: 20 (cost cap)
```

### Kubernetes HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### Pre-warming

Auto-scaling reacts to load — it doesn't anticipate it. For predictable spikes (flash sales, marketing events):

```
Schedule: at 09:55, scale to 15 instances before 10:00 launch
Warm up: pre-populate caches, establish DB connection pools
```

---

## Scalability Bottlenecks Checklist

| Bottleneck | Symptom | Fix |
|-----------|---------|-----|
| Single web server | CPU/memory maxed | Add load balancer + replicas |
| Stateful sessions | Can't route to any server | Move sessions to Redis |
| Single database | DB CPU/connections maxed | Read replicas, sharding |
| Slow queries | DB wait time high | Indexes, query optimisation, cache |
| Large payloads | Slow responses, high bandwidth | Compression, pagination, CDN |
| Single-region | High latency for global users | CDN + multi-region |
| Synchronous chains | High latency, cascading failures | Async with message queue |

---

## Interview Quick-Fire

**Q: When would you use L4 vs L7 load balancing?**
L4 for raw TCP throughput (databases, game servers, anything non-HTTP). L7 for HTTP/HTTPS: you get URL-based routing, header inspection, SSL termination, and can route `/api/orders` to the order service and `/api/users` to the user service from a single entry point.

**Q: Why is consistent hashing better than modulo hashing for distributed caches?**
Modulo `hash(key) % N` remaps nearly all keys when N changes — a server add/remove causes a cache miss storm. Consistent hashing only remaps `1/N` of keys on average. This is essential for Cassandra, Redis Cluster, and distributed caches where rebalancing must be gradual.

**Q: How do you handle a hot key in a distributed cache (celebrity problem)?**
A single cache key (e.g., `user:123` for a celebrity) overwhelms one cache node. Solutions: (1) local in-process cache with short TTL as L1; (2) key scattering — `user:123#shard0` through `user:123#shard9`, randomly selected; (3) read replicas for the hot shard.

<RelatedTopics :topics="['/system-design/caching', '/system-design/database-scaling', '/system-design/reliability']" />

[→ Back to System Design Overview](/system-design/)
