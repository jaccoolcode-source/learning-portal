    ---
title: Domain-Driven Design (DDD)
description: DDD fundamentals — Bounded Contexts, Aggregates, Entities, Value Objects, Domain Events, and the ubiquitous language
category: architecture
pageClass: layout-architecture
difficulty: advanced
tags: [ddd, bounded-context, aggregate, entity, value-object, domain-events, ubiquitous-language]
related:
  - /architecture/microservices
  - /architecture/cqrs-event-sourcing
  - /principles/solid
estimatedMinutes: 30
---

# Domain-Driven Design (DDD)

<DifficultyBadge level="advanced" />

DDD is an approach to software development that focuses on the **core domain** and aligns the model with the business. The codebase should reflect how domain experts talk about the problem.

---

## Strategic DDD

### Ubiquitous Language

A shared vocabulary between developers and domain experts. Every concept in the code must match the language of the domain.

```java
// BAD — technical vocabulary leaking into domain
public void processOrderRecord(int userId, List<CartItem> items) { }

// GOOD — ubiquitous language
public Order placeOrder(Customer customer, ShoppingCart cart) { }
```

### Bounded Context

A **Bounded Context** is a boundary within which a model (and its ubiquitous language) is consistent. The same word can mean different things in different contexts.

```
┌─────────────────────┐    ┌──────────────────────┐
│  Sales Context       │    │  Shipping Context     │
│  Order = contract    │    │  Order = shipment req │
│  Customer = buyer    │    │  Customer = recipient │
│  Product = offer     │    │  Product = physical   │
└─────────────────────┘    └──────────────────────┘
```

Each bounded context maps to a **separate module or microservice**.

### Context Map

Describes how bounded contexts relate:
- **Shared Kernel** — shared subset of domain model (use sparingly)
- **Customer/Supplier** — one context feeds another
- **Anticorruption Layer (ACL)** — translates between contexts to protect the model

```java
// ACL — translating external payment API model into your domain
public class PaymentAcl {

    private final ExternalPaymentGateway gateway;

    public PaymentResult charge(Money amount, CreditCard card) {
        ExternalChargeRequest req = toExternalRequest(amount, card);
        ExternalChargeResponse resp = gateway.charge(req);
        return toDomainResult(resp);  // translate, don't leak external model
    }
}
```

---

## Tactical DDD — Building Blocks

### Entity

An object defined by its **identity**, not its attributes. Two entities with the same data but different IDs are different objects.

```java
@Entity
public class Order {

    @Id
    private final OrderId id;     // identity is key
    private CustomerId customerId;
    private OrderStatus status;
    private List<OrderLine> lines;

    // Entities have lifecycle — they change over time
    public void addItem(Product product, Quantity qty) {
        lines.add(new OrderLine(product.getId(), qty, product.getPrice()));
    }

    public void confirm() {
        if (status != OrderStatus.PENDING) {
            throw new IllegalStateException("Only pending orders can be confirmed");
        }
        this.status = OrderStatus.CONFIRMED;
    }
}
```

### Value Object

An object defined by its **attributes**, not identity. Immutable, side-effect free.

```java
// Value Object — no ID, immutable, equality by value
public final class Money {

    private final BigDecimal amount;
    private final Currency currency;

    public Money(BigDecimal amount, Currency currency) {
        if (amount.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("Amount cannot be negative");
        }
        this.amount = amount;
        this.currency = currency;
    }

    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) {
            throw new CurrencyMismatchException();
        }
        return new Money(this.amount.add(other.amount), this.currency);   // returns new instance
    }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Money m)) return false;
        return amount.compareTo(m.amount) == 0 && currency.equals(m.currency);
    }
}
```

| | Entity | Value Object |
|---|---|---|
| Identity | Has unique ID | No ID |
| Mutability | Mutable (has lifecycle) | Immutable |
| Equality | By ID | By all attributes |
| Example | Order, Customer, Product | Money, Address, DateRange |

### Aggregate

An **Aggregate** is a cluster of entities and value objects with a single **Aggregate Root** that enforces all invariants.

```java
// Order is the Aggregate Root
public class Order {

    private final OrderId id;       // aggregate root ID
    private List<OrderLine> lines;  // OrderLine entities inside the aggregate
    private Money totalAmount;

    // All modifications go through the root
    public void addItem(ProductId productId, Quantity qty, Money unitPrice) {
        if (status != OrderStatus.DRAFT) {
            throw new OrderNotEditableException(id);
        }
        lines.add(new OrderLine(productId, qty, unitPrice));
        recalculateTotal();
    }

    // Enforces invariants
    private void recalculateTotal() {
        this.totalAmount = lines.stream()
            .map(OrderLine::lineTotal)
            .reduce(Money.ZERO, Money::add);
    }
}
```

**Rules:**
- Only reference an aggregate by its root ID from outside
- Save/load an aggregate as a unit
- Aggregates should be small (common mistake: making them too large)

### Repository

Provides collection-like access to aggregates. Abstracts persistence.

```java
// Domain interface — no persistence detail
public interface OrderRepository {
    Order findById(OrderId id);
    void save(Order order);
    List<Order> findByCustomer(CustomerId customerId);
}

// Infrastructure implementation
@Repository
public class JpaOrderRepository implements OrderRepository {

    private final OrderJpaRepository jpa;

    @Override
    public Order findById(OrderId id) {
        return jpa.findById(id.value())
            .map(OrderMapper::toDomain)
            .orElseThrow(() -> new OrderNotFoundException(id));
    }

    @Override
    public void save(Order order) {
        jpa.save(OrderMapper.toEntity(order));
    }
}
```

### Domain Service

Logic that doesn't naturally fit inside an entity or value object — usually spans multiple aggregates.

```java
// Doesn't belong on Order or Inventory alone
@Service
public class OrderFulfillmentService {

    public void fulfill(Order order, Inventory inventory) {
        inventory.reserve(order.getLines());
        order.markAsFulfilling();
    }
}
```

### Domain Events

Something that happened in the domain, named in the past tense.

```java
// Domain event
public record OrderPlaced(
    OrderId orderId,
    CustomerId customerId,
    Money totalAmount,
    Instant occurredAt
) implements DomainEvent {}

// Aggregate publishes events
public class Order {

    private final List<DomainEvent> events = new ArrayList<>();

    public void place() {
        this.status = OrderStatus.PENDING;
        events.add(new OrderPlaced(id, customerId, totalAmount, Instant.now()));
    }

    public List<DomainEvent> pullEvents() {
        var pending = List.copyOf(events);
        events.clear();
        return pending;
    }
}

// Application layer dispatches them
@Transactional
public Order placeOrder(PlaceOrderCommand cmd) {
    Order order = new Order(cmd);
    order.place();
    orderRepository.save(order);
    eventPublisher.publish(order.pullEvents());   // publish after commit
    return order;
}
```

---

## Application Layer

The application layer orchestrates use cases using domain objects. It should contain **no business logic** — only coordination.

```java
@Service
@RequiredArgsConstructor
public class PlaceOrderUseCase {

    private final OrderRepository orders;
    private final CustomerRepository customers;
    private final EventPublisher events;

    @Transactional
    public OrderId execute(PlaceOrderCommand cmd) {
        Customer customer = customers.findById(cmd.customerId());
        Order order = customer.startOrder();

        cmd.items().forEach(item ->
            order.addItem(item.productId(), item.quantity(), item.price())
        );

        order.place();
        orders.save(order);
        events.publish(order.pullEvents());
        return order.getId();
    }
}
```

---

## Layered Architecture

```
┌─────────────────────────────┐
│  Presentation / API Layer   │  Controllers, DTOs
├─────────────────────────────┤
│  Application Layer          │  Use cases, command handlers
├─────────────────────────────┤
│  Domain Layer               │  Entities, Aggregates, Value Objects,
│                             │  Domain Services, Events (NO deps on infra)
├─────────────────────────────┤
│  Infrastructure Layer       │  DB, messaging, external APIs
└─────────────────────────────┘
```

Dependencies always point **inward** — domain layer has no dependencies on infrastructure.

---

## Key Interview Points

| Concept | In one sentence |
|---------|----------------|
| Ubiquitous Language | Shared vocabulary between devs and domain experts reflected in code |
| Bounded Context | Boundary where a model and its language are consistent |
| Entity | Identity-based; can change over time |
| Value Object | Attribute-based; immutable; no ID |
| Aggregate | Cluster of objects with one root enforcing all invariants |
| Domain Event | Fact that something happened, past tense, published after state change |
| Repository | Collection-like abstraction over aggregate persistence |

---

> **Next:** [CQRS & Event Sourcing →](./cqrs-event-sourcing)

<RelatedTopics :topics="['/architecture/microservices', '/architecture/cqrs-event-sourcing', '/principles/solid', '/spring/spring-data']" />
