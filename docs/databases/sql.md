---
title: SQL Fundamentals
description: SQL reference — JOINs, CTEs, subqueries, window functions, transactions, isolation levels, locking, indexes, EXPLAIN ANALYZE, Flyway migrations, and HikariCP connection pooling
category: databases
pageClass: layout-databases
difficulty: intermediate
tags: [sql, joins, cte, subquery, window-functions, transactions, isolation, indexes, explain, flyway, hikaricp]
related:
  - /databases/jpa-hibernate
  - /databases/nosql
  - /spring/spring-data
estimatedMinutes: 35
---

# SQL Fundamentals

<DifficultyBadge level="intermediate" />

---

## JOINs

```sql
-- INNER JOIN: only rows with a match in both tables
SELECT u.name, o.total
FROM users u
INNER JOIN orders o ON o.user_id = u.id;

-- LEFT JOIN: all users, NULL for orders columns if no match
SELECT u.name, COUNT(o.id) AS order_count
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
GROUP BY u.id, u.name;

-- FULL OUTER JOIN: all rows from both sides (PostgreSQL, SQL Server; MySQL uses UNION)
SELECT u.name, o.id
FROM users u
FULL OUTER JOIN orders o ON o.user_id = u.id;

-- SELF JOIN: table joined to itself
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON m.id = e.manager_id;

-- CROSS JOIN: cartesian product (every row × every row)
SELECT s.size, c.colour FROM sizes s CROSS JOIN colours c;
```

---

## Aggregation

```sql
SELECT
    department,
    COUNT(*)          AS headcount,
    AVG(salary)       AS avg_salary,
    MAX(salary)       AS top_salary,
    MIN(salary)       AS lowest_salary,
    SUM(salary)       AS total_payroll,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY salary) AS median_salary
FROM employees
WHERE active = true               -- WHERE filters rows before grouping
GROUP BY department
HAVING AVG(salary) > 70000        -- HAVING filters groups after GROUP BY
ORDER BY avg_salary DESC;
```

---

## Window Functions

Window functions compute values across a "window" of rows related to the current row, without collapsing them into a single group.

```sql
SELECT
    name,
    department,
    salary,
    -- Ranking (ties handled differently)
    RANK()       OVER (PARTITION BY department ORDER BY salary DESC) AS rank_gaps,
    DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rank_no_gaps,
    ROW_NUMBER() OVER (ORDER BY salary DESC)                        AS global_row,
    NTILE(4)     OVER (ORDER BY salary DESC)                        AS quartile,

    -- Offset
    LAG(salary, 1, 0)  OVER (ORDER BY hire_date) AS prev_salary,
    LEAD(salary, 1, 0) OVER (ORDER BY hire_date) AS next_salary,
    FIRST_VALUE(salary) OVER (PARTITION BY department ORDER BY hire_date) AS first_hired_salary,

    -- Running aggregates
    SUM(salary) OVER (PARTITION BY department)                       AS dept_total,
    SUM(salary) OVER (ORDER BY hire_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
                                                                     AS running_total,
    AVG(salary) OVER (ORDER BY hire_date ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)
                                                                     AS rolling_3_avg
FROM employees;
```

---

## CTEs (Common Table Expressions)

`WITH` clauses name a subquery result for reuse — cleaner than nested subqueries.

```sql
-- Basic CTE
WITH high_earners AS (
    SELECT id, name, salary, department
    FROM employees
    WHERE salary > 100000
)
SELECT department, COUNT(*) AS count, AVG(salary) AS avg
FROM high_earners
GROUP BY department;

-- Multiple CTEs
WITH
  recent_orders AS (
      SELECT user_id, SUM(total) AS revenue
      FROM orders
      WHERE created_at > NOW() - INTERVAL '30 days'
      GROUP BY user_id
  ),
  top_customers AS (
      SELECT user_id FROM recent_orders WHERE revenue > 1000
  )
SELECT u.name, r.revenue
FROM users u
JOIN recent_orders r ON r.user_id = u.id
JOIN top_customers tc ON tc.user_id = u.id
ORDER BY r.revenue DESC;

-- Recursive CTE — traverse hierarchies
WITH RECURSIVE org_chart AS (
    -- Base case: top-level managers (no manager)
    SELECT id, name, manager_id, 0 AS depth
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive case: employees reporting to someone already in the CTE
    SELECT e.id, e.name, e.manager_id, oc.depth + 1
    FROM employees e
    JOIN org_chart oc ON oc.id = e.manager_id
)
SELECT depth, name FROM org_chart ORDER BY depth, name;
```

---

## Subqueries

```sql
-- Scalar subquery — returns a single value
SELECT name, salary,
       salary - (SELECT AVG(salary) FROM employees) AS diff_from_avg
FROM employees;

-- WHERE subquery
SELECT name FROM employees
WHERE department_id IN (
    SELECT id FROM departments WHERE location = 'London'
);

-- Correlated subquery — references the outer query per row (expensive!)
SELECT e.name, e.salary
FROM employees e
WHERE e.salary > (
    SELECT AVG(salary) FROM employees
    WHERE department_id = e.department_id  -- correlated on e.department_id
);

-- EXISTS — more efficient than IN for large sets
SELECT u.name FROM users u
WHERE EXISTS (
    SELECT 1 FROM orders o
    WHERE o.user_id = u.id AND o.status = 'PENDING'
);

-- Subquery in FROM (derived table)
SELECT dept, avg_sal
FROM (
    SELECT department AS dept, AVG(salary) AS avg_sal
    FROM employees
    GROUP BY department
) dept_averages
WHERE avg_sal > 80000;
```

---

## Transactions & ACID

```sql
BEGIN;
    UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;   -- atomic: both succeed or neither does
-- ROLLBACK;  -- undo all changes in this transaction

-- Savepoints — partial rollback
BEGIN;
    INSERT INTO orders (customer_id) VALUES (42);
    SAVEPOINT after_order;

    INSERT INTO order_items (order_id, product_id) VALUES (LASTVAL(), 99);
    -- Something goes wrong with items:
    ROLLBACK TO SAVEPOINT after_order;   -- undo items, keep order

    INSERT INTO order_items (order_id, product_id) VALUES (LASTVAL(), 12);
COMMIT;
```

**ACID:**
- **Atomicity** — all-or-nothing; partial failure rolls everything back
- **Consistency** — constraints, triggers, foreign keys always satisfied after commit
- **Isolation** — concurrent transactions behave as if sequential (degree controlled by isolation level)
- **Durability** — committed data survives crashes (WAL/redo log)

---

## Isolation Levels

| Level | Dirty Read | Non-repeatable Read | Phantom Read |
|-------|-----------|---------------------|-------------|
| READ UNCOMMITTED | possible | possible | possible |
| READ COMMITTED | prevented | possible | possible |
| REPEATABLE READ | prevented | prevented | possible |
| SERIALIZABLE | prevented | prevented | prevented |

- **Dirty read** — read uncommitted data from another transaction that later rolls back
- **Non-repeatable read** — same row returns different value within same transaction (another transaction committed an update)
- **Phantom read** — same query returns different rows (another transaction inserted/deleted rows)

```sql
-- Set isolation level for a transaction
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;
-- ...
COMMIT;
```

PostgreSQL default: **READ COMMITTED**. MySQL InnoDB default: **REPEATABLE READ** (uses snapshot, prevents most phantom reads).

---

## Locking

### Optimistic vs Pessimistic

| Strategy | How | When |
|----------|-----|------|
| **Optimistic** | No DB lock; detect conflict at commit (`@Version`) | Low contention, reads >> writes |
| **Pessimistic** | Acquire DB lock immediately; block other transactions | High contention, conflict is expensive |

### SELECT FOR UPDATE (Pessimistic)

```sql
-- Lock rows for the duration of the transaction
BEGIN;
SELECT * FROM inventory
WHERE product_id = 42
FOR UPDATE;                -- other transactions block on this row

UPDATE inventory SET quantity = quantity - 1 WHERE product_id = 42;
COMMIT;

-- FOR UPDATE SKIP LOCKED — process a work queue without blocking
SELECT * FROM job_queue
WHERE status = 'PENDING'
ORDER BY created_at
LIMIT 10
FOR UPDATE SKIP LOCKED;   -- skip rows already locked by other workers
```

```sql
-- FOR SHARE — shared lock, prevents writes but allows concurrent reads
SELECT * FROM products WHERE id = 42 FOR SHARE;
```

### Advisory Locks (PostgreSQL)

Application-level distributed locks — no table row needed.

```sql
-- Session-level (held until released or session ends)
SELECT pg_advisory_lock(42);          -- acquire (blocks if taken)
SELECT pg_try_advisory_lock(42);      -- acquire without blocking (returns bool)
SELECT pg_advisory_unlock(42);

-- Transaction-level (released automatically at COMMIT/ROLLBACK)
SELECT pg_advisory_xact_lock(42);
```

---

## Indexes

```sql
-- B-tree (default) — equality, range, ORDER BY, LIKE 'prefix%'
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Composite — column ORDER matters: leftmost prefix rule
CREATE INDEX idx_orders_user_status ON orders(user_id, status);
-- Useful for: WHERE user_id = ? AND status = ?
--             WHERE user_id = ?
-- NOT useful: WHERE status = ?  (no leftmost prefix)

-- Unique
CREATE UNIQUE INDEX idx_users_email ON users(email);

-- Partial — index only a subset of rows
CREATE INDEX idx_pending_orders ON orders(created_at)
WHERE status = 'PENDING';

-- Covering — INCLUDE adds non-key columns to avoid heap fetch
CREATE INDEX idx_orders_covering ON orders(user_id, status)
INCLUDE (total, created_at);

-- Expression index
CREATE INDEX idx_lower_email ON users(LOWER(email));
-- Query must use LOWER(email) to hit this index

-- GIN — full-text search, JSONB, arrays (PostgreSQL)
CREATE INDEX idx_doc_content ON documents USING GIN(to_tsvector('english', content));
CREATE INDEX idx_tags ON products USING GIN(tags);     -- tags is an array column

-- Hash — equality only, faster than B-tree for =
CREATE INDEX idx_session_token ON sessions USING HASH(token);
```

### Index Design Rules

1. Index columns in `WHERE`, `JOIN ON`, `ORDER BY`, `GROUP BY`
2. High-cardinality columns benefit most (email > gender)
3. Composite: put equality columns first, range columns last
4. Every write pays the index maintenance cost — don't over-index
5. Partial indexes are smaller and faster when only a subset matters
6. Covering indexes avoid the heap fetch ("index-only scan")

---

## EXPLAIN ANALYZE

`EXPLAIN` shows the query plan. `EXPLAIN ANALYZE` actually executes and shows real timings.

```sql
EXPLAIN ANALYZE
SELECT u.name, COUNT(o.id)
FROM users u
LEFT JOIN orders o ON o.user_id = u.id
WHERE u.active = true
GROUP BY u.id;
```

```
Gather  (cost=... rows=... width=...) (actual time=... rows=... loops=...)
  -> Hash Aggregate
     -> Hash Left Join
          Hash Cond: (o.user_id = u.id)
          -> Seq Scan on orders     ← full table scan — no index on user_id!
          -> Bitmap Heap Scan on users
               Filter: (active = true)
               -> Bitmap Index Scan on idx_users_active
```

**Key nodes to spot:**

| Node | Meaning | Action |
|------|---------|--------|
| `Seq Scan` | Full table scan | Add index if table is large |
| `Index Scan` | Uses index, fetches heap | Good — check filter selectivity |
| `Index Only Scan` | No heap fetch needed | Best — covering index |
| `Nested Loop` | Row-by-row join | Good for small inner table |
| `Hash Join` | Build hash table, probe | Good for larger tables |
| `Merge Join` | Both sides sorted | Good when both sides pre-sorted |
| `Sort` | Explicit sort step | Consider index on ORDER BY column |

```sql
-- Common EXPLAIN tips
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)  -- detailed buffer usage
SELECT ...;

-- Check estimated vs actual rows — large discrepancy → stale statistics
-- Fix: ANALYZE table_name;   or configure autovacuum
```

---

## Schema Migrations — Flyway & Liquibase

Never apply DDL changes by hand — use a migration tool so schema and code evolve together and CI/CD can apply them automatically.

### Flyway

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.flywaydb</groupId>
    <artifactId>flyway-core</artifactId>
</dependency>
```

```
src/main/resources/db/migration/
├── V1__create_users_table.sql
├── V2__create_orders_table.sql
├── V3__add_status_to_orders.sql
└── V4__add_index_orders_user_id.sql
```

```sql
-- V1__create_users_table.sql
CREATE TABLE users (
    id         BIGSERIAL PRIMARY KEY,
    email      VARCHAR(255) NOT NULL UNIQUE,
    name       VARCHAR(255) NOT NULL,
    active     BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

```yaml
# application.yml
spring:
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: false   # true only when adding Flyway to existing DB
    validate-on-migrate: true    # fail fast if checksums don't match
```

Flyway creates a `flyway_schema_history` table and applies migrations in version order. Already-applied versions are skipped.

### Liquibase

```yaml
# src/main/resources/db/changelog/db.changelog-master.yaml
databaseChangeLog:
  - include:
      file: db/changelog/001-create-users.yaml
  - include:
      file: db/changelog/002-create-orders.yaml
```

```yaml
# db/changelog/001-create-users.yaml
databaseChangeLog:
  - changeSet:
      id: 001
      author: alice
      changes:
        - createTable:
            tableName: users
            columns:
              - column:
                  name: id
                  type: BIGINT
                  autoIncrement: true
                  constraints:
                    primaryKey: true
              - column:
                  name: email
                  type: VARCHAR(255)
                  constraints:
                    nullable: false
                    unique: true
```

**Flyway vs Liquibase:**

| | Flyway | Liquibase |
|--|--------|-----------|
| Format | SQL (or Java) | XML, YAML, JSON, SQL |
| Versioning | Sequential (V1, V2…) | ChangeSet IDs |
| Rollback | Manual undo script | Auto-generated (for some ops) |
| Popularity | More common in Spring projects | More enterprise features |

---

## Connection Pooling — HikariCP

HikariCP is the default Spring Boot connection pool. A pool keeps DB connections open and reuses them — opening a new TCP + TLS connection on every request is too slow.

```yaml
# application.yml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: myuser
    password: secret
    hikari:
      pool-name: HikariPool-Orders
      maximum-pool-size: 20      # max connections in pool (tune to DB max_connections)
      minimum-idle: 5            # keep 5 connections alive even when idle
      idle-timeout: 600000       # remove idle connections after 10 min
      connection-timeout: 30000  # throw if no connection available in 30s
      max-lifetime: 1800000      # recycle connections after 30 min (< DB timeout)
      connection-test-query: SELECT 1  # only needed for JDBC4-non-compliant drivers
```

**Sizing the pool:**

```
DB max_connections (PostgreSQL default: 100)

Formula: pool_size = (core_count * 2) + effective_spindle_count
# For a 4-core server with SSDs: (4 * 2) + 1 = ~9 per app instance

# If 3 app instances × 20 = 60 connections → leave headroom for admin/monitoring
# Never set maximum-pool-size > (max_connections / app_instances)
```

::: warning Connection pool starvation
`@Transactional` methods hold a connection for their entire duration. Avoid long transactions (HTTP calls inside `@Transactional`, user-facing waits). A pool of 20 with 21 slow requests will deadlock.
:::

---

## Interview Quick-Fire

**Q: What is the difference between `WHERE` and `HAVING`?**
`WHERE` filters rows before grouping — operates on individual row columns. `HAVING` filters groups after `GROUP BY` — operates on aggregate results. You can't use aggregate functions in `WHERE`; you can in `HAVING`.

**Q: What is the leftmost prefix rule for composite indexes?**
A composite index `(a, b, c)` can be used for queries filtering on `a`, `a AND b`, or `a AND b AND c` — but not `b` or `c` alone (no leftmost prefix). Column order matters: put equality-filter columns first, range-filter columns last for maximum use.

**Q: What is `SELECT FOR UPDATE SKIP LOCKED` used for?**
Building a work queue: multiple workers compete for pending jobs. `FOR UPDATE` locks the selected rows; `SKIP LOCKED` makes workers skip rows already locked by another worker rather than blocking — enabling parallel queue processing without deadlocks or duplicate processing.

**Q: What does a Seq Scan in EXPLAIN ANALYZE tell you?**
The planner decided a full sequential table scan is cheaper than using an index — either the table is small, the index selectivity is low (filtering > ~20% of rows), or there's no suitable index. A Seq Scan on a large table in a hot path means you need an index. Check `actual rows` vs `estimated rows` — a large gap means stale table statistics (`ANALYZE`).

**Q: Why does HikariCP matter in a Spring Boot app?**
Opening a database connection (TCP handshake + authentication) takes 20–100 ms. With HikariCP, connections are opened once and reused, reducing per-request overhead to microseconds. Without a pool, a high-traffic app would exhaust database connection limits almost immediately.

<RelatedTopics :topics="['/databases/jpa-hibernate', '/databases/nosql', '/spring/spring-data']" />

[→ Back to Databases Overview](/databases/)
