---
title: Bean Scopes
description: Spring bean scopes — Singleton, Prototype, Request, Session, Application — when to use each and scope mismatches
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, bean-scopes, singleton, prototype, request, session]
related:
  - /spring/bean-lifecycle
  - /spring/ioc-di
estimatedMinutes: 15
---

# Bean Scopes

<DifficultyBadge level="intermediate" />

Bean scope determines how many instances Spring creates and how long they live. Choosing the wrong scope causes subtle bugs — especially the "scope mismatch" problem.

---

## Scope Overview

| Scope | Instances | Lifetime | Context |
|-------|----------|---------|---------|
| `singleton` | 1 per `ApplicationContext` | Until context closes | All |
| `prototype` | New for each request | Until GC | All |
| `request` | 1 per HTTP request | Until request ends | Web |
| `session` | 1 per HTTP session | Until session expires | Web |
| `application` | 1 per `ServletContext` | Until app stops | Web |

---

## Singleton (Default)

One bean instance shared across the entire application context. Every `@Autowired` injects the same object.

```java
@Component
// @Scope("singleton") — this is the default, no annotation needed
public class OrderService {
    // One instance for the entire application
}
```

::: warning Singleton beans must be thread-safe
Multiple threads use the same instance simultaneously. Avoid storing mutable state in singleton fields.

```java
// BAD — mutable state in singleton
@Service
public class ReportService {
    private List<String> currentReportLines; // ← shared between all requests!
}

// GOOD — local variable
@Service
public class ReportService {
    public Report generate(ReportRequest req) {
        List<String> lines = new ArrayList<>(); // ← per-call scope
        // ...
    }
}
```
:::

---

## Prototype

New instance created every time the bean is requested from the container.

```java
@Component
@Scope("prototype")
public class EmailBuilder {
    private String to;
    private String subject;
    private String body;

    // Each injection / getBean() call creates a fresh instance
    public EmailBuilder to(String to)      { this.to = to; return this; }
    public EmailBuilder subject(String s)  { this.subject = s; return this; }
    public EmailBuilder body(String b)     { this.body = b; return this; }
    public Email build()                   { return new Email(to, subject, body); }
}
```

**When to use prototype:**
- Stateful objects that should not be shared
- Objects used briefly then discarded
- Connection objects, builder objects, user sessions (in non-web contexts)

---

## Request Scope (Web Only)

One instance per HTTP request. Different requests get different instances.

```java
@Component
@RequestScope  // shorthand for @Scope(value = "request", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class RequestContext {
    private String userId;
    private String traceId = UUID.randomUUID().toString();

    public void setUserId(String id) { this.userId = id; }
    public String getUserId() { return userId; }
    public String getTraceId() { return traceId; }
}

@Service
public class AuditService {
    @Autowired RequestContext context; // gets the current request's instance

    public void log(String action) {
        System.out.println(context.getTraceId() + " | " + context.getUserId() + " | " + action);
    }
}
```

---

## Session Scope (Web Only)

One instance per HTTP session. Persists across multiple requests from the same user.

```java
@Component
@SessionScope
public class ShoppingCart {
    private final List<CartItem> items = new ArrayList<>();

    public void add(CartItem item) { items.add(item); }
    public List<CartItem> getItems() { return Collections.unmodifiableList(items); }
    public void clear() { items.clear(); }
}
```

---

## The Scope Mismatch Problem

**Problem:** Injecting a shorter-lived bean into a longer-lived bean.

```java
// Singleton service injecting a prototype bean — PROBLEM!
@Service  // singleton
public class ReportService {
    @Autowired
    private ReportBuilder builder; // prototype — but only injected ONCE at startup!
    // All calls will use the same ReportBuilder instance — defeats the purpose!
}
```

### Solutions

**Option 1: Inject ApplicationContext and call getBean()**

```java
@Service
public class ReportService {
    @Autowired
    private ApplicationContext ctx;

    public Report generate() {
        ReportBuilder builder = ctx.getBean(ReportBuilder.class); // fresh each time
        return builder.build();
    }
}
```

**Option 2: Use scoped proxy (recommended)**

```java
@Component
@Scope(value = "prototype", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class ReportBuilder { ... }

@Service
public class ReportService {
    @Autowired
    private ReportBuilder builder; // actually a proxy; each call creates new instance
}
```

The proxy delegates every method call to a fresh `ReportBuilder` instance.

**Option 3: Provider (JSR-330)**

```java
@Service
public class ReportService {
    @Autowired
    private Provider<ReportBuilder> builderProvider;

    public Report generate() {
        return builderProvider.get().build(); // new instance each time
    }
}
```

---

## Quick Reference

| Scenario | Scope |
|----------|-------|
| Stateless service (most services) | Singleton |
| Stateful, per-call | Prototype |
| Per HTTP request | Request |
| Per user session | Session |
| Application-wide singleton | Application (or just Singleton) |

---

## Summary

- Default scope is singleton — one instance per ApplicationContext.
- Prototype creates a new instance every time the bean is needed.
- Scope mismatch (singleton depending on prototype/request) requires scoped proxies or `Provider<T>`.
- Singleton beans must be thread-safe.

<RelatedTopics :topics="['/spring/bean-lifecycle', '/spring/ioc-di', '/spring/qualifiers']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
