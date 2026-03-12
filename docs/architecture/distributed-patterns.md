---
title: Distributed Systems Patterns
description: Distributed patterns for microservices — Transactional Outbox, Saga (choreography and orchestration), Idempotent Consumer, Strangler Fig, and compensating transactions
category: architecture
pageClass: layout-architecture
difficulty: advanced
tags: [outbox, saga, idempotent-consumer, choreography, orchestration, distributed-transactions, microservices, kafka, debezium]
related:
  - /architecture/microservices
  - /architecture/cqrs-event-sourcing
  - /messaging/kafka-core
  - /messaging/spring-kafka
  - /databases/sql
estimatedMinutes: 40
---

# Distributed Systems Patterns

<DifficultyBadge level="advanced" />

Microservices trade simple, in-process transactions for distributed complexity. These patterns solve the hardest problems: publishing events reliably, coordinating multi-service workflows, and handling duplicate delivery.

---

## The Dual-Write Problem

The root cause behind most distributed reliability issues:

```
// ❌ Classic dual-write — two separate writes, no atomicity
@Transactional
public void placeOrder(OrderRequest req) {
    Order order = orderRepository.save(new Order(req));  // write 1: DB
    kafkaTemplate.send("order-placed", new OrderPlacedEvent(order.getId())); // write 2: Kafka
    // If Kafka is down, the DB committed but no event was published → inconsistency
    // If the app crashes between the two, same problem
}
```

There's no XA/2PC between a relational DB and Kafka. The Outbox Pattern solves this.

---

## Transactional Outbox Pattern

Write the event to an **outbox table in the same DB transaction** as the business data. A separate relay process then publishes it to the broker — at-least-once, eventually.

```
┌─────────────────────────────────────────────────────┐
│  Application Transaction                            │
│  ┌─────────────────┐    ┌─────────────────────┐    │
│  │  orders table   │    │  outbox_events table │    │
│  │  INSERT order   │    │  INSERT event        │    │
│  └─────────────────┘    └─────────────────────┘    │
│          COMMIT  ────────────────────────────────── │
└─────────────────────────────────────────────────────┘
                                   │
               ┌───────────────────┘
               ▼
     Relay (polling or CDC)
               │
               ▼
         Kafka / RabbitMQ
               │
               ▼
     Consumers (InventoryService, NotificationService …)
```

### Outbox Table

```sql
CREATE TABLE outbox_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(100) NOT NULL,   -- e.g. 'Order'
    aggregate_id   VARCHAR(100) NOT NULL,   -- e.g. order ID
    event_type     VARCHAR(200) NOT NULL,   -- e.g. 'OrderPlaced'
    payload        JSONB        NOT NULL,
    occurred_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    published_at   TIMESTAMPTZ,            -- NULL = not yet published
    retry_count    INT          NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished ON outbox_events(occurred_at)
WHERE published_at IS NULL;
```

### Writing to the Outbox

```java
@Entity
@Table(name = "outbox_events")
public class OutboxEvent {
    @Id
    private UUID id = UUID.randomUUID();

    private String aggregateType;
    private String aggregateId;
    private String eventType;

    @Column(columnDefinition = "jsonb")
    private String payload;          // serialised JSON

    private Instant occurredAt = Instant.now();
    private Instant publishedAt;     // null = pending
    private int retryCount = 0;
}

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM OutboxEvent e WHERE e.publishedAt IS NULL ORDER BY e.occurredAt LIMIT :limit")
    List<OutboxEvent> findUnpublishedWithLock(@Param("limit") int limit);
}
```

```java
@Service
@RequiredArgsConstructor
public class OrderService {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outboxRepository;
    private final ObjectMapper objectMapper;

    @Transactional   // single transaction — both writes succeed or both roll back
    public Order placeOrder(OrderRequest req) {
        Order order = orderRepository.save(new Order(req));

        // Write event to outbox in the same transaction
        OutboxEvent outboxEvent = new OutboxEvent();
        outboxEvent.setAggregateType("Order");
        outboxEvent.setAggregateId(order.getId().toString());
        outboxEvent.setEventType("OrderPlaced");
        outboxEvent.setPayload(objectMapper.writeValueAsString(
            new OrderPlacedEvent(order.getId(), order.getCustomerId(), order.getTotal())
        ));
        outboxRepository.save(outboxEvent);

        return order;
    }
}
```

### Relay — Polling Publisher

A scheduled job polls the outbox and publishes pending events to Kafka.

```java
@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxRelayService {

    private final OutboxEventRepository outboxRepository;
    private final KafkaTemplate<String, String> kafkaTemplate;

    @Scheduled(fixedDelay = 1000)   // poll every second
    @Transactional
    public void relay() {
        List<OutboxEvent> pending = outboxRepository.findUnpublishedWithLock(50);

        for (OutboxEvent event : pending) {
            try {
                String topic = topicFor(event.getEventType());
                kafkaTemplate.send(topic, event.getAggregateId(), event.getPayload())
                    .get(5, TimeUnit.SECONDS);   // wait for broker ack

                event.setPublishedAt(Instant.now());
            } catch (Exception e) {
                event.setRetryCount(event.getRetryCount() + 1);
                log.warn("Failed to publish outbox event {}: {}", event.getId(), e.getMessage());
            }
            outboxRepository.save(event);
        }
    }

    private String topicFor(String eventType) {
        return switch (eventType) {
            case "OrderPlaced"    -> "order.placed";
            case "OrderCancelled" -> "order.cancelled";
            default -> throw new IllegalArgumentException("Unknown event type: " + eventType);
        };
    }
}
```

::: warning Polling at scale
A 1-second polling loop adds 0–1 second latency and puts load on the DB. For high-throughput systems use CDC (Debezium) instead.
:::

### Relay — CDC with Debezium (Production-Grade)

Debezium reads the PostgreSQL WAL (write-ahead log) and streams changes directly to Kafka — zero polling, sub-second latency, no DB load.

```yaml
# Debezium PostgreSQL connector config (deploy via Kafka Connect)
{
  "name": "outbox-connector",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "secret",
    "database.dbname": "orderdb",
    "table.include.list": "public.outbox_events",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.field.event.type": "event_type",
    "transforms.outbox.route.by.field": "aggregate_type",
    "transforms.outbox.table.field.event.key": "aggregate_id"
  }
}
```

Debezium's Outbox Event Router routes events to topic `{aggregate_type}` (e.g., `Order`) with key `aggregate_id`. No polling, no extra DB queries.

```
PostgreSQL WAL → Debezium → Kafka Connect → Kafka topics
                 (reads changes as they happen)
```

### Outbox Pattern Summary

| Approach | Latency | DB load | Complexity |
|----------|---------|---------|------------|
| Polling publisher | 1–5 s | Moderate (periodic SELECTs) | Low |
| CDC / Debezium | < 100 ms | Minimal (WAL reads) | Higher (Kafka Connect) |

---

## Saga Pattern

A Saga coordinates a **long-running business transaction** across multiple services, each performing a local DB transaction. If any step fails, **compensating transactions** undo the preceding steps.

There are two implementation styles:

### Choreography-based Saga

Services react to events — no central coordinator. Each service listens for events and publishes the next one.

```
OrderService         PaymentService        InventoryService
     │                     │                     │
     │ place order          │                     │
     │──────────────────────│─────────────────────│──► OrderCreated
     │                      │                     │
     │                      │◄────────────────────│ OrderCreated
     │                      │ charge card          │
     │                      │──────────────────────│──► PaymentProcessed
     │                      │                     │
     │                      │                     │◄── PaymentProcessed
     │                      │                     │ reserve stock
     │                      │                     │──► StockReserved
     │                      │                     │
     │◄─────────────────────│─────────────────────│ StockReserved
     │ confirm order        │                     │
```

**Compensation on failure** (e.g., stock reservation fails):

```
     │                      │                     │
     │                      │                     │──► StockReservationFailed
     │                      │◄────────────────────│
     │                      │ refund card (compensate)
     │                      │──────────────────────│──► PaymentRefunded
     │◄─────────────────────│─────────────────────│
     │ cancel order (compensate)
```

**Java implementation — choreography:**

```java
// OrderService — creates the order and starts the saga
@Service
@RequiredArgsConstructor
public class OrderSagaInitiator {

    private final OrderRepository orderRepository;
    private final OutboxEventRepository outbox;

    @Transactional
    public Order startSaga(OrderRequest req) {
        Order order = orderRepository.save(Order.create(req));  // status = PENDING
        outbox.save(OutboxEvent.of("Order", order.getId(), "OrderCreated",
            Map.of("orderId", order.getId(), "customerId", req.getCustomerId(),
                   "amount", req.getTotal(), "productId", req.getProductId())));
        return order;
    }

    // Listen for saga completion or failure
    @KafkaListener(topics = "stock-reserved")
    @Transactional
    public void onStockReserved(StockReservedEvent event) {
        Order order = orderRepository.findById(event.orderId()).orElseThrow();
        order.confirm();                // status = CONFIRMED
        orderRepository.save(order);
        // saga complete — optionally publish OrderConfirmed
    }

    @KafkaListener(topics = "stock-reservation-failed")
    @Transactional
    public void onStockFailed(StockReservationFailedEvent event) {
        Order order = orderRepository.findById(event.orderId()).orElseThrow();
        order.cancel("Out of stock");   // status = CANCELLED
        orderRepository.save(order);
        // trigger payment refund
        outbox.save(OutboxEvent.of("Order", order.getId(), "OrderCancelled",
            Map.of("orderId", order.getId(), "reason", "Out of stock")));
    }
}

// PaymentService — reacts to OrderCreated, publishes PaymentProcessed or PaymentFailed
@Component
@RequiredArgsConstructor
public class PaymentSagaParticipant {

    private final PaymentService paymentService;
    private final OutboxEventRepository outbox;

    @KafkaListener(topics = "order-created")
    @Transactional
    public void onOrderCreated(OrderCreatedEvent event) {
        try {
            Payment payment = paymentService.charge(event.customerId(), event.amount());
            outbox.save(OutboxEvent.of("Payment", payment.getId(), "PaymentProcessed",
                Map.of("orderId", event.orderId(), "transactionId", payment.getTransactionId())));
        } catch (PaymentFailedException e) {
            outbox.save(OutboxEvent.of("Payment", event.orderId(), "PaymentFailed",
                Map.of("orderId", event.orderId(), "reason", e.getMessage())));
        }
    }

    @KafkaListener(topics = "order-cancelled")
    @Transactional
    public void onOrderCancelled(OrderCancelledEvent event) {
        paymentService.refund(event.orderId());  // compensating transaction
        outbox.save(OutboxEvent.of("Payment", event.orderId(), "PaymentRefunded",
            Map.of("orderId", event.orderId())));
    }
}
```

**Pros:** Loose coupling, no single point of failure, simple to start.
**Cons:** Hard to see the whole flow (logic spread across services), difficult to debug, risk of cyclic event dependencies.

---

### Orchestration-based Saga

A central **Saga Orchestrator** controls the flow, sending commands to each service and tracking state. Services don't know about each other.

```
                    ┌─────────────────────────────┐
                    │       Saga Orchestrator      │
                    │   (state machine in DB)      │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
       PaymentService       InventoryService       ShippingService
    (command: ChargeCard) (command: ReserveStock) (command: Schedule)
```

```java
// Saga state stored in DB — survives restarts
@Entity
@Table(name = "order_sagas")
public class OrderSaga {
    @Id UUID sagaId;
    UUID orderId;

    @Enumerated(EnumType.STRING)
    OrderSagaStatus status;  // STARTED, PAYMENT_PENDING, STOCK_PENDING, COMPLETED, COMPENSATING, FAILED

    String failureReason;
    UUID paymentTransactionId;
    Instant startedAt = Instant.now();
    Instant completedAt;
}

@Service
@RequiredArgsConstructor
public class OrderSagaOrchestrator {

    private final OrderSagaRepository sagaRepository;
    private final OutboxEventRepository outbox;

    // Step 1: Start saga when order is placed
    @Transactional
    public void startSaga(UUID orderId, UUID customerId, BigDecimal amount, UUID productId) {
        OrderSaga saga = new OrderSaga(UUID.randomUUID(), orderId, OrderSagaStatus.STARTED);
        sagaRepository.save(saga);

        // Send command to PaymentService
        outbox.save(OutboxEvent.command("payment-commands", "ChargeCard",
            Map.of("sagaId", saga.getSagaId(), "orderId", orderId,
                   "customerId", customerId, "amount", amount)));

        saga.setStatus(OrderSagaStatus.PAYMENT_PENDING);
        sagaRepository.save(saga);
    }

    // Step 2: Payment succeeded → reserve stock
    @KafkaListener(topics = "saga-payment-results")
    @Transactional
    public void onPaymentResult(PaymentResultEvent event) {
        OrderSaga saga = sagaRepository.findBySagaId(event.sagaId()).orElseThrow();

        if (event.success()) {
            saga.setPaymentTransactionId(event.transactionId());
            saga.setStatus(OrderSagaStatus.STOCK_PENDING);
            sagaRepository.save(saga);

            outbox.save(OutboxEvent.command("inventory-commands", "ReserveStock",
                Map.of("sagaId", saga.getSagaId(), "orderId", saga.getOrderId(),
                       "productId", event.productId())));
        } else {
            // Payment failed — cancel order
            saga.setStatus(OrderSagaStatus.FAILED);
            saga.setFailureReason(event.reason());
            sagaRepository.save(saga);

            outbox.save(OutboxEvent.command("order-commands", "CancelOrder",
                Map.of("sagaId", saga.getSagaId(), "orderId", saga.getOrderId(),
                       "reason", "Payment failed: " + event.reason())));
        }
    }

    // Step 3: Stock reserved → complete order
    @KafkaListener(topics = "saga-inventory-results")
    @Transactional
    public void onInventoryResult(InventoryResultEvent event) {
        OrderSaga saga = sagaRepository.findBySagaId(event.sagaId()).orElseThrow();

        if (event.success()) {
            saga.setStatus(OrderSagaStatus.COMPLETED);
            saga.setCompletedAt(Instant.now());
            sagaRepository.save(saga);

            outbox.save(OutboxEvent.command("order-commands", "ConfirmOrder",
                Map.of("sagaId", saga.getSagaId(), "orderId", saga.getOrderId())));
        } else {
            // Stock failed → compensate: refund payment
            saga.setStatus(OrderSagaStatus.COMPENSATING);
            saga.setFailureReason(event.reason());
            sagaRepository.save(saga);

            outbox.save(OutboxEvent.command("payment-commands", "RefundCard",
                Map.of("sagaId", saga.getSagaId(),
                       "transactionId", saga.getPaymentTransactionId())));

            outbox.save(OutboxEvent.command("order-commands", "CancelOrder",
                Map.of("sagaId", saga.getSagaId(), "orderId", saga.getOrderId(),
                       "reason", "Out of stock")));
        }
    }
}
```

**Pros:** Full visibility of saga state in the orchestrator's DB; easy to add steps; clear failure handling; simple participant services.
**Cons:** Orchestrator is a point of coupling (not a single point of failure, but a dependency); extra service to build and maintain.

---

### Choreography vs Orchestration

| | Choreography | Orchestration |
|--|-------------|---------------|
| Control | Distributed — each service reacts to events | Centralised — orchestrator drives the flow |
| Coupling | Services coupled to event schemas | Services coupled to orchestrator's commands |
| Visibility | Hard — must trace events across services | Easy — saga state in one place |
| Debugging | Difficult — requires distributed tracing | Easier — check orchestrator state |
| Complexity | Low for simple flows; grows with steps | Higher upfront; scales better |
| Best for | 2–3 step sagas, well-understood flows | Complex flows with many steps/branches |

---

### Compensating Transactions

Compensations undo the *business effect* of a completed step — they are not a DB rollback (the step already committed).

| Step | Action | Compensation |
|------|--------|-------------|
| Create order | Insert order (PENDING) | Cancel order (CANCELLED) |
| Charge payment | Debit card, create payment record | Refund card, mark payment REFUNDED |
| Reserve stock | Decrement available_qty | Increment available_qty back |
| Send confirmation email | Send email | (no meaningful compensation — accept it) |

::: warning Compensations must be idempotent
The compensation may be triggered more than once (at-least-once delivery). Design them to be safe when called multiple times — check current state before acting.
:::

---

## Idempotent Consumer (Inbox Pattern)

Kafka and other brokers guarantee **at-least-once delivery** — a message may arrive more than once (broker retry, consumer restart, rebalance). Without protection, processing duplicates causes double-charges, double-reservations, etc.

```
Broker sends message → Consumer processes → Consumer crashes before ACK
→ Broker re-delivers → Consumer processes AGAIN  ← duplicate!
```

### Solution: Idempotency Key Table

Track processed message IDs in a DB table — within the same transaction as the business logic.

```sql
CREATE TABLE processed_messages (
    message_id     VARCHAR(255) PRIMARY KEY,
    consumer_group VARCHAR(100) NOT NULL,
    processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optional: auto-clean old records
CREATE INDEX idx_processed_at ON processed_messages(processed_at);
-- Run periodically: DELETE FROM processed_messages WHERE processed_at < NOW() - INTERVAL '7 days';
```

```java
@Repository
public interface ProcessedMessageRepository extends JpaRepository<ProcessedMessage, String> {

    @Query("SELECT COUNT(m) > 0 FROM ProcessedMessage m WHERE m.messageId = :id AND m.consumerGroup = :group")
    boolean existsByMessageIdAndConsumerGroup(@Param("id") String id, @Param("group") String group);
}

@Service
@RequiredArgsConstructor
public class IdempotentConsumerService {

    private final ProcessedMessageRepository processedMessages;
    private static final String CONSUMER_GROUP = "inventory-service";

    /**
     * Executes the action only if the messageId hasn't been processed before.
     * Both the deduplication record and the business action commit in one transaction.
     */
    @Transactional
    public void processIfNew(String messageId, Runnable action) {
        if (processedMessages.existsByMessageIdAndConsumerGroup(messageId, CONSUMER_GROUP)) {
            log.debug("Skipping duplicate message: {}", messageId);
            return;
        }

        // Record FIRST (within same transaction as business action)
        processedMessages.save(new ProcessedMessage(messageId, CONSUMER_GROUP));

        // Execute business logic
        action.run();
    }
}
```

```java
// Kafka listener using idempotent processing
@Component
@RequiredArgsConstructor
public class InventoryEventConsumer {

    private final IdempotentConsumerService idempotentService;
    private final InventoryService inventoryService;

    @KafkaListener(topics = "order-placed", groupId = "inventory-service")
    public void onOrderPlaced(
            @Payload OrderPlacedEvent event,
            @Header(KafkaHeaders.RECEIVED_MESSAGE_KEY) String key,
            Acknowledgment ack) {

        // Use Kafka partition + offset as unique message ID
        String messageId = event.getEventId().toString();   // or use Kafka headers

        idempotentService.processIfNew(messageId, () ->
            inventoryService.reserveStock(event.getProductId(), event.getQuantity(), event.getOrderId())
        );

        ack.acknowledge();
    }
}
```

::: tip Use the event's own ID as the idempotency key
Include a `eventId: UUID` in every event payload (generated at publish time). This is stable across retries and redeliveries. Kafka offset+partition can also work but resets on consumer group reset.
:::

### Idempotent Operations (No DB Check Needed)

Some operations are naturally idempotent — calling them twice has the same effect as calling once:

```java
// Idempotent by nature
UPDATE orders SET status = 'CONFIRMED' WHERE id = ? AND status = 'PENDING';
// Running twice: second UPDATE affects 0 rows — harmless

// INSERT ... ON CONFLICT DO NOTHING (PostgreSQL)
INSERT INTO reservations (order_id, product_id, quantity)
VALUES (?, ?, ?)
ON CONFLICT (order_id, product_id) DO NOTHING;

// Natural idempotency: setting an absolute value, not a delta
account.setBalance(newBalance);    // idempotent
account.addToBalance(amount);      // NOT idempotent — use deduplication
```

---

## Strangler Fig Pattern

Incrementally replace a legacy monolith by routing traffic to new microservices, one feature at a time. The monolith "strangled" until it can be decommissioned.

```
Phase 1: All traffic goes to Monolith
  Client → Proxy → Monolith

Phase 2: New feature extracted to microservice
  Client → Proxy → OrderService (new)  /api/orders/**
                └→ Monolith           (everything else)

Phase 3: More features extracted
  Client → Proxy → OrderService      /api/orders/**
                ├→ PaymentService    /api/payments/**
                └→ Monolith          (remaining)

Phase N: Monolith decommissioned
  Client → API Gateway → (all microservices)
```

```java
// Spring Cloud Gateway — route some paths to new service, rest to monolith
@Bean
public RouteLocator routes(RouteLocatorBuilder b) {
    return b.routes()
        // Strangled: new OrderService handles orders
        .route("order-service", r -> r
            .path("/api/orders/**")
            .uri("lb://order-service"))

        // Strangled: new PaymentService handles payments
        .route("payment-service", r -> r
            .path("/api/payments/**")
            .uri("lb://payment-service"))

        // Everything else still goes to the monolith
        .route("monolith", r -> r
            .path("/**")
            .uri("http://legacy-monolith:8080"))
        .build();
}
```

**Key practices:**
- Extract one bounded context at a time — don't big-bang rewrite
- Keep the proxy (API Gateway) as the stable entry point
- Synchronise data between old and new during transition (anti-corruption layer or dual-write)
- Feature flags to switch routing without redeployment

---

## Anti-Corruption Layer (ACL)

Translates between the model of a legacy/external system and your domain model, preventing their concepts from leaking into your codebase.

```java
// External payment provider has its own model
public class StripeChargeResponse {
    String id;
    String status;   // "succeeded", "failed", "pending"
    long amount;     // in cents
    String currency;
    String errorCode;
}

// ACL translates Stripe's model into your domain model
@Component
public class StripePaymentAdapter implements PaymentGateway {

    private final StripeClient stripeClient;

    @Override
    public PaymentResult charge(Money amount, PaymentMethod method) {
        StripeChargeResponse response = stripeClient.charge(
            amount.amountInCents(),
            amount.currency().code(),
            method.token()
        );

        return switch (response.status()) {
            case "succeeded" -> PaymentResult.success(response.id());
            case "failed"    -> PaymentResult.failure(response.errorCode());
            default          -> PaymentResult.pending(response.id());
        };
    }
}
```

---

## Pattern Reference

| Pattern | Problem Solved | Key Trade-off |
|---------|---------------|---------------|
| **Transactional Outbox** | Atomic DB write + event publish | Added latency (polling) or CDC complexity |
| **Saga — Choreography** | Distributed transaction, loose coupling | Hard to observe full flow |
| **Saga — Orchestration** | Distributed transaction, clear state | Central orchestrator service |
| **Idempotent Consumer** | Duplicate message processing | Extra DB table + lookup per message |
| **Strangler Fig** | Incremental monolith migration | Dual-write complexity during transition |
| **Anti-Corruption Layer** | External model leaking into domain | Extra translation layer |

---

## Interview Quick-Fire

**Q: What is the Transactional Outbox pattern and why is it needed?**
When you write to a database and publish an event to a broker (Kafka), these are two separate systems — there's no distributed transaction between them. If the app crashes between the two writes, you get inconsistency (data saved, no event; or event published, data rolled back). The Outbox pattern writes the event to an `outbox_events` table in the same DB transaction as the business data, then a separate relay process publishes it to the broker. The event is guaranteed to eventually be published — at-least-once.

**Q: What is the difference between choreography and orchestration in a Saga?**
In choreography, each service reacts to events and publishes the next event — decentralised, no coordinator. Good for simple 2–3 step sagas. Hard to observe the full flow or handle complex branching. In orchestration, a central Saga Orchestrator holds the state machine, sends commands to each service, and handles failures — the full saga lifecycle is visible in one place. Better for complex flows but adds a coordination service. Both use compensating transactions to undo completed steps on failure.

**Q: What is a compensating transaction and how does it differ from a database rollback?**
A DB rollback undoes changes before they commit — the DB handles it transparently. A compensating transaction is a separate business operation that undoes the *effect* of an already-committed step. For example, if charging a card succeeded (committed) but stock reservation failed, a compensating transaction issues a refund — it doesn't undo the original charge at the DB level. Compensations must be idempotent because they may be triggered more than once.

**Q: What is the Idempotent Consumer pattern and when is it needed?**
Message brokers typically guarantee at-least-once delivery — a message can be delivered multiple times due to retries, consumer crashes, or rebalancing. Without protection, processing the same message twice causes double-charges, double-reservations, etc. The Idempotent Consumer tracks processed message IDs in a `processed_messages` table within the same DB transaction as the business logic. If the ID is already there, the message is skipped. The idempotency record and business action commit atomically — so a crash between processing and ACK safely re-delivers and is detected as a duplicate.

<RelatedTopics :topics="['/architecture/microservices', '/architecture/cqrs-event-sourcing', '/messaging/kafka-core', '/messaging/spring-kafka', '/databases/sql']" />

[→ Back to Architecture Overview](/architecture/)
