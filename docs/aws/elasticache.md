---
title: AWS ElastiCache
description: Amazon ElastiCache — Redis vs Memcached, caching patterns, eviction policies, clustering, and Spring Cache integration
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, elasticache, redis, memcached, caching, cache-aside, ttl, clustering]
estimatedMinutes: 25
---

# AWS ElastiCache

<DifficultyBadge level="intermediate" />

Amazon ElastiCache is a managed in-memory caching service offering Redis and Memcached. It reduces database load and latency for read-heavy workloads.

---

## Redis vs Memcached

| Feature | Redis | Memcached |
|---------|-------|-----------|
| **Data types** | Strings, hashes, lists, sets, sorted sets, streams, bitmaps | Strings only |
| **Persistence** | RDB snapshots + AOF write-ahead log | None |
| **Replication** | Yes (primary + replicas) | No |
| **Cluster mode** | Yes (sharding across nodes) | Yes (horizontal sharding) |
| **Pub/Sub** | Yes | No |
| **Atomic ops** | Yes (INCR, LPUSH, ZADD…) | Basic (CAS) |
| **Best for** | Caching, sessions, leaderboards, rate limiting, queues | Pure caching, simple key-value |

**Choose Redis** unless you specifically need the extra scale of Memcached's multithreaded architecture (very rare).

---

## Caching Patterns

### Cache-Aside (Lazy Loading)

```java
// Most common pattern: application manages cache manually
public Product getProduct(String productId) {
    // 1. Try cache
    String cached = redis.get("product:" + productId);
    if (cached != null) {
        return deserialize(cached, Product.class);
    }

    // 2. Cache miss — load from DB
    Product product = productRepository.findById(productId)
        .orElseThrow(() -> new NotFoundException(productId));

    // 3. Populate cache with TTL
    redis.setex("product:" + productId, 3600, serialize(product));

    return product;
}

public void updateProduct(Product product) {
    productRepository.save(product);
    redis.del("product:" + product.getId());  // invalidate cache
}
```

### Write-Through

```java
// Write to cache and DB simultaneously — cache always up-to-date
public void saveProduct(Product product) {
    productRepository.save(product);
    redis.setex("product:" + product.getId(), 3600, serialize(product));
    // Reads always hit cache — no cache miss after first write
    // Downside: cache fills with rarely-read data
}
```

### Read-Through / Write-Behind

AWS ElastiCache doesn't natively support these — implement at the application level or use DAX (DynamoDB Accelerator) for DynamoDB-specific read-through caching.

---

## Spring Boot + Redis

```java
// application.properties
// spring.cache.type=redis
// spring.data.redis.host=my-cluster.cache.amazonaws.com
// spring.data.redis.port=6379
// spring.data.redis.ssl.enabled=true

@EnableCaching
@SpringBootApplication
public class App {}

@Service
public class ProductService {

    @Cacheable(value = "products", key = "#productId")
    public Product getProduct(String productId) {
        return productRepository.findById(productId).orElseThrow();
    }

    @CacheEvict(value = "products", key = "#product.id")
    public Product updateProduct(Product product) {
        return productRepository.save(product);
    }

    @CachePut(value = "products", key = "#result.id")
    public Product createProduct(Product product) {
        return productRepository.save(product);
    }
}
```

```java
// Direct Redis operations with RedisTemplate
@Autowired
private RedisTemplate<String, String> redisTemplate;

// Set with TTL
redisTemplate.opsForValue().set("session:" + userId, sessionJson, Duration.ofMinutes(30));

// Increment (rate limiting)
Long count = redisTemplate.opsForValue().increment("ratelimit:" + ip);
if (count == 1) {
    redisTemplate.expire("ratelimit:" + ip, Duration.ofMinutes(1));
}

// Sorted set (leaderboard)
redisTemplate.opsForZSet().add("leaderboard", userId, score);
Set<String> top10 = redisTemplate.opsForZSet().reverseRange("leaderboard", 0, 9);
```

---

## Eviction Policies

When memory is full, Redis evicts keys based on the configured policy.

| Policy | Behaviour |
|--------|-----------|
| `noeviction` | Return error on write — never evict (default) |
| `allkeys-lru` | Evict least recently used across all keys |
| `volatile-lru` | LRU only among keys with TTL set |
| `allkeys-lfu` | Evict least frequently used (Redis 4.0+) |
| `volatile-ttl` | Evict keys with shortest remaining TTL |
| `allkeys-random` | Random eviction |

::: tip Recommended policy for a cache
`allkeys-lru` — treats Redis purely as a cache, evicts cold data automatically regardless of TTL. Use `volatile-lru` if some keys must never be evicted (set no TTL on those).
:::

---

## Cluster Mode

### Replication Group (no sharding)

```
Primary node ──────▶ Replica 1  (AZ-a)
             ──────▶ Replica 2  (AZ-b)
             ──────▶ Replica 3  (AZ-c)

Reads: any replica (horizontal read scaling)
Writes: primary only
Failover: automatic promotion of a replica (Multi-AZ)
```

### Cluster Mode Enabled (sharding)

```
Shard 0:  Primary + 2 Replicas  (keys 0–5460)
Shard 1:  Primary + 2 Replicas  (keys 5461–10922)
Shard 2:  Primary + 2 Replicas  (keys 10923–16383)

Total keyspace: 16,384 hash slots spread across shards
```

Use cluster mode when data exceeds single-node memory (~400GB for r6g.16xlarge) or when write throughput requires horizontal scaling.

---

## Connection Best Practices

```java
// Use connection pooling (Lettuce is the default in Spring Data Redis)
@Bean
public LettuceConnectionFactory redisConnectionFactory() {
    RedisClusterConfiguration clusterConfig = new RedisClusterConfiguration(
        List.of("node1.cache.amazonaws.com:6379",
                "node2.cache.amazonaws.com:6379")
    );

    LettuceClientConfiguration clientConfig = LettuceClientConfiguration.builder()
        .useSsl()                                  // ElastiCache in-transit encryption
        .commandTimeout(Duration.ofSeconds(2))
        .build();

    return new LettuceConnectionFactory(clusterConfig, clientConfig);
}
```

---

## Interview Quick-Fire

**Q: What is cache-aside and when would you use write-through instead?**
Cache-aside (lazy loading): populate on miss, app manages cache manually. Write-through: populate on every write. Use write-through when you can't tolerate cache misses on read (every read must be fast), accepting higher write latency and cache pollution.

**Q: What happens when ElastiCache memory is full with `noeviction`?**
Redis returns an error on write commands. The application must handle this gracefully (fallback to DB). Use `allkeys-lru` for pure caches so Redis automatically evicts cold data instead.

**Q: How do you prevent cache stampede (thundering herd)?**
When a hot key expires, multiple requests simultaneously find a cache miss and all hit the DB. Solutions: probabilistic early expiration (refresh before actual expiry), mutex/lock on cache miss, background refresh, or large TTL + async refresh.

<RelatedTopics :topics="['/aws/', '/aws/dynamodb', '/spring/spring-data']" />

[→ Back to AWS Overview](/aws/)
