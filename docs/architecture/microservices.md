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

---

## Key Interview Points

| Question | Answer |
|----------|--------|
| How do services communicate? | Sync (REST/gRPC) or async (Kafka/RabbitMQ) |
| How to handle a failing downstream? | Circuit breaker, retry, fallback, bulkhead |
| How to avoid distributed transactions? | Saga pattern with compensating transactions |
| How to trace a request across services? | Distributed tracing (Zipkin, Jaeger) with trace IDs |
| When NOT to use microservices? | Small teams, unclear domain, early-stage products |

---

> **Next:** [DDD →](./ddd)

<RelatedTopics :topics="['/architecture/ddd', '/architecture/rest-web', '/spring/spring-boot', '/databases/sql']" />
