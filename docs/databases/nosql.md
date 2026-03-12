---
title: NoSQL Databases
description: NoSQL deep-dive — Redis data structures and patterns, MongoDB aggregation pipeline, Cassandra data modeling, Elasticsearch, CAP theorem, and when to use each
category: databases
pageClass: layout-databases
difficulty: intermediate
tags: [nosql, redis, mongodb, cassandra, elasticsearch, cap-theorem, caching, distributed-locks]
related:
  - /databases/sql
  - /databases/jpa-hibernate
  - /messaging/kafka-core
estimatedMinutes: 35
---

# NoSQL Databases

<DifficultyBadge level="intermediate" />

NoSQL databases trade some SQL guarantees for horizontal scalability, flexible schemas, or specialised access patterns. Choosing the right one requires understanding the data model and query requirements.

---

## Types

| Type | Examples | Best For |
|------|---------|---------|
| **Key-Value** | Redis, DynamoDB | Caching, sessions, counters, leaderboards, queues |
| **Document** | MongoDB, Couchbase | Flexible JSON documents, hierarchical/nested data |
| **Wide-Column** | Cassandra, HBase | Time-series, write-heavy, massive scale, fixed access patterns |
| **Graph** | Neo4j, Amazon Neptune | Traversing relationships, social graphs, recommendations |
| **Search** | Elasticsearch, OpenSearch | Full-text search, aggregations, log analytics |

---

## CAP Theorem

A distributed system can only guarantee **two of three** properties simultaneously:

- **C — Consistency**: every read returns the most recent write (or an error)
- **A — Availability**: every request gets a response (not necessarily latest data)
- **P — Partition Tolerance**: system continues operating despite network splits

Networks always fail → **P is non-negotiable** → choose **CP** or **AP**:

```
CP (Consistent + Partition Tolerant):
  → During partition: some nodes refuse requests to avoid serving stale data
  → Examples: PostgreSQL, MongoDB (primary reads), HBase, Zookeeper

AP (Available + Partition Tolerant):
  → During partition: nodes return possibly stale data but stay responsive
  → Examples: Cassandra, DynamoDB, CouchDB, DNS
```

### PACELC Extension

PACELC extends CAP: even when there's No partition (E — Else), there's still a tradeoff between **Latency** and **Consistency**:

| System | Partition | Else |
|--------|-----------|------|
| PostgreSQL | CP | Low latency, high consistency |
| Cassandra | AP | Low latency, tunable consistency |
| DynamoDB | AP | Low latency, eventual consistency |
| MongoDB | CP | Lower latency vs stronger consistency |

---

## Redis

Redis is an in-memory data structure store — used as a cache, message broker, and for distributed patterns.

### Data Structures

```java
// Spring Data Redis via RedisTemplate
@Autowired RedisTemplate<String, Object> redis;

// ── Strings (most common) ──────────────────────────────────────────────────
redis.opsForValue().set("user:42:session", sessionData);
redis.opsForValue().set("user:42:session", sessionData, 30, TimeUnit.MINUTES); // with TTL
String val = (String) redis.opsForValue().get("user:42:session");
redis.opsForValue().increment("page:views:home");        // atomic counter
redis.opsForValue().increment("page:views:home", 5L);

// ── Hashes (field-value pairs — good for objects) ─────────────────────────
redis.opsForHash().put("product:99", "name", "Widget");
redis.opsForHash().put("product:99", "stock", "100");
Map<Object, Object> product = redis.opsForHash().entries("product:99");
redis.opsForHash().increment("product:99", "stock", -1);  // decrement stock

// ── Lists (ordered, allows duplicates) ────────────────────────────────────
redis.opsForList().rightPush("job:queue", job);          // enqueue
Object job = redis.opsForList().leftPop("job:queue");    // dequeue (FIFO)
redis.opsForList().leftPush("recent:users", userId);     // stack push
redis.opsForList().trim("recent:users", 0, 99);          // keep last 100

// ── Sets (unordered, unique) ───────────────────────────────────────────────
redis.opsForSet().add("online:users", "alice", "bob");
Long count = redis.opsForSet().size("online:users");
Boolean isMember = redis.opsForSet().isMember("online:users", "alice");
Set<Object> union = redis.opsForSet().union("group:a", "group:b");

// ── Sorted Sets (score-ranked, unique members) ─────────────────────────────
redis.opsForZSet().add("leaderboard", "alice", 1500.0);
redis.opsForZSet().incrementScore("leaderboard", "alice", 100.0);
// Top 10 (highest scores first)
Set<Object> top10 = redis.opsForZSet().reverseRange("leaderboard", 0, 9);
// With scores
Set<ZSetOperations.TypedTuple<Object>> topWithScores =
    redis.opsForZSet().reverseRangeWithScores("leaderboard", 0, 9);
// Rank of a player (0-based)
Long rank = redis.opsForZSet().reverseRank("leaderboard", "alice");
```

### TTL and Expiry Patterns

```java
// Set TTL on key
redis.expire("session:abc123", 30, TimeUnit.MINUTES);
redis.expireAt("promo:flash-sale", Instant.parse("2024-12-25T00:00:00Z"));

// Check remaining TTL
Long ttl = redis.getExpire("session:abc123", TimeUnit.SECONDS);

// Sliding expiry — reset TTL on access
public Object getSession(String token) {
    Object session = redis.opsForValue().get("session:" + token);
    if (session != null) {
        redis.expire("session:" + token, 30, TimeUnit.MINUTES);  // extend
    }
    return session;
}
```

### Spring Cache Abstraction

```java
@Configuration
@EnableCaching
public class CacheConfig {
    @Bean
    public RedisCacheManager cacheManager(RedisConnectionFactory factory) {
        RedisCacheConfiguration config = RedisCacheConfiguration.defaultCacheConfig()
            .entryTtl(Duration.ofMinutes(10))
            .disableCachingNullValues()
            .serializeValuesWith(RedisSerializationContext.SerializationPair
                .fromSerializer(new GenericJackson2JsonRedisSerializer()));

        return RedisCacheManager.builder(factory)
            .cacheDefaults(config)
            .withCacheConfiguration("products", config.entryTtl(Duration.ofHours(1)))
            .build();
    }
}

@Service
public class ProductService {
    @Cacheable(value = "products", key = "#id")
    public Product findById(Long id) { return repo.findById(id).orElseThrow(); }

    @CachePut(value = "products", key = "#product.id")
    public Product update(Product product) { return repo.save(product); }

    @CacheEvict(value = "products", key = "#id")
    public void delete(Long id) { repo.deleteById(id); }

    @CacheEvict(value = "products", allEntries = true)  // flush entire cache
    @Scheduled(cron = "0 0 * * * *")
    public void evictAll() {}
}
```

### Pub/Sub

```java
// Publisher
@Autowired StringRedisTemplate redis;

public void publishEvent(String channel, String message) {
    redis.convertAndSend(channel, message);
}

// Subscriber
@Component
public class OrderEventListener implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        String body = new String(message.getBody());
        // handle event
    }
}

@Configuration
public class RedisSubscriberConfig {
    @Bean
    public RedisMessageListenerContainer container(
            RedisConnectionFactory factory, OrderEventListener listener) {
        RedisMessageListenerContainer container = new RedisMessageListenerContainer();
        container.setConnectionFactory(factory);
        container.addMessageListener(listener, new PatternTopic("orders.*"));
        return container;
    }
}
```

### Distributed Lock

Redis-based distributed lock — prevents concurrent access across multiple app instances.

```java
@Service
public class DistributedLockService {

    @Autowired StringRedisTemplate redis;

    private static final String LOCK_PREFIX = "lock:";
    private static final Duration DEFAULT_TTL = Duration.ofSeconds(30);

    public boolean tryLock(String resource, String ownerId) {
        // SET key value NX PX ttl — atomic: only sets if key doesn't exist
        Boolean acquired = redis.opsForValue()
            .setIfAbsent(LOCK_PREFIX + resource, ownerId, DEFAULT_TTL);
        return Boolean.TRUE.equals(acquired);
    }

    public void unlock(String resource, String ownerId) {
        // Only release if we own the lock (Lua script for atomicity)
        String script = """
            if redis.call('get', KEYS[1]) == ARGV[1] then
                return redis.call('del', KEYS[1])
            else
                return 0
            end
            """;
        redis.execute(
            new DefaultRedisScript<>(script, Long.class),
            List.of(LOCK_PREFIX + resource),
            ownerId
        );
    }
}

// Usage
String lockId = UUID.randomUUID().toString();
if (lockService.tryLock("inventory:42", lockId)) {
    try {
        // exclusive access to inventory 42
    } finally {
        lockService.unlock("inventory:42", lockId);
    }
}
```

### Pipelining

Batch multiple commands into a single network round-trip.

```java
List<Object> results = redis.executePipelined((RedisCallback<Object>) conn -> {
    for (Long userId : userIds) {
        conn.get(("user:" + userId).getBytes());
    }
    return null;   // always null for pipelining
});
// results contains all values in order
```

---

## MongoDB

MongoDB stores documents (JSON-like BSON) in collections. No fixed schema — each document can have different fields.

### Document Mapping

```java
@Document(collection = "orders")
@CompoundIndex(name = "customer_status_idx", def = "{'customerId': 1, 'status': 1}")
public class Order {
    @Id
    private String id;                    // stored as ObjectId, exposed as String

    @Indexed
    private String customerId;

    @Enumerated
    private OrderStatus status;

    private List<OrderItem> items;        // embedded array — no JOIN needed

    private Address shippingAddress;      // embedded document

    @CreatedDate
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;
}

// Nested documents (no @Document — embedded, not a separate collection)
public class OrderItem {
    private String productId;
    private String productName;
    private int quantity;
    private BigDecimal price;
}
```

### Repository Queries

```java
public interface OrderRepository extends MongoRepository<Order, String> {

    List<Order> findByCustomerId(String customerId);
    List<Order> findByStatusAndCreatedAtAfter(OrderStatus status, LocalDateTime since);

    // MongoDB JSON query
    @Query("{ 'items.productId': ?0, 'status': ?1 }")
    List<Order> findByProductAndStatus(String productId, OrderStatus status);

    // Projection — return only specified fields
    @Query(value = "{ 'customerId': ?0 }",
           fields = "{ 'id': 1, 'status': 1, 'createdAt': 1 }")
    List<OrderSummary> findSummariesByCustomer(String customerId);
}
```

### Aggregation Pipeline

MongoDB's aggregation pipeline processes documents through a sequence of stages.

```java
// Via MongoTemplate
@Autowired MongoTemplate mongo;

public List<CustomerRevenue> getTopCustomers(LocalDateTime since) {
    Aggregation agg = Aggregation.newAggregation(
        // Stage 1: filter
        match(Criteria.where("status").is("COMPLETED")
                      .and("createdAt").gte(since)),

        // Stage 2: unwind array into separate documents
        unwind("items"),

        // Stage 3: group and aggregate
        group("customerId")
            .sum(ArithmeticOperators.Multiply.valueOf("items.price")
                    .multiplyBy("items.quantity")).as("revenue")
            .count().as("orderCount"),

        // Stage 4: sort
        sort(Sort.by(Sort.Direction.DESC, "revenue")),

        // Stage 5: limit
        limit(10),

        // Stage 6: project output shape
        project("revenue", "orderCount")
            .and("_id").as("customerId")
    );

    return mongo.aggregate(agg, "orders", CustomerRevenue.class).getMappedResults();
}
```

```javascript
// Equivalent MongoDB shell pipeline
db.orders.aggregate([
    { $match: { status: "COMPLETED", createdAt: { $gte: ISODate("2024-01-01") } } },
    { $unwind: "$items" },
    { $group: {
        _id: "$customerId",
        revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
        orderCount: { $sum: 1 }
    }},
    { $sort: { revenue: -1 } },
    { $limit: 10 }
])
```

### Common Aggregation Stages

| Stage | Purpose |
|-------|---------|
| `$match` | Filter documents (like `WHERE`) — put early to reduce data |
| `$group` | Group and aggregate (`SUM`, `AVG`, `COUNT`, `PUSH`) |
| `$project` | Shape the output — include/exclude/rename fields |
| `$unwind` | Flatten an array field into separate documents |
| `$lookup` | Left outer join to another collection |
| `$sort` | Order results |
| `$limit` / `$skip` | Pagination |
| `$addFields` | Add computed fields without changing other fields |
| `$facet` | Multiple aggregation pipelines in one pass |

---

## Cassandra

Cassandra is a wide-column store designed for massive write throughput and linear horizontal scaling. Schema design is query-driven — you design tables around your queries, not normalisation.

### Key Concepts

```
Keyspace → Schema namespace (like a database)
  └── Table
        └── Row (identified by primary key)
              └── Column
```

```
Primary Key = Partition Key + Clustering Columns

┌──────────────────────────────────────────────────────┐
│  Partition Key   │  Clustering Columns               │
│  (determines     │  (ordering within partition,      │
│   which node)    │   also part of uniqueness)        │
└──────────────────┴───────────────────────────────────┘
```

### CQL — Cassandra Query Language

```sql
-- Create keyspace (schema)
CREATE KEYSPACE myapp
WITH replication = {'class': 'NetworkTopologyStrategy', 'dc1': 3};

-- Design table around the query: "get all orders for a customer, newest first"
CREATE TABLE orders_by_customer (
    customer_id  UUID,
    created_at   TIMESTAMP,
    order_id     UUID,
    status       TEXT,
    total        DECIMAL,
    PRIMARY KEY ((customer_id), created_at, order_id)
) WITH CLUSTERING ORDER BY (created_at DESC, order_id ASC);
-- partition key: customer_id (all orders for one customer on one node)
-- clustering: created_at DESC (newest first within partition)

-- Insert
INSERT INTO orders_by_customer
    (customer_id, created_at, order_id, status, total)
VALUES (uuid(), toTimestamp(now()), uuid(), 'PENDING', 99.99);

-- Query — must use partition key
SELECT * FROM orders_by_customer
WHERE customer_id = 550e8400-e29b-41d4-a716-446655440000
  AND created_at > '2024-01-01'
LIMIT 20;
```

### Data Modeling Rules

```
1. No JOINs — duplicate data across tables for each query
2. No aggregations — pre-aggregate at write time or use ALLOW FILTERING (avoid)
3. Partition size — aim for < 100 MB per partition; avoid hot partitions
4. Denormalise — one table per query pattern

Example: you need two queries
  A) "Get all orders for customer X"         → orders_by_customer (partition: customer_id)
  B) "Get all orders with status PENDING"    → orders_by_status (partition: status)

Create TWO tables, write to BOTH on every insert.
```

### Tunable Consistency

```
Write/Read consistency = how many replicas must acknowledge

ONE    → fastest, lowest consistency (1 replica)
QUORUM → majority of replicas (RF=3 → 2 replicas); balances speed and consistency
ALL    → all replicas must respond; strongest consistency, lowest availability
LOCAL_QUORUM → quorum within the local datacenter (multi-DC setups)

Strong consistency rule: write_CL + read_CL > replication_factor
  QUORUM + QUORUM > 3 → 2 + 2 = 4 > 3 ✓  (strongly consistent)
  ONE + ONE > 3       → 1 + 1 = 2 > 3 ✗  (eventually consistent)
```

```java
// Spring Data Cassandra
@Table("orders_by_customer")
public class OrderByCustomer {
    @PrimaryKeyColumn(name = "customer_id", type = PrimaryKeyType.PARTITIONED)
    private UUID customerId;

    @PrimaryKeyColumn(name = "created_at", type = PrimaryKeyType.CLUSTERED,
                      ordering = Ordering.DESCENDING)
    private Instant createdAt;

    @PrimaryKeyColumn(name = "order_id", type = PrimaryKeyType.CLUSTERED)
    private UUID orderId;

    private String status;
    private BigDecimal total;
}
```

---

## Elasticsearch

Elasticsearch is a distributed search and analytics engine — built on Apache Lucene. Optimised for full-text search, log analysis (ELK stack), and aggregations.

### Core Concepts

```
Index   → like a database table (stores documents)
Document → JSON object
Shard   → horizontal partition of an index
Replica → copy of a shard for redundancy + read throughput
Mapping → schema definition (field types, analyzers)
```

### Indexing and Searching

```java
// Spring Data Elasticsearch
@Document(indexName = "products")
public class Product {
    @Id
    private String id;

    @Field(type = FieldType.Text, analyzer = "english")
    private String name;

    @Field(type = FieldType.Text, analyzer = "english")
    private String description;

    @Field(type = FieldType.Keyword)   // exact match — no analysis
    private String category;

    @Field(type = FieldType.Double)
    private BigDecimal price;

    @Field(type = FieldType.Keyword)
    private List<String> tags;
}

public interface ProductSearchRepository
    extends ElasticsearchRepository<Product, String> {

    // Derived query → ES query
    List<Product> findByCategory(String category);
    List<Product> findByPriceBetween(BigDecimal min, BigDecimal max);
}
```

### Custom Queries

```java
@Autowired ElasticsearchOperations esOps;

public SearchHits<Product> search(String keyword, String category, Pageable pageable) {
    Query query = NativeQuery.builder()
        .withQuery(q -> q
            .bool(b -> b
                // Full-text search on name and description
                .must(m -> m.multiMatch(mm -> mm
                    .query(keyword)
                    .fields("name^2", "description")   // name weighted 2x
                    .fuzziness("AUTO")))                // typo tolerance
                // Filter by category (no scoring)
                .filter(f -> f.term(t -> t.field("category").value(category)))
            )
        )
        .withPageable(pageable)
        .withHighlightQuery(HighlightQuery.builder(Highlight.builder()
            .withFields(HighlightField.builder("name").build(),
                        HighlightField.builder("description").build())
            .build()).build())
        .build();

    return esOps.search(query, Product.class);
}
```

### Aggregations

```java
// Price histogram + category breakdown in one query
Query query = NativeQuery.builder()
    .withAggregation("by_category", Aggregation.of(a -> a
        .terms(t -> t.field("category").size(10))))
    .withAggregation("price_ranges", Aggregation.of(a -> a
        .histogram(h -> h.field("price").interval(50.0))))
    .withMaxResults(0)   // only aggregations, no documents
    .build();

SearchHits<Product> result = esOps.search(query, Product.class);
ElasticsearchAggregations aggs = (ElasticsearchAggregations) result.getAggregations();
```

---

## SQL vs NoSQL Decision Matrix

| Requirement | Best Choice |
|-------------|------------|
| ACID transactions across multiple entities | PostgreSQL |
| Flexible JSON schema, hierarchical data | MongoDB |
| Caching, sessions, pub/sub, leaderboards | Redis |
| Massive write throughput, known query patterns | Cassandra |
| Full-text search, log analytics | Elasticsearch |
| Graph traversal, recommendations | Neo4j |
| Global low-latency key-value at scale | DynamoDB |
| Time-series metrics | InfluxDB / TimescaleDB |

---

## Interview Quick-Fire

**Q: Explain the CAP theorem and give examples of CP and AP systems.**
You can guarantee only two of: Consistency (every read sees the latest write), Availability (every request gets a response), Partition Tolerance (works during network splits). Since partitions are unavoidable, you choose CP or AP. PostgreSQL and MongoDB (with majority reads) are CP — they may reject requests during partitions to stay consistent. Cassandra and DynamoDB are AP — they always respond but may return stale data.

**Q: How does Cassandra's data modeling differ from relational databases?**
Cassandra is query-driven: you design tables around specific queries, not normalisation. There are no JOINs — data is denormalised, duplicated across multiple tables for different access patterns. The partition key determines which node holds the data; the clustering columns control row ordering within a partition. You must know all query patterns upfront.

**Q: What is a Redis distributed lock and what makes it safe?**
A distributed lock uses `SET key value NX PX ttl` — sets only if the key doesn't exist, with an expiry to prevent deadlocks if the holder crashes. To safely release, a Lua script atomically checks the value matches the requester's ID before deleting — preventing a late-unlocking process from releasing someone else's lock. `Redisson` provides a battle-tested implementation.

**Q: What is the difference between a Redis List and a Sorted Set? When would you use each?**
A List is ordered by insertion (push/pop from head or tail) — ideal for queues and stacks. A Sorted Set associates each member with a floating-point score and keeps members sorted by score — ideal for leaderboards, rate limiting, delayed queues (score = expiry timestamp), and priority queues. Both have O(log N) operations for most mutations.

<RelatedTopics :topics="['/databases/sql', '/databases/jpa-hibernate', '/spring/spring-data']" />

[→ Back to Databases Overview](/databases/)
