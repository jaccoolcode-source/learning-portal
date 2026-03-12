---
title: Object Class — equals, hashCode, wait/notify
description: Deep dive into java.lang.Object methods — equals, hashCode, toString, clone, and thread coordination
category: java-core
pageClass: layout-java-core
difficulty: intermediate
tags: [java, equals, hashcode, object, threading]
related:
  - /collections/equals-hashcode
  - /collections/hashmap-internals
  - /java-core/strings
estimatedMinutes: 20
---

# Object Class

<DifficultyBadge level="intermediate" />

Every Java class implicitly extends `java.lang.Object`. Its methods are the building blocks of the Collections framework, caching, threading, and debugging.

---

## Why This Matters

Violating the `equals`/`hashCode` contract is one of the most common bugs in Java — it silently breaks `HashSet`, `HashMap`, and any caching based on object identity.

---

## equals()

`Object.equals()` defaults to **reference equality** (`==`). Override it to define *logical* equality.

### Contract (from the Javadoc)

| Property | Rule |
|----------|------|
| Reflexive | `x.equals(x)` → `true` |
| Symmetric | `x.equals(y)` ↔ `y.equals(x)` |
| Transitive | `x.equals(y) && y.equals(z)` → `x.equals(z)` |
| Consistent | Multiple calls return same result |
| Null-safe | `x.equals(null)` → `false` |

### Correct implementation

```java
public class Point {
    private final int x;
    private final int y;

    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;               // 1. same reference?
        if (!(o instanceof Point other)) return false;  // 2. same type? (pattern match)
        return x == other.x && y == other.y;      // 3. same values?
    }
}
```

::: tip Use `instanceof` with pattern matching (Java 16+)
`if (!(o instanceof Point other)) return false;` — cleaner and null-safe in one step.
:::

---

## hashCode()

### The golden rule

> **If `a.equals(b)` is `true`, then `a.hashCode()` must equal `b.hashCode()`.**

The reverse is NOT required — two objects with the same hash don't have to be equal (that's a **collision**).

### Why it matters for HashMap

`HashMap` uses `hashCode()` to find the bucket, then `equals()` to find the exact key. If `hashCode()` is wrong, the key will never be found even if `equals()` would return `true`.

```java
// BAD: hashCode not overridden → each call returns a different hash
Point p1 = new Point(1, 2);
Point p2 = new Point(1, 2);
Map<Point, String> map = new HashMap<>();
map.put(p1, "origin");

System.out.println(map.get(p2)); // null! (p1.equals(p2) true but hashes differ)
```

### Correct hashCode

```java
@Override
public int hashCode() {
    return Objects.hash(x, y);  // combines fields using prime multiplication
}
```

Under the hood, `Objects.hash` uses the 31-prime formula:
```
result = 31 * result + field.hashCode()
```

Use `31` because it's prime and the JIT can optimise `31 * x` to `(x << 5) - x`.

---

## toString()

Override to produce human-readable output for logging and debugging.

```java
@Override
public String toString() {
    return "Point{x=" + x + ", y=" + y + "}";
}
```

Or use a record (Java 16+) which generates `toString()` automatically:

```java
public record Point(int x, int y) {}
// toString() → Point[x=1, y=2]
```

---

## clone()

`Object.clone()` makes a **shallow copy** — copied references still point to the same objects.

::: warning Prefer copy constructors over clone()
`clone()` has subtle issues (requires `Cloneable` marker, throws checked exception, shallow copy problems). The preferred pattern is a copy constructor or static factory.
:::

```java
// Prefer this:
public Point(Point other) {
    this.x = other.x;
    this.y = other.y;
}
```

---

## wait(), notify(), notifyAll()

These methods coordinate threads sharing a **monitor lock**. They must be called inside a `synchronized` block.

```java
class MessageBus {
    private String message;
    private boolean hasMessage = false;

    public synchronized void produce(String msg) throws InterruptedException {
        while (hasMessage) wait();     // release lock, wait for consumer
        this.message = msg;
        this.hasMessage = true;
        notifyAll();                   // wake up waiting threads
    }

    public synchronized String consume() throws InterruptedException {
        while (!hasMessage) wait();    // release lock, wait for producer
        hasMessage = false;
        notifyAll();
        return message;
    }
}
```

::: danger Always use a loop, not an if
Use `while` instead of `if` before calling `wait()`. Spurious wakeups are possible — always re-check the condition.
:::

| Method | What it does |
|--------|-------------|
| `wait()` | Releases lock, suspends thread until notified |
| `notify()` | Wakes one waiting thread (random) |
| `notifyAll()` | Wakes all waiting threads |

In modern Java, prefer `java.util.concurrent` classes (`ReentrantLock`, `Condition`, `BlockingQueue`) over raw `wait`/`notify`.

---

## Quick Reference

| Method | Default Behaviour | When to Override |
|--------|------------------|-----------------|
| `equals()` | Reference (`==`) | When logical equality matters |
| `hashCode()` | System identity hash | Whenever you override `equals()` |
| `toString()` | `ClassName@hexHash` | Always (for debugging) |
| `clone()` | Shallow copy | Rarely — use copy constructors |
| `wait/notify` | Thread coordination | Use `java.util.concurrent` instead |

---

## Summary

- Always override `equals()` and `hashCode()` together.
- `equals()` must be reflexive, symmetric, transitive, consistent, and null-safe.
- If `a.equals(b)` then `a.hashCode() == b.hashCode()`.
- Use `Objects.hash(field1, field2, ...)` for easy `hashCode` implementations.
- `wait()`/`notify()` require a `synchronized` context and a `while` loop guard.

<RelatedTopics :topics="['/collections/equals-hashcode', '/collections/hashmap-internals', '/java-core/strings']" />
