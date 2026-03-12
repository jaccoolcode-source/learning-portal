---
title: Builder Pattern
description: Construct complex objects step by step, separating construction from representation — with Lombok and record alternatives
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [builder, creational, java, lombok, design-patterns]
related:
  - /design-patterns/creational/factory-method
  - /design-patterns/creational/abstract-factory
estimatedMinutes: 15
---

# Builder Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Separate the construction of a complex object from its representation so that the same construction process can create different representations.

---

## Problem

Constructors with many optional parameters become unreadable:

```java
// Telescoping constructor anti-pattern
new Pizza(30, true, false, true, false, true, "tomato", "mozzarella");
// What does 'true' mean at position 4?
```

---

## Classic Builder

```java
public class Pizza {
    private final int size;
    private final boolean cheese;
    private final boolean pepperoni;
    private final boolean mushrooms;
    private final String sauce;

    private Pizza(Builder builder) {
        this.size      = builder.size;
        this.cheese    = builder.cheese;
        this.pepperoni = builder.pepperoni;
        this.mushrooms = builder.mushrooms;
        this.sauce     = builder.sauce;
    }

    // Static nested Builder class
    public static class Builder {
        private final int size;       // required
        private boolean cheese;       // optional
        private boolean pepperoni;
        private boolean mushrooms;
        private String sauce = "tomato"; // default

        public Builder(int size) { this.size = size; }

        public Builder cheese()        { this.cheese = true; return this; }
        public Builder pepperoni()     { this.pepperoni = true; return this; }
        public Builder mushrooms()     { this.mushrooms = true; return this; }
        public Builder sauce(String s) { this.sauce = s; return this; }

        public Pizza build() { return new Pizza(this); }
    }
}

// Usage — readable, self-documenting
Pizza pizza = new Pizza.Builder(30)
    .cheese()
    .pepperoni()
    .sauce("bbq")
    .build();
```

---

## Lombok @Builder

```java
import lombok.Builder;
import lombok.Value;

@Value  // immutable + equals/hashCode/toString
@Builder(toBuilder = true)
public class HttpRequest {
    String method;
    String url;
    Map<String, String> headers;
    String body;
    Duration timeout;
}

// Usage
HttpRequest req = HttpRequest.builder()
    .method("GET")
    .url("https://api.example.com/users")
    .timeout(Duration.ofSeconds(10))
    .build();

// Modify existing (toBuilder)
HttpRequest post = req.toBuilder()
    .method("POST")
    .body("{\"name\":\"Alice\"}")
    .build();
```

---

## Java Records with Builder (Java 16+)

Records are immutable but have a compact constructor. For complex creation, add a builder factory:

```java
public record Config(String host, int port, boolean ssl, Duration timeout) {

    public static Builder builder() { return new Builder(); }

    public static class Builder {
        private String host = "localhost";
        private int port = 8080;
        private boolean ssl = false;
        private Duration timeout = Duration.ofSeconds(30);

        public Builder host(String h)       { this.host = h; return this; }
        public Builder port(int p)          { this.port = p; return this; }
        public Builder ssl()                { this.ssl = true; return this; }
        public Builder timeout(Duration d)  { this.timeout = d; return this; }

        public Config build() { return new Config(host, port, ssl, timeout); }
    }
}
```

---

## Real-World Examples

- `StringBuilder` / `StringJoiner` — classic builder concept
- `UriComponentsBuilder` (Spring) — build URIs step by step
- Lombok `@Builder`
- `RestAssured` / `MockMvc` test fluent APIs
- `ProcessBuilder` — configure and start OS processes
- `Locale.Builder` — construct locale with optional fields

---

## When to Use

- Class has many optional parameters
- Object construction requires multiple steps
- Want to enforce immutability (build once, then read-only)
- Need different representations of the same object

---

## Summary

- Builder solves the "telescoping constructor" anti-pattern.
- Fluent interface (method chaining) makes usage self-documenting.
- Use Lombok `@Builder` for zero boilerplate in production code.
- Records can be combined with a static Builder class.

<RelatedTopics :topics="['/design-patterns/creational/factory-method', '/design-patterns/creational/prototype']" />
