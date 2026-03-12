---
title: Classic System Design Problems
description: Step-by-step designs for URL shortener, news feed, notification system, rate limiter, and file storage
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [system-design, url-shortener, news-feed, notification-system, rate-limiter, file-storage]
related:
  - /system-design/scalability
  - /system-design/caching
  - /system-design/database-scaling
estimatedMinutes: 40
---

# Classic System Design Problems

<DifficultyBadge level="advanced" />

These are the most frequently asked system design problems. Each solution follows the interview framework: requirements → estimates → design → deep dive → trade-offs.

---

## URL Shortener (bit.ly)

### Requirements

**Functional:**
- Shorten a long URL to a short code (e.g., `bit.ly/abc123`)
- Redirect short URL to original
- Custom aliases (optional)
- Link expiry (optional)

**Non-functional:**
- 100M URLs created/day, 10B redirects/day
- Reads >> Writes (~100:1)
- Redirect latency < 10ms

### Estimates

```
Write QPS: 100M / 86,400 = ~1,200/s
Read QPS:  10B / 86,400 = ~115,000/s

Storage per URL: 500 bytes
10 years × 100M/day × 500B = ~180 TB
```

### High-Level Design

```
Write path:
  Client → API Gateway → URL Service → DB (store mapping)
                                      → Cache (populate)

Read path:
  Client → CDN (cache redirect) →
         Load Balancer → Redirect Service → Redis → DB (if miss)
                       → HTTP 301/302 redirect
```

### Short Code Generation

**Option 1: Hash + truncate**
```java
public String shorten(String longUrl) {
    String hash = DigestUtils.md5Hex(longUrl);  // 32-char hex
    return hash.substring(0, 7);               // take first 7 chars
    // Collision risk: ~0.1% at 100M URLs — handle with retry
}
```

**Option 2: Base62 encoding of auto-increment ID ← recommended**
```java
private static final String CHARS =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

public String toBase62(long id) {
    StringBuilder sb = new StringBuilder();
    while (id > 0) {
        sb.append(CHARS.charAt((int)(id % 62)));
        id /= 62;
    }
    return sb.reverse().toString();
    // 62^7 = 3.5 trillion unique codes — enough for centuries
}
```

### Database Schema

```sql
CREATE TABLE urls (
    id         BIGSERIAL PRIMARY KEY,
    code       VARCHAR(10) NOT NULL UNIQUE,
    long_url   TEXT NOT NULL,
    user_id    BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_urls_code ON urls(code);
```

### Redirect Cache (Redis)

```java
// Cache: code → long_url, TTL = 24 hours
public String redirect(String code) {
    String longUrl = redis.opsForValue().get("url:" + code);
    if (longUrl == null) {
        Url url = urlRepo.findByCode(code)
            .orElseThrow(() -> new NotFoundException());
        longUrl = url.getLongUrl();
        redis.opsForValue().set("url:" + code, longUrl, Duration.ofHours(24));
    }
    return longUrl; // return HTTP 302 redirect
}
```

### 301 vs 302 Redirect

| | 301 Permanent | 302 Temporary |
|--|--------------|--------------|
| Browser caches? | Yes — future redirects skip the server | No — hits server every time |
| Analytics possible? | No — browser goes direct | Yes — every hit logged |
| Use when | CDN-cached links, reduce server load | Need click analytics |

### Scaling

```
Read bottleneck (100K redirects/s):
→ Redis caches hot codes (most links are accessed briefly, then forgotten — Zipf distribution)
→ CDN caches top 5% of links (handle 95% of traffic at edge)
→ Read replicas for DB misses

Write bottleneck (1,200 shorts/s):
→ Single primary DB is sufficient at this scale
→ Distributed ID generation if multi-region: Twitter Snowflake ID
```

---

## News Feed (Twitter / Instagram)

### Requirements

**Functional:**
- User posts a tweet
- User sees a timeline of people they follow
- Timelines are roughly chronological

**Non-functional:**
- 300M DAU, 500M tweets/day
- Timeline load < 300ms
- Eventual consistency acceptable

### Estimates

```
Write QPS: 500M / 86,400 = ~5,800 tweets/s
Read QPS:  300M × 5 timeline loads/day / 86,400 = ~17,000/s

Storage: 500M tweets × 280 chars × 2 bytes = ~280 GB/day (text only)
```

### The Core Problem: Fan-out

When a user with 1M followers posts a tweet, how do you deliver it?

#### Fan-out on Write (Push Model)

When Alice tweets, pre-compute and push to all followers' timeline caches.

```
Alice tweets
→ Worker fetches Alice's 1M follower IDs
→ For each follower: prepend tweet to their Redis timeline list
→ Follower reads: Redis hit (fast!)

Pros: Read is fast (pre-computed)
Cons: Write amplification — 1M followers = 1M cache writes
     Celebrity problem — 50M followers is catastrophic
```

#### Fan-out on Read (Pull Model)

When Bob loads his timeline, fetch tweets from everyone he follows.

```
Bob loads timeline
→ Fetch Bob's following list (e.g., 200 people)
→ Query each person's last N tweets
→ Merge and sort by timestamp

Pros: Simple, write is cheap
Cons: Read is expensive — N DB queries per timeline load
     Doesn't scale for users following 1000+ people
```

#### Hybrid (Twitter's Approach) ← recommended

```
Fan-out on write for normal users
Fan-out on read for celebrities (verified users with millions of followers)

Criteria: user has > 10K followers → skip pre-write, read on demand
At timeline load: merge pre-computed feed + live celebrity tweets
```

### Architecture

```
Write path:
  POST /tweet → API → Kafka topic: "tweets"
                     ↓
                Fan-out workers (consume Kafka)
                     ↓
                For normal users: write to followers' Redis timeline
                For celebrities: skip fan-out, tweet stored in DB only

Read path:
  GET /timeline → Timeline Service
                → Redis: sorted set of tweet IDs (user's pre-computed feed)
                → Fetch tweet content from Tweet Cache (Redis)
                → Merge celebrity tweets (pull on read)
                → Return top 20
```

### Data Model

```sql
-- Tweets table
CREATE TABLE tweets (
    id         BIGINT PRIMARY KEY,       -- Snowflake ID (time-sortable)
    user_id    BIGINT NOT NULL,
    content    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

-- Follow graph (who follows whom)
CREATE TABLE follows (
    follower_id BIGINT NOT NULL,
    followee_id BIGINT NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX idx_follows_followee ON follows(followee_id); -- "who follows user X?"
```

```java
// Redis timeline: sorted set, score = tweet timestamp
// ZADD timeline:userId timestamp tweetId
// ZREVRANGE timeline:userId 0 19 → last 20 tweet IDs
redisTemplate.opsForZSet().add(
    "timeline:" + followerId,
    tweetId.toString(),
    tweet.getCreatedAt().toEpochMilli()
);

// Trim to last 800 tweets per user (memory management)
redisTemplate.opsForZSet().removeRange("timeline:" + followerId, 0, -801);
```

---

## Notification System

### Requirements

**Functional:**
- Send notifications via email, SMS, push notification, in-app
- Support scheduled and triggered notifications
- Preferences: users can opt out per channel/type

**Non-functional:**
- 10M notifications/day
- Delivery within 30 seconds of trigger
- At-least-once delivery (some duplicates acceptable)

### Architecture

```
Trigger sources (services):
  OrderService → "order.shipped"
  PaymentService → "payment.failed"
  MarketingService → "promo.campaign"
         ↓
    [Kafka topic: notification-events]
         ↓
    Notification Service
    ├── Check user preferences (Redis or DB)
    ├── Template rendering (Handlebars/Freemarker)
    └── Fan-out to channel workers:
         ├── Email Worker → SendGrid / SES
         ├── SMS Worker   → Twilio / SNS
         └── Push Worker  → FCM (Android) / APNs (iOS)
```

### Database Schema

```sql
-- Notification preferences
CREATE TABLE notification_preferences (
    user_id          BIGINT NOT NULL,
    notification_type VARCHAR(100) NOT NULL,  -- 'ORDER_SHIPPED', 'PROMO'
    channel          VARCHAR(50) NOT NULL,     -- 'EMAIL', 'SMS', 'PUSH'
    enabled          BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (user_id, notification_type, channel)
);

-- Notification log (for idempotency + audit)
CREATE TABLE notification_log (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          BIGINT NOT NULL,
    channel          VARCHAR(50) NOT NULL,
    idempotency_key  VARCHAR(200) UNIQUE NOT NULL,
    status           VARCHAR(50) NOT NULL,     -- 'SENT', 'FAILED', 'SKIPPED'
    sent_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### Idempotency (Avoid Duplicate Notifications)

```java
@Service
public class NotificationService {
    public void send(NotificationEvent event) {
        String idempotencyKey = event.getType() + ":" + event.getReferenceId()
                                + ":" + event.getUserId();

        // Skip if already sent
        if (notificationLogRepo.existsByIdempotencyKey(idempotencyKey)) {
            log.info("Notification already sent: {}", idempotencyKey);
            return;
        }

        // Check user preferences
        boolean enabled = preferencesRepo.isEnabled(
            event.getUserId(), event.getType(), event.getChannel());
        if (!enabled) return;

        // Send via appropriate provider
        channelProvider.send(event);

        // Log as sent
        notificationLogRepo.save(new NotificationLog(
            event.getUserId(), event.getChannel(), idempotencyKey, "SENT"));
    }
}
```

### Scaling

```
10M notifications/day = ~115/s average
Peak 10× = ~1,150/s

Kafka partitioned by user_id → parallel processing per user
Separate consumer groups per channel (email workers ≠ push workers)
Rate limit per provider (SendGrid: 100/s/IP → multiple sending IPs)
Priority queues: transactional alerts before marketing
```

---

## Rate Limiter Service

### Requirements

- Limit API calls per user: 100 requests/minute
- Multiple rate limit rules (per IP, per user, per API key)
- Return 429 with `Retry-After` header when exceeded
- Distributed (works across multiple API gateway instances)

### Architecture

```
Client → API Gateway (Nginx / Kong)
              ↓
         [Rate Limiter middleware]
              ↓ check Redis
         Allowed → forward to service
         Blocked → 429 Too Many Requests
```

### Redis Sliding Window Implementation

```java
@Service
public class DistributedRateLimiter {

    // Lua script runs atomically in Redis
    private static final String SCRIPT = """
        local key = KEYS[1]
        local window_ms = tonumber(ARGV[1])
        local limit = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        redis.call('ZREMRANGEBYSCORE', key, 0, now - window_ms)
        local count = redis.call('ZCARD', key)

        if count < limit then
            redis.call('ZADD', key, now, now .. '-' .. math.random())
            redis.call('PEXPIRE', key, window_ms)
            return {1, limit - count - 1}  -- allowed, remaining
        end

        local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
        local reset_ms = tonumber(oldest[2]) + window_ms - now
        return {0, 0, reset_ms}  -- blocked, remaining, retry-after-ms
        """;

    public RateLimitResult check(String key, int windowSeconds, int limit) {
        long now = System.currentTimeMillis();
        List<Object> result = redis.execute(script,
            List.of(key),
            String.valueOf(windowSeconds * 1000L),
            String.valueOf(limit),
            String.valueOf(now)
        );

        boolean allowed = ((Long) result.get(0)) == 1L;
        long remaining = (Long) result.get(1);
        long retryAfterMs = result.size() > 2 ? (Long) result.get(2) : 0;

        return new RateLimitResult(allowed, remaining, retryAfterMs);
    }
}

// API Gateway filter
@Component
public class RateLimitFilter implements GlobalFilter {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String userId = exchange.getRequest().getHeaders().getFirst("X-User-Id");
        String key = "rate:user:" + userId;

        RateLimitResult result = rateLimiter.check(key, 60, 100);

        exchange.getResponse().getHeaders()
            .set("X-RateLimit-Remaining", String.valueOf(result.getRemaining()));

        if (!result.isAllowed()) {
            exchange.getResponse().setStatusCode(HttpStatus.TOO_MANY_REQUESTS);
            exchange.getResponse().getHeaders()
                .set("Retry-After", String.valueOf(result.getRetryAfterMs() / 1000));
            return exchange.getResponse().setComplete();
        }

        return chain.filter(exchange);
    }
}
```

---

## File Storage (Dropbox / Google Drive)

### Requirements

**Functional:**
- Upload files (up to 1 GB)
- Download files
- Share files with other users
- Sync across devices

**Non-functional:**
- 1B users, 50M DAU
- Durability: 99.999999999% (11 nines)
- Files deduplicated (same file uploaded twice = stored once)

### Architecture

```
Upload:
  Client → API Server → generate pre-signed S3 URL
                     ← return upload URL to client
  Client → S3 directly (bypasses API server for large files)
  S3 → triggers Lambda/event → API Server: update metadata DB

Download:
  Client → API Server → generate pre-signed S3 download URL
         → Client downloads directly from S3 / CDN
```

### Chunked Upload (Large Files)

```
Split 1 GB file into 5 MB chunks
Upload each chunk independently (parallelism, resume on failure)
Server assembles chunks → atomic file

Benefits:
  - Resume interrupted uploads (only re-upload failed chunks)
  - Parallel upload (4× faster)
  - Deduplication at chunk level
```

### Deduplication (Content-Addressed Storage)

```java
// Before storing: check if content already exists
public String storeFile(InputStream data) {
    byte[] content = data.readAllBytes();
    String hash = sha256(content);  // content hash = file identity

    if (objectStorage.exists(hash)) {
        // File already stored — just create metadata record
        return createFileRecord(hash, userId, filename);
    }

    // Upload to S3 with hash as key
    objectStorage.put(hash, content);
    return createFileRecord(hash, userId, filename);
}
```

### Database Schema

```sql
-- File metadata
CREATE TABLE files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     BIGINT NOT NULL,
    name        VARCHAR(500) NOT NULL,
    size_bytes  BIGINT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,   -- SHA-256 → points to S3 object
    mime_type   VARCHAR(200),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ               -- soft delete
);

-- Blob storage (deduplication table)
CREATE TABLE blobs (
    content_hash VARCHAR(64) PRIMARY KEY,
    s3_key       TEXT NOT NULL,
    size_bytes   BIGINT NOT NULL,
    ref_count    INT NOT NULL DEFAULT 1  -- how many files reference this blob
);

-- Sharing
CREATE TABLE file_shares (
    file_id      UUID NOT NULL,
    shared_with  BIGINT,                  -- NULL = public link
    share_token  VARCHAR(100) UNIQUE,     -- for link sharing
    permissions  VARCHAR(20) NOT NULL     -- 'READ', 'EDIT'
);
```

### Sync Protocol (Dropbox-style)

```
Long polling / WebSocket for real-time sync:

Client connects: GET /sync?cursor=lastSyncTimestamp
Server waits until new changes available → return delta
Client applies changes → update local files → send new cursor

Delta:
{
  "changes": [
    { "type": "CREATED", "file": {...} },
    { "type": "MODIFIED", "file": {...} },
    { "type": "DELETED", "file_id": "abc" }
  ],
  "cursor": "2024-01-15T10:30:00Z"
}
```

---

## Interview Quick-Fire

**Q: In a URL shortener, would you use 301 or 302 redirects?**
Depends on requirements. 301 (permanent) is cached by browsers — future redirects skip the server, reducing load. 302 (temporary) hits the server every time, enabling click analytics. If analytics are needed (usually yes for bit.ly-like products), use 302. If maximum redirect speed with no analytics is needed, use 301.

**Q: What's the fan-out problem in news feed design?**
When a user with millions of followers posts, you need to deliver that post to millions of timelines. Fan-out on write pre-computes all timelines at write time — reads are instant but celebrities with 50M followers can cause 50M writes per tweet. Fan-out on read computes timelines at read time — writes are cheap but reads query many users' tweets and merge them. The hybrid approach (fan-out on write for normal users, fan-out on read for celebrities) is the production answer.

**Q: How do you ensure a notification is sent exactly once?**
Use idempotency keys: before sending, check if a record with `notification_type + reference_id + user_id` already exists in the notification log. If yes, skip. If no, send and write the log record atomically. This gives at-least-once delivery with deduplication — practical guarantees vs the impossible exactly-once in distributed systems.

<RelatedTopics :topics="['/system-design/scalability', '/system-design/caching', '/system-design/database-scaling', '/system-design/reliability']" />

[→ Back to System Design Overview](/system-design/)
