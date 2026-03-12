---
title: System Design
description: System design interview framework — requirements, estimation, high-level design, deep dives, and bottleneck identification
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [system-design, scalability, architecture, interviews]
related:
  - /system-design/scalability
  - /system-design/caching
  - /system-design/reliability
estimatedMinutes: 15
---

# System Design

<DifficultyBadge level="advanced" />

System design interviews test your ability to design large-scale distributed systems from scratch. Unlike coding interviews, there's no single correct answer — the goal is to demonstrate structured thinking, awareness of trade-offs, and depth in the right areas.

---

## The Interview Framework

Use this structure for every system design interview. Spend roughly the times shown for a 45-minute session.

```
1. Clarify Requirements       (~5 min)
2. Estimate Scale             (~5 min)
3. High-Level Design          (~10 min)
4. Deep Dive                  (~15 min)
5. Identify Bottlenecks       (~5 min)
6. Wrap Up / Trade-offs       (~5 min)
```

---

### Step 1 — Clarify Requirements

Never start designing without asking questions. Interviewers deliberately leave requirements ambiguous.

**Functional requirements** (what the system does):
```
- Who are the users? (consumers, businesses, internal?)
- What are the core features? (scope to 3–4 for the interview)
- Read-heavy or write-heavy?
- Real-time or async?
- Any consistency requirements? (strong vs eventual)
```

**Non-functional requirements** (how well it performs):
```
- Scale: how many users? Daily/Monthly Active Users?
- Latency: p99 < 200ms? Real-time updates?
- Availability: 99.9% (8.7 hrs/year downtime)? 99.99% (52 min/year)?
- Durability: data loss acceptable?
- Geo: single region or global?
```

---

### Step 2 — Estimate Scale

Back-of-envelope calculations anchor your design decisions.

**Key numbers to know:**

| Metric | Ballpark |
|--------|----------|
| Twitter-scale DAU | 300 million |
| Tweets per second (peak) | ~6,000 |
| Read/write ratio (Twitter) | 100:1 |
| MySQL row read | ~0.1 ms |
| Redis read | ~0.1 ms |
| Network roundtrip (same DC) | 0.5 ms |
| SSD read | 0.1 ms |
| HDD seek | 10 ms |
| 1 GB over network | 10 ms |

**Common estimation pattern:**
```
Daily Active Users: 10 million
Write QPS: 10M × 2 writes/day ÷ 86,400 s = ~230 writes/s
Read QPS: 10M × 20 reads/day ÷ 86,400 s = ~2,300 reads/s
Peak QPS (2–3× avg): ~7,000 reads/s

Storage: 230 writes/s × 1 KB/write × 86,400 s = 20 GB/day
             → ~7 TB/year
```

---

### Step 3 — High-Level Design

Draw the system with major components. Don't get into details yet.

```
Client → Load Balancer → API Gateway → Services → Databases

Typical components:
├── DNS
├── CDN (static assets, edge caching)
├── Load Balancer (L7 — routes by path/host)
├── API Gateway (auth, rate limiting, routing)
├── Application Servers (stateless, horizontally scalable)
├── Cache (Redis — hot data)
├── Message Queue (Kafka — async, decoupling)
├── Database (PostgreSQL / Cassandra / etc.)
├── Object Storage (S3 — files, images)
└── Search (Elasticsearch)
```

Pick the right database for each service:
```
User profiles, orders    → PostgreSQL (relational, ACID)
Session data, hot cache  → Redis (in-memory key-value)
Activity feeds, timelines → Cassandra (wide-column, high write)
Product catalogue search  → Elasticsearch (full-text)
Images, videos           → Object storage (S3/GCS)
```

---

### Step 4 — Deep Dive

The interviewer will steer you toward components they care about. Common deep dives:

| Component | What to explain |
|-----------|----------------|
| **Database** | Schema, indexing, sharding strategy, replication |
| **Cache** | Cache-aside vs write-through, TTL, eviction, thundering herd |
| **API** | Pagination, rate limiting, idempotency |
| **Scalability** | Stateless services, load balancing, auto-scaling |
| **Reliability** | Circuit breakers, retry with backoff, failover |

---

### Step 5 — Identify Bottlenecks

Proactively call out single points of failure and scalability limits:

```
- Single database → Add read replicas → Shard by user_id
- Hot cache key (celebrity problem) → Local cache + jitter
- One API server → Load balancer + auto-scaling group
- Synchronous calls chain → Break with message queue
- Large payload → Pagination / cursor-based
- Global users, high latency → CDN + multi-region
```

---

## What's Covered in This Section

| Topic | Key Concepts |
|-------|-------------|
| [Scalability](/system-design/scalability) | Load balancing, consistent hashing, CDN, stateless design |
| [Caching](/system-design/caching) | Cache strategies, Redis patterns, thundering herd, eviction |
| [Database Scaling](/system-design/database-scaling) | Sharding, replication, polyglot persistence |
| [Reliability & Resilience](/system-design/reliability) | Circuit breaker, rate limiting, SLA/SLO, RTO/RPO |
| [Observability](/system-design/observability) | Metrics, logging, distributed tracing, alerting |
| [Classic Problems](/system-design/classic-problems) | URL shortener, news feed, notification system, file storage |

---

## Key Trade-offs to Know

| Decision | Option A | Option B |
|----------|----------|----------|
| Consistency vs Availability | Strong consistency (SQL, Zookeeper) | Eventual consistency (Cassandra, DynamoDB) |
| Sync vs Async | Lower latency, tighter coupling | Higher latency, looser coupling (Kafka) |
| Push vs Pull | Real-time, server overhead | Client controls rate, higher latency |
| Fan-out on write vs read | Read is fast, write is slow | Write is fast, read does work |
| Normalisation vs Denormalisation | Storage-efficient, slow joins | Fast reads, data duplication |
| Cache-aside vs write-through | Tolerates stale data, simple | Always consistent, write overhead |

---

## Interview Tips

- **State assumptions out loud** — "I'll assume this is read-heavy, ~10M DAU"
- **Think aloud** — interviewers want to see your reasoning process
- **Use numbers** — vague answers are weak; estimates show confidence
- **Drive the conversation** — don't wait for prompts; propose and explain
- **Know trade-offs** — every design decision has costs; name them
- **Don't over-engineer** — start simple, scale incrementally
- **Ask for feedback** — "Does this level of detail work, or should I go deeper?"

<RelatedTopics :topics="['/system-design/scalability', '/system-design/caching', '/system-design/reliability', '/system-design/classic-problems']" />
