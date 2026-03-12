---
title: Reliability & Resilience
description: Circuit breakers, bulkhead, retry with backoff, rate limiting algorithms, failover, SLA/SLO/SLI, and RTO/RPO
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [reliability, circuit-breaker, retry, rate-limiting, sla, slo, rto, rpo, resilience]
related:
  - /system-design/scalability
  - /system-design/observability
  - /architecture/microservices
estimatedMinutes: 35
---

# Reliability & Resilience

<DifficultyBadge level="advanced" />

Reliable systems assume failures will happen and are designed to handle them gracefully. The goal is not to prevent all failures — it's to limit their blast radius and recover quickly.

---

## Reliability Fundamentals

### Failure Is Inevitable

```
Distributed system with 10 services, each at 99.9% availability:
  P(all up) = 0.999^10 = 99% → 3.6 days of downtime/year

Each service at 99.99%:
  P(all up) = 0.9999^10 = 99.9% → 8.7 hours of downtime/year
```

Design assumption: **any component can fail at any time**. Services should degrade gracefully, not cascade.

### Cascading Failures

```
Service A calls Service B. B is slow.
→ A's threads block waiting for B
→ A's thread pool exhausts
→ A becomes unresponsive
→ All services calling A fail

Solution: timeouts + circuit breakers + bulkheads
```

---

## Timeouts

Every network call must have a timeout. Without one, threads block indefinitely.

```java
// Spring WebClient with timeouts
WebClient client = WebClient.builder()
    .baseUrl("https://payment-service.internal")
    .clientConnector(new ReactorClientHttpConnector(
        HttpClient.create()
            .connectTimeout(Duration.ofSeconds(1))   // TCP connect timeout
            .responseTimeout(Duration.ofSeconds(5))  // Total response timeout
    ))
    .build();

// RestTemplate (legacy)
RestTemplate restTemplate = new RestTemplate();
HttpComponentsClientHttpRequestFactory factory =
    new HttpComponentsClientHttpRequestFactory();
factory.setConnectTimeout(1000);
factory.setReadTimeout(5000);
restTemplate.setRequestFactory(factory);
```

**Timeout budgets:** Set timeouts based on SLOs. If your SLO is p99 < 200ms, your downstream timeout should be < 150ms.

---

## Retry with Exponential Backoff + Jitter

Retrying immediately after a failure often makes things worse (thundering herd). Use **exponential backoff** with **jitter** (randomness).

```
Attempt 1: wait 1s
Attempt 2: wait 2s
Attempt 3: wait 4s
Attempt 4: wait 8s  (+ random jitter ±50%)
→ Give up
```

```java
// Spring Retry
@Configuration
@EnableRetry
public class RetryConfig { }

@Service
public class PaymentService {
    @Retryable(
        retryFor = { ResourceAccessException.class, ServiceUnavailableException.class },
        maxAttempts = 4,
        backoff = @Backoff(
            delay = 1000,       // initial delay ms
            multiplier = 2.0,   // exponential factor
            random = true       // jitter
        )
    )
    public PaymentResult charge(PaymentRequest request) {
        return paymentClient.charge(request);
    }

    @Recover
    public PaymentResult recoverCharge(Exception ex, PaymentRequest request) {
        log.error("Payment failed after retries", ex);
        return PaymentResult.failed("Service unavailable — please try later");
    }
}
```

**Only retry idempotent operations.** A failed `POST /orders` that might have succeeded must not be blindly retried without an idempotency key — you could create duplicate orders.

---

## Circuit Breaker

Prevents cascading failures by fast-failing requests when a downstream is unhealthy.

### States

```
CLOSED (normal) → failure threshold exceeded → OPEN (fast fail)
                                               ↓ wait timeout
                                         HALF-OPEN (probe)
                                               ↓ success
                                             CLOSED
                                               ↓ failure
                                              OPEN
```

```
CLOSED: requests pass through, failures counted
  → if failure rate > 50% in last 10 requests → OPEN

OPEN: all requests fail immediately (no waiting)
  → after 30 seconds → HALF-OPEN

HALF-OPEN: let a few requests through
  → if they succeed → CLOSED
  → if they fail → OPEN
```

### Resilience4j Circuit Breaker

```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
</dependency>
```

```yaml
# application.yml
resilience4j:
  circuitbreaker:
    instances:
      payment-service:
        slidingWindowType: COUNT_BASED
        slidingWindowSize: 10           # evaluate last 10 calls
        failureRateThreshold: 50        # open if 50%+ fail
        waitDurationInOpenState: 30s
        permittedNumberOfCallsInHalfOpenState: 3
        minimumNumberOfCalls: 5         # need at least 5 calls before evaluating
        recordExceptions:
          - java.io.IOException
          - java.util.concurrent.TimeoutException
```

```java
@Service
public class OrderService {
    @CircuitBreaker(name = "payment-service", fallbackMethod = "paymentFallback")
    @Retry(name = "payment-service")
    @TimeLimiter(name = "payment-service")
    public CompletableFuture<PaymentResult> processPayment(Order order) {
        return CompletableFuture.supplyAsync(() ->
            paymentClient.charge(order.total(), order.customerId())
        );
    }

    // Fallback — called when circuit is open or retries exhausted
    public CompletableFuture<PaymentResult> paymentFallback(Order order, Exception ex) {
        log.warn("Payment circuit open, queuing for later", ex);
        paymentQueue.add(order); // save to retry queue
        return CompletableFuture.completedFuture(PaymentResult.queued());
    }
}
```

---

## Bulkhead Pattern

Isolate resources per consumer so one slow/failing consumer doesn't exhaust shared resources.

```
Without bulkhead:
  All service calls share one thread pool (100 threads)
  Payment service becomes slow → uses all 100 threads
  → User service, Order service starved

With bulkhead:
  Payment service pool: 20 threads
  User service pool: 30 threads
  Order service pool: 50 threads
  → Payment going down doesn't affect User or Order
```

```yaml
resilience4j:
  bulkhead:
    instances:
      payment-service:
        maxConcurrentCalls: 20          # max parallel calls to payment service
        maxWaitDuration: 500ms          # wait 500ms for a slot, then fail fast

  thread-pool-bulkhead:
    instances:
      payment-service:
        maxThreadPoolSize: 10
        coreThreadPoolSize: 5
        queueCapacity: 20
```

---

## Rate Limiting

Rate limiting protects services from being overwhelmed and fairly distributes capacity.

### Token Bucket Algorithm ← most common

A bucket holds N tokens. Each request consumes a token. Tokens refill at a fixed rate.

```
Bucket capacity: 10 tokens
Refill rate: 10 tokens/second

Request arrives → consume 1 token → if bucket empty: reject (429)
Burst: can consume up to 10 tokens instantly, then rate-limited
```

```java
// Bucket4j — Java token bucket implementation
Bucket bucket = Bucket.builder()
    .addLimit(Bandwidth.classic(10,       // capacity
              Refill.intervally(10,        // refill 10 tokens
                                Duration.ofSeconds(1)))) // per second
    .build();

public ResponseEntity<?> handleRequest() {
    if (bucket.tryConsume(1)) {
        return ResponseEntity.ok(processRequest());
    }
    return ResponseEntity.status(429).body("Too many requests");
}
```

### Algorithm Comparison

| Algorithm | Burst | Memory | Accuracy | Use Case |
|-----------|-------|--------|----------|----------|
| **Token Bucket** | Allows burst up to capacity | Low (counter + timestamp) | Good | API rate limiting — most common |
| **Leaky Bucket** | No burst (constant output rate) | Low | Good | Traffic shaping, smooth output |
| **Fixed Window Counter** | Spike at window boundary | Very low | Poor at boundaries | Simple, coarse limiting |
| **Sliding Window Log** | Precise | High (stores timestamps) | Exact | Strict enforcement |
| **Sliding Window Counter** | Good | Low | Good | Balance of accuracy and memory |

### Distributed Rate Limiting with Redis

```java
// Sliding window counter in Redis
// Script runs atomically — no race conditions
private static final String RATE_LIMIT_SCRIPT = """
    local key = KEYS[1]
    local window = tonumber(ARGV[1])  -- window in seconds
    local limit = tonumber(ARGV[2])   -- max requests
    local now = tonumber(ARGV[3])     -- current timestamp ms

    -- Remove entries outside the window
    redis.call('ZREMRANGEBYSCORE', key, 0, now - window * 1000)
    -- Count remaining
    local count = redis.call('ZCARD', key)

    if count < limit then
        redis.call('ZADD', key, now, now)
        redis.call('EXPIRE', key, window)
        return 1  -- allowed
    end
    return 0  -- rejected
    """;

@Service
public class RateLimiter {
    private final RedisTemplate<String, String> redis;
    private final DefaultRedisScript<Long> script;

    public boolean isAllowed(String userId, int windowSeconds, int limit) {
        String key = "rate:" + userId;
        Long allowed = redis.execute(script,
            List.of(key),
            String.valueOf(windowSeconds),
            String.valueOf(limit),
            String.valueOf(System.currentTimeMillis()));
        return Long.valueOf(1L).equals(allowed);
    }
}
```

---

## Failover

**Active-passive failover:**
```
Primary: active, receiving traffic
Standby: passive, replicating from primary

On primary failure:
  DNS failover: update DNS record → standby IP
  Health check: load balancer removes primary, adds standby
```

**Active-active failover:**
```
Both nodes active, both receive traffic
On one node failure:
  Remaining node handles 100% of traffic
  Need enough headroom: size each node for full load
```

**Warm standby vs cold standby:**
```
Warm standby: standby is running, synced, but not serving traffic
  → Failover in seconds to minutes

Cold standby: standby is not running, brought up from snapshot
  → Failover in minutes to hours (RTO is higher)
```

---

## SLA, SLO, SLI

| Term | Definition | Example |
|------|-----------|---------|
| **SLI** (Service Level Indicator) | Measured metric | p99 latency = 95ms, error rate = 0.1% |
| **SLO** (Service Level Objective) | Internal target | p99 latency < 200ms, error rate < 1% |
| **SLA** (Service Level Agreement) | External contract (with penalties) | 99.9% uptime, refund if breached |

```
SLI: what you measure
SLO: what you aim for (slightly stricter than SLA)
SLA: what you promise customers (with consequences)

Buffer: SLO should be stricter than SLA
  SLA: 99.9% uptime
  SLO: 99.95% uptime (internal target — alerts fire before you breach SLA)
```

### Error Budget

```
SLO: 99.9% availability = 0.1% allowed error rate
Monthly error budget: 0.1% × 30 days × 24 hours = 43.2 minutes of downtime

When error budget is exhausted:
→ Stop new feature launches
→ Focus all effort on reliability
```

---

## RTO and RPO

| Term | Definition | Example |
|------|-----------|---------|
| **RTO** (Recovery Time Objective) | Maximum tolerable downtime | 4 hours — system must be up within 4 hours of failure |
| **RPO** (Recovery Point Objective) | Maximum tolerable data loss | 1 hour — can lose at most 1 hour of data |

```
Failure at 14:00
RPO = 1 hour → restore from backup at 13:00 (lose 1 hour of data)
RTO = 4 hours → system must be operational by 18:00

Lower RTO/RPO → more expensive:
  RPO = 0 (no data loss) → synchronous replication
  RTO = 0 (no downtime) → active-active multi-region
```

### Achieving Low RTO/RPO

```
High RPO tolerance (hours):
  → Daily backups to S3

Low RPO (minutes):
  → Continuous replication to standby DB

Near-zero RPO (seconds):
  → Synchronous multi-master replication

Near-zero RTO:
  → Active-active, load balancer detects failure and reroutes in seconds
```

---

## Design Patterns for Reliability

| Pattern | Problem Solved | Implementation |
|---------|---------------|----------------|
| **Circuit Breaker** | Cascading failures | Resilience4j |
| **Bulkhead** | Resource starvation | Thread pool isolation |
| **Retry** | Transient failures | Exponential backoff + jitter |
| **Timeout** | Blocking forever | All network calls |
| **Rate Limiter** | Overload protection | Token bucket (Bucket4j + Redis) |
| **Fallback** | Graceful degradation | Return cached/default data |
| **Health Check** | LB removes bad instances | `/actuator/health` |
| **Idempotency** | Duplicate requests | Idempotency key + DB dedup |
| **Queue-based decoupling** | Peak load absorption | Kafka / RabbitMQ |

---

## Chaos Engineering

Deliberately inject failures to test resilience:

```
Chaos Monkey (Netflix): randomly terminates instances in production
Chaos Mesh (Kubernetes): inject network latency, pod failures, CPU stress

Start small:
  1. Kill one pod → does LB route away? Does app recover?
  2. Inject 200ms network latency → does circuit breaker open? Does timeout fire?
  3. Fill a disk → does app log errors gracefully?
  4. Kill the primary DB → does failover work? How long?
```

---

## Interview Quick-Fire

**Q: What is a circuit breaker and what problem does it solve?**
A circuit breaker monitors calls to a downstream service. When the failure rate exceeds a threshold (e.g., 50% in the last 10 calls), it "opens" and fast-fails all requests without attempting the call. This prevents cascading failures — a slow downstream can't exhaust the calling service's thread pool. After a cooldown, it enters half-open state to probe if the downstream recovered.

**Q: Explain token bucket vs leaky bucket rate limiting.**
Token bucket: a bucket fills with tokens at a fixed rate (e.g., 10/second). Each request consumes a token. If the bucket is empty, reject. Allows bursts up to bucket capacity. Leaky bucket: requests enter a queue and are processed at a constant rate — no bursting. Token bucket is more common for APIs (allows reasonable bursts); leaky bucket is used for traffic shaping where smooth output is required.

**Q: What's the difference between RTO and RPO?**
RPO (Recovery Point Objective) is about data: how much data can we afford to lose? RPO = 1 hour means we can restore from an hour-old backup. RTO (Recovery Time Objective) is about time: how long can the system be down? RTO = 4 hours means we must be operational within 4 hours of a failure. Both are business decisions — lower values require more expensive infrastructure (more frequent backups, hot standbys, active-active).

<RelatedTopics :topics="['/system-design/scalability', '/system-design/observability', '/architecture/microservices', '/architecture/distributed-patterns']" />

[→ Back to System Design Overview](/system-design/)
