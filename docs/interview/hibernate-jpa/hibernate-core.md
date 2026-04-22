# Hibernate / JPA

**Q33 to Q37** · [← Hibernate/JPA Overview](./index)

---

## Q33: JPA Entity Lifecycle

> Most candidates know `persist` and `merge` — seniors know what happens in each state and how the `EntityManager` tracks changes.

An entity moves through four states in JPA. Understanding them prevents subtle bugs like accidental updates or detached-entity exceptions.

| State | Description | How to enter |
|-------|-------------|--------------|
| **Transient** | Not known to the `EntityManager`, no identity | `new Entity()` |
| **Managed** | Tracked by the current `EntityManager` — any change is auto-flushed | `persist()`, `find()`, `merge()` returns managed copy |
| **Detached** | Was managed, now disconnected (session closed or `detach()` called) | End of transaction, `clear()`, `close()` |
| **Removed** | Scheduled for deletion on next flush | `remove()` on a managed entity |

```java
// Transient
Order order = new Order("LAPTOP");        // no ID, not tracked

// Managed — any field change is dirty-checked and flushed
em.persist(order);                        // INSERT scheduled
order.setStatus("CONFIRMED");             // UPDATE scheduled automatically

// Detached — changes are NOT tracked
em.detach(order);
order.setStatus("SHIPPED");               // silently ignored

// Merge — copies detached state into a new managed instance
Order managed = em.merge(order);          // managed is the tracked copy
managed.setStatus("SHIPPED");             // this change WILL be flushed

// Removed
em.remove(managed);                       // DELETE scheduled
```

::: details Full model answer

**Transient:**
An object created with `new` has no `@Id` assigned by Hibernate and is completely unknown to the persistence context. Nothing in the database corresponds to it yet.

**Managed (Persistent):**
The entity is associated with the current persistence context. Hibernate's **dirty-checking** mechanism compares the entity's current state to a snapshot taken when it first became managed. On `flush()` (typically at commit time), any differences are written to the DB automatically — no explicit `update()` call needed.

**Detached:**
When the persistence context closes (end of a `@Transactional` method, `em.clear()`, `em.close()`), all previously managed entities become detached. Changes to detached objects are ignored unless you re-attach them with `merge()`.

Common pitfall — lazy loading on detached entity:
```java
@Transactional
public Order getOrder(Long id) {
    return orderRepo.findById(id).orElseThrow();
}
// Caller accesses order.getItems() OUTSIDE transaction → LazyInitializationException
```

**Removed:**
Calling `em.remove()` on a managed entity schedules a DELETE. If you call `em.persist()` on a removed entity before flush, it transitions back to managed.

**Persistence Context vs EntityManager:**
- `EntityManager` is the API you interact with.
- **Persistence Context** is the first-level cache it manages — a Map of `{EntityClass + id → entity instance}`. Within one transaction, loading the same entity twice returns the **same Java object** (identity guarantee).

**Flush modes:**
- `AUTO` (default) — flushes before queries and at commit to ensure consistent reads.
- `COMMIT` — only flushes at commit. Faster but can cause dirty reads within the same transaction.
- `MANUAL` — you must call `flush()` explicitly.

**Spring Data JPA integration:**
Spring's `@Transactional` manages the `EntityManager` lifecycle. Each `@Transactional` method gets its own persistence context (scoped to the transaction). This is why detachment typically happens when the method returns.

:::

> [!TIP] Golden Tip
> The most important lifecycle nuance: **`merge()` does NOT update the detached object** — it returns a new managed copy. Code like `em.merge(detached); detached.setFoo("x");` will NOT persist the change. Always work with the return value of `merge()`. This is a classic trap in codebases that mix detached objects with transactions.

**Follow-up questions:**
- What is dirty checking and when does Hibernate flush?
- What is `LazyInitializationException` and how do you prevent it?
- What is the difference between `persist()` and `merge()`?
- What happens if you call `merge()` on a transient entity (no ID)?

---

## Q34: The N+1 Select Problem

> Every JPA developer hits N+1 in production. Seniors know how to diagnose it AND fix it correctly for each relationship type.

N+1 occurs when loading N parent entities triggers N additional SELECT queries to fetch their associations — one per parent.

```java
// Loading 100 orders → 1 query
List<Order> orders = orderRepo.findAll();

// Accessing items on each → 100 additional queries = N+1
orders.forEach(o -> System.out.println(o.getItems().size()));
// Total: 101 queries instead of 1 or 2
```

**Diagnosis:** Enable SQL logging:
```properties
spring.jpa.show-sql=true
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.type.descriptor.sql=TRACE
```

::: details Full model answer

**Why it happens:**
When you load a `List<Order>` with `LAZY` fetching on `items`, Hibernate loads just the orders. The moment you access `order.getItems()`, Hibernate fires a SELECT for that specific order's items. With 100 orders, that's 100 extra queries.

**Fix 1 — JPQL JOIN FETCH:**
```java
@Query("SELECT DISTINCT o FROM Order o JOIN FETCH o.items WHERE o.status = :status")
List<Order> findWithItems(@Param("status") String status);
```
Fetches orders and items in **one JOIN query**. Use `DISTINCT` to deduplicate the order rows caused by the join. Best for one-to-many when you need items always.

**Fix 2 — `@EntityGraph`:**
```java
@EntityGraph(attributePaths = {"items", "customer"})
List<Order> findByStatus(String status);
```
Spring Data JPA generates a JOIN FETCH automatically. Cleaner than `@Query` for simple cases — no raw JPQL needed.

**Fix 3 — `@BatchSize`:**
```java
@OneToMany(fetch = FetchType.LAZY)
@BatchSize(size = 25)
private List<OrderItem> items;
```
Instead of 100 individual SELECTs, Hibernate batches them: `WHERE order_id IN (1,2,...,25)`. Reduces 100 queries to 4. Good for cases where you only access items for a subset of orders.

**Fix 4 — Hibernate `default_batch_fetch_size` (Spring Boot):**
```properties
spring.jpa.properties.hibernate.default_batch_fetch_size=25
```
Applies batching globally to all lazy associations. Easy win for existing codebases.

**Fix 5 — DTO projection:**
```java
@Query("SELECT new com.example.OrderDto(o.id, o.status, i.name) " +
       "FROM Order o JOIN o.items i")
List<OrderDto> findOrderDtos();
```
Returns flat DTOs — no entity tracking, no lazy loading, maximum performance for read-only use cases.

**When N+1 is actually OK:**
If you load 5 orders and only access items for 2 of them, N+1 is cheaper than a JOIN FETCH that loads all items. Batching is a better default than eager joining in this scenario.

**Hibernate Statistics (production monitoring):**
```properties
spring.jpa.properties.hibernate.generate_statistics=true
```
Exposes metrics like `QueryStatistics` — you can see total query count per request. Alert if queries/request exceed a threshold.

:::

> [!TIP] Golden Tip
> The single most impactful fix in most Spring Boot apps is setting `spring.jpa.properties.hibernate.default_batch_fetch_size=25` globally — it converts 100 individual SELECTs into 4 batch SELECTs with zero code changes. Reach for `JOIN FETCH` only when you always need the association. And always mention **Hibernate Statistics** — showing you can measure the problem, not just describe it, signals production experience.

**Follow-up questions:**
- What is the difference between `JOIN FETCH` and `@EntityGraph`?
- Can `JOIN FETCH` cause a `MultipleBagFetchException`? How do you fix it?
- What is the `@BatchSize` annotation and when would you use it over JOIN FETCH?
- How do you detect N+1 problems in a running production application?

---

## Q35: Lazy vs Eager Loading

> Default fetch types trip up most candidates — know the defaults and the pitfalls of both.

| Relationship | Default Fetch | Recommended |
|-------------|---------------|-------------|
| `@ManyToOne` | **EAGER** | LAZY |
| `@OneToOne` | **EAGER** | LAZY |
| `@OneToMany` | **LAZY** | LAZY |
| `@ManyToMany` | **LAZY** | LAZY |

**Rule of thumb: always use LAZY, fetch eagerly only when needed via JOIN FETCH or `@EntityGraph`.**

```java
@Entity
public class Order {

    @ManyToOne(fetch = FetchType.LAZY)   // override EAGER default
    private Customer customer;

    @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)   // already default
    private List<OrderItem> items;
}
```

::: details Full model answer

**LAZY loading:**
The association is represented by a **proxy object**. Hibernate generates a subclass at runtime (via ByteBuddy or cglib). When you access any property of the proxy, Hibernate fires a SELECT to load the real data.

Benefits: Only loads data you actually use. Prevents loading the entire object graph unnecessarily.

Pitfall — `LazyInitializationException`:
```java
Order order = orderService.findById(1L);   // transaction ends here
order.getCustomer().getName();              // → LazyInitializationException
// The proxy has no session to load from
```

Solutions:
1. **Open the transaction** — access within `@Transactional`
2. **JOIN FETCH / @EntityGraph** — load eagerly when needed
3. **`@Transactional(readOnly = true)`** — keeps session open during serialization (use carefully with OSIV)
4. **DTO projection** — map to DTO inside the transaction, return only needed data

**EAGER loading:**
The association is always loaded with the parent — Hibernate joins immediately. Sounds convenient but causes problems:

- Loads data even when you don't need it
- `@ManyToOne` EAGER causes a JOIN on every query — even `findAll()` joins customer for every order
- Multiple EAGER `@OneToMany` on the same entity → `MultipleBagFetchException`
- Can't be overridden to LAZY per-query without significant effort

**Open Session in View (OSIV):**
Spring Boot enables OSIV by default (`spring.jpa.open-in-view=true`). This keeps the Hibernate session open for the entire HTTP request, preventing `LazyInitializationException` in controllers/views. But it's controversial:
- Pros: Convenience, no `LazyInitializationException` in views
- Cons: DB connections held open across the full request lifecycle (network I/O, view rendering), hidden N+1 queries in templates

**Recommendation for production:** Disable OSIV (`spring.jpa.open-in-view=false`), use DTO projections or explicit JOIN FETCH. Forces you to think about what data you actually need.

```properties
spring.jpa.open-in-view=false
```

**Proxy identity pitfall:**
```java
Order o1 = em.find(Order.class, 1L);               // fully loaded
Order o2 = em.getReference(Order.class, 1L);       // proxy
o1 == o2;  // false — different objects!
o1.equals(o2);  // depends on your equals() impl
```
Always implement `equals()` and `hashCode()` on entities based on the database ID (or a natural business key), never on the proxy's default identity.

:::

> [!TIP] Golden Tip
> Recommend disabling OSIV in production (`spring.jpa.open-in-view=false`) — this forces the team to write proper DTO projections and prevents hidden N+1 queries in Thymeleaf/Jackson serialization. Mentioning OSIV shows you understand the full Spring Boot + JPA request lifecycle, not just the Hibernate API.

**Follow-up questions:**
- What is `LazyInitializationException` and what are three ways to fix it?
- What is Open Session in View and why is it considered an anti-pattern?
- What is `em.getReference()` vs `em.find()`?
- What is `MultipleBagFetchException` and how do you resolve it?

---

## Q36: Hibernate Caching

> Caching at the wrong level causes stale data bugs. Know all three cache levels and when each is appropriate.

| Cache Level | Scope | Default | Stores |
|-------------|-------|---------|--------|
| **L1 (Session Cache)** | Single session/transaction | Always on | All loaded entities within the current `EntityManager` |
| **L2 (Second-Level Cache)** | Shared across sessions | Off (opt-in) | Entity data, keyed by class + ID |
| **Query Cache** | Shared | Off (opt-in) | Query result sets (list of IDs) |

::: details Full model answer

**First-Level Cache (L1):**
Built into every `EntityManager`. Within a single transaction, loading the same entity twice returns the **same Java object** from memory — no second DB query. Automatic and always active.

```java
Order o1 = em.find(Order.class, 1L);   // SELECT fired
Order o2 = em.find(Order.class, 1L);   // returned from L1 cache — no query
assert o1 == o2;                        // same instance
```

Cleared when the `EntityManager` closes or when you call `em.clear()` / `em.evict(entity)`.

L1 pitfall — bulk updates bypass the cache:
```java
// JPQL bulk update does NOT update L1 cache
em.createQuery("UPDATE Order o SET o.status = 'CLOSED' WHERE o.id = 1").executeUpdate();
Order stale = em.find(Order.class, 1L);  // still shows old status from L1!
em.refresh(stale);                        // force reload from DB
```

**Second-Level Cache (L2):**
Optional, shared across all `EntityManager` instances in the same application. Survives transaction boundaries. Requires a provider — **Ehcache** or **Caffeine** via Hibernate's JCache integration are most common.

```java
@Entity
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class Country {
    // reference data — rarely changes, read often
}
```

```yaml
spring:
  jpa:
    properties:
      hibernate:
        cache:
          use_second_level_cache: true
          region.factory_class: org.hibernate.cache.jcache.JCacheCacheRegionFactory
```

**Cache concurrency strategies:**
| Strategy | Use case |
|----------|----------|
| `READ_ONLY` | Immutable data (country codes, enums) |
| `READ_WRITE` | Mutable data, soft locks during update |
| `NONSTRICT_READ_WRITE` | Rarely updated, stale reads acceptable |
| `TRANSACTIONAL` | JTA environments, full transactional consistency |

L2 is **not appropriate** for entities that change frequently (orders, payments) — cache invalidation overhead exceeds the benefit, and you risk serving stale data.

**Query Cache:**
Caches the **result set** (list of primary keys) for a specific JPQL/HQL query + parameters. When the same query is re-executed with the same parameters, Hibernate returns the IDs from the query cache and resolves entities via L2 (or DB).

```java
TypedQuery<Country> q = em.createQuery("FROM Country", Country.class);
q.setHint("org.hibernate.cacheable", true);
```

Query cache is invalidated whenever ANY entity of the queried type is modified — even if the specific rows queried didn't change. This makes it unsuitable for frequently-updated entities.

**When to use L2:**
Good candidates: reference/lookup data (countries, currencies, configuration, product catalogue), entities that are read far more than written, entities without tight consistency requirements.

Bad candidates: user accounts, orders, financial records, anything requiring real-time accuracy.

:::

> [!TIP] Golden Tip
> Warn about the **bulk update / L1 stale data bug** — most candidates don't know about it. When you do a JPQL bulk UPDATE or DELETE, the L1 cache is NOT invalidated, so subsequent `find()` calls return stale data. The fix is `em.flush()` + `em.clear()` or `em.refresh()` after bulk operations. This is a real production bug that silently serves wrong data.

**Follow-up questions:**
- What happens to the L1 cache after a JPQL bulk update?
- What cache provider would you choose for L2 in a Spring Boot app?
- When is the Query Cache NOT a good idea?
- How do you evict a specific entity from the L2 cache programmatically?

---

## Q37: Optimistic vs Pessimistic Locking

> Locking is critical for concurrent writes. Know when to use each strategy and what `@Version` actually does.

| Strategy | Mechanism | Best for | Cost |
|----------|-----------|----------|------|
| **Optimistic** | `@Version` column — detect conflict at commit | Low contention, mostly reads | Low (no DB locks held) |
| **Pessimistic** | `SELECT FOR UPDATE` — DB-level lock | High contention, must-not-lose writes | Higher (locks held during tx) |

```java
@Entity
public class BankAccount {

    @Version
    private int version;          // Hibernate manages this automatically

    private BigDecimal balance;
}
```

::: details Full model answer

**Optimistic Locking:**
No actual database lock is acquired. Hibernate adds a `version` column (integer or timestamp). On every UPDATE, Hibernate checks:
```sql
UPDATE bank_account
SET balance = ?, version = 2
WHERE id = 1 AND version = 1    ← fails if another transaction already incremented version
```
If `0 rows updated` (version mismatch), Hibernate throws `OptimisticLockException` → Spring translates to `ObjectOptimisticLockingFailureException`.

```java
@Entity
public class Product {

    @Version
    private Long version;

    @Column(nullable = false)
    private int stock;

    public void decrementStock() {
        if (stock <= 0) throw new IllegalStateException("Out of stock");
        stock--;
    }
}
```

**Handling `OptimisticLockException`:**
```java
@Retryable(value = ObjectOptimisticLockingFailureException.class, maxAttempts = 3)
@Transactional
public void reserveProduct(Long id) {
    Product p = productRepo.findById(id).orElseThrow();
    p.decrementStock();
}
```
Spring Retry (`@Retryable`) re-runs the transaction from scratch — re-reads the latest version and retries the update.

**Pessimistic Locking:**
Acquires a real DB lock when reading, preventing concurrent modifications until the transaction commits.

```java
// Spring Data JPA
@Lock(LockModeType.PESSIMISTIC_WRITE)
@Query("SELECT p FROM Product p WHERE p.id = :id")
Optional<Product> findByIdForUpdate(@Param("id") Long id);
```

Generates: `SELECT * FROM product WHERE id = ? FOR UPDATE`

**Lock modes:**
| Mode | SQL | Behaviour |
|------|-----|-----------|
| `PESSIMISTIC_READ` | `FOR SHARE` | Others can read, not write |
| `PESSIMISTIC_WRITE` | `FOR UPDATE` | Exclusive lock — no concurrent reads or writes |
| `PESSIMISTIC_FORCE_INCREMENT` | `FOR UPDATE` + version bump | Acquires lock AND increments `@Version` |

**Optimistic vs Pessimistic — when to use which:**

| Scenario | Recommendation |
|----------|---------------|
| Low contention (most reads, rare conflicts) | Optimistic — no blocking |
| High contention (inventory, seat booking, flash sales) | Pessimistic — prevent wasted work |
| Long-running operations across multiple requests | Optimistic (with version sent to UI) |
| Short transactions with guaranteed atomicity | Pessimistic |
| Microservices / distributed systems | Optimistic (pessimistic locks don't span services) |

**Distributed optimistic locking pattern:**
Pass the `version` to the API client, send it back on update:
```json
GET /products/1 → { "id": 1, "stock": 10, "version": 3 }
PUT /products/1 → { "stock": 9, "version": 3 }  ← server checks version
```
If another request modified the product between GET and PUT, the version mismatch is detected and the client gets a 409 Conflict.

**Deadlock risk with pessimistic locking:**
Two transactions locking entities in opposite order → deadlock. Always acquire locks in a **consistent order** (e.g., always lock by entity ID ascending). Set a pessimistic lock timeout to avoid indefinite blocking:
```java
query.setHint("javax.persistence.lock.timeout", 3000);  // 3 seconds
```

:::

> [!TIP] Golden Tip
> The distributed optimistic locking pattern (returning `version` in the API response) is what most candidates miss. It solves the classic "lost update" problem in REST APIs — client reads a resource, another client modifies it, first client's write silently overwrites the second. Sending the `version` field back with updates and returning 409 on conflict is the correct solution. Also mention `@Retryable` from Spring Retry — it makes optimistic lock retry logic clean and non-intrusive.

**Follow-up questions:**
- What exception is thrown on an optimistic lock conflict and how do you handle it?
- What is a deadlock and how do you prevent it with pessimistic locking?
- How would you implement optimistic locking across a REST API (not just within a single transaction)?
- What is `PESSIMISTIC_FORCE_INCREMENT` used for?
