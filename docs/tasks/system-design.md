---
title: System Design Tasks
description: 12 system and architecture design tasks — URL shortener, distributed cache, rate limiter, notification service, and more — with approach outlines
---

# System Design Tasks

Tasks 59–70. These are open-ended architecture problems. There is no single correct answer — focus on trade-offs, scalability, and failure modes.

---

### Task 59 — URL Shortener

**Difficulty:** Medium

**Problem:** Design a service that converts a long URL into a short code (e.g., `https://sho.rt/aB3kZ`) and redirects users to the original URL when they visit the short link. Support analytics (click counts, referrer).

**Key Design Decisions**

**Short code generation**
```
Option A: Base62 of auto-incremented ID (simple, predictable, no collisions)
  → ID 125 → Base62 → "CB"
Option B: MD5/SHA hash of URL, take first 7 chars (risk of collision, handle with retry)
Option C: Pre-generate a pool of random codes stored in a "codes" table
```

**Data model**
```
links table:
  short_code  VARCHAR(8) PK
  long_url    TEXT NOT NULL
  created_at  TIMESTAMP
  creator_id  BIGINT (nullable)
  expires_at  TIMESTAMP (nullable)

clicks table:
  id          BIGINT PK
  short_code  VARCHAR(8) FK
  clicked_at  TIMESTAMP
  referrer    TEXT
  user_agent  TEXT
```

**Read path (latency-critical)**
```
Request → CDN/Edge Cache (TTL 1h for popular links)
        → App Server → Redis cache (short_code → long_url, TTL 24h)
        → PostgreSQL (miss only)
        → 301 (permanent) or 302 (allows analytics per visit) redirect
```

**Write path**
```
POST /shorten { longUrl }
→ Validate URL
→ Generate short_code (base62 of next sequence value)
→ INSERT into links
→ Return short URL
```

**Scaling considerations**
- Read-heavy (100:1 read/write ratio typical) → cache aggressively
- Multiple app servers → stateless; all state in DB + cache
- Clicks table → partition by month or use time-series DB (InfluxDB/TimescaleDB)
- Custom domains → separate `domains` table with routing rules

**Why 302 vs 301:** `301` is cached by the browser permanently — future clicks won't hit your server, losing analytics. `302` (temporary redirect) forces every visit through your service.

---

### Task 60 — Distributed Cache

**Difficulty:** Hard

**Problem:** Design a distributed in-memory cache (like Redis) that supports `GET`, `SET`, `DELETE`, and TTL. It must survive single-node failures and handle 10,000 requests/second.

**Architecture**
```
Clients → Consistent Hash Ring → Cache Nodes

Consistent hashing:
  - Virtual nodes (150 vnodes per physical node) for even key distribution
  - Node join/leave only remaps ~K/N keys (K=keys, N=nodes)
  - Client library computes which node owns a key

Replication:
  - Each key stored on primary + 2 replicas (next 2 nodes on the ring)
  - Write: quorum write (2/3 nodes must ACK) for durability
  - Read: quorum read or read from primary only (tunable consistency)
```

**Eviction policies**
```
LRU  — evict least recently accessed (default Redis)
LFU  — evict least frequently used (better for skewed access patterns)
TTL  — lazy expiry (on read) + active sweep (background thread every 100ms samples keys)
```

**Failure handling**
```
Node failure detected via: heartbeat timeout (gossip protocol, 3s)
Read: if primary is down, read from replica
Write: if primary is down, promote replica (leader election via Raft or Zookeeper)
```

**Key trade-offs**
| | Strong consistency | Eventual consistency |
|-|-|-|
| **Write path** | Synchronous replication | Async replication |
| **Latency** | Higher (waits for replicas) | Lower |
| **Stale reads** | Never | Possible |

---

### Task 61 — Rate Limiter Service

**Difficulty:** Medium

**Problem:** Design a distributed rate limiter that limits each user to 100 API requests per minute. It must work across multiple app server instances.

**Algorithm: Sliding Window with Redis**
```lua
-- Redis Lua script (atomic execution)
local key      = KEYS[1]      -- "ratelimit:{userId}"
local limit    = tonumber(ARGV[1])  -- 100
local window   = tonumber(ARGV[2])  -- 60 (seconds)
local now      = tonumber(ARGV[3])  -- current timestamp (ms)
local windowMs = window * 1000

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
-- Count remaining
local count = redis.call('ZCARD', key)
if count < limit then
    redis.call('ZADD', key, now, now)   -- add current request timestamp
    redis.call('EXPIRE', key, window + 1)
    return 1  -- allowed
end
return 0  -- rejected
```

**API response headers (follow standard)**
```
X-RateLimit-Limit:     100
X-RateLimit-Remaining: 42
X-RateLimit-Reset:     1713350400   (Unix timestamp when window resets)
Retry-After:           15           (seconds, only on 429 response)
```

**Why sliding window over fixed window:** Fixed window has a "boundary burst" problem — a user can make 100 calls at 00:59 and 100 more at 01:01 (200 in 2 seconds). Sliding window counts exactly the last 60 seconds of requests.

---

### Task 62 — Notification Service

**Difficulty:** Medium

**Problem:** Design a service that sends notifications via email, SMS, and push. Notifications are fan-out: one event can trigger notifications to millions of users.

**Architecture**
```
Event Producer → Message Broker (Kafka)
                     │
         ┌───────────┴───────────┐
    EmailConsumer          SMSConsumer       PushConsumer
         │                     │                   │
    SES / SendGrid         Twilio            FCM / APNs
```

**Fan-out strategies**

*Push model (write-heavy):*
```
On event: look up all subscribers, enqueue one message per subscriber
→ Good for small subscriber lists
→ Problem: celebrity/event with 10M subscribers = 10M queue messages
```

*Pull model (read-heavy):*
```
Store notification in a "notifications" table
On user open: query their unread notifications
→ Good for large fan-out
→ Problem: latency until user checks
```

*Hybrid:*
```
Small subscriber list → push
Large subscriber list → push to online users immediately, pull for offline users
```

**Delivery guarantees**
```
At-least-once delivery: Kafka consumer commits offset after successful send
Idempotency: notification table has (userId, eventId) unique constraint — deduplicate on insert
Dead-letter queue: failed deliveries after 3 retries → DLQ for manual inspection
```

---

### Task 63 — Social Feed Ranking System

**Difficulty:** Hard

**Problem:** Design a feed for a social network where users see posts from accounts they follow, ranked by relevance/recency. Support 100M users, each following up to 1,000 accounts.

**Fan-out approaches**

*Fan-out on write:*
```
User posts → write post to all N followers' feed caches
Pros: fast reads (pre-computed feed)
Cons: expensive writes for users with many followers (10M followers = 10M cache writes)
```

*Fan-out on read:*
```
User requests feed → query posts from all N followed accounts, merge and rank
Pros: no write amplification
Cons: slow reads for users following many accounts
```

*Hybrid (used by Instagram/Twitter):*
```
Regular users (< 10k followers): fan-out on write → pre-built feed in Redis
Celebrity users (> 10k followers): fan-out on read → injected at read time
```

**Feed ranking signals**
```
- Recency (timestamp)
- Engagement rate (likes/comments/shares relative to impressions)
- Relationship strength (how often you interact with this account)
- Content type preference (video vs text affinity)
```

**Storage**
```
Post metadata:  PostgreSQL (write) + Elasticsearch (full-text search)
Feed cache:     Redis sorted set per user (score = rank, member = postId)
Media:          S3 + CloudFront CDN
```

---

### Task 64 — Search Autocomplete

**Difficulty:** Medium

**Problem:** Design a system that returns the top-5 search suggestions as a user types. Queries are short (< 30 chars). The system must respond in < 100ms and handle 10,000 QPS.

**Data structure: Trie with top-k tracking**
```
Each trie node stores:
  - children: Map<char, TrieNode>
  - topSuggestions: List<String> (top 5 by frequency, maintained on insert)

Search "ap":
  → Walk trie: root → 'a' → 'p'
  → Return p.topSuggestions  (already computed)
```

**At scale (can't fit trie in one machine)**
```
Prefix-based sharding:
  Shard 0: a-f
  Shard 1: g-m
  Shard 2: n-s
  Shard 3: t-z

Query router hashes first character → routes to correct shard
```

**Keeping suggestions fresh**
```
Option A: Batch job — aggregate search logs every 1h, rebuild trie
Option B: Streaming — Kafka stream of search events → Flink/Spark job →
          update frequency counters in Redis → rebuild top-k per prefix every 5min
```

**Caching**
```
Most queries have a long common prefix → cache at edge CDN
Key: normalised prefix (lowercase, trimmed)
TTL: 5 minutes
Hit rate: ~80% for common prefixes
```

---

### Task 65 — Ride-Sharing Backend

**Difficulty:** Hard

**Problem:** Design the backend for a ride-sharing app. Riders request a ride; the system matches them with the nearest available driver and tracks the ride lifecycle.

**Core services**

```
LocationService  — stores real-time driver locations (Redis geospatial: GEOADD/GEORADIUS)
MatchingService  — finds nearest drivers, sends offer, handles acceptance
RideService      — manages ride lifecycle (REQUESTED → MATCHED → IN_PROGRESS → COMPLETED)
PricingService   — calculates fare (surge pricing = demand/supply ratio per zone)
NotificationService — driver/rider push notifications
```

**Matching algorithm**
```
1. Rider requests ride at (lat, lng)
2. Query Redis: GEORADIUS drivers:available lat lng 5km
3. Sort by distance + rating
4. Send offer to top-3 drivers simultaneously (first to accept wins)
5. If all reject or timeout (10s) → expand radius to 10km, repeat
6. Mark driver unavailable in Redis
7. Create ride record in PostgreSQL
```

**Location updates**
```
Driver app sends GPS location every 4 seconds
→ Redis GEOADD drivers:available driverId lat lng
→ Discard location if driver is on a ride (move to drivers:busy set)
```

**Surge pricing**
```
Zone = H3 hexagonal grid cell (Uber's H3 library)
demand  = active ride requests in zone (last 5 min)
supply  = available drivers in zone
surge   = max(1.0, demand / supply * 1.2)  (capped at 3.0)
Recompute every 60 seconds
```

---

### Task 66 — E-Commerce Order Pipeline (Saga Pattern)

**Difficulty:** Hard

**Problem:** Design an order placement flow: reserve inventory → charge payment → create shipment. Any step can fail. The system must be consistent without a distributed transaction.

**Saga: Choreography-based**
```
OrderService      → publishes OrderPlaced
InventoryService  → consumes OrderPlaced → reserves stock → publishes StockReserved
PaymentService    → consumes StockReserved → charges card → publishes PaymentCharged
ShipmentService   → consumes PaymentCharged → creates shipment → publishes OrderConfirmed

On failure:
PaymentService fails → publishes PaymentFailed
InventoryService      → consumes PaymentFailed → releases stock
OrderService          → consumes PaymentFailed → marks order as FAILED, notifies user
```

**Outbox pattern (ensures at-least-once event publishing)**
```java
// In the same DB transaction:
orderRepository.save(order);
outboxRepository.save(new OutboxEvent("OrderPlaced", order.getId(), payload));

// Background relay publishes outbox events to Kafka and deletes them
```

**Idempotency**
```
Each consumer checks: has this eventId already been processed?
→ Store (eventId, status) in processed_events table
→ Duplicate events are silently skipped
```

---

### Task 67 — Metrics Aggregation Pipeline

**Difficulty:** Medium

**Problem:** Design a system that collects application metrics (counters, gauges, histograms) from thousands of services, aggregates them over time windows (1m, 5m, 1h), and stores them for querying.

**Architecture**
```
Services → StatsD/Prometheus push → Kafka (raw metrics topic)
         → Flink streaming job (tumbling windows: 1m, 5m, 1h)
         → InfluxDB / TimescaleDB (compressed time-series storage)
         → Grafana / custom API (query + visualise)
```

**Aggregation types**
```
Counter:   sum within window
Gauge:     last value within window
Histogram: p50, p95, p99 (use t-digest for distributed percentile approximation)
```

**Cardinality problem**
```
metric{service="api", region="eu-west-1", endpoint="/orders"} 
→ high cardinality (many label combinations) → slow queries, high storage
Solution: limit cardinality at ingestion; reject metrics with >1000 unique label values
```

**Retention**
```
Raw (1s resolution):  7 days
1m aggregates:        30 days
5m aggregates:        90 days
1h aggregates:        2 years
```

---

### Task 68 — Feature Flag Service

**Difficulty:** Medium

**Problem:** Design a feature flag service that enables/disables features per user, percentage rollout, or user segment. Changes should take effect within 30 seconds without redeployment.

**Flag evaluation**
```java
// Evaluation order (first match wins):
1. Is user in the override list?          → return override value
2. Is user in a targeted segment?         → return segment value
3. Random bucket (hash userId % 100 < rolloutPct) → return rollout value
4. Default                                → return flag default
```

**Storage and caching**
```
Source of truth: PostgreSQL (flag config, audit log)
Cache: Redis (flag → JSON config, TTL 30s)
Local cache: in-process cache (TTL 5s) to avoid Redis latency on every request
SDK polling: SDK fetches flag config every 30s (or SSE push for instant propagation)
```

**Flag config schema**
```json
{
  "flagKey": "new-checkout-flow",
  "defaultValue": false,
  "rules": [
    { "type": "USER_LIST",  "users": ["alice", "bob"], "value": true },
    { "type": "SEGMENT",    "segment": "beta-testers", "value": true },
    { "type": "PERCENTAGE", "rolloutPct": 10, "value": true }
  ]
}
```

**Why local cache + Redis + DB:** Three-tier caching gives sub-millisecond evaluation with eventual consistency. The TTL hierarchy (5s → 30s → source of truth) balances freshness and performance.

---

### Task 69 — Webhook Delivery System

**Difficulty:** Medium

**Problem:** Design a system that delivers HTTP webhook events to customer endpoints reliably. Deliveries should be retried on failure with exponential backoff. Customers can inspect delivery history.

**Architecture**
```
Event Source → Webhook Router → Delivery Queue (Kafka)
                                      │
                              Delivery Workers (N)
                                      │
                              Customer Endpoint (HTTP POST)
                                      │
                         Success: mark delivered
                         Failure: re-enqueue with backoff
```

**Retry strategy**
```
Attempt 1: immediate
Attempt 2: 30s delay
Attempt 3: 5 min
Attempt 4: 30 min
Attempt 5: 2 hours
→ After 5 failures: move to Dead Letter Queue, alert customer
```

**Delivery guarantees**
```
At-least-once: save delivery attempt before sending, update status after
Idempotency key: include X-Webhook-Id header so customers can deduplicate
Ordering: guaranteed within a single customer (partition Kafka by customerId)
```

**Database schema**
```
webhooks:          id, customer_id, url, secret, events[], active
webhook_events:    id, webhook_id, event_type, payload, created_at
delivery_attempts: id, event_id, attempt_no, status, response_code, latency_ms, attempted_at
```

---

### Task 70 — Multi-Tenant SaaS Architecture

**Difficulty:** Hard

**Problem:** Design the data isolation and routing layer for a multi-tenant SaaS application. Tenants must be isolated from each other. Support three isolation tiers: shared DB (free plan), separate schema (pro plan), dedicated DB (enterprise plan).

**Isolation models**

| Model | Isolation | Cost | Compliance |
|-------|-----------|------|-----------|
| Shared DB + tenant_id column | Low | Low | Not suitable for regulated |
| Separate schema (same DB) | Medium | Medium | Suitable for most |
| Dedicated DB | High | High | Required for HIPAA/PCI |

**Routing**

```java
// TenantContext is set in a servlet filter
public class TenantContextFilter implements Filter {
    public void doFilter(ServletRequest req, ...) {
        String tenantId = extractTenantId((HttpServletRequest) req); // from JWT / subdomain / header
        TenantContext.set(tenantId);
        try { chain.doFilter(req, res); }
        finally { TenantContext.clear(); }
    }
}

// Spring DataSource routing
public class TenantDataSource extends AbstractRoutingDataSource {
    @Override
    protected Object determineCurrentLookupKey() {
        return TenantContext.get(); // routes to the right DataSource
    }
}
```

**Schema-based isolation (Postgres)**
```sql
-- Each tenant gets their own schema
CREATE SCHEMA tenant_acme;
CREATE TABLE tenant_acme.orders ( ... );

-- Connection: set search_path = tenant_acme at session start
SET search_path = tenant_acme;
```

**Onboarding a new tenant**
```
1. Allocate isolation tier based on plan
2. Provision schema/DB (Flyway migration per tenant schema)
3. Register tenant in control plane DB (tenant_id → db_url/schema)
4. Issue JWT with tenant_id claim
```

---

<RelatedTopics :topics="['/tasks/low-level-design', '/architecture/', '/tasks/spring-boot']" />

[→ Back to Tasks Overview](/tasks/)
