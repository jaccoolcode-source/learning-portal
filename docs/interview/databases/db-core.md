# Databases

**Q38 to Q40** · [← Databases Overview](./index)

---

## Q38: Database Indexing

> Most candidates know "indexes make queries faster." Seniors know the data structure, when indexes hurt, and how to choose the right type.

An index is a separate data structure (typically a **B-tree**) that allows the database engine to find rows without scanning the entire table.

| Index type | Use case | Notes |
|-----------|----------|-------|
| **B-tree** (default) | Equality, range queries, ORDER BY | Works for most cases |
| **Hash** | Equality only (`=`) | Faster for exact match, no range support |
| **Composite** | Queries on multiple columns | Column order matters — leftmost prefix rule |
| **Partial** | Subset of rows | `CREATE INDEX ... WHERE status = 'ACTIVE'` |
| **Covering** | All query columns in the index | Avoids table access entirely |
| **Full-text** | Text search | `LIKE '%keyword%'` can't use B-tree |

::: details Full model answer

**B-tree internals:**
A B-tree (balanced tree) keeps data sorted. Internal nodes store key ranges that guide traversal; leaf nodes store the actual keys and pointers to rows (or the rows themselves in a clustered index). For a table with 10 million rows, a B-tree finds a row in ~4 disk reads (log₂ of 10M ≈ 23, but pages hold thousands of entries, so tree height stays low).

**Clustered vs Non-clustered index:**
- **Clustered index:** The table data IS stored in index order. In InnoDB/PostgreSQL, the primary key is always the clustered index. Only one per table.
- **Non-clustered index:** A separate structure that stores the indexed columns + a pointer (row ID) back to the heap/clustered index. Multiple allowed per table.

**Composite index and the leftmost prefix rule:**
```sql
CREATE INDEX idx_order ON orders (customer_id, status, created_at);
```

This index satisfies queries that use `customer_id` alone, `customer_id + status`, or `customer_id + status + created_at` — but NOT `status` alone or `created_at` alone. The optimizer can use a prefix of the composite key, but not arbitrary columns from the middle.

```sql
-- ✅ Uses index
SELECT * FROM orders WHERE customer_id = 1 AND status = 'OPEN';

-- ❌ Cannot use index efficiently (skips leftmost column)
SELECT * FROM orders WHERE status = 'OPEN';
```

**Covering index:**
If an index contains all columns needed by a query, the DB engine never needs to access the actual table rows (index-only scan). Extremely fast for read-heavy queries.
```sql
-- Covering index for this query:
CREATE INDEX idx_cover ON orders (customer_id, status, total_amount);
SELECT total_amount FROM orders WHERE customer_id = 1 AND status = 'OPEN';
-- total_amount is IN the index — no table row read needed
```

**When indexes HURT:**
- **Write performance:** Every INSERT, UPDATE, DELETE must maintain all indexes on the table. A table with 10 indexes pays 10x the write cost.
- **Low-cardinality columns:** An index on `gender` (2 values) provides almost no benefit — the optimizer may skip it.
- **Large index footprint:** Too many indexes consume disk space and buffer pool/cache space.
- **`LIKE '%prefix%'` queries:** Leading wildcards prevent B-tree prefix matching.

**Identifying missing indexes — EXPLAIN:**
```sql
EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 1;
```
Look for:
- `Seq Scan` (full table scan) — possible missing index
- `rows=` estimate vs actual — stale statistics
- High `cost=` — slow plan

**Spring Boot / Hibernate tip:**
Define indexes in the entity:
```java
@Entity
@Table(name = "orders", indexes = {
    @Index(name = "idx_order_customer", columnList = "customer_id"),
    @Index(name = "idx_order_status_created", columnList = "status, created_at")
})
public class Order { ... }
```

:::

> [!TIP] Golden Tip
> Mention the **leftmost prefix rule** for composite indexes — it's where most developers go wrong. Creating `INDEX(a, b, c)` and then querying only on `b` won't use the index. Also worth saying: too many indexes is as bad as too few — write-heavy tables (like event logs or audit tables) often perform worse with excessive indexing. Showing you understand the trade-off signals production DBA-level thinking, not just "add an index and it gets faster."

**Follow-up questions:**
- What is the difference between a clustered and a non-clustered index?
- What is the leftmost prefix rule for composite indexes?
- How do you identify a slow query and whether an index is being used?
- When would you use a partial index?

---

## Q39: Transaction Isolation Levels

> Isolation levels are one of the most-asked senior DB questions. Know the anomalies each level prevents.

The **ACID** properties guarantee correctness. **Isolation** controls the trade-off between data consistency and concurrency performance. Higher isolation = fewer anomalies = more locking = less concurrency.

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|----------------|-----------|---------------------|--------------|
| **READ UNCOMMITTED** | ✅ possible | ✅ possible | ✅ possible |
| **READ COMMITTED** | ❌ prevented | ✅ possible | ✅ possible |
| **REPEATABLE READ** | ❌ prevented | ❌ prevented | ✅ possible (❌ InnoDB) |
| **SERIALIZABLE** | ❌ prevented | ❌ prevented | ❌ prevented |

Default levels: PostgreSQL → **READ COMMITTED**, MySQL InnoDB → **REPEATABLE READ**.

::: details Full model answer

**The three concurrency anomalies:**

**1. Dirty Read:**
Transaction A reads data written but NOT yet committed by Transaction B. If B rolls back, A has read data that never existed.
```
T1: UPDATE account SET balance = 1000 WHERE id = 1;  -- not committed
T2: SELECT balance FROM account WHERE id = 1;         -- reads 1000 (dirty)
T1: ROLLBACK;
-- T2 acted on data that never existed
```

**2. Non-Repeatable Read:**
Transaction A reads a row, Transaction B commits an UPDATE to that row, Transaction A reads it again — gets different data.
```
T1: SELECT balance FROM account WHERE id = 1;  -- reads 100
T2: UPDATE account SET balance = 200 WHERE id = 1; COMMIT;
T1: SELECT balance FROM account WHERE id = 1;  -- reads 200 (changed!)
```
Breaks the assumption "within a transaction, data doesn't change."

**3. Phantom Read:**
Transaction A queries a range of rows, Transaction B INSERTs new rows matching that range and commits, Transaction A re-queries — sees new "phantom" rows.
```
T1: SELECT COUNT(*) FROM orders WHERE status = 'OPEN';  -- returns 5
T2: INSERT INTO orders (status) VALUES ('OPEN'); COMMIT;
T1: SELECT COUNT(*) FROM orders WHERE status = 'OPEN';  -- returns 6 (phantom!)
```

**Isolation levels in depth:**

`READ UNCOMMITTED`: No locking. Fastest but allows all anomalies. Rarely used in production (only acceptable for approximate analytics where correctness doesn't matter — e.g., dashboard counters).

`READ COMMITTED`: Reads only committed data. Prevents dirty reads. Each statement sees a fresh snapshot — so within the same transaction, two reads of the same row can return different values if another transaction committed between them. Default in PostgreSQL, Oracle.

`REPEATABLE READ`: Reads are consistent throughout the transaction — the same row always returns the same data within the transaction. Prevents dirty and non-repeatable reads. **MySQL InnoDB** prevents phantom reads here too via **gap locks** (locks the gaps between index values, preventing INSERTs into the range). PostgreSQL REPEATABLE READ uses MVCC snapshots, also preventing phantoms in practice.

`SERIALIZABLE`: Full isolation — transactions execute as if serially, one after another. Prevents all anomalies. Implemented via **predicate locks** (range locks) or **SSI** (Serializable Snapshot Isolation in PostgreSQL). Significant performance cost.

**Spring / JPA configuration:**
```java
// Per-transaction isolation
@Transactional(isolation = Isolation.REPEATABLE_READ)
public BigDecimal calculateBalance(Long accountId) { ... }

// Default for all transactions
spring.datasource.hikari.transaction-isolation=TRANSACTION_READ_COMMITTED
```

**MVCC (Multi-Version Concurrency Control):**
Modern databases (PostgreSQL, MySQL InnoDB) use MVCC to implement isolation without traditional read locks. Each transaction sees a consistent **snapshot** of the database as it was at the start of the transaction (or statement, depending on level). Writers don't block readers; readers don't block writers. Only write-write conflicts cause blocking.

**Practical isolation level guide:**
| Use case | Recommended level |
|----------|------------------|
| General OLTP (Spring Boot apps) | READ COMMITTED |
| Financial calculations (balance, inventory) | REPEATABLE READ or SERIALIZABLE |
| Batch reporting (reads only) | READ COMMITTED (or SERIALIZABLE for consistency) |
| High-throughput, approximate reads | READ COMMITTED |

:::

> [!TIP] Golden Tip
> Explain **MVCC** — most candidates describe isolation in terms of "locks," but modern databases achieve isolation through multiversion snapshots, not traditional read locks. Understanding that in `READ COMMITTED` / PostgreSQL, readers don't block writers (and vice versa) because each transaction reads from a snapshot is a genuine insight. Also: MySQL InnoDB's `REPEATABLE READ` uses gap locks to prevent phantom reads — making it behave like `SERIALIZABLE` for range scans — which is often misunderstood.

**Follow-up questions:**
- What is the difference between a dirty read, non-repeatable read, and phantom read?
- Why is `READ UNCOMMITTED` rarely used in production?
- What is MVCC and how does it differ from lock-based isolation?
- What isolation level would you choose for a banking transaction that reads and then updates a balance?

---

## Q40: SQL vs NoSQL

> Don't just list differences — know WHY each model exists and when each is the right tool.

| Dimension | SQL (Relational) | NoSQL |
|-----------|-----------------|-------|
| Data model | Tables with fixed schema | Documents, key-value, column-family, graph |
| Schema | Strict (DDL enforced) | Flexible / schema-on-read |
| Consistency | Strong (ACID) | Eventual (BASE) — varies by DB |
| Scaling | Vertical (+ read replicas) | Horizontal (sharding) |
| Joins | Native (JOINs, FKs) | Application-level or denormalized |
| Query language | SQL (standard) | DB-specific APIs |
| Examples | PostgreSQL, MySQL, Oracle | MongoDB, Cassandra, Redis, DynamoDB, Neo4j |

::: details Full model answer

**Why relational databases exist:**
The relational model (E.F. Codd, 1970) solves the problem of storing structured, interrelated data without duplication. **Normalization** eliminates redundancy; **foreign keys** enforce referential integrity; **transactions** guarantee ACID correctness. SQL is declarative — you describe WHAT you want, the optimizer decides HOW to get it.

**Why NoSQL databases exist:**
In the 2000s, internet-scale companies (Google, Amazon, Facebook) hit the limits of vertical scaling with relational databases. They needed to handle:
- Massive write throughput (millions of events/second)
- Huge datasets spread across hundreds of servers
- Flexible schemas (user profiles with arbitrary attributes)
- Geographic distribution

NoSQL databases traded the ACID guarantees and query flexibility of SQL for horizontal scalability and operational simplicity at scale.

**NoSQL data models:**

**Document stores (MongoDB, CouchDB):**
Store JSON-like documents. No joins — embed related data or reference by ID. Best for hierarchical data with varying attributes. Flexible schema evolution. Poor for complex relational queries.

```json
{
  "_id": "order_123",
  "customer": { "name": "Jan", "email": "jan@example.com" },
  "items": [
    { "product": "Laptop", "price": 1200 },
    { "product": "Mouse", "price": 30 }
  ]
}
```

**Key-value stores (Redis, DynamoDB in simple mode):**
Fastest possible read/write. Data is opaque to the DB — just keys and values. Ideal for caching, sessions, rate limiting, feature flags.

**Wide-column / Column-family (Cassandra, HBase):**
Data is stored by rows, but each row can have different columns. Designed for massive write throughput and time-series data. Partitioned by a **partition key** (determines which node). No joins. Queries must align with the partition/clustering key design. Schema must match access patterns.

**Graph databases (Neo4j):**
Model data as nodes and edges. Optimised for traversing relationships (friend-of-a-friend, shortest path, recommendation). SQL JOINs are expensive for deep relationship traversal; graph DBs handle it naturally.

**CAP theorem:**
In a distributed system, you can only guarantee two of:
- **Consistency** — every read returns the most recent write
- **Availability** — every request gets a response (not necessarily up-to-date)
- **Partition tolerance** — system continues operating despite network failures

Network partitions are unavoidable in distributed systems, so the real choice is **CP** (consistent + partition-tolerant: PostgreSQL with synchronous replication, ZooKeeper) vs **AP** (available + partition-tolerant: Cassandra, DynamoDB with eventual consistency).

**BASE vs ACID:**
- **ACID** (Atomicity, Consistency, Isolation, Durability) — SQL databases
- **BASE** (Basically Available, Soft state, Eventually consistent) — many NoSQL systems

"Eventually consistent" means: all replicas will converge to the same value — eventually. But there may be a window where different nodes return different data.

**When to choose SQL:**
- Financial data, orders, inventory — anywhere ACID correctness is non-negotiable
- Complex queries with multiple JOINs and aggregations
- Data with strong relational structure and referential integrity
- Team is more comfortable with SQL and ORM tooling

**When to choose NoSQL:**
- Schema flexibility is critical (user-generated content, metadata, config)
- Write throughput exceeds what a single relational DB can handle
- Data access patterns are simple and well-known upfront (DynamoDB)
- Low-latency caching layer (Redis)
- Analytical time-series data (Cassandra, InfluxDB)
- Graph traversal (Neo4j)

**Polyglot persistence (real-world architecture):**
Most mature systems use multiple databases for different concerns:
```
PostgreSQL  → orders, customers, payments (ACID required)
Redis       → session cache, rate limiting, distributed locks
Cassandra   → user activity events, time-series metrics
Elasticsearch → full-text search, log aggregation
```

:::

> [!TIP] Golden Tip
> Avoid the trap of "SQL is better" or "NoSQL is better" — the answer is always **it depends on the access patterns and consistency requirements**. The most impressive answer describes **polyglot persistence**: using PostgreSQL for transactional data, Redis for caching, and Elasticsearch for search — each tool doing what it's best at. Also mention the **CAP theorem** and explain that "eventual consistency" doesn't mean "wrong data forever" — it means a bounded window of inconsistency, which is acceptable for many use cases (social media feeds, product recommendations).

**Follow-up questions:**
- What is the CAP theorem and why does it matter for distributed system design?
- What is the difference between ACID and BASE?
- When would you choose Cassandra over PostgreSQL?
- How would you design a caching strategy using Redis in a Spring Boot application?
- What is eventual consistency and when is it acceptable?
