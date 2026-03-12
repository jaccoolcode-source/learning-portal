---
title: BigQuery, Looker Studio & Analytics Hub
description: BigQuery architecture, SQL dialect, partitioning, clustering, slots, cost optimisation, Java client, Looker Studio dashboards, and Analytics Hub data sharing
category: gcp
pageClass: layout-gcp
difficulty: intermediate
tags: [bigquery, looker-studio, analytics-hub, gcp, data-warehouse, sql, partitioning, clustering]
related:
  - /gcp/iam
  - /databases/sql
estimatedMinutes: 40
---

# BigQuery, Looker Studio & Analytics Hub

<DifficultyBadge level="intermediate" />

BigQuery is GCP's serverless, columnar data warehouse. You run SQL queries against petabyte-scale datasets — no infrastructure to manage, no indexes to build, no cluster to size.

---

## BigQuery Architecture

```
You write SQL
  ↓
Dremel query engine (distributed query execution)
  ↓
Colossus (Google's distributed file system — columnar storage)
  ↓
Jupiter network (petabit internal network — eliminates I/O bottleneck)
```

Key architectural decisions:
- **Columnar storage** — only the columns you SELECT are scanned → pay per bytes scanned
- **Compute and storage are separate** — storage is cheap, compute (slots) is elastic
- **Serverless** — no cluster to provision; Google allocates slots on demand

---

## Core Concepts

### Dataset, Table, View

```
Project
  └── Dataset  (like a database schema — access control boundary)
        ├── Table
        ├── View           (saved SQL query, no data stored)
        ├── Materialised View  (query result cached and auto-refreshed)
        └── External Table     (data lives in Cloud Storage / Drive)
```

### Slots

A **slot** is a unit of BigQuery compute (CPU + RAM + network). On-demand pricing includes 2,000 slots shared per project. Reservations allow dedicated slot allocation.

```
On-demand:    $6.25 per TB scanned (no commitment)
Flat-rate:    reserve N slots, pay per hour regardless of queries run
BigQuery editions (2023+):
  Standard — autoscaling slots, pay per slot·hour
  Enterprise — governance features, BI Engine
```

---

## BigQuery SQL Dialect (Standard SQL)

BigQuery uses **Standard SQL** (ANSI-compliant), not legacy SQL.

### Data Types

| Category | Types |
|----------|-------|
| Numeric | `INT64`, `FLOAT64`, `NUMERIC` (exact decimal), `BIGNUMERIC` |
| String | `STRING`, `BYTES` |
| Date/Time | `DATE`, `TIME`, `DATETIME`, `TIMESTAMP` |
| Semi-structured | `JSON`, `ARRAY<T>`, `STRUCT<field TYPE, ...>` |
| Geography | `GEOGRAPHY` |

### Arrays and Structs

```sql
-- ARRAY — repeated values in one row
SELECT
  name,
  ARRAY_LENGTH(orders) AS order_count,
  orders[OFFSET(0)].amount AS first_order_amount
FROM customers;

-- UNNEST — flatten array into rows
SELECT name, order.amount
FROM customers, UNNEST(orders) AS order;

-- STRUCT — nested record
SELECT
  user.name,
  user.address.city
FROM users;
```

### Window Functions

```sql
SELECT
  user_id,
  order_date,
  amount,
  SUM(amount) OVER (PARTITION BY user_id ORDER BY order_date
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total,
  RANK()       OVER (PARTITION BY user_id ORDER BY amount DESC) AS rank_by_amount,
  LAG(amount)  OVER (PARTITION BY user_id ORDER BY order_date)  AS prev_amount
FROM orders;
```

### Date/Time Functions (Common Interview Topics)

```sql
-- Current time
SELECT CURRENT_TIMESTAMP(), CURRENT_DATE(), CURRENT_DATETIME()

-- Truncate to period
SELECT DATE_TRUNC(order_date, MONTH)   -- first day of month
SELECT TIMESTAMP_TRUNC(ts, HOUR)

-- Extract parts
SELECT EXTRACT(YEAR FROM order_date)
SELECT EXTRACT(DAYOFWEEK FROM order_date)  -- 1=Sunday

-- Date arithmetic
SELECT DATE_ADD(order_date, INTERVAL 7 DAY)
SELECT DATE_DIFF(end_date, start_date, DAY)

-- Format
SELECT FORMAT_DATE('%Y-%m', order_date)
SELECT FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%S', ts, 'Europe/Warsaw')
```

### DML

```sql
-- INSERT
INSERT INTO dataset.table (col1, col2)
VALUES ('a', 1), ('b', 2);

-- UPDATE (BigQuery DML is not ACID like OLTP databases)
UPDATE dataset.orders
SET status = 'shipped'
WHERE order_date < '2024-01-01' AND status = 'pending';

-- MERGE (upsert)
MERGE dataset.target AS T
USING dataset.source AS S ON T.id = S.id
WHEN MATCHED THEN
  UPDATE SET T.value = S.value
WHEN NOT MATCHED THEN
  INSERT (id, value) VALUES (S.id, S.value);

-- DELETE
DELETE FROM dataset.orders WHERE status = 'cancelled';
```

::: warning DML Performance
DML (UPDATE/DELETE/MERGE) in BigQuery rewrites entire partitions. For high-frequency updates use Cloud Spanner or Cloud SQL. BigQuery DML is suited for batch corrections, not OLTP patterns.
:::

---

## Partitioning

Partitioning splits a table into segments by a column value. BigQuery **only scans matching partitions** → massive cost and time savings.

### Partition Types

| Type | Column | Granularity |
|------|--------|------------|
| Time-unit | `DATE`, `DATETIME`, `TIMESTAMP` | DAY (default), HOUR, MONTH, YEAR |
| Integer range | `INT64` | Custom range + interval |
| Ingestion time | `_PARTITIONTIME` (pseudo-column) | DAY, HOUR |

```sql
-- Create partitioned table
CREATE TABLE dataset.events
PARTITION BY DATE(event_timestamp)    -- DATE partition on TIMESTAMP column
OPTIONS (
  partition_expiration_days = 90      -- auto-delete partitions older than 90 days
)
AS SELECT * FROM dataset.events_raw;

-- Query — always filter on partition column for cost savings
SELECT *
FROM dataset.events
WHERE DATE(event_timestamp) BETWEEN '2024-01-01' AND '2024-01-31';

-- See partitions
SELECT * FROM dataset.INFORMATION_SCHEMA.PARTITIONS
WHERE table_name = 'events';
```

::: tip Partition Pruning
If your query doesn't filter on the partition column, BigQuery scans all partitions. Always include a `WHERE` clause on the partition column in production queries.
:::

---

## Clustering

Clustering sorts data within each partition (or table) by up to 4 columns. BigQuery skips blocks that don't match your filter — called **block pruning**.

```sql
CREATE TABLE dataset.events
PARTITION BY DATE(event_timestamp)
CLUSTER BY user_id, event_type    -- up to 4 columns; order matters
AS SELECT * FROM dataset.events_raw;

-- Clustering is most effective when filtering on clustered columns
SELECT *
FROM dataset.events
WHERE DATE(event_timestamp) = '2024-01-15'
  AND user_id = 'u-123'           -- hits clustering block pruning
  AND event_type = 'purchase';
```

### Partitioning vs Clustering

| | Partitioning | Clustering |
|-|-------------|------------|
| Granularity | Segment-level (partition) | Block-level (within segment) |
| Cost savings | Guaranteed (partition pruned) | Estimated (block pruning, best-effort) |
| DML | Partition-level rewrites | Full cluster column awareness |
| Best for | Date/time filters, data expiry | High-cardinality columns (user_id, event_type) |
| Combine? | Yes — partition + cluster together |

---

## Cost Optimisation

```sql
-- 1. Preview bytes scanned before running (no charge for dry run)
-- In console: query validator shows "This query will process X MB"

-- 2. SELECT only needed columns (columnar = you pay for what you scan)
-- AVOID: SELECT *
-- USE:   SELECT user_id, event_type, created_at

-- 3. Use partitioned tables + filter on partition column

-- 4. Use materialised views for repeated aggregations
CREATE MATERIALIZED VIEW dataset.daily_revenue AS
SELECT DATE(order_timestamp) AS order_date, SUM(amount) AS revenue
FROM dataset.orders
GROUP BY 1;

-- 5. Table expiry — don't keep temp tables forever
CREATE TABLE dataset.temp_analysis
OPTIONS (expiration_timestamp = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 1 DAY))
AS SELECT ...;

-- 6. BI Engine — in-memory cache for Looker Studio (sub-second response)
-- Configured in Cloud Console → BigQuery → BI Engine reservations
```

---

## Java Client

```xml
<dependency>
  <groupId>com.google.cloud</groupId>
  <artifactId>google-cloud-bigquery</artifactId>
  <!-- version managed by libraries-bom -->
</dependency>
```

### Run a Query

```java
import com.google.cloud.bigquery.*;

BigQuery bigQuery = BigQueryOptions.getDefaultInstance().getService();

String sql = """
    SELECT user_id, COUNT(*) AS events
    FROM `my-project.analytics.events`
    WHERE DATE(event_timestamp) = @date
    GROUP BY user_id
    ORDER BY events DESC
    LIMIT 100
    """;

QueryJobConfiguration queryConfig = QueryJobConfiguration.newBuilder(sql)
    .addNamedParameter("date", QueryParameterValue.date("2024-01-15"))
    .setUseLegacySql(false)
    .build();

TableResult result = bigQuery.query(queryConfig);
for (FieldValueList row : result.iterateAll()) {
    String userId = row.get("user_id").getStringValue();
    long events   = row.get("events").getLongValue();
    System.out.printf("user=%s events=%d%n", userId, events);
}
```

::: tip Always Use Named Parameters
Named parameters (`:date` → `@date`) prevent SQL injection and allow BigQuery to cache query plans.
:::

### Load Data from Cloud Storage

```java
TableId tableId = TableId.of("my-project", "dataset", "table");
LoadJobConfiguration loadConfig = LoadJobConfiguration.newBuilder(
        tableId, "gs://my-bucket/data/*.parquet")
    .setFormatOptions(FormatOptions.parquet())
    .setWriteDisposition(JobInfo.WriteDisposition.WRITE_TRUNCATE)
    .setAutodetect(true)
    .build();

Job loadJob = bigQuery.create(JobInfo.of(loadConfig));
loadJob = loadJob.waitFor();

if (loadJob.getStatus().getError() != null) {
    throw new RuntimeException("Load failed: " + loadJob.getStatus().getError());
}
```

### Insert Rows (Streaming — for real-time ingestion)

```java
// Streaming insert — immediately queryable, but costs more than batch load
InsertAllRequest insertRequest = InsertAllRequest.newBuilder(tableId)
    .addRow("row-id-1", Map.of(
        "user_id", "u-123",
        "event_type", "click",
        "event_timestamp", "2024-01-15T10:30:00Z"
    ))
    .build();

InsertAllResponse response = bigQuery.insertAll(insertRequest);
if (response.hasErrors()) {
    response.getInsertErrors().forEach((rowIndex, errors) ->
        log.error("Row {} failed: {}", rowIndex, errors));
}
```

### Stream Insert vs Batch Load

| | Streaming Insert | Batch Load |
|-|-----------------|-----------|
| Latency | Seconds | Minutes |
| Cost | $0.01/200 MB | **Free** (native formats) |
| Immediately queryable | Yes | Yes (after job completes) |
| Use case | Real-time dashboards | ETL pipelines, data migration |

---

## Looker Studio

Looker Studio (formerly Data Studio) is Google's free BI dashboard tool, tightly integrated with BigQuery.

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Data Source** | Connection to BigQuery table/view/custom SQL |
| **Report** | Dashboard with charts, tables, filters |
| **Blend** | Join data from multiple sources (left join on key) |
| **Calculated Field** | Custom metric/dimension using Looker Studio formula language |
| **Filter Control** | Interactive filter widget — users select values |
| **Date Range Control** | Global date picker that affects all charts using `_PARTITIONDATE` |

### BigQuery ↔ Looker Studio Integration

```
BigQuery Table/View
  ↓
Looker Studio Data Source (connects via BigQuery connector)
  ↓
Cached in BI Engine (optional — sub-second queries)
  ↓
Report (charts read from data source)
```

**Gotchas:**
- Looker Studio sends one BigQuery query **per chart** per page refresh — design views/materialised views to pre-aggregate
- Enable **BI Engine** reservation in BigQuery to cache data in-memory for Looker Studio
- Use **Extract Data Source** (Looker Studio's own cache) for static/slow-changing data to avoid repeated BigQuery charges
- **Date dimension** in charts must match your table's partition column for partition pruning to work

### Calculated Fields (Common Patterns)

```
-- Looker Studio formula syntax (not SQL)

-- Conditional
CASE WHEN Revenue > 1000 THEN "High" ELSE "Low" END

-- Date formatting
FORMAT_DATETIME("%Y-%m", Date)

-- Running total (use table chart with running sum metric)
-- No window functions in Looker Studio — use BigQuery views for complex logic
```

---

## Analytics Hub

Analytics Hub is a data exchange platform that lets organisations publish BigQuery datasets as **listings** that other organisations or projects can subscribe to.

### Key Roles

| Role | Description |
|------|-------------|
| **Publisher** | Creates an Exchange, publishes Listings (datasets) |
| **Subscriber** | Discovers listings, creates a linked dataset in their own project |
| **Exchange** | Container for listings (org-level or public) |

### How Linked Datasets Work

```
Publisher Project                     Subscriber Project
dataset.sales_data  ─── Listing ───→  linked_dataset.sales_data
(source data stays                     (reads-through to publisher's
 in publisher's storage)                storage — no data copy)
```

- Data is **never copied** to subscriber's project — queries run against publisher's storage
- Publisher pays for storage; subscriber pays for query compute
- Publisher controls access: can revoke at any time
- Subscriber can query but not modify the data

### Use Cases
- Share curated datasets across business units without duplicating data
- Monetise data products (Analytics Hub marketplace)
- Consume third-party datasets (Google public datasets, financial data providers)

---

## Interview Quick-Fire

**Q: Why is BigQuery fast?**
Columnar storage, distributed query execution (Dremel), compute/storage separation, and petabit internal network.

**Q: What's the difference between a view and a materialised view?**
A view is a saved query — data is not stored, runs on every access. A materialised view stores the query result and refreshes automatically; ideal for repeated aggregations.

**Q: When would you partition vs cluster?**
Partition when you regularly filter on a date/time or integer range — guarantees partition pruning. Cluster for high-cardinality columns within a partition (user_id, event_type) where block pruning reduces scan further.

**Q: How does Analytics Hub differ from just sharing a dataset?**
Dataset sharing (IAM) gives access to the dataset in your project. Analytics Hub creates a linked dataset in the subscriber's own project — they use their own billing, and the data never leaves the publisher's storage.

<RelatedTopics :topics="['/gcp/iam', '/gcp/pubsub', '/databases/sql']" />

[→ Back to GCP Overview](/gcp/)
