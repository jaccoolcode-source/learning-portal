---
title: Microservices
description: Microservices architecture — service decomposition, communication patterns, resilience, service mesh, and when to choose microservices
category: architecture
pageClass: layout-architecture
difficulty: advanced
tags: [microservices, api-gateway, circuit-breaker, service-mesh, event-driven]
related:
  - /architecture/ddd
  - /architecture/rest-web
  - /spring/spring-boot
  - /databases/
estimatedMinutes: 30
---

# Microservices

<DifficultyBadge level="advanced" />

Microservices is an architectural style where an application is composed of small, independently deployable services. Each service owns its data and communicates over a network.

---

## Monolith → Microservices

### When to stay with a monolith
- Team is small (< ~8 engineers)
- Domain boundaries are unclear
- You're still validating the product
- Operational complexity of distributed systems isn't justified

### When microservices make sense
- Clear bounded contexts with different release cadences
- Independent scaling requirements per service
- Large teams needing independent ownership
- Different technology requirements per service

::: tip Rule of Thumb
Start with a **modular monolith**. Extract services when bounded contexts are proven and organizational pressure exists.
:::

---

## Service Decomposition

### Decompose by Business Capability

```
E-commerce monolith → extract:
  ├── OrderService      (create, track, cancel orders)
  ├── InventoryService  (stock levels, reservations)
  ├── PaymentService    (charge, refund)
  ├── NotificationService (email, SMS)
  └── UserService       (auth, profiles)
```

### Decompose by DDD Bounded Context

Each service maps to one bounded context. The `Order` concept in `OrderService` is different from `Order` in `InventoryService` — they own their own models.

---

## Communication Patterns

### Synchronous — REST / gRPC

```java
// Feign client (Spring Cloud)
@FeignClient(name = "inventory-service")
public interface InventoryClient {

    @GetMapping("/api/inventory/{productId}")
    InventoryResponse checkStock(@PathVariable String productId);
}

@Service
@RequiredArgsConstructor
public class OrderService {

    private final InventoryClient inventoryClient;

    public Order placeOrder(OrderRequest req) {
        InventoryResponse inv = inventoryClient.checkStock(req.getProductId());
        if (!inv.isAvailable()) {
            throw new OutOfStockException(req.getProductId());
        }
        return orderRepository.save(new Order(req));
    }
}
```

**Pros:** Simple, immediate response
**Cons:** Temporal coupling — if Inventory is down, Order fails

### Asynchronous — Message Broker (Kafka / RabbitMQ)

```java
// Producer — OrderService publishes an event
@Service
@RequiredArgsConstructor
public class OrderService {

    private final KafkaTemplate<String, OrderPlacedEvent> kafka;

    public Order placeOrder(OrderRequest req) {
        Order order = orderRepository.save(new Order(req));
        kafka.send("order-placed", new OrderPlacedEvent(order.getId(), req.getProductId()));
        return order;
    }
}

// Consumer — InventoryService reacts
@Component
public class InventoryEventListener {

    @KafkaListener(topics = "order-placed")
    public void onOrderPlaced(OrderPlacedEvent event) {
        inventoryService.reserve(event.getProductId(), event.getOrderId());
    }
}
```

**Pros:** Decoupled, resilient, scales independently
**Cons:** Eventual consistency, harder to trace and debug

---

## Resilience Patterns

### Circuit Breaker (Resilience4j)

```java
@Service
public class OrderService {

    @CircuitBreaker(name = "inventoryService", fallbackMethod = "fallbackStock")
    public InventoryResponse checkStock(String productId) {
        return inventoryClient.checkStock(productId);
    }

    public InventoryResponse fallbackStock(String productId, Exception ex) {
        // Return cached data or a default response
        return InventoryResponse.assumeAvailable(productId);
    }
}
```

**States:**
- **Closed** — requests flow normally, failures counted
- **Open** — requests immediately fail/fallback (circuit tripped)
- **Half-Open** — test requests allowed to probe recovery

### Retry with Exponential Backoff

```java
@Retry(name = "inventoryService", fallbackMethod = "fallbackStock")
public InventoryResponse checkStock(String productId) {
    return inventoryClient.checkStock(productId);
}
```

```yaml
# application.yml
resilience4j:
  retry:
    instances:
      inventoryService:
        maxAttempts: 3
        waitDuration: 500ms
        enableExponentialBackoff: true
        exponentialBackoffMultiplier: 2
```

### Bulkhead

Isolates failures so one slow service doesn't exhaust all threads.

```yaml
resilience4j:
  bulkhead:
    instances:
      inventoryService:
        maxConcurrentCalls: 10
        maxWaitDuration: 0
```

---

## API Gateway

The gateway is the single entry point for all client requests. It handles:
- Routing to downstream services
- Authentication / JWT validation
- Rate limiting
- Request aggregation

```
Client
  │
  ▼
API Gateway (Spring Cloud Gateway / Kong / AWS API GW)
  ├── /api/orders/**   → OrderService:8081
  ├── /api/inventory/** → InventoryService:8082
  └── /api/users/**   → UserService:8083
```

```java
// Spring Cloud Gateway route config
@Bean
public RouteLocator routes(RouteLocatorBuilder builder) {
    return builder.routes()
        .route("order-service", r -> r
            .path("/api/orders/**")
            .filters(f -> f.addRequestHeader("X-Gateway", "true"))
            .uri("lb://order-service"))  // lb = load balanced via Eureka
        .build();
}
```

---

## Service Discovery

```java
// Register with Eureka
// application.yml
spring:
  application:
    name: order-service
eureka:
  client:
    service-url:
      defaultZone: http://eureka-server:8761/eureka/
```

Services register themselves; clients look up by name (`lb://order-service`) rather than hardcoded URLs.

---

## Distributed Tracing

Correlate logs across services using a **trace ID** propagated in HTTP headers (W3C TraceContext or Zipkin B3).

```java
// Micrometer Tracing (Spring Boot 3+) — auto-configured
// Each request gets a traceId; all downstream calls carry it
// View in Zipkin or Jaeger UI
```

Log output with Sleuth/Micrometer:
```
INFO  [order-service,traceId=abc123,spanId=def456] Order placed: 99
INFO  [inventory-service,traceId=abc123,spanId=ghi789] Reserved stock for order 99
```

---

## Data Patterns

### Database per Service

Each service owns its own database schema — no shared tables.

```
OrderService    → orders_db (PostgreSQL)
InventoryService → inventory_db (PostgreSQL)
NotificationService → notifications_db (MongoDB)
```

### Saga Pattern (Distributed Transactions)

Replaces 2-phase commit with a sequence of local transactions + compensating actions.

```
1. OrderService     → creates order (PENDING)
2. PaymentService   → charges card
3. InventoryService → reserves stock
4. OrderService     → confirms order (CONFIRMED)

If step 3 fails:
  → PaymentService compensates (refunds card)
  → OrderService compensates (cancels order)
```

There are two ways to implement sagas: **Choreography** and **Orchestration**.

---

## Choreography vs Orchestration

### Choreography — Event-Driven, No Central Coordinator

Each service reacts to events published by other services. No service knows the full workflow.

```java
// OrderService — publishes event, doesn't know what happens next
@Service
public class OrderService {

    @Transactional
    public Order placeOrder(OrderRequest req) {
        Order order = orderRepo.save(Order.pending(req));
        eventPublisher.publish(new OrderPlacedEvent(order.getId(), req.getProductId(), req.getAmount()));
        return order;
    }

    // Listens for final outcomes
    @KafkaListener(topics = "payment-failed")
    public void onPaymentFailed(PaymentFailedEvent event) {
        orderRepo.findById(event.getOrderId())
            .ifPresent(order -> { order.cancel(); orderRepo.save(order); });
    }
}

// PaymentService — reacts to OrderPlaced, publishes its outcome
@Component
public class PaymentEventHandler {

    @KafkaListener(topics = "order-placed")
    public void onOrderPlaced(OrderPlacedEvent event) {
        try {
            paymentService.charge(event.getOrderId(), event.getAmount());
            eventPublisher.publish(new PaymentSucceededEvent(event.getOrderId()));
        } catch (PaymentException e) {
            eventPublisher.publish(new PaymentFailedEvent(event.getOrderId(), e.getMessage()));
        }
    }
}

// InventoryService — reacts to PaymentSucceeded
@Component
public class InventoryEventHandler {

    @KafkaListener(topics = "payment-succeeded")
    public void onPaymentSucceeded(PaymentSucceededEvent event) {
        inventoryService.reserve(event.getOrderId(), event.getProductId());
        eventPublisher.publish(new StockReservedEvent(event.getOrderId()));
    }
}
```

**Choreography pros:** Fully decoupled — no service knows about others; easy to add new participants.

**Choreography cons:** Hard to visualise the full workflow; difficult to debug cascading failures; no single place to see overall saga state.

### Orchestration — Central Coordinator

One service (the Saga Orchestrator) knows the full workflow and tells each participant what to do.

```java
// Saga Orchestrator — owns the entire workflow
@Service
public class OrderSagaOrchestrator {

    @Transactional
    public void startSaga(Long orderId) {
        SagaState saga = sagaRepo.save(SagaState.start(orderId));
        commandBus.send(new ChargePaymentCommand(orderId, saga.getId()));
    }

    @EventHandler
    public void onPaymentCharged(PaymentChargedEvent event) {
        SagaState saga = sagaRepo.findBySagaId(event.getSagaId());
        saga.step("PAYMENT_DONE");
        commandBus.send(new ReserveStockCommand(event.getOrderId(), saga.getId()));
        sagaRepo.save(saga);
    }

    @EventHandler
    public void onStockReserved(StockReservedEvent event) {
        SagaState saga = sagaRepo.findBySagaId(event.getSagaId());
        saga.complete();
        commandBus.send(new ConfirmOrderCommand(event.getOrderId()));
        sagaRepo.save(saga);
    }

    @EventHandler
    public void onPaymentFailed(PaymentFailedEvent event) {
        SagaState saga = sagaRepo.findBySagaId(event.getSagaId());
        saga.fail("PAYMENT_FAILED");
        commandBus.send(new CancelOrderCommand(event.getOrderId()));
        sagaRepo.save(saga);
    }
}
```

**Orchestration pros:** Full workflow visibility in one place; easier to debug, monitor, and add compensating actions.

**Orchestration cons:** Orchestrator becomes a coupling point; if it fails, the saga stalls.

### Comparison

| | Choreography | Orchestration |
|--|--|--|
| Coupling | Low — services only know about events | Medium — services know the orchestrator |
| Visibility | Hard — flow is implicit | Clear — flow is explicit in one place |
| Debugging | Difficult — trace through event chain | Easier — one place to check state |
| Scalability | High — no bottleneck | Potential bottleneck at orchestrator |
| Best for | Simple flows (2–3 services) | Complex flows (3+ steps, compensation logic) |

::: tip Golden Rule
Use choreography for simple 2-service event flows. Use orchestration (or AWS Step Functions / Axon) for anything with 3+ steps, compensation logic, or where workflow visibility matters in production.
:::

---

## Idempotency in Microservices

At-least-once delivery (Kafka, SQS) means your consumer may receive the same message multiple times. Every consumer must be idempotent.

```java
// Pattern: idempotency table — track processed message IDs
@Component
public class PaymentEventHandler {

    @KafkaListener(topics = "order-placed")
    @Transactional
    public void onOrderPlaced(OrderPlacedEvent event) {
        // Check if already processed
        if (processedEventRepo.existsById(event.getEventId())) {
            log.info("Duplicate event {}, skipping", event.getEventId());
            return;
        }

        paymentService.charge(event.getOrderId(), event.getAmount());

        // Mark as processed in same transaction
        processedEventRepo.save(new ProcessedEvent(event.getEventId(), Instant.now()));
    }
}
```

**Idempotency at multiple levels:**

| Level | Technique |
|-------|-----------|
| API (POST) | Idempotency-Key header stored in Redis (24h TTL) |
| Message consumer | Processed event ID table, check before acting |
| Database | `INSERT ... ON CONFLICT DO NOTHING`, conditional writes |
| DynamoDB | `PutItem` with `attribute_not_exists(PK)` condition |

---

## Key Interview Points

| Question | Answer |
|----------|--------|
| How do services communicate? | Sync (REST/gRPC) or async (Kafka/RabbitMQ) |
| How to handle a failing downstream? | Circuit breaker, retry, fallback, bulkhead |
| How to avoid distributed transactions? | Saga pattern with compensating transactions |
| Choreography vs Orchestration? | Choreography = event-driven, decoupled; Orchestration = central coordinator, better visibility |
| How to handle at-least-once delivery? | Idempotency keys / processed-event table checked in same transaction |
| How to trace a request across services? | Distributed tracing (Zipkin, Jaeger) with trace IDs |
| When NOT to use microservices? | Small teams, unclear domain, early-stage products |

---

## Interview Quick-Fire

**Q: What is the difference between choreography and orchestration in the Saga pattern?**
In choreography, each service reacts to events from other services — there's no central coordinator; services are fully decoupled but the overall flow is implicit and hard to visualise. In orchestration, a central orchestrator (a dedicated service or a workflow engine like AWS Step Functions) explicitly tells each participant what to do — the entire flow is visible in one place, compensation logic is centralised, and debugging is easier. Use choreography for simple 2-service flows; orchestration for anything with 3+ steps or complex compensation.

**Q: How do you ensure idempotency in a microservice that consumes Kafka messages?**
Use a processed-event deduplication table. Before processing a message, check if its unique event ID is already in the table. If yes, skip it. If no, process the event and insert the event ID — both in the same transaction. This guarantees exactly-once processing even with at-least-once delivery. For stateless operations (like `PUT /resource`), the operation itself may already be naturally idempotent.

**Q: Why is 2PC (Two-Phase Commit) avoided in microservices?**
2PC requires a distributed coordinator that locks resources across all participants until the commit phase completes. If the coordinator crashes mid-commit, all participants are blocked indefinitely. It's a single point of failure, creates tight coupling between services, and performs poorly under load. The Saga pattern replaces 2PC with local transactions + compensating actions — no cross-service locks, eventual consistency instead of strong consistency.

---

> **Next:** [DDD →](./ddd)

<RelatedTopics :topics="['/architecture/ddd', '/architecture/rest-web', '/spring/spring-boot', '/databases/sql']" />
