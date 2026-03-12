---
title: CQRS & Event Sourcing
description: Command Query Responsibility Segregation and Event Sourcing — separating reads and writes, event stores, projections, and eventual consistency
category: architecture
pageClass: layout-architecture
difficulty: advanced
tags: [cqrs, event-sourcing, event-store, projections, eventual-consistency, commands, queries]
related:
  - /architecture/ddd
  - /architecture/microservices
  - /databases/sql
estimatedMinutes: 25
---

# CQRS & Event Sourcing

<DifficultyBadge level="advanced" />

CQRS and Event Sourcing are two independent but often combined patterns for handling complex read/write workloads and auditability.

---

## CQRS — Command Query Responsibility Segregation

CQRS separates the model used for **writing** (commands) from the model used for **reading** (queries).

### The Problem with a Single Model

A single model must serve both reads (complex projections, joins, filters) and writes (enforce invariants, business rules). These often have conflicting requirements.

```java
// BAD — single model trying to do everything
@Entity
public class Order {
    // Write concerns: invariants, business logic
    // Read concerns: display data, joined with customer name, formatted totals
    // The model gets bloated trying to satisfy both
}
```

### CQRS Solution

```
Write Side                         Read Side
──────────────────────────────     ─────────────────────────────
Command → CommandHandler           Query → QueryHandler
          ↓                                 ↓
     Domain Model                    Read Model (flat, denormalized)
          ↓                                 ↑
     Event Store / DB             Projection (built from events)
```

---

## Commands and Queries

### Commands — change state

```java
// Commands are intent — imperative, named after action
public record PlaceOrderCommand(
    CustomerId customerId,
    List<OrderItemDto> items
) {}

public record CancelOrderCommand(
    OrderId orderId,
    String reason
) {}

// Command handler — uses domain model
@Service
@RequiredArgsConstructor
public class PlaceOrderCommandHandler {

    private final OrderRepository orders;
    private final EventPublisher events;

    @Transactional
    public OrderId handle(PlaceOrderCommand cmd) {
        Order order = Order.create(cmd.customerId(), cmd.items());
        orders.save(order);
        events.publish(order.pullEvents());
        return order.getId();
    }
}
```

### Queries — return data, no side effects

```java
// Queries are specific to what the UI needs
public record GetOrderSummaryQuery(OrderId orderId) {}

public record OrderSummaryDto(
    String orderId,
    String customerName,
    String status,
    String totalAmount,
    List<String> itemDescriptions
) {}

// Query handler — reads directly from a read-optimized store
@Service
@RequiredArgsConstructor
public class GetOrderSummaryQueryHandler {

    private final OrderReadRepository readRepo;

    public OrderSummaryDto handle(GetOrderSummaryQuery query) {
        return readRepo.findOrderSummary(query.orderId().value())
            .orElseThrow(() -> new OrderNotFoundException(query.orderId()));
    }
}
```

### Read Model — denormalized for fast queries

```sql
-- Read model table: pre-joined, pre-formatted
CREATE TABLE order_summaries (
    order_id       VARCHAR PRIMARY KEY,
    customer_name  VARCHAR,
    status         VARCHAR,
    total_amount   VARCHAR,
    item_count     INT,
    created_at     TIMESTAMP
);
```

---

## Synchronous vs Asynchronous CQRS

### Synchronous (simpler)

```
Command → Write DB → Update Read DB (same transaction or same call) → Response
```

Read and write models stay in sync. Fine for moderate scale.

### Asynchronous (eventual consistency)

```
Command → Write DB → publish event → [event bus] → Projector updates Read DB
                                                    (happens later)
```

```java
// Projector listens for domain events and updates read models
@Component
public class OrderSummaryProjector {

    private final OrderSummaryRepository readRepo;

    @EventListener
    @Transactional
    public void on(OrderPlaced event) {
        readRepo.save(new OrderSummaryEntity(
            event.orderId().value(),
            event.customerName(),
            "PENDING",
            event.totalAmount().toString(),
            event.itemCount(),
            event.occurredAt()
        ));
    }

    @EventListener
    @Transactional
    public void on(OrderCancelled event) {
        readRepo.updateStatus(event.orderId().value(), "CANCELLED");
    }
}
```

**Tradeoff:** Reads may see stale data for a short period — this is **eventual consistency**.

---

## Event Sourcing

Event Sourcing stores the **sequence of events** that happened to an aggregate, rather than its current state.

### Traditional storage

```
orders table:
id | status      | total
1  | CONFIRMED   | 99.00   ← only current state, history lost
```

### Event Sourced storage

```
order_events table:
id | order_id | event_type      | payload              | timestamp
1  | 1        | OrderCreated    | {customerId:42,...}  | 2024-01-01 10:00
2  | 1        | ItemAdded       | {productId:5,...}    | 2024-01-01 10:01
3  | 1        | OrderConfirmed  | {}                   | 2024-01-01 10:05
```

Current state is reconstructed by **replaying** events.

---

## Event Sourcing Implementation

```java
// Aggregate applies events to rebuild state
public class Order {

    private OrderId id;
    private OrderStatus status;
    private List<OrderLine> lines = new ArrayList<>();
    private final List<DomainEvent> uncommittedEvents = new ArrayList<>();

    // Reconstruct from event history
    public static Order reconstitute(List<DomainEvent> history) {
        Order order = new Order();
        history.forEach(order::apply);
        return order;
    }

    // Commands raise events; never mutate state directly
    public void confirm() {
        if (status != OrderStatus.PENDING) {
            throw new IllegalStateException("Cannot confirm a non-pending order");
        }
        raise(new OrderConfirmed(id, Instant.now()));
    }

    // Apply mutates state — called both when handling new events and when replaying
    private void apply(DomainEvent event) {
        switch (event) {
            case OrderCreated e  -> { this.id = e.orderId(); this.status = OrderStatus.PENDING; }
            case ItemAdded e     -> this.lines.add(new OrderLine(e.productId(), e.qty(), e.price()));
            case OrderConfirmed e -> this.status = OrderStatus.CONFIRMED;
            case OrderCancelled e -> this.status = OrderStatus.CANCELLED;
            default -> throw new UnknownEventException(event);
        }
    }

    private void raise(DomainEvent event) {
        apply(event);                  // update in-memory state immediately
        uncommittedEvents.add(event);  // queue for persistence
    }

    public List<DomainEvent> pullUncommittedEvents() {
        var pending = List.copyOf(uncommittedEvents);
        uncommittedEvents.clear();
        return pending;
    }
}
```

```java
// Event Store repository
@Repository
public class EventSourcedOrderRepository {

    private final EventStore eventStore;

    public Order findById(OrderId id) {
        List<DomainEvent> history = eventStore.loadEvents(id.value());
        if (history.isEmpty()) throw new OrderNotFoundException(id);
        return Order.reconstitute(history);
    }

    @Transactional
    public void save(Order order) {
        List<DomainEvent> newEvents = order.pullUncommittedEvents();
        eventStore.append(order.getId().value(), newEvents);
        // also publish events for projectors/subscribers
    }
}
```

---

## Snapshots

For aggregates with very long histories, replaying thousands of events becomes slow. Snapshots store the state at a point in time.

```java
public Order findById(OrderId id) {
    Optional<Snapshot> snapshot = snapshotStore.findLatest(id.value());

    List<DomainEvent> history = snapshot
        .map(s -> eventStore.loadEventsAfter(id.value(), s.version()))
        .orElse(eventStore.loadEvents(id.value()));

    Order order = snapshot
        .map(s -> Order.fromSnapshot(s))
        .orElse(new Order());

    history.forEach(order::apply);
    return order;
}
```

---

## CQRS + Event Sourcing Together

```
User Action
    │
    ▼
Command Handler
    │  creates domain events
    ▼
Event Store (append-only)
    │
    ├──► Aggregate state (replay events on load)
    │
    └──► Event Bus
              │
              ▼
         Projectors
              │
              ▼
         Read Models (MongoDB, Elasticsearch, Redis, SQL views...)
              │
              ▼
         Query Handlers → API responses
```

---

## Benefits and Tradeoffs

| Aspect | Benefit | Cost |
|--------|---------|------|
| Audit log | Full history of what happened, when, and why | Storage grows over time |
| Temporal queries | "What was the state at noon on Jan 1?" trivial | Extra complexity |
| Debugging | Replay events to reproduce bugs exactly | System complexity |
| Read scale | Independent read models per use case | Eventual consistency |
| Schema migration | Just add new projectors for new read needs | Projector maintenance |

::: warning When to use Event Sourcing
Event Sourcing adds significant complexity. Use it when you genuinely need the audit trail, temporal queries, or multiple independent read models — not as a default approach.
:::

---

## Key Interview Points

| Question | Answer |
|----------|--------|
| What is CQRS? | Separate models/paths for writes (commands) and reads (queries) |
| Why CQRS? | Commands need invariant enforcement; queries need denormalized views |
| What is Event Sourcing? | Store sequence of events, not current state; reconstruct by replay |
| CQRS vs Event Sourcing | Independent — CQRS doesn't require ES, ES doesn't require CQRS |
| What is a projection? | Read model built by consuming domain events |
| Downside of async CQRS? | Eventual consistency — reads may lag behind writes |

---

> **Next:** [REST & Web →](./rest-web)

<RelatedTopics :topics="['/architecture/ddd', '/architecture/microservices', '/databases/sql', '/spring/spring-data']" />
