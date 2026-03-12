---
title: Spring Data & JPA
description: Spring Data JPA repositories, @Entity, Hibernate session management, JPQL vs native queries, transactions
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, jpa, hibernate, repository, entity, transaction]
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

## @Transactional with JPA

```java
@Service
@Transactional(readOnly = true)  // default for all methods — optimises read queries
public class OrderService {

    @Transactional  // overrides for write methods
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
Read-only transactions allow Hibernate optimisations: no dirty checking, no flush on commit. Always use it for query-only services.
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

<RelatedTopics :topics="['/spring/aop', '/databases/jpa-hibernate', '/spring/spring-boot']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
