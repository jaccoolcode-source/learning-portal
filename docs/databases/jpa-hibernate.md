---
title: JPA & Hibernate
description: JPA and Hibernate deep-dive — entity lifecycle, relationships, N+1, @Embeddable, inheritance strategies, optimistic locking, projections, Spring Data JPA, auditing, and Criteria API
category: databases
pageClass: layout-databases
difficulty: advanced
tags: [jpa, hibernate, entity, orm, jpql, lazy-loading, caching, optimistic-locking, projections, spring-data]
related:
  - /databases/sql
  - /databases/nosql
  - /spring/spring-data
estimatedMinutes: 40
---

# JPA & Hibernate

<DifficultyBadge level="advanced" />

JPA (Jakarta Persistence API) is the standard ORM specification. Hibernate is the most popular implementation. Spring Data JPA wraps both with repository abstractions.

---

## Entity Lifecycle

```
new MyEntity()   →  TRANSIENT   (unknown to Hibernate, no DB row)
    │
    │ em.persist(e)  /  repo.save(e) on transient
    ↓
         PERSISTENT            (managed — dirty checking, changes flushed to DB)
    │
    │ em.detach(e)  /  session closes  /  repo returns outside @Transactional
    ↓
         DETACHED              (snapshot exists in DB, no longer tracked)
    │
    │ em.merge(e)  /  repo.save(e) on detached
    ↓
         PERSISTENT again
    │
    │ em.remove(e)
    ↓
         REMOVED               (DELETE issued on next flush)
```

```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "customer_name", nullable = false, length = 200)
    private String customerName;

    @Enumerated(EnumType.STRING)   // store as "PENDING", not 0
    private OrderStatus status;

    @Column(updatable = false)     // set on insert only
    private LocalDateTime createdAt;
}
```

---

## Relationship Mapping

### @OneToMany / @ManyToOne

```java
@Entity
public class Order {
    @Id @GeneratedValue Long id;

    @OneToMany(
        mappedBy = "order",          // field name in OrderItem that owns the FK
        cascade = CascadeType.ALL,   // persist/remove items with order
        orphanRemoval = true,        // delete item when removed from list
        fetch = FetchType.LAZY       // default for collections — always keep LAZY
    )
    private List<OrderItem> items = new ArrayList<>();

    // Convenience methods to keep both sides in sync
    public void addItem(OrderItem item) {
        items.add(item);
        item.setOrder(this);
    }

    public void removeItem(OrderItem item) {
        items.remove(item);
        item.setOrder(null);
    }
}

@Entity
public class OrderItem {
    @Id @GeneratedValue Long id;

    @ManyToOne(fetch = FetchType.LAZY)   // override EAGER default — always!
    @JoinColumn(name = "order_id")
    private Order order;

    private String productName;
    private int quantity;
    private BigDecimal price;
}
```

### @ManyToMany

```java
@Entity
public class Student {
    @Id @GeneratedValue Long id;

    @ManyToMany
    @JoinTable(
        name = "student_course",
        joinColumns = @JoinColumn(name = "student_id"),
        inverseJoinColumns = @JoinColumn(name = "course_id")
    )
    private Set<Course> courses = new HashSet<>();
}

@Entity
public class Course {
    @Id @GeneratedValue Long id;

    @ManyToMany(mappedBy = "courses")   // student owns the join table
    private Set<Student> students = new HashSet<>();
}
```

::: tip @ManyToMany with extra columns
If the join table needs extra columns (enrollment date, grade), create an explicit join entity (`@Enrollment`) with `@ManyToOne` to both sides instead of `@ManyToMany`.
:::

### @OneToOne

```java
@Entity
public class User {
    @Id @GeneratedValue Long id;

    @OneToOne(cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id")
    private UserProfile profile;
}
```

---

## @Embeddable — Value Objects

Embed a value object directly into the owning entity's table — no separate table, no FK.

```java
@Embeddable
public class Address {
    private String street;
    private String city;
    private String country;
    private String postcode;
}

@Entity
public class Customer {
    @Id @GeneratedValue Long id;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "street",   column = @Column(name = "billing_street")),
        @AttributeOverride(name = "city",     column = @Column(name = "billing_city")),
        @AttributeOverride(name = "country",  column = @Column(name = "billing_country")),
        @AttributeOverride(name = "postcode", column = @Column(name = "billing_postcode"))
    })
    private Address billingAddress;

    @Embedded
    @AttributeOverrides({
        @AttributeOverride(name = "street",   column = @Column(name = "shipping_street")),
        @AttributeOverride(name = "city",     column = @Column(name = "shipping_city")),
        // ...
    })
    private Address shippingAddress;
}
```

The `customers` table gets columns: `billing_street`, `billing_city`, `shipping_street`, `shipping_city`, etc. No join needed.

---

## Inheritance Strategies

How to map a class hierarchy to database tables.

### SINGLE_TABLE (default)

All subclasses in one table. Uses a `dtype` discriminator column.

```java
@Entity
@Inheritance(strategy = InheritanceType.SINGLE_TABLE)
@DiscriminatorColumn(name = "payment_type", discriminatorType = DiscriminatorType.STRING)
public abstract class Payment {
    @Id @GeneratedValue Long id;
    BigDecimal amount;
    LocalDateTime paidAt;
}

@Entity
@DiscriminatorValue("CARD")
public class CardPayment extends Payment {
    String cardLastFour;
    String cardBrand;
}

@Entity
@DiscriminatorValue("BANK")
public class BankTransferPayment extends Payment {
    String iban;
    String bic;
}
```

```
payments table:
| id | payment_type | amount | paid_at | card_last_four | card_brand | iban | bic |
|----|-------------|--------|---------|----------------|------------|------|-----|
| 1  | CARD        | 99.99  | ...     | 4242           | VISA       | NULL | NULL|
| 2  | BANK        | 500.00 | ...     | NULL           | NULL       | DE89 | ... |
```

**Pros:** Single query, no joins, best performance.
**Cons:** Subclass columns are nullable; wide table with many subclasses.

### JOINED

Each subclass has its own table; subclass table joins to parent via PK/FK.

```java
@Entity
@Inheritance(strategy = InheritanceType.JOINED)
public abstract class Payment { ... }

@Entity
@Table(name = "card_payments")
public class CardPayment extends Payment { ... }
// card_payments.id is FK → payments.id
```

**Pros:** Normalised schema, no nullable columns.
**Cons:** JOIN on every query; slower for polymorphic queries.

### TABLE_PER_CLASS

Each concrete class has its own complete table (all parent columns repeated).

```java
@Entity
@Inheritance(strategy = InheritanceType.TABLE_PER_CLASS)
public abstract class Payment { ... }
```

**Pros:** No joins for single-type queries.
**Cons:** `UNION ALL` for polymorphic queries; no shared sequence for IDs.

| Strategy | Polymorphic query | Nullable cols | Joins |
|----------|-------------------|---------------|-------|
| SINGLE_TABLE | Fast (no join) | Yes | None |
| JOINED | Medium (JOIN) | No | One per level |
| TABLE_PER_CLASS | Slow (UNION ALL) | No | None |

Default for most cases: **SINGLE_TABLE** (simplest, fastest) unless normalisation is required.

---

## The N+1 Problem

```java
// 1 query: SELECT * FROM orders
List<Order> orders = orderRepository.findAll();

// N queries: SELECT * FROM order_items WHERE order_id = ?
// (one per order — triggered by lazy load)
for (Order o : orders) {
    o.getItems().size();   // ← lazy load fires here
}
```

### Fix 1: JOIN FETCH

```java
@Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.items")
List<Order> findAllWithItems();
```

::: warning JOIN FETCH + pagination
`JOIN FETCH` with `Pageable` produces a warning and does in-memory pagination (loads ALL data then pages). Fix with `@BatchSize` or two-query approach: page the IDs first, then fetch with JOIN FETCH.
:::

### Fix 2: @EntityGraph

```java
@EntityGraph(attributePaths = {"items", "items.product"})
List<Order> findByCustomerId(Long customerId);

// Or named entity graph on entity
@Entity
@NamedEntityGraph(name = "order.with-items",
    attributeNodes = @NamedAttributeNode(value = "items",
        subgraph = "items.product"),
    subgraphs = @NamedSubgraph(name = "items.product",
        attributeNodes = @NamedAttributeNode("product"))
)
public class Order { ... }
```

### Fix 3: @BatchSize

```java
@OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
@BatchSize(size = 25)   // load 25 collections per SQL IN clause
private List<OrderItem> items;
// 1 + ceil(N/25) queries instead of 1 + N
```

### Fix 4: DTO projection with JOIN

```java
@Query("""
    SELECT new com.example.OrderSummary(o.id, o.customerName, COUNT(i))
    FROM Order o LEFT JOIN o.items i
    GROUP BY o.id, o.customerName
    """)
List<OrderSummary> findOrderSummaries();
```

---

## Optimistic Locking — @Version

Prevents lost updates without acquiring DB locks. Each entity has a version column; Hibernate checks it on update.

```java
@Entity
public class Product {
    @Id @GeneratedValue Long id;
    String name;
    int stockQuantity;

    @Version
    Long version;   // Hibernate manages this automatically
}
```

```java
// Thread 1 and Thread 2 both load product version=5
// Thread 1 updates: version becomes 6 → UPDATE ... WHERE id=? AND version=5 → OK
// Thread 2 updates: version=5 but DB has version=6 → 0 rows affected
// Hibernate throws OptimisticLockException → caller retries or shows conflict message
```

```java
// Handle the exception in the service
@Transactional
@Retryable(retryFor = OptimisticLockException.class, maxAttempts = 3)
public Product updateStock(Long id, int delta) {
    Product p = productRepository.findById(id).orElseThrow();
    p.setStockQuantity(p.getStockQuantity() + delta);
    return productRepository.save(p);   // throws OptimisticLockException if stale
}
```

---

## Pessimistic Locking

Acquire a DB-level lock to prevent concurrent access.

```java
// Spring Data JPA
@Lock(LockModeType.PESSIMISTIC_WRITE)      // SELECT ... FOR UPDATE
Optional<Product> findWithLockById(Long id);

@Lock(LockModeType.PESSIMISTIC_READ)       // SELECT ... FOR SHARE
Optional<Product> findWithShareLockById(Long id);

// EntityManager
Product p = em.find(Product.class, id, LockModeType.PESSIMISTIC_WRITE);

// JPQL
@Query("SELECT p FROM Product p WHERE p.id = :id")
@Lock(LockModeType.PESSIMISTIC_WRITE)
Optional<Product> lockById(@Param("id") Long id);
```

---

## Projections

Load only the columns you need — avoid fetching entire entities when you only need a subset.

### Interface Projection

```java
// Closed projection — only declared methods fetched
public interface OrderSummary {
    Long getId();
    String getCustomerName();
    OrderStatus getStatus();

    // Nested
    interface ItemCount {
        int getQuantity();
    }
}

// Open projection — SpEL expressions
public interface FullName {
    @Value("#{target.firstName + ' ' + target.lastName}")
    String getFullName();
}

// Repository
List<OrderSummary> findByStatus(OrderStatus status);
```

### DTO Projection (Constructor)

```java
public record OrderDto(Long id, String customerName, BigDecimal total) {}

@Query("SELECT new com.example.OrderDto(o.id, o.customerName, SUM(i.price * i.quantity)) " +
       "FROM Order o JOIN o.items i GROUP BY o.id, o.customerName")
List<OrderDto> findOrderTotals();
```

### Dynamic Projection

```java
// Same repository method, different return type
<T> List<T> findByStatus(OrderStatus status, Class<T> type);

// Usage
List<OrderSummary> summaries = repo.findByStatus(PENDING, OrderSummary.class);
List<Order>        orders    = repo.findByStatus(PENDING, Order.class);
```

---

## Spring Data JPA — Derived Queries

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    // Method name → SQL (Spring Data generates the query)
    List<Order> findByStatus(OrderStatus status);
    List<Order> findByCustomerNameContainingIgnoreCase(String name);
    Optional<Order> findTopByCustomerNameOrderByCreatedAtDesc(String name);
    long countByStatus(OrderStatus status);
    boolean existsByCustomerEmailAndStatus(String email, OrderStatus status);
    void deleteByStatusAndCreatedAtBefore(OrderStatus status, LocalDateTime cutoff);

    // Pagination + sorting
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);
    Slice<Order> findByCustomerId(Long customerId, Pageable pageable);  // no COUNT query

    // Custom JPQL
    @Query("SELECT o FROM Order o WHERE o.total > :minTotal AND o.status = :status")
    List<Order> findExpensiveOrders(@Param("minTotal") BigDecimal min,
                                    @Param("status") OrderStatus status);

    // Native SQL
    @Query(value = "SELECT * FROM orders WHERE EXTRACT(MONTH FROM created_at) = :month",
           nativeQuery = true)
    List<Order> findByMonth(@Param("month") int month);

    // Modifying query
    @Modifying
    @Transactional
    @Query("UPDATE Order o SET o.status = :status WHERE o.id IN :ids")
    int bulkUpdateStatus(@Param("ids") List<Long> ids, @Param("status") OrderStatus status);
}
```

---

## Auditing

Automatically populate `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

```java
// Enable in @SpringBootApplication class or @Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
public class AppConfig {

    @Bean
    public AuditorAware<String> auditorProvider() {
        return () -> Optional.ofNullable(SecurityContextHolder.getContext())
            .map(ctx -> ctx.getAuthentication())
            .map(auth -> auth.getName());
    }
}
```

```java
// Base class for all audited entities
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class AuditableEntity {

    @CreatedDate
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    private LocalDateTime updatedAt;

    @CreatedBy
    @Column(updatable = false)
    private String createdBy;

    @LastModifiedBy
    private String updatedBy;
}

@Entity
public class Order extends AuditableEntity {
    @Id @GeneratedValue Long id;
    // ... createdAt, updatedAt, createdBy, updatedBy inherited
}
```

---

## Criteria API & Specifications

Type-safe programmatic query building — useful for dynamic search filters.

```java
// Specification — composable predicate
public class OrderSpecifications {

    public static Specification<Order> hasStatus(OrderStatus status) {
        return (root, query, cb) ->
            status == null ? null : cb.equal(root.get("status"), status);
    }

    public static Specification<Order> createdAfter(LocalDateTime date) {
        return (root, query, cb) ->
            date == null ? null : cb.greaterThan(root.get("createdAt"), date);
    }

    public static Specification<Order> customerNameContains(String name) {
        return (root, query, cb) ->
            name == null ? null :
            cb.like(cb.lower(root.get("customerName")), "%" + name.toLowerCase() + "%");
    }
}

// Repository extends JpaSpecificationExecutor
public interface OrderRepository extends JpaRepository<Order, Long>,
                                          JpaSpecificationExecutor<Order> {}

// Usage — compose dynamically
public Page<Order> search(OrderSearchRequest req, Pageable pageable) {
    Specification<Order> spec = Specification.where(null);

    if (req.status() != null)
        spec = spec.and(hasStatus(req.status()));
    if (req.since() != null)
        spec = spec.and(createdAfter(req.since()));
    if (req.customerName() != null)
        spec = spec.and(customerNameContains(req.customerName()));

    return orderRepository.findAll(spec, pageable);
}
```

---

## Hibernate Caching

| Level | Scope | Default |
|-------|-------|---------|
| First-level (persistence context) | Per transaction / `EntityManager` | Always on |
| Second-level | Shared across all `EntityManager`s | Off — configure explicitly |
| Query cache | Cache query result sets | Off |

```yaml
# application.yml — enable Hibernate second-level cache with Caffeine
spring:
  jpa:
    properties:
      hibernate:
        cache:
          use_second_level_cache: true
          use_query_cache: true
          region.factory_class: org.hibernate.cache.jcache.JCacheRegionFactory
        javax.cache.provider: com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider
```

```java
@Entity
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)   // for mutable entities
// or: READ_ONLY for immutable reference data
public class Product { ... }

// Cache a query
@QueryHints(@QueryHint(name = "org.hibernate.cacheable", value = "true"))
List<Product> findByCategory(String category);
```

::: warning Open Session in View anti-pattern
`spring.jpa.open-in-view=true` (default!) keeps the Hibernate session open for the entire HTTP request — allows lazy loading in views/controllers but holds a DB connection for the whole request duration. Disable it: `spring.jpa.open-in-view=false`. Fix lazy loading with JOIN FETCH or projections in the service layer.
:::

---

## Interview Quick-Fire

**Q: What is the difference between `EAGER` and `LAZY` fetch and which should you use?**
`EAGER` loads the associated entity/collection immediately when the parent is loaded (extra SQL or JOIN). `LAZY` defers loading until first access. JPA defaults: `@ManyToOne`/`@OneToOne` are EAGER; `@OneToMany`/`@ManyToMany` are LAZY. Always override `@ManyToOne` to `LAZY` — EAGER causes unnecessary SELECTs and disables many query optimisations. Fix loading with explicit JOIN FETCH or `@EntityGraph` where needed.

**Q: What is optimistic locking and when would you use it over pessimistic?**
Optimistic locking (`@Version`) assumes conflicts are rare — no DB lock is taken; instead, Hibernate checks the version column on UPDATE and throws `OptimisticLockException` if another transaction already updated the row. Use it for read-heavy workloads where contention is low. Use pessimistic locking (`SELECT FOR UPDATE`) when conflicts are frequent and retrying is expensive — for example, decrementing stock in a flash sale.

**Q: What are the three inheritance mapping strategies?**
`SINGLE_TABLE`: all subclasses in one table with a discriminator column — fastest (no joins), but subclass columns are nullable. `JOINED`: each class has its own table joined by PK/FK — normalised, but requires a JOIN. `TABLE_PER_CLASS`: each concrete class has a complete table — no joins for single type, but polymorphic queries need `UNION ALL`. `SINGLE_TABLE` is the default and usually the best choice.

**Q: Why is `spring.jpa.open-in-view=true` considered an anti-pattern?**
It holds the Hibernate `EntityManager` (and therefore a DB connection from the pool) open for the entire HTTP request lifecycle — including time spent rendering views or serialising JSON. Under load this can exhaust the connection pool. It also hides N+1 problems by silently triggering lazy loads in controllers. Disable it; instead, fetch all required data in the service layer using projections or JOIN FETCH.

<RelatedTopics :topics="['/databases/sql', '/databases/nosql', '/spring/spring-data']" />

[→ Back to Databases Overview](/databases/)
