---
title: Spring Data & JPA
description: Spring Data JPA repositories, @Entity, Hibernate session management, JPQL vs native queries, transactions, @Transactional propagation
category: spring
pageClass: layout-spring
difficulty: advanced
tags: [spring, jpa, hibernate, repository, entity, transaction, transactional, propagation, isolation]
related:
  - /spring/aop
  - /spring/spring-boot
  - /databases/jpa-hibernate
estimatedMinutes: 25
---

# Spring Data & JPA

<DifficultyBadge level="intermediate" />

Spring Data JPA eliminates repository boilerplate. Hibernate (the JPA implementation) handles SQL generation, caching, and session management.

---

## Core Annotations

```java
@Entity
@Table(name = "orders")
public class Order {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String customerName;

    @Column(name = "order_date")
    private LocalDateTime orderDate;

    @Enumerated(EnumType.STRING)
    private OrderStatus status;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, fetch = FetchType.LAZY)
    private List<OrderItem> items = new ArrayList<>();

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;
}
```

---

## Spring Data Repositories

```java
// Extend JpaRepository<Entity, ID> — get 30+ methods for free
public interface OrderRepository extends JpaRepository<Order, Long> {

    // Query by method name — Spring generates SQL automatically
    List<Order> findByCustomerName(String name);
    List<Order> findByStatus(OrderStatus status);
    List<Order> findByOrderDateBetween(LocalDateTime from, LocalDateTime to);
    long countByStatus(OrderStatus status);
    boolean existsByCustomerNameAndStatus(String name, OrderStatus status);

    // Sorting and paging
    List<Order> findByStatusOrderByOrderDateDesc(OrderStatus status);
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);

    // JPQL query
    @Query("SELECT o FROM Order o WHERE o.customer.email = :email AND o.status = 'PENDING'")
    List<Order> findPendingByEmail(@Param("email") String email);

    // Native SQL query
    @Query(value = "SELECT * FROM orders WHERE total > ?1", nativeQuery = true)
    List<Order> findHighValueOrders(double threshold);

    // Projections — fetch only needed fields
    @Query("SELECT o.id, o.customerName, o.status FROM Order o WHERE o.orderDate > :date")
    List<Object[]> findSummaryAfter(@Param("date") LocalDateTime date);

    // Modifying queries
    @Modifying
    @Transactional
    @Query("UPDATE Order o SET o.status = 'CANCELLED' WHERE o.id = :id")
    int cancelOrder(@Param("id") Long id);
}
```

---

## JpaRepository Built-in Methods

```java
// CRUD
repo.findById(1L)           // Optional<T>
repo.findAll()              // List<T>
repo.findAll(Sort.by("name"))
repo.findAllById(List.of(1L, 2L))
repo.save(entity)           // INSERT or UPDATE (based on ID)
repo.saveAll(entities)
repo.delete(entity)
repo.deleteById(1L)
repo.existsById(1L)
repo.count()

// Paging
Page<Order> page = repo.findAll(PageRequest.of(0, 20, Sort.by("orderDate").descending()));
page.getContent()           // List<Order>
page.getTotalElements()     // total count
page.getTotalPages()
page.hasNext()
```

---

## Fetch Types & N+1 Problem

```java
@OneToMany(fetch = FetchType.LAZY)   // default for collections — load when accessed
@ManyToOne(fetch = FetchType.EAGER)  // default for single entities — load immediately
```

### The N+1 Problem

```java
// BAD: N+1 — 1 query for orders, then 1 query per order to load customer
List<Order> orders = repo.findAll();
for (Order o : orders) {
    System.out.println(o.getCustomer().getName()); // triggers N separate queries!
}

// GOOD: JOIN FETCH — single query with JOIN
@Query("SELECT DISTINCT o FROM Order o LEFT JOIN FETCH o.customer WHERE o.status = 'PENDING'")
List<Order> findPendingWithCustomers();

// GOOD: @EntityGraph — declarative fetch plan
@EntityGraph(attributePaths = {"customer", "items"})
List<Order> findByStatus(OrderStatus status);
```

---

## Hibernate Session & First-Level Cache

Hibernate's `Session` (mapped to JPA's `EntityManager`) maintains a **first-level cache** — all entities loaded in the same session are cached for the session's duration.

```java
// Same transaction = same session = same entity instance
Order o1 = repo.findById(1L).get();
Order o2 = repo.findById(1L).get(); // returns same object from cache, NO second DB query

System.out.println(o1 == o2); // true — same instance!
```

This is why you rarely need explicit caching within a transaction.

---

## @Transactional — Propagation Modes

`@Transactional` in Spring AOP wraps method calls in a transaction proxy. The `propagation` attribute controls what happens when a transactional method calls another.

### The 7 Propagation Modes

| Mode | Behaviour |
|------|-----------|
| `REQUIRED` *(default)* | Join existing transaction; create new if none exists |
| `REQUIRES_NEW` | Always create a new transaction; suspend any existing one |
| `NESTED` | Create a savepoint within the existing transaction (JDBC only) |
| `SUPPORTS` | Join if a transaction exists; run non-transactionally otherwise |
| `NOT_SUPPORTED` | Suspend any existing transaction; always run non-transactionally |
| `MANDATORY` | Must run inside an existing transaction; throws if none |
| `NEVER` | Must NOT run inside a transaction; throws if one exists |

### REQUIRED vs REQUIRES_NEW

```java
@Service
public class OrderService {

    @Transactional  // REQUIRED — joins outer transaction
    public void placeOrder(OrderRequest req) {
        Order order = orderRepo.save(new Order(req));
        auditService.log("ORDER_PLACED", order.getId()); // joins same transaction
        // If auditService.log() throws, entire outer transaction rolls back
    }
}

@Service
public class AuditService {

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void log(String event, Long entityId) {
        // Always runs in its OWN transaction
        // If outer transaction rolls back, this audit entry is still committed
        auditRepo.save(new AuditLog(event, entityId));
    }
}
```

::: tip When to use REQUIRES_NEW
Use it when the inner method must commit independently of the outer transaction — audit logs, notification records, outbox events. This guarantees persistence even if the outer transaction fails.
:::

### NESTED — savepoints

```java
@Transactional(propagation = Propagation.NESTED)
public void processOptionalStep(Long orderId) {
    // Creates a savepoint in the outer transaction.
    // If this method throws, only changes since the savepoint are rolled back.
    // The outer transaction can catch the exception and continue.
}

// In the caller:
@Transactional
public void placeOrder(OrderRequest req) {
    Order order = orderRepo.save(new Order(req));
    try {
        loyaltyService.processOptionalStep(order.getId()); // nested savepoint
    } catch (Exception e) {
        // Rolled back to savepoint — order itself is NOT rolled back
        log.warn("Loyalty step failed, continuing without it");
    }
    // order is still saved
}
```

::: warning NESTED limitations
`NESTED` only works with JDBC `DataSourceTransactionManager` and a database that supports savepoints (PostgreSQL, MySQL). It does NOT work with JTA/XA transactions. Use `REQUIRES_NEW` when portability matters.
:::

### Self-Invocation Anti-Pattern

`@Transactional` is applied via a Spring AOP proxy. Calling a transactional method from within the same bean bypasses the proxy — no transaction is applied!

```java
@Service
public class OrderService {

    @Transactional
    public void placeOrder(OrderRequest req) {
        Order order = orderRepo.save(new Order(req));
        sendConfirmation(order); // ← WRONG: direct call, no proxy involved
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)  // NEVER fires!
    public void sendConfirmation(Order order) {
        // This runs inside the outer transaction despite REQUIRES_NEW
    }
}

// Fix: inject self-reference or extract to separate @Service bean
@Service
public class OrderService {

    @Autowired
    private OrderService self; // Spring injects the proxy

    @Transactional
    public void placeOrder(OrderRequest req) {
        Order order = orderRepo.save(new Order(req));
        self.sendConfirmation(order); // goes through proxy — REQUIRES_NEW fires correctly
    }
}
```

### Rollback Rules

By default, `@Transactional` only rolls back on **unchecked exceptions** (`RuntimeException` and `Error`). Checked exceptions **do not** trigger rollback.

```java
// Default: only RuntimeException triggers rollback
@Transactional
public void transfer(Long fromId, Long toId, BigDecimal amount) throws InsufficientFundsException {
    accountRepo.debit(fromId, amount);
    accountRepo.credit(toId, amount);
    // If InsufficientFundsException (checked) is thrown — NO rollback!
    // If NullPointerException (unchecked) is thrown — rollback
}

// Explicit rollback for checked exceptions
@Transactional(rollbackFor = InsufficientFundsException.class)
public void transfer(Long fromId, Long toId, BigDecimal amount) throws InsufficientFundsException {
    // Now InsufficientFundsException triggers rollback too
}

// Prevent rollback for specific unchecked exceptions
@Transactional(noRollbackFor = OptimisticLockException.class)
public void updateWithRetry(Long id) {
    // OptimisticLockException won't roll back — caller handles retry
}
```

### Isolation Levels

| Level | Dirty Read | Non-Repeatable Read | Phantom Read | Use Case |
|-------|-----------|---------------------|--------------|----------|
| `READ_UNCOMMITTED` | possible | possible | possible | Rare — analytics approximations |
| `READ_COMMITTED` *(default in most DBs)* | ❌ | possible | possible | Most OLTP applications |
| `REPEATABLE_READ` | ❌ | ❌ | possible | Financial summaries, consistent snapshots |
| `SERIALIZABLE` | ❌ | ❌ | ❌ | Strong consistency (inventory, banking) |

```java
@Transactional(isolation = Isolation.REPEATABLE_READ)
public BigDecimal calculateAccountBalance(Long accountId) {
    // If two reads of the same row must return the same value within the transaction
    BigDecimal balance = accountRepo.getBalance(accountId);
    List<Transaction> txns = txnRepo.findPending(accountId);
    return balance.add(txns.stream()...); // balance won't change between reads
}

@Transactional(isolation = Isolation.SERIALIZABLE)
public void decrementStock(Long productId, int quantity) {
    // Prevents phantom reads — no other transaction can insert/update stock rows
    // that match this transaction's query range while this transaction runs
    Product p = productRepo.findById(productId).orElseThrow();
    if (p.getStock() < quantity) throw new InsufficientStockException();
    p.setStock(p.getStock() - quantity);
}
```

::: warning Isolation vs Performance
Higher isolation = more locking = lower throughput. `SERIALIZABLE` can kill performance under load. Use optimistic locking (`@Version`) with `READ_COMMITTED` for most contention scenarios.
:::

### @Transactional with JPA

```java
@Service
@Transactional(readOnly = true)  // default for all methods — optimises read queries
public class OrderService {

    @Transactional  // overrides class-level — full read-write transaction
    public Order createOrder(CreateOrderRequest req) {
        Order order = new Order();
        order.setCustomerName(req.getCustomerName());
        // ...
        return orderRepo.save(order); // INSERT
    }

    // readOnly = true inherited from class
    public List<Order> getPendingOrders() {
        return orderRepo.findByStatus(OrderStatus.PENDING);
    }
}
```

::: tip @Transactional(readOnly = true)
Read-only transactions allow Hibernate optimisations: no dirty checking, no snapshot comparison on flush. Hibernate also skips the write-lock step and some databases route read-only transactions to replicas. Always use it for query-only service methods.
:::

---

## Cascade Types

| Type | When used |
|------|----------|
| `CascadeType.PERSIST` | Save parent → save children |
| `CascadeType.MERGE` | Merge parent → merge children |
| `CascadeType.REMOVE` | Delete parent → delete children |
| `CascadeType.REFRESH` | Refresh parent → refresh children |
| `CascadeType.ALL` | All of the above |
| `CascadeType.DETACH` | Detach parent → detach children |

---

## Summary

- Spring Data JPA generates repository implementations from interface method names.
- Use JPQL (`@Query`) or `@EntityGraph` for complex queries, `JOIN FETCH` for N+1 prevention.
- Hibernate's first-level cache (per session/transaction) avoids redundant queries.
- Mark service classes `@Transactional(readOnly = true)` and override for writes.
- `CascadeType.ALL` is convenient but can cause accidental deletes — use carefully.
- `@Transactional` propagation: `REQUIRED` joins or creates; `REQUIRES_NEW` always creates fresh; `NESTED` uses savepoints.
- Self-invocation bypasses the proxy — extract to a separate bean or inject self-reference.
- Only `RuntimeException` triggers rollback by default — use `rollbackFor` for checked exceptions.
- Prefer `READ_COMMITTED` isolation with optimistic locking (`@Version`) over `SERIALIZABLE` for throughput.

---

## Interview Quick-Fire

**Q: What is the difference between `REQUIRED` and `REQUIRES_NEW` propagation?**
`REQUIRED` (default) joins an existing transaction or creates one if none exists — all operations share a single commit/rollback boundary. `REQUIRES_NEW` always suspends any existing transaction and starts a completely independent one — it commits on its own even if the outer transaction later rolls back. Use `REQUIRES_NEW` for audit logs, outbox events, or any record that must persist regardless of the outer outcome.

**Q: Why doesn't `@Transactional` work when you call a method from within the same class?**
Spring's transaction management uses AOP proxies — `@Transactional` only fires when the method is called **through the proxy**. An internal call (`this.method()`) bypasses the proxy entirely, so no transaction is started and no propagation applies. Fix: inject the bean into itself (`@Autowired private MyService self`) so internal calls go through the proxy, or extract the method into a separate Spring bean.

**Q: What happens when a `@Transactional` method throws a checked exception?**
By default, Spring **does not roll back** on checked exceptions (any `Exception` that isn't a `RuntimeException` or `Error`). The transaction commits normally. Add `rollbackFor = MyCheckedException.class` to `@Transactional` to override this behaviour. This is a common source of data integrity bugs — always verify rollback behaviour when using checked exceptions in transactional code.

**Q: What is a phantom read and which isolation level prevents it?**
A phantom read occurs when a second query within the same transaction returns rows that weren't visible before (because another transaction inserted them in between). `REPEATABLE_READ` prevents non-repeatable reads (same row changing) but not phantoms. Only `SERIALIZABLE` prevents phantoms by locking the full query range. In practice, use `REPEATABLE_READ` with snapshot isolation (PostgreSQL default) or optimistic locking for most scenarios.

<RelatedTopics :topics="['/spring/aop', '/databases/jpa-hibernate', '/spring/spring-boot']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
