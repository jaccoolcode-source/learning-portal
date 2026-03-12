---
title: Strings & Immutability
description: Why Strings are immutable in Java, how the String pool works, intern(), and when to use StringBuilder vs StringBuffer
category: java-core
pageClass: layout-java-core
difficulty: intermediate
tags: [java, string, immutability, string-pool, stringbuilder]
related:
  - /java-core/object-class
  - /java-memory/jvm-structure
  - /modern-java/java8
estimatedMinutes: 15
---

# Strings & Immutability

<DifficultyBadge level="intermediate" />

Strings are the most used class in Java. Understanding their internal design explains a class of bugs and performance pitfalls that show up in nearly every application.

---

## Why Are Strings Immutable?

Java designers made `String` immutable (all fields `final`, no mutating methods) for three reasons:

| Reason | Explanation |
|--------|-------------|
| **Thread safety** | An immutable object can be shared freely between threads — no synchronisation needed |
| **String pool** | The JVM can deduplicate string literals because they will never change |
| **Security** | Class names, file paths, and DB connection strings can't be modified after validation |

```java
String s = "hello";
s.toUpperCase();         // returns NEW String, s is unchanged
System.out.println(s);  // "hello" — original untouched
s = s.toUpperCase();    // reassign reference, not mutation
```

---

## The String Pool (String Intern Pool)

String literals are stored in a special area of the heap called the **String Pool** (part of the heap since Java 7; previously PermGen).

```java
String a = "Java";       // stored in pool
String b = "Java";       // same reference from pool
String c = new String("Java"); // new heap object, NOT from pool

System.out.println(a == b);     // true  (same pool reference)
System.out.println(a == c);     // false (c is a new object)
System.out.println(a.equals(c));// true  (same content)
```

::: warning Never use == to compare Strings
Always use `.equals()`. The `==` operator checks reference equality (same object in memory), not content.
:::

---

## intern()

`String.intern()` adds a string to the pool (or returns the existing pooled string if it exists).

```java
String c = new String("Java");
String d = c.intern();          // returns pool reference

System.out.println(a == d);     // true — d is now the pool reference
```

Use `intern()` carefully — overuse can pollute the pool. It's mainly relevant when creating many strings dynamically that are likely to be the same value.

---

## String Concatenation Performance

### ❌ Naive concatenation in a loop

```java
String result = "";
for (int i = 0; i < 10_000; i++) {
    result += i; // creates a new String object every iteration!
}
```

At compile time, the `+` operator becomes `new StringBuilder(result).append(i).toString()` — so you're creating 10,000 throwaway objects.

### ✅ Use StringBuilder

```java
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 10_000; i++) {
    sb.append(i);
}
String result = sb.toString();
```

::: tip Compiler optimises single-statement concatenation
`String s = "Hello " + name + "!";` is optimised by the compiler to a single `StringBuilder` chain. The loop case is NOT optimised.
:::

---

## StringBuilder vs StringBuffer

| Feature | `StringBuilder` | `StringBuffer` |
|---------|-----------------|---------------|
| Thread-safe | No | Yes (synchronised) |
| Performance | Faster | Slower |
| Use case | Single-threaded (99% of cases) | Legacy or multi-threaded string building |

**Use `StringBuilder` by default.** `StringBuffer`'s synchronisation overhead is rarely worth it — if you need thread safety, there are better tools (`StringJoiner`, structured concurrency, etc.).

---

## String Methods Cheat Sheet

```java
String s = "  Hello, World!  ";

s.trim()                    // "Hello, World!" — removes leading/trailing whitespace
s.strip()                   // same, but Unicode-aware (Java 11+)
s.toLowerCase()             // "  hello, world!  "
s.toUpperCase()             // "  HELLO, WORLD!  "
s.contains("World")         // true
s.startsWith("  Hello")     // true
s.substring(7, 12)          // "World"
s.replace("World", "Java")  // "  Hello, Java!  "
s.split(", ")               // ["  Hello", "World!  "]
s.strip().isEmpty()         // false
s.isBlank()                 // false (Java 11+)
"".isEmpty()                // true
"  ".isBlank()              // true

// String.format vs formatted (Java 15+)
String.format("Hello, %s!", "World")
"Hello, %s!".formatted("World")  // Java 15+

// Join
String.join(", ", "a", "b", "c")  // "a, b, c"
```

---

## Strings in switch (Java 7+)

```java
String command = "START";
switch (command) {
    case "START" -> System.out.println("Starting...");
    case "STOP"  -> System.out.println("Stopping...");
    default      -> System.out.println("Unknown command");
}
```

Internally, the compiler uses `hashCode()` then `equals()` for the match — efficient and null-safe (passing `null` throws `NullPointerException`).

---

## Quick Reference

| Concept | Key Point |
|---------|----------|
| Immutability | String fields are `final`; methods return new Strings |
| String pool | Literals are shared; `new String()` bypasses pool |
| `==` vs `.equals()` | `==` → reference, `.equals()` → content |
| `intern()` | Forces pool storage for heap Strings |
| Concatenation | Use `StringBuilder` in loops |
| `StringBuilder` vs `StringBuffer` | Prefer `StringBuilder` (not thread-safe but faster) |

---

## Summary

- Strings are immutable for thread safety, security, and pool efficiency.
- The String pool deduplicates literals; `new String()` creates a separate heap object.
- Use `.equals()` to compare content — never `==`.
- `StringBuilder` is the right tool for building strings in loops.

<RelatedTopics :topics="['/java-core/object-class', '/java-memory/jvm-structure', '/modern-java/java8']" />
