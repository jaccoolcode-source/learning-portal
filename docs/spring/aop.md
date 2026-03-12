---
title: AOP — Aspect-Oriented Programming
description: Spring AOP concepts — Advice, Pointcut, JoinPoint, Aspect — and how @Transactional, @Cacheable use it
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, aop, aspect, advice, pointcut, transactional, cacheable]
related:
  - /spring/ioc-di
  - /spring/bean-lifecycle
  - /design-patterns/structural/proxy
estimatedMinutes: 20
---

# AOP — Aspect-Oriented Programming

<DifficultyBadge level="intermediate" />

AOP lets you add cross-cutting concerns (logging, transactions, security, caching) to methods without modifying their code. Spring implements AOP via dynamic proxies.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **Aspect** | A class that encapsulates a cross-cutting concern |
| **Advice** | The action taken at a join point (what to do) |
| **Join Point** | A point in the execution (method call, exception) |
| **Pointcut** | An expression that selects join points (where to act) |
| **Weaving** | Applying aspects to target objects (Spring: runtime via proxy) |
| **AOP Proxy** | The object created by Spring to implement the aspect |

---

## Advice Types

| Type | When it runs | Annotation |
|------|-------------|-----------|
| Before | Before the method | `@Before` |
| After Returning | After successful return | `@AfterReturning` |
| After Throwing | After an exception is thrown | `@AfterThrowing` |
| After (Finally) | After any outcome | `@After` |
| Around | Before AND after, controls execution | `@Around` |

---

## Creating an Aspect

```java
@Aspect
@Component
public class LoggingAspect {

    // Pointcut: all methods in service layer
    @Pointcut("execution(* com.example.service.*.*(..))")
    public void serviceLayer() {}

    // Before advice
    @Before("serviceLayer()")
    public void logBefore(JoinPoint jp) {
        System.out.println("Calling: " + jp.getSignature().getName()
            + " with args: " + Arrays.toString(jp.getArgs()));
    }

    // After returning advice — captures the return value
    @AfterReturning(pointcut = "serviceLayer()", returning = "result")
    public void logAfter(JoinPoint jp, Object result) {
        System.out.println("Returned: " + result);
    }

    // After throwing advice — captures the exception
    @AfterThrowing(pointcut = "serviceLayer()", throwing = "ex")
    public void logException(JoinPoint jp, Exception ex) {
        System.out.println("Exception in " + jp.getSignature() + ": " + ex.getMessage());
    }
}
```

---

## @Around Advice (Most Powerful)

Around advice wraps the method — it can modify arguments, return value, swallow exceptions.

```java
@Aspect
@Component
public class TimingAspect {

    @Around("@annotation(com.example.Timed)")  // any method with @Timed annotation
    public Object measureTime(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();
        try {
            Object result = pjp.proceed(); // call the actual method
            long elapsed = System.currentTimeMillis() - start;
            System.out.println(pjp.getSignature().getName() + " took " + elapsed + "ms");
            return result;
        } catch (Exception e) {
            System.out.println("Failed after " + (System.currentTimeMillis() - start) + "ms");
            throw e;
        }
    }
}
```

---

## Pointcut Expressions

```java
// All methods in package
"execution(* com.example.service.*.*(..))"

// Specific method
"execution(* com.example.OrderService.placeOrder(..)"

// Methods returning a type
"execution(java.util.List com.example..*.*(..))"

// Methods with specific annotation
"@annotation(org.springframework.transaction.annotation.Transactional)"

// Methods in a class with annotation
"@within(org.springframework.stereotype.Service)"

// Combines with && || !
"execution(* com.example.service.*.*(..)) && !execution(* com.example.service.*.get*(..))"
```

---

## @Transactional Under the Hood

```java
@Service
public class OrderService {
    @Transactional
    public void placeOrder(Order order) {
        orderRepo.save(order);
        inventoryService.reduce(order);
        // If exception here → rollback
    }
}
```

Spring replaces `OrderService` with a proxy. When `placeOrder()` is called:

```
1. Proxy intercepts call
2. Proxy opens transaction (BEGIN)
3. Delegates to real OrderService.placeOrder()
4a. No exception → COMMIT
4b. RuntimeException → ROLLBACK
5. Returns result to caller
```

::: warning @Transactional only works on public methods
Proxies intercept method calls from outside the bean. Calling `@Transactional` methods from within the same class bypasses the proxy — no transaction!

```java
@Service
public class OrderService {
    @Transactional
    public void placeOrder(Order o) { ... }

    public void processOrders(List<Order> orders) {
        for (Order o : orders) {
            placeOrder(o); // ← bypasses proxy! No individual transactions!
        }
    }
}
```
Fix: inject self (`@Autowired OrderService self`) or move `processOrders` to another bean.
:::

---

## @Cacheable

```java
@Service
public class ProductService {
    @Cacheable(value = "products", key = "#id")
    public Product findById(Long id) {
        return productRepo.findById(id).orElseThrow(); // only called on cache miss
    }

    @CacheEvict(value = "products", key = "#product.id")
    public void update(Product product) {
        productRepo.save(product);
        // Cache entry for this product is removed
    }

    @CachePut(value = "products", key = "#product.id")
    public Product save(Product product) {
        return productRepo.save(product);
        // Always executes AND updates cache
    }
}
```

Requires a `CacheManager` bean (e.g., `CaffeineCacheManager`, `RedisCacheManager`).

---

## AOP Proxy Limitations

| Limitation | Explanation |
|-----------|-------------|
| **Internal calls bypass proxy** | `this.method()` doesn't go through proxy |
| **Only public methods** | JDK proxies only intercept interface methods |
| **Private/final classes** | CGLIB can't proxy `final` classes |

---

## Summary

- AOP separates cross-cutting concerns from business logic.
- Spring uses runtime proxies (JDK or CGLIB) for weaving.
- `@Around` advice is the most powerful — it controls method execution.
- `@Transactional` is AOP — it creates a proxy that begins/commits/rolls back transactions.
- Internal calls bypass the proxy — a critical pitfall.

<RelatedTopics :topics="['/spring/ioc-di', '/spring/bean-lifecycle', '/design-patterns/structural/proxy']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
