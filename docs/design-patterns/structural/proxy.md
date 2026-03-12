---
title: Proxy Pattern
description: Provide a surrogate or placeholder for another object to control access — lazy loading, caching, security, AOP
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [proxy, structural, java, design-patterns, aop, spring]
related:
  - /design-patterns/structural/decorator
  - /spring/aop
  - /design-patterns/structural/adapter
estimatedMinutes: 15
---

# Proxy Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Provide a surrogate or placeholder for another object to control access to it.

---

## Types of Proxy

| Type | Purpose |
|------|---------|
| **Virtual proxy** | Lazy initialisation — create expensive object on first use |
| **Protection proxy** | Control access based on permissions |
| **Remote proxy** | Represent an object in a different address space (RMI) |
| **Caching proxy** | Cache results of expensive operations |
| **Logging proxy** | Log calls transparently |
| **AOP proxy** | Cross-cutting concerns (Spring) |

---

## Static Proxy Example

```java
public interface DataService {
    List<String> fetchAll();
    void save(String data);
}

public class DatabaseService implements DataService {
    @Override public List<String> fetchAll() { /* DB query */ return List.of(); }
    @Override public void save(String data)  { /* DB insert */ }
}

// Caching proxy
public class CachingDataServiceProxy implements DataService {
    private final DataService realService;
    private List<String> cache;

    public CachingDataServiceProxy(DataService realService) {
        this.realService = realService;
    }

    @Override
    public List<String> fetchAll() {
        if (cache == null) {
            System.out.println("Cache miss — delegating to real service");
            cache = realService.fetchAll();
        } else {
            System.out.println("Cache hit");
        }
        return cache;
    }

    @Override
    public void save(String data) {
        cache = null; // invalidate cache
        realService.save(data);
    }
}

// Client
DataService service = new CachingDataServiceProxy(new DatabaseService());
service.fetchAll(); // cache miss → DB call
service.fetchAll(); // cache hit
service.save("new");
service.fetchAll(); // cache miss → DB call (cache invalidated)
```

---

## Dynamic Proxy (Java Reflection)

Java's `java.lang.reflect.Proxy` creates proxies at runtime:

```java
public class LoggingHandler implements InvocationHandler {
    private final Object target;

    public LoggingHandler(Object target) { this.target = target; }

    @Override
    public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
        System.out.println("Calling: " + method.getName());
        long start = System.currentTimeMillis();
        Object result = method.invoke(target, args);
        System.out.println("Done in " + (System.currentTimeMillis() - start) + "ms");
        return result;
    }
}

// Create dynamic proxy at runtime
DataService proxy = (DataService) Proxy.newProxyInstance(
    DataService.class.getClassLoader(),
    new Class[]{DataService.class},
    new LoggingHandler(new DatabaseService())
);

proxy.fetchAll(); // logs method call and duration
```

**Requirement:** The target must implement an interface (for JDK dynamic proxies). For classes without interfaces, Spring/Hibernate use **CGLIB** (generates a subclass bytecode).

---

## Spring AOP: Proxy Under the Hood

When you add `@Transactional` or `@Cacheable`:

```java
@Service
public class OrderService {

    @Transactional          // Spring wraps this in a transaction proxy
    public void createOrder(Order order) {
        // ... DB operations
    }

    @Cacheable("orders")    // Spring wraps this in a caching proxy
    public Order findById(Long id) {
        return repository.findById(id).orElseThrow();
    }
}
```

Spring creates a proxy of `OrderService` at startup:
- If `OrderService` implements an interface → JDK dynamic proxy
- If not → CGLIB subclass proxy

The proxy intercepts method calls, runs the cross-cutting logic (begin TX, check cache), then delegates to the real bean.

---

## Proxy vs Decorator

| Aspect | Proxy | Decorator |
|--------|-------|-----------|
| Intent | Control access | Add behaviour |
| Relationship | Same interface | Same interface |
| Creates target? | Often yes (lazy) | Target passed in |
| Examples | AOP, security, lazy-load | I/O streams, filters |

In practice, the line blurs — both wrap an object and implement the same interface.

---

## Summary

- Proxy controls access to an object without the client knowing.
- JDK dynamic proxy works with interfaces; CGLIB works with classes.
- Spring uses proxies to implement `@Transactional`, `@Cacheable`, `@Async`.
- Know the difference between virtual, protection, caching, and logging proxies.

<RelatedTopics :topics="['/design-patterns/structural/decorator', '/spring/aop', '/design-patterns/structural/adapter']" />
