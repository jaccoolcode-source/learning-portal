---
title: Caching
description: Cache strategies, Redis patterns, CDN caching, eviction policies, thundering herd, cache penetration, and cache avalanche
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [caching, redis, cache-aside, write-through, thundering-herd, eviction, cdn]
related:
  - /system-design/scalability
  - /system-design/database-scaling
  - /databases/nosql
estimatedMinutes: 30
---

# Caching

<DifficultyBadge level="advanced" />

Caching is the most effective performance optimisation in distributed systems. A well-designed cache can cut database load by 90% and reduce response latency from milliseconds to microseconds.

---

## Why Cache?

| Operation | Latency |
|-----------|---------|
| L1 CPU cache | 0.5 ns |
| L2 CPU cache | 7 ns |
| RAM (in-process cache) | 100 ns |
| **Redis read (network)** | **~0.1 ms** |
| PostgreSQL index read | ~1 ms |
| PostgreSQL full scan | ~10–100 ms |
| HDD seek | 10 ms |

The gap between Redis and database is 10–1000×. For read-heavy workloads, caching the right data is more impactful than any database tuning.

---

## Cache Levels

```
L1: In-process cache (Caffeine, ConcurrentHashMap)
    → Zero network overhead, but local to one instance
    → Risk: stale data when another instance updates

L2: Distributed cache (Redis, Memcached)
    → Shared across all instances
    → ~0.1ms network roundtrip

L3: CDN (CloudFront, Cloudflare)
    → Edge node close to user, globally distributed
    → Serves static/semi-static content
```

### Caffeine (In-Process L1 Cache)

```java
// dependency: com.github.ben-manes.caffeine:caffeine
@Configuration
public class CaffeineCacheConfig {
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(10_000)
            .expireAfterWrite(Duration.ofMinutes(5))
            .recordStats()
        );
        return manager;
    }
}

@Service
public class ProductService {
    @Cacheable("products")            // first call populates cache
    public Product findById(Long id) {
        return productRepo.findById(id).orElseThrow();
    }

    @CachePut(value = "products", key = "#product.id")
    public Product update(Product product) {
        return productRepo.save(product);
    }

    @CacheEvict(value = "products", key = "#id")
    public void delete(Long id) {
        productRepo.deleteById(id);
    }
}
```

---

## Cache Strategies

### Cache-Aside (Lazy Loading) ← most common

Application manages the cache manually. Cache is populated on demand.

```
Read:
  1. Check cache → HIT: return cached value
  2. MISS: read from DB
  3. Write result to cache with TTL
  4. Return result

Write:
  - Write to DB
  - Invalidate (delete) cache key
```

```java
public Product getProduct(Long id) {
    String cacheKey = "product:" + id;

    // 1. Try cache
    Product cached = (Product) redisTemplate.opsForValue().get(cacheKey);
    if (cached != null) return cached;

    // 2. Cache miss → DB
    Product product = productRepo.findById(id).orElseThrow();

    // 3. Populate cache with TTL
    redisTemplate.opsForValue().set(cacheKey, product, Duration.ofMinutes(30));
    return product;
}

public void updateProduct(Product product) {
    productRepo.save(product);
    redisTemplate.delete("product:" + product.getId()); // invalidate
}
```

**Pros:** Resilient — if cache fails, app reads from DB. Cache only contains requested data.
**Cons:** Cache miss penalty (3 steps), risk of stale data between write and invalidation.

---

### Write-Through

Write to cache and database simultaneously on every write.

```
Write:
  1. Write to cache
  2. Write to DB (synchronously)
  3. Return success

Read:
  1. Check cache → almost always a HIT (fresh data written on every update)
```

```java
public Product updateProduct(Product product) {
    productRepo.save(product);                                // write DB
    String key = "product:" + product.getId();
    redisTemplate.opsForValue().set(key, product,            // write cache
        Duration.ofHours(1));
    return product;
}
```

**Pros:** Cache is always consistent with DB. No stale reads.
**Cons:** Write latency doubles (DB + cache). Cold start: new cache nodes start empty.

---

### Write-Behind (Write-Back)

Write to cache first, write to DB asynchronously later.

```
Write:
  1. Write to cache
  2. Return success immediately
  3. (Background) flush cache → DB in batches

Read:
  1. Cache HIT (just written)
```

**Pros:** Lowest write latency. Batch DB writes are efficient.
**Cons:** Data loss window if cache fails before flush. Complex to implement correctly. **Rarely used in web APIs** — suitable for write-heavy analytics, IoT telemetry.

---

### Read-Through

Cache sits in front of DB. Application only talks to cache.

```
Read:
  1. Application calls cache.get(key)
  2. Cache HIT → return
  3. Cache MISS → cache fetches from DB, stores, returns
```

Application code is simpler (no cache management logic). Redis with a loader callback, or libraries like Ehcache implement this.

---

### Strategy Comparison

| Strategy | Consistency | Read perf | Write perf | Complexity | Use when |
|----------|-------------|-----------|-----------|------------|----------|
| Cache-Aside | Eventual | Fast (post-warm) | Unchanged | Low | Most read-heavy APIs |
| Write-Through | Strong | Fast | Slower (2 writes) | Low | Data must be consistent |
| Write-Behind | Eventual | Fast | Fast | High | High write throughput, tolerate loss |
| Read-Through | Eventual | Fast (post-warm) | Unchanged | Medium | Simplify app code |

---

## Cache Invalidation

**"There are only two hard things in Computer Science: cache invalidation and naming things."**

### TTL (Time-To-Live) — simplest

```java
redisTemplate.opsForValue().set("user:123", user, Duration.ofMinutes(15));
// Automatically expires after 15 minutes
// Risk: stale data for up to 15 minutes after an update
```

### Event-Driven Invalidation

```java
// On product update, publish event
@TransactionalEventListener
public void onProductUpdated(ProductUpdatedEvent event) {
    redisTemplate.delete("product:" + event.getProductId());
    // Optionally delete related cached lists:
    redisTemplate.delete("products:category:" + event.getCategoryId());
}
```

### Cache Key Versioning

Embed a version in the key — changing the version effectively invalidates everything:

```java
String version = "v2"; // bump this to invalidate all
String key = String.format("product:%s:%d", version, productId);
// Old keys with "v1:" just expire naturally via TTL
```

---

## Cache Eviction Policies

When the cache is full, an eviction policy decides what to remove.

| Policy | Description | Use Case |
|--------|-------------|----------|
| **LRU** (Least Recently Used) | Evict the least recently accessed | General purpose — most common |
| **LFU** (Least Frequently Used) | Evict the least accessed over time | Long-lived caches, popularity matters |
| **FIFO** | Evict the oldest inserted entry | Predictable, but ignores access patterns |
| **Random** | Evict a random entry | Simple, surprisingly effective |
| **TTL** | Evict expired entries first | Always set TTLs to avoid stale data |
| **Allkeys-LRU** | LRU across all keys (Redis) | When all data benefits from caching |
| **Volatile-LRU** | LRU among keys with TTL set | Protect important permanent keys |

```yaml
# Redis eviction policy
maxmemory: 2gb
maxmemory-policy: allkeys-lru  # Redis default is noeviction (returns error when full)
```

---

## Cache Problems and Solutions

### Thundering Herd (Cache Stampede)

**Problem:** A popular cache key expires. Hundreds of requests all miss simultaneously and hammer the database.

```
cache miss for "top-products"
→ 500 concurrent requests → 500 DB queries → DB overwhelmed
```

**Solutions:**

```java
// 1. Mutex lock — only one request rebuilds the cache
public List<Product> getTopProducts() {
    List<Product> cached = (List<Product>) redisTemplate.opsForValue()
        .get("top-products");
    if (cached != null) return cached;

    // Only one thread wins the lock
    Boolean locked = redisTemplate.opsForValue()
        .setIfAbsent("top-products:lock", "1", Duration.ofSeconds(30));

    if (Boolean.TRUE.equals(locked)) {
        try {
            List<Product> result = productRepo.findTop10();
            redisTemplate.opsForValue().set("top-products", result,
                Duration.ofMinutes(5));
            return result;
        } finally {
            redisTemplate.delete("top-products:lock");
        }
    } else {
        // Wait briefly for another thread to populate
        Thread.sleep(50);
        return getTopProducts(); // retry
    }
}

// 2. Probabilistic early expiration (simpler)
// Refresh before expiry if TTL < threshold
Long ttl = redisTemplate.getExpire("top-products", TimeUnit.SECONDS);
if (ttl != null && ttl < 30) {
    // Asynchronously refresh before it expires
    executor.submit(() -> refreshTopProducts());
}

// 3. Jitter — randomise TTL to stagger expirations
long jitter = ThreadLocalRandom.current().nextLong(60);
redisTemplate.opsForValue().set(key, value, Duration.ofSeconds(300 + jitter));
```

---

### Cache Penetration

**Problem:** Requests for keys that don't exist in cache OR database (e.g., attacker probing random IDs) bypass the cache entirely on every request.

```
GET /users/99999999 → cache miss → DB miss → no caching → repeat forever
```

**Solutions:**

```java
// 1. Cache null values for non-existent keys
Optional<User> user = userRepo.findById(userId);
if (user.isPresent()) {
    redis.set("user:" + userId, user.get(), Duration.ofMinutes(30));
} else {
    redis.set("user:" + userId, "NULL_MARKER", Duration.ofMinutes(5));
    // Short TTL — real user might be created soon
}

// 2. Bloom filter — probabilistic data structure
// "Is this key possibly in the database?" → fast O(1) check
// False positives possible (goes to DB unnecessarily), false negatives impossible
@Bean
public BloomFilter<Long> userIdBloomFilter() {
    // Guava Bloom filter
    return BloomFilter.create(
        Funnels.longFunnel(),
        10_000_000,  // expected insertions
        0.01         // 1% false positive rate
    );
}
```

---

### Cache Avalanche

**Problem:** Large numbers of cache keys expire at the same time → mass cache misses → DB spike.

```
00:00 — batch loaded 10,000 products with TTL=1 hour
01:00 — all 10,000 expire simultaneously → DB overwhelmed
```

**Solutions:**
```java
// Randomise TTL to stagger expirations
long baseTtl = 3600;
long jitter = ThreadLocalRandom.current().nextLong(600); // ±10 min
redis.set(key, value, Duration.ofSeconds(baseTtl + jitter));

// Use circuit breaker to protect DB when cache is down
// Serve stale data rather than letting DB fail
```

---

## Redis vs Memcached

| | Redis | Memcached |
|--|-------|-----------|
| Data structures | Strings, Hash, List, Set, ZSet, Stream | String only |
| Persistence | RDB snapshots + AOF log | None |
| Replication | Master-replica + Cluster | None built-in |
| Lua scripting | Yes | No |
| Pub/Sub | Yes | No |
| Memory efficiency | Lower (richer structures) | Higher |
| Multi-thread | Single-threaded (I/O multiplexing) | Multi-threaded |
| **Use when** | Default choice — rich features | Pure cache, maximum throughput, simple use case |

**Verdict:** Use Redis. Memcached's only advantage is multi-threading, which matters only at extreme scale where Redis's I/O multiplexing becomes a bottleneck.

---

## Interview Quick-Fire

**Q: What's the difference between cache-aside and write-through?**
Cache-aside (lazy loading): application checks cache first, on miss reads from DB and populates cache — cache fills only on reads. Write-through: every write goes to cache AND DB — cache is always fresh but writes are slower. Cache-aside is more resilient to cache failures; write-through avoids stale reads.

**Q: How would you handle a thundering herd when a popular cache key expires?**
Three approaches: (1) distributed mutex — only one request rebuilds, others wait; (2) probabilistic early refresh — refresh key before it expires using background thread; (3) TTL jitter — randomise expiry times so keys don't all expire simultaneously.

**Q: What is cache penetration and how do you prevent it?**
Cache penetration is repeated requests for keys that don't exist in cache or DB — they always hit the DB. Prevention: (1) cache null results with a short TTL; (2) use a Bloom filter as a fast pre-check — if the Bloom filter says the ID doesn't exist, return 404 without hitting cache or DB.

<RelatedTopics :topics="['/system-design/scalability', '/system-design/database-scaling', '/databases/nosql']" />

[→ Back to System Design Overview](/system-design/)
