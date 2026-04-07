---
title: Databases Quiz
---

<script setup>
const questions = [
  {
    question: "What is the difference between INNER JOIN and LEFT JOIN?",
    options: [
      "INNER JOIN returns all rows from both tables; LEFT JOIN returns only matching rows",
      "INNER JOIN returns only rows with matching values in both tables; LEFT JOIN returns all rows from the left table plus matching rows from the right (NULL for non-matches)",
      "They are identical — LEFT JOIN is just an alias for INNER JOIN",
      "INNER JOIN is faster; LEFT JOIN includes indexes automatically"
    ],
    answer: 1,
    explanation: "INNER JOIN: only rows where the join condition is satisfied in both tables. LEFT JOIN (LEFT OUTER JOIN): all rows from the left table; matching rows from the right table; NULL values where there is no match. Use LEFT JOIN when you need records even without a corresponding row in the right table."
  },
  {
    question: "What are the four ACID properties of a database transaction?",
    options: [
      "Atomicity, Consistency, Isolation, Durability",
      "Availability, Consistency, Isolation, Distribution",
      "Atomicity, Concurrency, Integrity, Durability",
      "Authorization, Consistency, Idempotency, Delivery"
    ],
    answer: 0,
    explanation: "ACID: Atomicity (all or nothing — transaction either fully commits or fully rolls back), Consistency (transaction brings DB from one valid state to another), Isolation (concurrent transactions appear sequential), Durability (committed data survives crashes, persisted to durable storage)."
  },
  {
    question: "What does the READ COMMITTED isolation level prevent?",
    options: [
      "Dirty reads only",
      "Dirty reads and non-repeatable reads",
      "Dirty reads, non-repeatable reads, and phantom reads",
      "Only phantom reads"
    ],
    answer: 0,
    explanation: "READ COMMITTED prevents dirty reads (reading uncommitted data from other transactions). It does NOT prevent non-repeatable reads (same row read twice returns different values if another transaction commits between reads) or phantom reads (new rows appear when a range is re-queried). REPEATABLE READ prevents both; SERIALIZABLE prevents all three."
  },
  {
    question: "What is the N+1 query problem in JPA/Hibernate?",
    options: [
      "A query that returns N rows plus 1 header row",
      "Fetching N parent entities with 1 query, then issuing 1 additional query per entity to load its lazy-loaded children — N+1 total queries",
      "A performance problem caused by having more than N indexes on a table",
      "Running the same query N+1 times due to missing query caching"
    ],
    answer: 1,
    explanation: "Classic ORM problem: load a list of Order entities (1 query), then access order.getItems() for each (N queries). Fix with JOIN FETCH in JPQL, entity graphs, or Hibernate's @BatchSize. The N+1 problem causes dramatic performance degradation as N grows."
  },
  {
    question: "What is the JPA entity lifecycle and which states exist?",
    options: [
      "Created, Persisted, Deleted",
      "Transient, Managed, Detached, Removed",
      "New, Active, Expired, Archived",
      "Uncommitted, Committed, Rolled back"
    ],
    answer: 1,
    explanation: "JPA entity states: Transient (new object, not tracked by EntityManager), Managed (tracked by persistence context — changes auto-synced to DB on flush), Detached (was managed, now EntityManager closed or entity detached — changes not synced), Removed (marked for deletion, deleted on commit)."
  },
  {
    question: "What type of database index is most effective for a query like `WHERE email = 'user@example.com'`?",
    options: [
      "Full-text index",
      "B-tree index on the email column",
      "Hash index — but only for in-memory tables",
      "Composite index on all columns in the table"
    ],
    answer: 1,
    explanation: "A B-tree index on email allows O(log n) lookup for equality and range queries. Hash indexes are faster for exact equality (O(1)) but don't support range queries (>, <, BETWEEN, LIKE prefix). Most relational databases default to B-tree. Full-text indexes are for natural language text search."
  },
  {
    question: "What is optimistic locking in JPA, and when should you use it?",
    options: [
      "A lock that assumes conflicts are common and locks the row immediately on read",
      "A concurrency control mechanism using a @Version field; a transaction detects concurrent modification at commit time and throws OptimisticLockException instead of locking",
      "A JPA hint to disable locking entirely for maximum throughput",
      "A lock mode that optimistically assumes transactions will always commit without retrying"
    ],
    answer: 1,
    explanation: "Optimistic locking uses a @Version column (integer or timestamp). On update, Hibernate checks the version matches — if another transaction updated it first, it throws OptimisticLockException. Use when conflicts are rare (low-contention scenarios). For high-contention cases, use pessimistic locking (SELECT FOR UPDATE)."
  },
  {
    question: "What is the difference between a clustered and a non-clustered index?",
    options: [
      "Clustered indexes are faster; non-clustered indexes are stored in a separate file",
      "A clustered index determines the physical order of data rows in the table (one per table); a non-clustered index is a separate structure with pointers to the actual data rows",
      "Non-clustered indexes use B-trees; clustered indexes use hash tables",
      "Clustered indexes only work on primary keys; non-clustered work on all columns"
    ],
    answer: 1,
    explanation: "Clustered index: data rows are physically sorted by the index key (e.g., primary key). There can be only one. Non-clustered index: separate structure containing index key + pointer (row ID or clustered key) to the actual row. A table can have many non-clustered indexes. Clustered gives faster range scans; non-clustered adds lookup overhead."
  },
  {
    question: "What is lazy loading in Hibernate, and what is the 'Open Session in View' anti-pattern?",
    options: [
      "Lazy loading fetches related entities immediately; Open Session in View is a best practice for web apps",
      "Lazy loading defers fetching related entities until accessed; Open Session in View keeps the Hibernate session open during view rendering, which causes unintended lazy queries in the presentation layer",
      "Open Session in View prevents lazy loading by eagerly fetching all relations",
      "Lazy loading is only available with @ManyToMany; eager loading is the default for all other relations"
    ],
    answer: 1,
    explanation: "Lazy loading fetches associations on access (not at query time). Open Session in View extends the session to the view layer, allowing lazy loading there — but this triggers unintended queries in the presentation layer and hides N+1 problems. Best practice: fetch everything needed in the service layer and close the session before the view."
  },
  {
    question: "What is database sharding?",
    options: [
      "Splitting a table vertically into separate tables by column groups",
      "Horizontally partitioning data across multiple database instances where each shard holds a subset of rows, distributing load and storage",
      "Replicating the same data to multiple read replicas for high availability",
      "Compressing database files into smaller shards to save disk space"
    ],
    answer: 1,
    explanation: "Sharding horizontally partitions data across multiple DB instances (shards). Each shard holds a subset of rows (e.g., users with ID 1–1M on shard 1, 1M–2M on shard 2). Enables horizontal scaling but adds complexity: cross-shard queries, rebalancing, and distributed transactions become harder. Choose shard key carefully to avoid hotspots."
  },
  {
    question: "What is a covering index?",
    options: [
      "An index that covers all tables in the database schema",
      "An index that contains all columns needed for a query, allowing the database to satisfy the query from the index alone without accessing the table",
      "A full-text index that covers all text columns",
      "An index automatically created by the database to cover missing index gaps"
    ],
    answer: 1,
    explanation: "A covering index includes all columns referenced in a query (WHERE, SELECT, ORDER BY, JOIN). The database can answer the query entirely from the index without a 'table lookup'. This eliminates a round-trip to the heap/clustered index and dramatically improves query performance for frequent queries."
  },
  {
    question: "In the context of NoSQL databases, what does BASE stand for?",
    options: [
      "Basically Available, Scalable, Eventually consistent",
      "Basically Available, Soft state, Eventually consistent",
      "Balanced Availability, Strong consistency, Eventual delivery",
      "Broadly Available, Structured, Elastic"
    ],
    answer: 1,
    explanation: "BASE is the NoSQL counterpart to ACID: Basically Available (the system guarantees availability), Soft state (state may change over time without input, due to eventual consistency), Eventually consistent (the system will eventually become consistent given no new updates). BASE trades consistency for availability and partition tolerance (AP in CAP)."
  }
]
</script>

# Databases Quiz

Test your knowledge of SQL, transactions, JPA/Hibernate lifecycle, indexes, and NoSQL principles.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Databases study pages](/databases/).
