---
title: equals & hashCode Contract
description: The equals/hashCode contract, common violations, IDE-generated vs manual implementations, and using Objects.hash
category: collections
pageClass: layout-collections
difficulty: intermediate
tags: [java, equals, hashcode, contract, collections]
related:
  - /java-core/object-class
  - /collections/hashmap-internals
estimatedMinutes: 15
---

# equals & hashCode Contract

<DifficultyBadge level="intermediate" />

The `equals`/`hashCode` contract is the most critical rule in Java's Collections framework. Breaking it causes bugs that are extremely hard to diagnose.

---

## The Contract

From the `Object` Javadoc:

1. **If `a.equals(b)` is `true`, then `a.hashCode() == b.hashCode()` must also be true.**
2. The reverse does NOT hold: equal hashes don't require equal objects (that's a collision).
3. `equals()` must be reflexive, symmetric, transitive, consistent, and null-safe.
4. `hashCode()` must be consistent — same value for same object across multiple calls (within a JVM session).

---

## Why They Must Be Overridden Together

```
HashMap lookup flow:
  1. Compute hash(key)
  2. Find bucket: index = hash & (capacity - 1)
  3. In bucket, compare: hash == entry.hash && key.equals(entry.key)

If hashCode() is correct but equals() isn't → wrong key matches
If equals() is correct but hashCode() isn't → key lands in wrong bucket → not found
```

---

## Common Mistake: Override equals, Forget hashCode

```java
public class Employee {
    private String id;
    private String name;

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Employee e)) return false;
        return id.equals(e.id);
    }
    // hashCode() NOT overridden — inherits Object's identity hash!
}

Employee e1 = new Employee("E001", "Alice");
Employee e2 = new Employee("E001", "Bob");

System.out.println(e1.equals(e2));  // true  (same id)

Set<Employee> set = new HashSet<>();
set.add(e1);
set.contains(e2);  // false! — different hashCodes → different buckets
```

---

## Correct Implementation

### Using `Objects.hash()` (recommended)

```java
public class Employee {
    private final String id;
    private final String name;
    private final int departmentId;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Employee e)) return false;
        return departmentId == e.departmentId
            && Objects.equals(id, e.id)
            && Objects.equals(name, e.name);
    }

    @Override
    public int hashCode() {
        return Objects.hash(id, name, departmentId);
    }
}
```

`Objects.hash()` uses the 31-prime formula internally:
```java
// Equivalent to:
int result = 1;
result = 31 * result + Objects.hashCode(id);
result = 31 * result + Objects.hashCode(name);
result = 31 * result + departmentId;
```

Why 31? It's prime (reduces collisions) and `31 * x = (x << 5) - x` is JIT-optimisable.

### Using Java Records (automatic)

Records auto-generate correct `equals`, `hashCode`, and `toString`:

```java
public record Point(int x, int y) {}

Point p1 = new Point(1, 2);
Point p2 = new Point(1, 2);
p1.equals(p2);    // true
p1.hashCode() == p2.hashCode(); // true
```

---

## Dealing with Nullable Fields

```java
// Objects.equals handles null safely
Objects.equals(null, null)    // true
Objects.equals("a", null)     // false
Objects.equals(null, "a")     // false
Objects.equals("a", "a")      // true

// Objects.hashCode handles null (returns 0 for null)
Objects.hashCode(null)        // 0
Objects.hashCode("hello")     // "hello".hashCode()
```

---

## Using Only Some Fields

You may choose to use only *some* fields in `equals`/`hashCode`. The rule: use **the same set of fields** in both methods.

```java
// Business key: only ID matters for equality
@Override
public boolean equals(Object o) {
    if (!(o instanceof Customer c)) return false;
    return Objects.equals(id, c.id);
}

@Override
public int hashCode() {
    return Objects.hash(id); // same field — correct!
}
```

::: warning Do not use mutable fields in hashCode
If an object is stored in a `HashSet` or as a `HashMap` key and you then mutate a field that's part of `hashCode`, the object will be in the wrong bucket and can never be found. Use only **immutable** fields, or don't mutate objects used as keys.
:::

---

## IDE Generation vs Manual

Most IDEs (IntelliJ, Eclipse) can generate `equals`/`hashCode`. The output is correct but verbose. Prefer:

1. **Records** (Java 16+) — automatic, zero boilerplate
2. **`Objects.hash()` + `Objects.equals()`** — clean, null-safe
3. **Lombok `@EqualsAndHashCode`** — annotation-based generation
4. **IDE-generated** — correct but verbose

---

## Symmetric equals: Subclass Pitfall

```java
public class Point {
    protected int x, y;

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof Point p)) return false;
        return x == p.x && y == p.y;
    }
}

public class ColorPoint extends Point {
    private String color;

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof ColorPoint cp)) return false;
        return super.equals(cp) && color.equals(cp.color);
    }
}

Point p = new Point(1, 2);
ColorPoint cp = new ColorPoint(1, 2, "red");

p.equals(cp);  // true (Point.equals ignores color)
cp.equals(p);  // false (ColorPoint.equals requires ColorPoint)
// VIOLATION: symmetry broken!
```

The clean solution: use composition over inheritance, or seal the class hierarchy.

---

## Quick Reference

| Rule | Detail |
|------|--------|
| Equal objects → equal hashes | Mandatory |
| Equal hashes → equal objects? | No (just a collision) |
| Fields in equals/hashCode | Use the same fields in both |
| Mutable fields as keys | Dangerous — avoid |
| Null-safe equals | Use `Objects.equals()` |
| Best approach | Records > `Objects.hash()` > IDE-generated |

---

## Summary

- Override `hashCode()` whenever you override `equals()` — always.
- Use `Objects.hash(field1, field2, ...)` for clean implementations.
- Never use mutable fields in `hashCode()` for objects used as Map keys or Set elements.
- Records (Java 16+) give you correct implementations for free.

<RelatedTopics :topics="['/java-core/object-class', '/collections/hashmap-internals', '/collections/implementations']" />

[→ Take the Collections Quiz](/quizzes/collections-quiz)
