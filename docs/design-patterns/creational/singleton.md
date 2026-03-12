---
title: Singleton Pattern
description: Ensure a class has only one instance with a global access point — implementations, thread safety, and pitfalls
category: design-patterns
pageClass: layout-design-patterns
difficulty: beginner
tags: [singleton, creational, java, thread-safety]
related:
  - /design-patterns/creational/factory-method
  - /spring/bean-scopes
estimatedMinutes: 15
---

# Singleton Pattern

<DifficultyBadge level="beginner" />

**Intent:** Ensure a class has only one instance, and provide a global access point to it.

---

## Problem

Some resources should have exactly one instance shared across the application: logging, configuration, connection pools, thread pools.

---

## Implementations

### 1. Eager Initialisation (Thread-safe, simple)

```java
public class ConfigManager {
    // Created once when class is loaded — thread-safe by JVM class loading guarantee
    private static final ConfigManager INSTANCE = new ConfigManager();

    private ConfigManager() {
        loadConfig();
    }

    public static ConfigManager getInstance() {
        return INSTANCE;
    }

    private void loadConfig() { /* read config files */ }
}
```

**Pro:** Simple, thread-safe. **Con:** Created even if never used.

### 2. Lazy Initialisation — double-checked locking (Thread-safe)

```java
public class DatabasePool {
    // volatile prevents instruction reordering
    private static volatile DatabasePool instance;

    private DatabasePool() { /* init pool */ }

    public static DatabasePool getInstance() {
        if (instance == null) {                    // 1st check (no lock)
            synchronized (DatabasePool.class) {
                if (instance == null) {            // 2nd check (inside lock)
                    instance = new DatabasePool();
                }
            }
        }
        return instance;
    }
}
```

**Why double-checked?** The first `if` avoids acquiring the lock for every call. The second `if` prevents two threads from both seeing `null` and both creating an instance. `volatile` ensures visibility.

### 3. Enum Singleton (Best approach)

```java
public enum AppConfig {
    INSTANCE;

    private final Properties props = new Properties();

    public String get(String key) { return props.getProperty(key); }
}

// Usage
AppConfig.INSTANCE.get("db.url");
```

**Why best?** Thread-safe by JVM spec, serialisation-safe, reflection-safe, concise.

### 4. Initialisation-on-Demand (Bill Pugh pattern)

```java
public class Logger {
    private Logger() {}

    // Inner class is not loaded until getInstance() is called
    private static class Holder {
        private static final Logger INSTANCE = new Logger();
    }

    public static Logger getInstance() {
        return Holder.INSTANCE;
    }
}
```

**Lazy** (inner class loads on demand) + **thread-safe** (class loading is synchronised by JVM).

---

## When to Use

- Configuration/settings object
- Logger (though SLF4J/Logback handle this)
- Connection pool manager
- Thread pools
- Caches

---

## Pitfalls

::: warning Singleton anti-patterns
- **Hidden dependencies** — callers can't see what a class depends on (breaks DI)
- **Hard to test** — global state makes unit testing difficult
- **Violated SRP** — manages its own lifecycle
- **Not truly single in distributed systems** — each JVM has its own Singleton
:::

**In Spring**, prefer Spring-managed beans (default scope = singleton) over manual Singletons. Spring gives you lifecycle management, dependency injection, and testability.

---

## Spring's Singleton Bean vs. Java Singleton

| Aspect | Java Singleton | Spring Singleton Bean |
|--------|---------------|----------------------|
| Scope | Per JVM (ClassLoader) | Per `ApplicationContext` |
| Thread safety | Must implement manually | Must implement manually |
| Testability | Hard (global state) | Easy (inject mock context) |
| Lifecycle | Manual | Managed (`@PostConstruct`, etc.) |

---

## Summary

- Singleton ensures one instance; enum singleton is the cleanest approach.
- Use double-checked locking with `volatile` for lazy thread-safe init.
- Prefer Spring-managed singletons over manual Singleton pattern.

<RelatedTopics :topics="['/spring/bean-scopes', '/design-patterns/creational/factory-method']" />
