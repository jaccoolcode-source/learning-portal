---
title: Database Scaling
description: Read replicas, sharding strategies, multi-master replication, polyglot persistence, and database selection for large-scale systems
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [database-scaling, sharding, replication, read-replicas, polyglot, partitioning]
related:
  - /system-design/caching
  - /databases/sql
  - /databases/nosql
estimatedMinutes: 30
---

# Database Scaling

<DifficultyBadge level="advanced" />

The database is typically the hardest component to scale because it's stateful. Understanding replication, sharding, and when to switch database engines is essential for senior-level system design.

---

## The Scaling Progression

Start simple, scale when you have evidence of a bottleneck:

```
1. Single database (start here)
   ↓ write bottleneck? read bottleneck?
2. Read replicas (handle read-heavy load)
   ↓ write bottleneck? dataset too large?
3. Sharding (partition data across multiple databases)
   ↓ need different data models for different services?
4. Polyglot persistence (right database for each job)
```

---

## Read Replicas

The primary handles writes; replicas receive changes via replication and handle reads.

```
             Writes
               ↓
           [Primary]
          /    |    \
         /     |     \  Async replication
   [Replica] [Replica] [Replica]
       ↑           ↑
     Reads       Reads
```

### Replication Modes

| Mode | Consistency | Latency | Risk |
|------|------------|---------|------|
| **Synchronous** | Strong — replica confirms before primary commits | Higher write latency | No data loss |
| **Asynchronous** | Eventual — replica lags behind primary | No added write latency | Lag = potential stale reads |
| **Semi-synchronous** | At least one replica must confirm | Moderate | Compromise |

Most production setups use **asynchronous replication** with **eventual consistency** for reads.

### Replication Lag

```java
// Problem: read-after-write inconsistency
POST /api/orders → writes to primary (order created)
GET  /api/orders → reads from replica → order not there yet (replication lag!)

// Solutions:
// 1. Read from primary immediately after write (for the writing user only)
// 2. Route user's reads to primary for N seconds after their write
// 3. Use a read-after-write consistency token
// 4. Accept eventual consistency — display "order is processing"
```

### Spring Boot Multi-DataSource (Primary + Replica)

```java
@Configuration
public class DataSourceConfig {

    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.primary")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create().build();
    }

    @Bean
    @ConfigurationProperties("spring.datasource.replica")
    public DataSource replicaDataSource() {
        return DataSourceBuilder.create().build();
    }

    // Routing data source — reads go to replica, writes go to primary
    @Bean
    public DataSource routingDataSource(
            @Qualifier("primaryDataSource") DataSource primary,
            @Qualifier("replicaDataSource") DataSource replica) {

        Map<Object, Object> targets = Map.of(
            "primary", primary,
            "replica", replica
        );
        AbstractRoutingDataSource routing = new AbstractRoutingDataSource() {
            @Override
            protected Object determineCurrentLookupKey() {
                return TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                    ? "replica" : "primary";
            }
        };
        routing.setTargetDataSources(targets);
        routing.setDefaultTargetDataSource(primary);
        return routing;
    }
}

// Usage: @Transactional(readOnly = true) routes to replica
@Transactional(readOnly = true)
public List<Product> findAll() {
    return productRepo.findAll(); // → replica
}

@Transactional
public Product create(Product product) {
    return productRepo.save(product); // → primary
}
```

---

## Sharding (Horizontal Partitioning)

Sharding splits a single large table across multiple database servers (shards). Each shard contains a subset of the rows.

```
Without sharding: one DB with 100M users
With sharding:    Shard A: users 0–25M
                  Shard B: users 25M–50M
                  Shard C: users 50M–75M
                  Shard D: users 75M–100M
```

### Sharding Strategies

#### Range-Based Sharding

```
Shard A: user_id 1–1,000,000
Shard B: user_id 1,000,001–2,000,000
Shard C: user_id 2,000,001–3,000,000

Routing: shard_index = user_id / 1,000,000
```

**Pros:** Simple routing, range queries stay on one shard.
**Cons:** Hot shards — new users always go to the last shard. Uneven distribution if data is skewed.

#### Hash-Based Sharding

```
shard_index = hash(user_id) % num_shards

user_id 42   → hash → shard 2
user_id 43   → hash → shard 0
user_id 44   → hash → shard 1
```

**Pros:** Even distribution, no hot shards.
**Cons:** Range queries span multiple shards. Resharding (adding shards) requires remapping all keys.

**Use consistent hashing** to reduce remapping on shard addition. See [Scalability page](/system-design/scalability#consistent-hashing).

#### Directory-Based Sharding

A lookup table stores which shard each entity lives on.

```
user_id → shard mapping:
42 → shard_2
43 → shard_0
44 → shard_1
```

**Pros:** Flexible — can move entities between shards.
**Cons:** Lookup table is a single point of failure; must be cached.

---

### Sharding Key Choice

The sharding key determines data distribution. Choose poorly and you get hot shards.

| Shard Key | Problem | Better Alternative |
|-----------|---------|-------------------|
| `user_id` | Good — even distribution | — |
| `created_at` | Hot shard — all new writes go to last shard | Hash of ID + range |
| `country` | Uneven — US >> Luxembourg | `user_id` |
| `status` | Hot shard — most orders are 'ACTIVE' | Composite key |

**Rule:** Shard on the most frequent query dimension. If most queries are by `user_id`, shard on `user_id`.

---

### Sharding Challenges

#### Cross-Shard Queries

```sql
-- This query spans all shards (expensive!):
SELECT COUNT(*) FROM orders WHERE created_at > '2024-01-01';

-- Solutions:
-- 1. Scatter-gather: query all shards in parallel, aggregate results
-- 2. Pre-aggregate in a separate analytics DB (read replica from all shards)
-- 3. Use a data warehouse (BigQuery, Redshift) for analytics
```

#### Cross-Shard Transactions

```
Move money from user A (shard 1) to user B (shard 2)
→ Can't use a single ACID transaction across shards

Solutions:
1. Two-phase commit (2PC) — slow, coordinator is SPOF
2. Saga pattern — compensating transactions (see distributed-patterns)
3. Design to avoid cross-shard transactions (put related data on same shard)
```

#### Resharding

```
Starting: 4 shards → Growing: need 8 shards
→ Move 50% of data from each shard to new shards
→ Zero-downtime resharding requires:
   - Dual-write (new + old shard) during migration
   - Read from both until migration complete
   - Stop dual-write, read from new shard only
```

---

## Multi-Master Replication

Multiple nodes accept writes. Writes replicate to all other masters.

```
[Master A] ←→ [Master B]
     ↑               ↑
  Writes           Writes
```

**Pros:** Write availability if one master goes down; geographic write distribution.
**Cons:** Write conflicts — two masters update the same row simultaneously. Requires conflict resolution strategy:
- **Last-write-wins** (timestamp) — may lose updates
- **Application-level merge** — complex, domain-specific
- **CRDTs** — data structures that merge without conflicts (counters, sets)

**When to use:** Geo-distributed systems requiring low-latency writes in each region. Cassandra and CockroachDB are built for this.

---

## Polyglot Persistence

Use the right database for each job within the same system.

```
E-commerce System:
├── Users, Orders, Payments → PostgreSQL (relational, ACID)
├── Product Catalogue search → Elasticsearch (full-text)
├── Sessions, Rate limits → Redis (in-memory, TTL)
├── Product images, videos → S3 (object storage)
├── Recommendation graph → Neo4j (graph relationships)
├── Real-time analytics → Cassandra (high write throughput)
└── Reporting / BI → BigQuery (analytical)
```

### Database Selection Guide

```
Need complex queries, JOINs, ACID transactions?
→ PostgreSQL / MySQL

Need flexible JSON documents?
→ MongoDB (document store)

Need massive write throughput, no JOINs?
→ Cassandra (wide-column, tunable consistency)

Need caching, sessions, pub/sub, leaderboard?
→ Redis (key-value, in-memory)

Need full-text search?
→ Elasticsearch / OpenSearch

Need graph traversal (social networks, recommendations)?
→ Neo4j (graph)

Need global ACID transactions at scale?
→ CockroachDB / Spanner (distributed SQL)

Need analytical queries over huge datasets?
→ BigQuery / Redshift / Snowflake (OLAP)
```

---

## Connection Pooling at Scale

Every database connection is expensive (~5 MB RAM per connection in PostgreSQL). Don't open a new connection per request.

```yaml
# HikariCP (Spring Boot default)
spring:
  datasource:
    hikari:
      maximum-pool-size: 20      # tune to: (core_count * 2) + spindles
      minimum-idle: 5
      connection-timeout: 30000  # 30s — throw if no connection available
      max-lifetime: 1800000      # 30 min — recycle before DB timeout
```

### PgBouncer (Connection Pooler for PostgreSQL)

When you have 100 app instances × 20 pool size = 2,000 connections and PostgreSQL's `max_connections=500`:

```
App Instances (100×20=2000 logical connections)
         ↓
    [PgBouncer]  ← connection pooler
         ↓
   PostgreSQL (100 actual connections)
```

PgBouncer modes:
- **Session pooling** — connection held for entire client session
- **Transaction pooling** — connection returned to pool after each transaction ← most efficient
- **Statement pooling** — returned after each statement (incompatible with multi-statement transactions)

---

## Interview Quick-Fire

**Q: When would you add read replicas vs sharding?**
Read replicas when you have a read-heavy load (reads >> writes) and a single primary can handle writes — add replicas to distribute reads. Sharding when the dataset is too large for one machine, or when write throughput exceeds what one primary can handle. Read replicas are much simpler — shard only when you must.

**Q: What are the main challenges with sharding?**
(1) Cross-shard queries — scatter-gather is expensive; avoid by choosing the shard key that matches your most frequent query pattern. (2) Cross-shard transactions — require 2PC or Saga patterns. (3) Resharding — adding shards requires data migration; use consistent hashing to minimise data movement. (4) Hot shards — if the shard key is poorly chosen (e.g., timestamp), one shard gets all the traffic.

**Q: How do you handle replication lag causing stale reads?**
Strategies: (1) Read from primary for the same user immediately after a write (read-after-write consistency); (2) route all reads to primary for N seconds after a user's write; (3) accept eventual consistency and design the UI to reflect it ("order is being processed"); (4) use a consistency token — the write returns a version, the read waits until replica reaches that version.

<RelatedTopics :topics="['/system-design/caching', '/system-design/scalability', '/databases/sql', '/databases/nosql']" />

[→ Back to System Design Overview](/system-design/)
