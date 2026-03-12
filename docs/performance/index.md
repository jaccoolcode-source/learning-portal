---
title: Performance & Optimisation
description: Performance engineering for Java applications — profiling, JVM tuning, load testing, and API optimisation
category: performance
pageClass: layout-performance
difficulty: advanced
tags: [performance, optimisation, profiling, jvm-tuning, load-testing]
related:
  - /performance/profiling
  - /performance/jvm-tuning
  - /performance/load-testing
  - /java-memory/garbage-collection
estimatedMinutes: 10
---

# Performance & Optimisation

<DifficultyBadge level="advanced" />

Performance engineering is the discipline of making systems faster, more efficient, and more predictable under load. The most common mistake is optimising without measuring — fixing the wrong thing while the real bottleneck remains untouched.

---

## The Golden Rule: Measure First

```
1. Measure — find where time is actually spent
2. Identify — locate the real bottleneck (it's rarely where you think)
3. Change — make one change at a time
4. Measure again — verify the change helped
5. Repeat
```

**Never optimise code you haven't profiled.** Amdahl's Law: if 5% of your code takes 90% of execution time, optimising the other 95% gives you at most a 5.5% speedup.

---

## What's Covered

| Topic | Key Concepts |
|-------|-------------|
| [Profiling & Benchmarking](/performance/profiling) | JMH, JFR, async-profiler, flame graphs |
| [JVM Tuning](/performance/jvm-tuning) | GC selection (G1/ZGC/Shenandoah), heap flags, code cache, JIT |
| [Load Testing](/performance/load-testing) | Gatling, k6, test types, capacity planning |
| [API & Network Performance](/performance/api-performance) | HTTP/2, gRPC, compression, Protobuf, pagination |

**Already covered elsewhere — cross-links:**

| Topic | Where |
|-------|-------|
| EXPLAIN ANALYZE, indexes | [SQL Fundamentals](/databases/sql) |
| N+1, JPA projections | [JPA & Hibernate](/databases/jpa-hibernate) |
| HikariCP pool sizing | [SQL Fundamentals](/databases/sql#connection-pooling--hikaricp) |
| Cache strategies, eviction | [Caching](/system-design/caching) |
| Thread pool sizing, virtual threads | [Concurrency](/concurrency/) |
| GC algorithms, heap structure | [JVM & Memory](/java-memory/) |
| OOM diagnosis, memory leaks | [Memory Problems](/java-memory/memory-problems) |

---

## Performance Mindset

### Where Time Goes in a Typical Web Request

```
Incoming request (e.g., GET /api/orders)
│
├── Network (1–50ms)            ← CDN, connection reuse, HTTP/2
├── Load balancer routing (<1ms)
├── Application server
│   ├── Framework overhead (1–5ms) ← Spring filter chain, serialisation
│   ├── Business logic (1–10ms)    ← rarely the bottleneck
│   ├── Cache lookup (0.1ms)       ← if cached, you're done
│   └── Database query (1–100ms)   ← most common bottleneck
└── Response serialisation (1–5ms)

Total: ~5–200ms depending on DB access patterns
```

### Common Bottleneck Priorities

1. **Database** — slow queries, missing indexes, N+1 — most frequent
2. **External calls** — synchronous HTTP to slow third parties
3. **Serialisation** — JSON at high QPS, large payloads
4. **Locking** — thread contention, DB row locks
5. **GC** — object allocation rate, long GC pauses
6. **CPU** — algorithmic complexity (rare in web apps)

### Performance Budget (Latency SLOs)

```
p50 < 50ms   — what most users experience
p90 < 100ms  — fast enough for interactive UIs
p99 < 500ms  — edge cases, slow users
p99.9 < 2s   — very worst case

If p50 is fast but p99 is slow → look at lock contention, GC pauses, thread pool starvation
If everything is slow → look at DB queries and cache hit rate
```

---

## The Optimisation Hierarchy

Address in order — each level gives bigger wins than the next:

```
1. Architecture     — caching, async, database choice
2. Algorithms       — O(n²) → O(n log n), avoid redundant work
3. Database         — indexes, query optimisation, pooling
4. Concurrency      — parallelism, non-blocking I/O
5. JVM / GC         — GC tuning, heap sizing, allocation reduction
6. Micro-optimisation — JMH-measured, last resort
```

---

## Interview Quick-Fire

**Q: How do you approach a performance problem in production?**
Start by gathering data: check APM/metrics for the endpoint in question (latency percentiles, error rate, throughput). Look at distributed traces to find which span is slow. Check DB slow query logs. Profile CPU with async-profiler if CPU is high. Never guess — every action is driven by data.

**Q: What's the most common performance bottleneck in Java web applications?**
Database access: missing indexes, N+1 queries, or insufficient connection pool size. The second most common is external HTTP calls made synchronously in the request path. CPU-bound bottlenecks are rare in typical web APIs — most time is spent waiting for I/O.

<RelatedTopics :topics="['/performance/profiling', '/performance/jvm-tuning', '/performance/load-testing', '/performance/api-performance']" />
