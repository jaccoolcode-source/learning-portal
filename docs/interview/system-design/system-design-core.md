# System Design

**Q62 to Q63** · [← System Design Overview](./index)

---

## Q62: System Design Approach

> System design interviews test how you think, not just what you know. The process matters as much as the answer. Use a structured framework every time.

A system design interview is an open-ended conversation. The interviewer wants to see how you handle ambiguity, make trade-offs, and think at scale. There is no single correct answer — **the process is the answer**.

**The 6-step framework:**

```
1. Clarify requirements       (5 min)
2. Estimate scale             (3 min)
3. Define API / data model    (5 min)
4. High-level architecture    (10 min)
5. Deep-dive into components  (15 min)
6. Identify bottlenecks       (5 min)
```

::: details Full model answer

**Step 1 — Clarify requirements:**
Never start designing before you understand what you're building. Ask:

*Functional requirements:*
- What are the core features? (Don't over-scope)
- Who are the users? (end users, internal services, both?)
- What is in scope vs out of scope for this session?

*Non-functional requirements:*
- Scale: How many users? Requests per second? Data volume?
- Latency: p99 target? User-facing or internal?
- Consistency: Strong or eventual? Can we tolerate stale reads?
- Availability: 99.9% (8.7 hours downtime/year) vs 99.99% (52 min/year)?
- Durability: Can we lose data? How much?

**Step 2 — Estimate scale:**
Back-of-envelope estimates guide technology choices. Be explicit and show working.

```
Example: Design Twitter's timeline

Users:      300M DAU
Tweets:     500M tweets/day → ~6,000 tweets/second
Read:write: 100:1 (heavy reads)
Timeline:   each user follows ~200 accounts

Storage:
- 1 tweet = 200 bytes text + 100 bytes metadata = 300 bytes
- 500M * 300 bytes = 150 GB/day
- 5 years: 150 GB * 365 * 5 = ~274 TB

Read throughput:
- 300M DAU, each views 100 tweets/day = 30B read requests/day
- 30B / 86,400 = ~350,000 reads/second
```

**Step 3 — API design:**
Define the public interface before the internals.
```
POST /orders                     → create order
GET  /orders/{id}                → get order status
POST /orders/{id}/cancel         → cancel order
GET  /users/{id}/orders?status=  → order history (paginated)
```

Key entities and their relationships:
```
User (id, email, address)
Order (id, userId, status, total, createdAt)
OrderItem (orderId, productId, quantity, price)
Product (id, name, price, stockLevel)
Payment (orderId, amount, status, provider)
```

**Step 4 — High-level architecture:**
Draw the major components and data flows. Start simple, add complexity when justified.

```
Client → CDN → API Gateway → Order Service → PostgreSQL
                           → Inventory Service → PostgreSQL
                           → Payment Service → PostgreSQL
                           → Notification Service → SES/SNS

All services → Kafka (events)
            → Redis (caching, rate limiting)

Background: Order Saga Orchestrator (manages multi-step transaction)
```

**Step 5 — Deep-dive:**
The interviewer will pick 1–2 components for deeper discussion. Common areas:

- **Database choice and schema design** — why this DB? indexes? partitioning?
- **Caching strategy** — what to cache? TTL? invalidation strategy?
- **Scaling** — horizontal scaling, sharding, read replicas
- **Async processing** — what goes on a queue vs synchronous
- **Consistency** — how do you handle the inventory check → payment → deduct race condition?

**Step 6 — Bottlenecks and trade-offs:**
Proactively identify weaknesses:
- "The order service is stateless and scales horizontally, but PostgreSQL becomes the bottleneck at X req/s — we'd add read replicas and later consider sharding by userId"
- "The saga orchestrator is a single point of failure — we'd make it stateful with persistent saga state in the DB"
- "Cache invalidation: we use write-through for product data but accept 60-second staleness for prices"

**Scaling fundamentals to know:**

**Horizontal vs vertical scaling:**
- Vertical (scale-up): bigger machine. Simple but has limits and is expensive.
- Horizontal (scale-out): more machines. Requires stateless services and a load balancer.

**Database scaling:**
- Read replicas: distribute read traffic (80–90% of requests)
- Connection pooling (PgBouncer): prevent DB connection exhaustion
- Caching (Redis): serve common reads without hitting DB
- Sharding: partition data across multiple DB instances (by userId, region)
- CQRS: separate read and write models

**Caching strategies:**
| Pattern | How | Use case |
|---------|-----|---------|
| Cache-aside (lazy) | App checks cache, loads from DB on miss | General purpose |
| Write-through | Write to cache AND DB together | Consistency critical |
| Write-behind | Write to cache, async write to DB | High write throughput |
| Read-through | Cache handles DB load on miss | Simpler app code |

**CAP theorem in practice:**
For user-facing APIs: prefer **availability** over consistency (AP systems) — users tolerate slight staleness but not errors.
For financial operations: prefer **consistency** (CP systems) — never show wrong balances or double-charge.

:::

> [!TIP] Golden Tip
> The most common mistake in system design interviews: **jumping to solutions before clarifying requirements**. The interviewer is watching whether you ask good questions. Spending 5 minutes clarifying "1,000 users or 1 billion?" and "can we tolerate 30-second stale reads?" changes every technology choice. The second mistake: presenting a perfect distributed system for day 1. Always **start simple** (monolith + one DB) and scale up with justification — "at 10K req/s we'd add a Redis cache because the DB read latency becomes the bottleneck." Showing your reasoning is more impressive than naming 12 AWS services.

**Follow-up questions:**
- How do you decide between strong and eventual consistency?
- What is the difference between horizontal and vertical scaling?
- What caching strategy would you use for a product catalogue?
- How do you design for high availability (99.99%)?

---

## Q63: Design an E-Commerce Order System

> Apply the framework from Q62 to a concrete problem. This is a canonical system design question.

**Problem statement:** Design a system that allows users to browse products, place orders, process payments, and track order status. Support 100K DAU growing to 10M DAU.

---

### Step 1 — Requirements

**Functional:**
- Users can browse and search products
- Users can add items to a cart and place orders
- System processes payments via a payment gateway (Stripe)
- Users receive order confirmation and status updates
- Admins can manage inventory

**Non-functional:**
- Availability: 99.9% (primary goal)
- Order placement: &lt;500ms p99
- Product search: &lt;200ms p99
- Consistency: strong for orders/payments; eventual acceptable for product availability display
- Scale: start 100K DAU, design for 10M DAU

---

### Step 2 — Scale Estimates

```
10M DAU, average 5 page views, 0.1 orders/day per user

Read:   10M * 5 = 50M product views/day → ~580 req/s
Orders: 10M * 0.1 = 1M orders/day → ~12 orders/second (peak 3x = 36/s)

Order data:
- 1 order = ~500 bytes
- 1M orders/day = 500 MB/day → ~180 GB/year

Product data:
- 1M products * 2 KB = 2 GB (fits in memory with Redis)
```

---

### Step 3 — API Design

```
# Products
GET  /products?q=laptop&page=1&size=20    → search products
GET  /products/{id}                        → product detail

# Cart
GET  /cart                                 → get cart
POST /cart/items                           → add item
DELETE /cart/items/{productId}             → remove item

# Orders
POST /orders                               → place order (checkout)
GET  /orders/{id}                          → order status
GET  /users/{id}/orders                    → order history

# Admin
PUT  /products/{id}/inventory              → update stock level
```

---

### Step 4 — High-Level Architecture

::: details Architecture diagram (text)
```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────────────────────────┐
│   Browser   │────▶│ CloudFront   │────▶│              API Gateway                │
│  Mobile App │     │ (CDN/WAF)    │     │  (auth, rate limiting, routing)          │
└─────────────┘     └──────────────┘     └──┬──────────┬──────────┬────────────────┘
                                            │          │          │
                                   ┌────────▼──┐  ┌────▼───┐ ┌───▼──────────┐
                                   │  Product  │  │  Cart  │ │   Order      │
                                   │  Service  │  │Service │ │   Service    │
                                   └─────┬─────┘  └───┬────┘ └──────┬───────┘
                                         │             │             │
                                   ┌─────▼─────┐  ┌───▼────┐ ┌──────▼───────┐
                                   │PostgreSQL │  │ Redis  │ │  PostgreSQL  │
                                   │(products) │  │(carts) │ │  (orders)    │
                                   └───────────┘  └────────┘ └──────┬───────┘
                                                                      │
                                                          ┌───────────▼──────────┐
                                                          │       Kafka          │
                                                          │  OrderPlaced event   │
                                                          └──┬──────────┬────────┘
                                                             │          │
                                                    ┌────────▼──┐ ┌─────▼───────────┐
                                                    │ Inventory │ │  Notification   │
                                                    │  Service  │ │    Service      │
                                                    └─────┬─────┘ └─────────────────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │ Payment     │
                                                   │ Service     │
                                                   │ (→ Stripe)  │
                                                   └─────────────┘
```
:::

---

### Step 5 — Key Design Decisions

::: details Deep-dive

**Order placement flow (saga):**
```
1. POST /orders received
2. Validate cart and product availability
3. Create order (status: PENDING) — local DB transaction
4. Publish OrderPlaced event to Kafka

Background saga:
5. Inventory Service: reserve stock → StockReserved
6. Payment Service: charge card via Stripe → PaymentProcessed
7. Order Service: update status to CONFIRMED

Failure paths:
- Payment fails → PaymentFailed → release stock → order CANCELLED
- Stock unavailable → StockUnavailable → order CANCELLED
- Timeout (no event in 5 min) → compensate all steps
```

**Product catalogue:**
- Products stored in PostgreSQL
- Redis cache with 5-minute TTL for product detail pages
- Elasticsearch for full-text search (name, description, tags)
- Cache-aside pattern: read from Redis, fallback to PostgreSQL
- Product updates invalidate cache entry + reindex in Elasticsearch

**Inventory consistency:**
The critical race condition: two users simultaneously place orders for the last item.

```sql
-- Pessimistic lock on high-contention flash sale items
SELECT * FROM inventory WHERE product_id = ? FOR UPDATE;
UPDATE inventory SET reserved = reserved + 1 WHERE product_id = ? AND available > 0;

-- Or: optimistic lock with version
UPDATE inventory
SET reserved = reserved + 1, version = version + 1
WHERE product_id = ? AND available > 0 AND version = ?;
-- 0 rows updated → retry or return "out of stock"
```

For flash sales (extreme contention): pre-load stock into Redis, use `DECRBY` (atomic) to reserve, async confirm in DB.

**Cart:**
- Stored in Redis (TTL: 7 days)
- Key: `cart:{userId}`
- Value: JSON map of `{productId: quantity}`
- Fast R/W, no need for ACID
- Merged with any anonymous cart on login

**Notifications:**
- Kafka consumer: `NotificationService` listens to `OrderPlaced`, `OrderShipped`, `PaymentFailed`
- Email via AWS SES, SMS via SNS
- Idempotent: deduplicate on order ID before sending

**Search (Elasticsearch):**
```json
{
  "query": {
    "multi_match": {
      "query": "gaming laptop",
      "fields": ["name^3", "description", "tags^2"],
      "fuzziness": "AUTO"
    }
  },
  "filter": {
    "range": { "price": { "gte": 500, "lte": 2000 } }
  }
}
```

:::

---

### Step 6 — Bottlenecks & Scaling

| Bottleneck | At scale solution |
|-----------|-----------------|
| Product reads | Redis cache + CDN for images |
| Order DB writes | Connection pooling (PgBouncer), write partitioning by userId |
| Payment processing | Async via saga — don't block HTTP response |
| Search | Elasticsearch cluster (3+ nodes), index sharding |
| Flash sales | Redis atomic DECRBY for inventory reservation |
| Session/auth | JWT (stateless) — no session store needed |

**Scaling path:**
- **Day 1 (100K DAU):** Monolith + PostgreSQL + Redis + Elasticsearch
- **1M DAU:** Extract Order + Payment + Inventory into separate services, add Kafka
- **10M DAU:** Horizontal scaling of services, read replicas, shard orders DB by userId range, CDN for static assets

> [!TIP] Golden Tip
> The order placement saga is the heart of this design — most candidates oversimplify it as "call inventory and payment synchronously." The correct answer separates concerns: the HTTP response returns 202 Accepted immediately after creating the PENDING order, and the saga runs asynchronously. This avoids blocking the user on a potentially slow payment gateway and makes the system more resilient. Also show that you've thought about the **flash sale inventory problem** — it's the hardest concurrency challenge in e-commerce and signals that you've dealt with real production load.

**Follow-up questions:**
- How do you prevent overselling inventory during a flash sale?
- How would you implement order cancellation (with payment refund) as a saga?
- How would you scale the product search to support 1B products?
- What monitoring would you put in place to detect a broken payment saga?
