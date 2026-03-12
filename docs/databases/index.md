---
title: Databases — Overview
description: SQL, JPA/Hibernate, and NoSQL — relational fundamentals, ORM patterns, and distributed data stores
category: databases
pageClass: layout-databases
difficulty: intermediate
tags: [databases, sql, jpa, hibernate, nosql, redis, mongodb, cassandra, cap-theorem]
related:
  - /databases/sql
  - /databases/jpa-hibernate
  - /databases/nosql
  - /spring/spring-data
estimatedMinutes: 10
---

# Databases

<DifficultyBadge level="intermediate" />

Databases are at the heart of most Java applications. This section covers SQL fundamentals, ORM with JPA/Hibernate, and NoSQL alternatives — with enough depth for both day-to-day development and interviews.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [SQL Fundamentals](./sql) | JOINs, CTEs, subqueries, window functions, transactions, isolation levels, indexes, locking, EXPLAIN, Flyway, HikariCP |
| [JPA & Hibernate](./jpa-hibernate) | Entity lifecycle, relationships, N+1, projections, inheritance, optimistic locking, auditing, Criteria API |
| [NoSQL](./nosql) | Redis data structures & patterns, MongoDB aggregation, Cassandra data modeling, Elasticsearch, CAP theorem |

---

## Choosing a Database

```
Do you need complex relationships and ad-hoc queries?
  → Relational (PostgreSQL, MySQL)

Do you need caching, sessions, pub/sub, or a leaderboard?
  → Redis (key-value)

Do you need flexible JSON documents with nested data?
  → MongoDB (document store)

Do you need massive write throughput at global scale?
  → Cassandra (wide-column)

Do you need full-text search or log analytics?
  → Elasticsearch / OpenSearch

Do you need to traverse connected relationships (social graph, recommendations)?
  → Neo4j (graph)
```

---

## Isolation Levels Quick Reference

| Level | Dirty Read | Non-repeatable Read | Phantom Read | Default in |
|-------|-----------|---------------------|-------------|------------|
| READ UNCOMMITTED | ✅ possible | ✅ possible | ✅ possible | — |
| READ COMMITTED | ❌ prevented | ✅ possible | ✅ possible | PostgreSQL |
| REPEATABLE READ | ❌ prevented | ❌ prevented | ✅ possible | MySQL/InnoDB |
| SERIALIZABLE | ❌ prevented | ❌ prevented | ❌ prevented | — |

---

## Interview Quick-Fire

**Q: What is the N+1 problem and how do you fix it?**
Loading a list of entities (1 query) and then triggering a lazy-load for each entity's collection (N queries). Fix with `JOIN FETCH` in JPQL, `@EntityGraph`, or `@BatchSize`. Always check query count with `spring.jpa.show-sql=true` or Hibernate statistics.

**Q: What does CAP theorem say and which property do real systems sacrifice?**
A distributed system can only guarantee two of: Consistency, Availability, Partition Tolerance. Since network partitions always occur, systems choose CP (consistent reads, may be unavailable during partition — PostgreSQL, MongoDB) or AP (always available, possibly stale — Cassandra, DynamoDB). The choice depends on whether stale data is acceptable.

**Q: When would you choose NoSQL over a relational database?**
When the data model is document-like (nested, schema-flexible), when write throughput at scale exceeds what a single relational node can handle, when access patterns are known and fixed (Cassandra is designed around queries, not tables), or when you need specialised capabilities (Redis for caching/pub/sub, Elasticsearch for full-text search). Don't choose NoSQL just for scale — PostgreSQL handles millions of rows well with proper indexing.

<RelatedTopics :topics="['/databases/sql', '/databases/jpa-hibernate', '/databases/nosql', '/spring/spring-data']" />
