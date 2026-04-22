# Microservices

**Q44 to Q48** · [← Microservices Overview](./index)

---

## Q44: Microservices Patterns & Communication

> Microservices solve scaling and team autonomy — but introduce distributed systems problems. Seniors know the patterns that solve those problems and the trade-offs of synchronous vs asynchronous communication.

**Synchronous vs Asynchronous communication:**

| | Synchronous (HTTP/gRPC) | Asynchronous (Kafka/RabbitMQ) |
|--|------------------------|-------------------------------|
| **Coupling** | Temporal coupling — both services must be up | Decoupled — producer doesn't wait |
| **Latency** | Response immediately | Eventual |
| **Reliability** | Caller fails if callee is down | Queue buffers messages |
| **Use case** | Query data, user-facing requests | Events, commands, notifications |
| **Complexity** | Low | Higher (idempotency, ordering, retries) |

::: details Full model answer

**Core microservices patterns:**

**1. API Gateway:**
Single entry point for all client requests. Handles cross-cutting concerns: authentication, rate limiting, routing, SSL termination, request aggregation. Clients talk to one URL; the gateway routes internally.
```
Client → API Gateway → Order Service
                     → User Service
                     → Payment Service
```

**2. Service Discovery:**
Services register themselves (Eureka, Consul, Kubernetes DNS). Clients look up instances dynamically instead of hardcoding URLs.
- **Client-side discovery** — client queries registry, picks an instance (Ribbon + Eureka)
- **Server-side discovery** — load balancer queries registry, routes transparently (AWS ALB, Kubernetes Service)

**3. Database per Service:**
Each microservice owns its own database. No shared database — the service's DB is an implementation detail. Services communicate via APIs or events, never via direct DB access from another service.

Benefits: independent scaling, independent schema evolution, polyglot persistence.
Cost: no JOINs across services, eventual consistency challenges.

**4. Strangler Fig:**
Incrementally migrate a monolith to microservices. Route specific features to new services while the monolith still handles the rest. Gradually "strangle" the monolith as more features are extracted.

**5. Sidecar / Service Mesh:**
Each service gets a sidecar proxy (Envoy in Istio). The mesh handles mTLS, retries, timeouts, circuit breaking, observability — without changing application code.

**Synchronous: REST vs gRPC:**

REST:
- Text-based (JSON), universally compatible
- Easy to debug (curl, browser)
- No contract enforcement by default (use OpenAPI)

gRPC:
- Binary (Protocol Buffers) — smaller, faster
- Strict contract via `.proto` files — breaking changes caught at compile time
- Bidirectional streaming
- Best for service-to-service communication, not public APIs

**Asynchronous messaging patterns:**

**Request/Reply over messaging:** Producer sends to a reply queue; consumer processes and sends back to a response queue. Asynchronous but still logically request-response.

**Event-driven:** Services emit domain events (`OrderPlaced`, `PaymentProcessed`). Consumers subscribe and react. Producers have zero knowledge of consumers. Maximum decoupling.

**Event notification vs Event-carried state transfer:**
- Notification: "Order 123 was placed" — consumer fetches details via API
- State transfer: event contains full order data — no callback needed. Faster but larger messages.

**Outbox Pattern (guaranteed delivery):**
```
1. In the same DB transaction:
   - Write the business entity (Order)
   - Write event to outbox table

2. Outbox poller reads unpublished events → publishes to Kafka
3. Mark events as published

→ If Kafka publish fails: retry from outbox. No lost events.
→ No distributed transaction needed between DB and Kafka.
```

:::

> [!TIP] Golden Tip
> Mention the **Outbox Pattern** unprompted — it solves the "dual write" problem (write to DB AND publish to Kafka atomically) that every event-driven system eventually hits. The naive approach of writing to DB and then publishing to Kafka fails if the app crashes between the two operations. The Outbox pattern uses a single local DB transaction and a relay process, giving you exactly-once semantics without a distributed transaction. Knowing this pattern shows you've thought about production reliability, not just happy-path architecture.

**Follow-up questions:**
- What is temporal coupling and how does async messaging solve it?
- What is the database-per-service pattern and what problems does it cause?
- What is the Outbox Pattern and why is it needed?
- When would you choose gRPC over REST for service-to-service communication?

---

## Q45: Circuit Breaker Pattern

> Every senior Java developer working on microservices needs to know this. Network calls fail — the circuit breaker prevents cascading failures from taking down the whole system.

Without a circuit breaker: one slow/failing service causes all callers to queue up → thread pool exhaustion → cascading failure → system-wide outage.

**Circuit breaker states:**

```
           failure threshold exceeded
CLOSED ──────────────────────────────→ OPEN
  ↑                                      │
  │ success                 wait timeout │
  │                                      ↓
HALF-OPEN ←──────────────────────── OPEN
  │ probe request fails → back to OPEN
  │ probe request succeeds → back to CLOSED
```

| State | Behaviour |
|-------|-----------|
| **CLOSED** | Normal operation — calls pass through, failures counted |
| **OPEN** | Fast-fail — all calls immediately return fallback, no actual calls made |
| **HALF-OPEN** | Probe — a limited number of test calls allowed to check if service recovered |

::: details Full model answer

**Resilience4j in Spring Boot:**
```xml
<dependency>
    <groupId>io.github.resilience4j</groupId>
    <artifactId>resilience4j-spring-boot3</artifactId>
</dependency>
```

```yaml
resilience4j:
  circuitbreaker:
    instances:
      paymentService:
        sliding-window-type: COUNT_BASED
        sliding-window-size: 10           # evaluate last 10 calls
        failure-rate-threshold: 50        # open if >50% fail
        wait-duration-in-open-state: 10s  # stay OPEN for 10s
        permitted-number-of-calls-in-half-open-state: 3
        slow-call-rate-threshold: 80      # also open if >80% are slow
        slow-call-duration-threshold: 2s  # "slow" = >2s
```

```java
@Service
public class OrderService {

    @CircuitBreaker(name = "paymentService", fallbackMethod = "paymentFallback")
    @Retry(name = "paymentService")
    @TimeLimiter(name = "paymentService")
    public CompletableFuture<PaymentResult> processPayment(PaymentRequest req) {
        return paymentClient.process(req);
    }

    private CompletableFuture<PaymentResult> paymentFallback(PaymentRequest req, Exception ex) {
        // Queue for retry, return pending status, or notify user
        return CompletableFuture.completedFuture(PaymentResult.pending(req.getOrderId()));
    }
}
```

**Combining Resilience4j decorators (order matters):**
```
Retry ( CircuitBreaker ( RateLimiter ( TimeLimiter ( Bulkhead ( Function ) ) ) ) )
```
Apply from outside in — Retry wraps the entire circuit breaker, so retries only happen while the circuit is CLOSED (no point retrying when OPEN).

**Bulkhead pattern (companion to circuit breaker):**
Limits the number of concurrent calls to a service. Prevents one slow service from consuming all threads.

```yaml
resilience4j:
  bulkhead:
    instances:
      paymentService:
        max-concurrent-calls: 10
        max-wait-duration: 0ms   # fail immediately if all slots full
```

**Thread pool isolation vs semaphore isolation:**
- **Semaphore** (default in Resilience4j): limits concurrent calls in the caller's thread. Low overhead.
- **Thread pool** (Bulkhead `ThreadPoolBulkhead`): runs calls in a separate thread pool. Caller's thread is freed if the pool is full. Better for slow I/O, supports `TimeLimiter`.

**Fallback strategies:**
| Strategy | Use case |
|----------|----------|
| Return cached/stale data | Read operations (product catalogue) |
| Return default/empty response | Non-critical enrichment data |
| Queue for async processing | Write operations (order creation) |
| Return error to user with retry guidance | User-facing critical paths |

**Monitoring:**
```java
CircuitBreakerRegistry registry = CircuitBreakerRegistry.ofDefaults();
CircuitBreaker cb = registry.circuitBreaker("paymentService");

// State change events
cb.getEventPublisher()
  .onStateTransition(e -> log.warn("Circuit breaker state: {}", e.getStateTransition()))
  .onFailureRateExceeded(e -> alerting.send("Payment service failing"));
```

Expose via Actuator + Micrometer → Prometheus → Grafana dashboard.

:::

> [!TIP] Golden Tip
> Distinguish between **circuit breaker** (stops calling a failing service) and **retry** (retries a failed call). They solve different problems and must be composed correctly: retry inside circuit breaker means retries count toward the failure threshold. Retry outside (wrapping the circuit breaker) means retries only fire when the circuit is CLOSED — the right behaviour. Also mention the **Bulkhead** pattern alongside circuit breaker — thread pool exhaustion is how circuit breaking failures cascade even when you have a circuit breaker, and Bulkhead prevents that.

**Follow-up questions:**
- What are the three states of a circuit breaker and what triggers each transition?
- What is the difference between a circuit breaker and a retry?
- What is the Bulkhead pattern and why is it used alongside a circuit breaker?
- How do you monitor circuit breaker state in production?

---

## Q46: Saga Pattern & Distributed Transactions

> You can't use a database transaction across microservices. The Saga pattern is the standard solution — know both flavours and their failure modes.

In a distributed system, each service has its own database. A business operation spanning multiple services (create order → reserve inventory → charge payment) cannot use a single ACID transaction. **Saga** breaks it into a sequence of local transactions, each with a **compensating transaction** that undoes the work if a later step fails.

**Two implementations:**

| | Choreography | Orchestration |
|--|-------------|--------------|
| **Coordination** | Services react to events | Central orchestrator commands services |
| **Coupling** | Loose — no central coordinator | Tighter — orchestrator knows all steps |
| **Visibility** | Hard to trace flow | Easy to visualise in one place |
| **Failure handling** | Events trigger compensations | Orchestrator manages rollback |
| **Best for** | Simple flows (3–4 steps) | Complex flows, long-running processes |

::: details Full model answer

**Choreography-based Saga:**
Services communicate via events. Each service does its work and emits an event; downstream services listen and react.

```
OrderService     → emits: OrderCreated
InventoryService → listens: OrderCreated → reserves stock → emits: StockReserved
PaymentService   → listens: StockReserved → charges card → emits: PaymentProcessed
OrderService     → listens: PaymentProcessed → confirms order

// Failure path:
PaymentService   → payment fails → emits: PaymentFailed
InventoryService → listens: PaymentFailed → releases stock → emits: StockReleased
OrderService     → listens: StockReleased → cancels order
```

Pros: Maximum decoupling, no single point of failure.
Cons: Business logic is scattered across multiple services. Circular events can cause hard-to-debug issues. Hard to visualise the full saga state.

**Orchestration-based Saga:**
A central **Saga Orchestrator** (can be implemented with Spring State Machine or Temporal) manages the saga lifecycle. It sends commands and waits for replies.

```java
@SagaEventHandler(associationProperty = "orderId")
public class OrderSaga {

    @StartSaga
    @SagaEventHandler(associationProperty = "orderId")
    public void on(OrderCreatedEvent event) {
        commandGateway.send(new ReserveStockCommand(event.getOrderId(), event.getItems()));
    }

    @SagaEventHandler(associationProperty = "orderId")
    public void on(StockReservedEvent event) {
        commandGateway.send(new ProcessPaymentCommand(event.getOrderId(), event.getAmount()));
    }

    @SagaEventHandler(associationProperty = "orderId")
    public void on(PaymentFailedEvent event) {
        commandGateway.send(new ReleaseStockCommand(event.getOrderId()));  // compensate
        commandGateway.send(new CancelOrderCommand(event.getOrderId()));
    }

    @EndSaga
    @SagaEventHandler(associationProperty = "orderId")
    public void on(PaymentProcessedEvent event) {
        commandGateway.send(new ConfirmOrderCommand(event.getOrderId()));
    }
}
```
(Example using Axon Framework)

**Key design considerations:**

**Idempotency is mandatory:** Events can be delivered more than once (Kafka at-least-once). Every saga step must be idempotent — processing the same event twice must produce the same result.

**Isolation problem:** Sagas do not provide isolation. While a saga is in-progress, other transactions can see intermediate state (order is PENDING, stock is reserved). This is by design — Saga trades isolation for availability.

**Compensating transactions are NOT rollbacks:** A compensating transaction is a new forward action that logically undoes the previous step. If inventory was reserved, the compensation is an "unreserve" — a new DB write, not a rollback of the old transaction.

**Semantic locking (pivot transaction):** Mark resources as "pending" during the saga so other operations don't interfere:
```
Order status: DRAFT → PENDING_PAYMENT → CONFIRMED
Stock status: AVAILABLE → RESERVED → ALLOCATED
```

**Saga failure scenarios:**
| Failure | Recovery |
|---------|---------|
| Step fails before compensation event | Retry (idempotent) |
| Compensation fails | Dead letter queue → manual intervention → alert |
| Orchestrator crashes | Persist saga state — resume from last checkpoint |

**Temporal (workflow-as-code):**
Modern alternative to manual saga orchestration. Sagas are written as regular Java code — Temporal handles persistence, retries, timeouts, and recovery transparently. Used heavily at Netflix, DoorDash, Stripe.

```java
@WorkflowImpl
public class OrderWorkflowImpl implements OrderWorkflow {
    public void processOrder(OrderRequest request) {
        inventoryActivities.reserveStock(request);
        try {
            paymentActivities.chargeCard(request);
        } catch (PaymentException e) {
            inventoryActivities.releaseStock(request);
            throw e;
        }
        orderActivities.confirmOrder(request);
    }
}
```

:::

> [!TIP] Golden Tip
> The most common interview mistake: confusing Saga compensating transactions with database rollbacks. A compensation is a **new forward business operation** — it can fail, it has side effects (email sent, stock released), and it must also be idempotent. The other thing worth mentioning: Saga solves atomicity across services but NOT isolation — intermediate states are visible. For use cases that require isolation (financial transfers), you need additional patterns like semantic locking or process managers. Showing this nuance separates senior from junior candidates.

**Follow-up questions:**
- What is the difference between choreography and orchestration sagas?
- How do compensating transactions differ from database rollbacks?
- What is the isolation problem with sagas and how do you address it?
- What is Temporal and how does it simplify saga implementation?

---

## Q47: CQRS & Event Sourcing

> Often mentioned together but distinct patterns. Know what problem each solves and the operational costs they introduce.

**CQRS (Command Query Responsibility Segregation):** Separate the write model (Commands) from the read model (Queries). Different models optimised for their purpose.

**Event Sourcing:** Instead of storing current state, store the full sequence of events that led to that state. Current state is derived by replaying events.

They are complementary but independent — you can use CQRS without Event Sourcing and vice versa.

::: details Full model answer

**CQRS:**

Traditional model: one entity/table serves both reads and writes. Writes need normalization; reads need denormalized projections optimised for specific queries. These requirements conflict.

CQRS separates them:
```
Client
  ├── Command → Command Handler → Write DB (normalized, ACID)
  │                             ↓ (event/sync)
  └── Query  → Query Handler  → Read DB (denormalized, optimised for specific views)
```

**Spring Boot CQRS example:**
```java
// Command side
@CommandHandler
public void handle(CreateOrderCommand cmd) {
    Order order = new Order(cmd.getOrderId(), cmd.getItems());
    orderRepository.save(order);
    eventPublisher.publish(new OrderCreatedEvent(order));
}

// Query side — separate model, separate table, different structure
@EventHandler
public void on(OrderCreatedEvent event) {
    OrderSummary summary = new OrderSummary(
        event.getOrderId(), event.getCustomerName(), event.getTotal()
    );
    orderSummaryRepository.save(summary);  // denormalized read model
}

@QueryHandler
public OrderSummary handle(GetOrderSummaryQuery query) {
    return orderSummaryRepository.findById(query.getOrderId());
}
```

**Eventual consistency in CQRS:**
The read model is updated asynchronously after the write — there's a lag. The write side is immediately consistent; the read side is eventually consistent. UI needs to handle "your order is being processed" states.

**When CQRS is worth the complexity:**
- Read and write throughput requirements differ significantly (heavy read scaling)
- Query projections are fundamentally different from the write model
- Complex domain logic in writes, simple in reads
- Event-driven architecture already in place

**Event Sourcing:**

Instead of: `ORDER table → row with current status`
Event Sourcing: `EVENTS table → OrderCreated, ItemAdded, PaymentProcessed, OrderShipped`

Current state = replay all events for an entity.

```java
public class Order {
    private String status;
    private List<OrderItem> items;

    public void apply(OrderCreatedEvent event) {
        this.status = "CREATED";
    }

    public void apply(ItemAddedEvent event) {
        this.items.add(new OrderItem(event.getProductId(), event.getQty()));
    }

    public void apply(OrderShippedEvent event) {
        this.status = "SHIPPED";
    }

    // Rebuild state from event stream
    public static Order reconstitute(List<DomainEvent> events) {
        Order order = new Order();
        events.forEach(order::apply);
        return order;
    }
}
```

**Benefits of Event Sourcing:**
- Full audit log — every state change recorded with timestamp, who made it, why
- Time travel — reconstruct state at any point in the past
- Event replay — rebuild projections, fix bugs retrospectively
- Natural fit for event-driven architecture

**Costs of Event Sourcing:**
- No simple `SELECT * FROM orders WHERE id = 1` — must replay events
- Snapshots required for performance (avoid replaying 10,000 events to get current state)
- Schema evolution is hard — old events must be handled when event structure changes
- Eventual consistency in projections
- Steep learning curve; overkill for most CRUD applications

**Snapshots:**
```java
// Every N events, save a snapshot of current state
if (order.getVersion() % 100 == 0) {
    snapshotStore.save(new OrderSnapshot(order.getId(), order, order.getVersion()));
}

// Rebuild: load snapshot + replay only events after snapshot version
OrderSnapshot snap = snapshotStore.findLatest(orderId);
List<DomainEvent> recentEvents = eventStore.findByAggregateIdAndVersionAfter(orderId, snap.getVersion());
Order order = snap.getState();
recentEvents.forEach(order::apply);
```

:::

> [!TIP] Golden Tip
> Most candidates conflate CQRS with Event Sourcing — clarify they're independent patterns. The stronger insight: **CQRS is often a prerequisite for scaling reads independently, but it introduces eventual consistency** — the UI must be designed for it (optimistic updates, "processing" states). For Event Sourcing, lead with the **costs**: it's complex to operate, schema evolution is painful, and it's justified only when you genuinely need an audit trail or time-travel queries. Recommending Event Sourcing without mentioning the operational costs is a red flag to experienced interviewers.

**Follow-up questions:**
- What is the difference between CQRS and Event Sourcing?
- How do you handle schema evolution in an event-sourced system?
- What is a snapshot in Event Sourcing and why is it needed?
- When would you recommend CQRS without Event Sourcing?

---

## Q48: Service Discovery & API Gateway

> These are the plumbing of microservices. Know the two discovery models, what an API gateway does, and how Kubernetes changes the picture.

**Service Discovery** solves: "How does Service A find the current address of Service B?"

In a monolith, you call a class. In microservices, services run on dynamic IPs (containers are rescheduled, scaled up/down). Service discovery keeps a registry of live service instances.

| Model | How it works | Examples |
|-------|-------------|---------|
| **Client-side** | Client queries registry, picks instance, calls directly | Eureka + Ribbon (Netflix OSS) |
| **Server-side** | Client calls load balancer; LB queries registry | AWS ALB, Kubernetes Service |

::: details Full model answer

**Eureka (Client-side discovery — Spring Cloud Netflix):**
```java
// Provider: self-register
@SpringBootApplication
@EnableEurekaClient
public class PaymentServiceApplication { ... }

// Consumer: look up by service name
@LoadBalanced   // Spring Cloud ribbon/loadbalancer
@Bean
RestTemplate restTemplate() { return new RestTemplate(); }

// Usage — service name resolved dynamically
restTemplate.getForObject("http://payment-service/payments/123", PaymentDto.class);
```

**Kubernetes (Server-side discovery — the modern default):**
Kubernetes provides built-in service discovery via DNS:
```yaml
# Service definition — Kubernetes manages DNS + load balancing
apiVersion: v1
kind: Service
metadata:
  name: payment-service
spec:
  selector:
    app: payment
  ports:
    - port: 80
      targetPort: 8080
```

In Kubernetes, services are just DNS names (`payment-service.default.svc.cluster.local`). The `kube-proxy` and `iptables`/IPVS rules handle load balancing. No Eureka needed — Kubernetes IS the service registry.

In a cloud-native environment (EKS, GKE, AKS), use Kubernetes service discovery. Eureka/Consul are relevant for non-Kubernetes deployments.

**API Gateway:**

An API gateway is the single entry point for all external traffic. It sits between clients and backend services, handling:

```
Clients → API Gateway → Microservices
```

**Responsibilities:**
| Concern | How |
|---------|-----|
| **Routing** | Path-based: `/orders/**` → Order Service |
| **Authentication** | Validate JWT before forwarding |
| **Rate limiting** | Per-IP or per-user limits |
| **SSL termination** | Gateway handles HTTPS; internal traffic is HTTP |
| **Request aggregation** | One client call → multiple backend calls |
| **Observability** | Log/trace all requests centrally |
| **Canary / A-B routing** | Route % of traffic to v2 |

**Spring Cloud Gateway:**
```java
@Configuration
public class GatewayConfig {

    @Bean
    public RouteLocator routes(RouteLocatorBuilder builder) {
        return builder.routes()
            .route("order-service", r -> r
                .path("/orders/**")
                .filters(f -> f
                    .addRequestHeader("X-Gateway", "true")
                    .circuitBreaker(c -> c.setName("orderCB").setFallbackUri("forward:/fallback")))
                .uri("lb://order-service"))    // lb:// = load-balanced
            .route("payment-service", r -> r
                .path("/payments/**")
                .filters(f -> f.requestRateLimiter(rl -> rl
                    .setRateLimiter(redisRateLimiter())
                    .setKeyResolver(userKeyResolver())))
                .uri("lb://payment-service"))
            .build();
    }
}
```

**BFF (Backend for Frontend) pattern:**
Instead of one gateway for all clients, create separate gateways per client type:
- Mobile BFF — optimised payloads for mobile bandwidth constraints
- Web BFF — richer responses for desktop
- Partner BFF — external API with different auth and rate limits

**Service Mesh (Istio, Linkerd) vs API Gateway:**
| | API Gateway | Service Mesh |
|--|------------|-------------|
| **Scope** | North-south (external→internal) | East-west (service→service) |
| **Features** | Auth, routing, rate limiting | mTLS, retries, circuit breaking, observability |
| **Implementation** | Application-level proxy | Sidecar proxy per pod |
| **Complexity** | Low | High |

They're complementary: API Gateway for external traffic, Service Mesh for internal service-to-service.

:::

> [!TIP] Golden Tip
> In 2025, **Kubernetes is the de facto service registry** — if you're on Kubernetes, you don't need Eureka. Mentioning this shows you're current. For API gateways, distinguish between **the gateway pattern** (auth, routing, rate limiting for external traffic) and **service mesh** (mTLS, retries for internal traffic) — these are different concerns often confused with each other. Also: the **BFF pattern** (separate gateways per client type) is a practical answer to "how do you handle mobile vs web vs partner APIs differently" — it comes up in system design interviews.

**Follow-up questions:**
- What is the difference between client-side and server-side service discovery?
- Why is Eureka often unnecessary in Kubernetes deployments?
- What is the difference between an API Gateway and a Service Mesh?
- What is the Backend for Frontend (BFF) pattern and when would you use it?
