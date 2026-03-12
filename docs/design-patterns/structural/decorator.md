---
title: Decorator Pattern
description: Attach additional responsibilities to objects dynamically — Java I/O streams, Spring Security filters
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [decorator, structural, java, design-patterns, composition]
related:
  - /design-patterns/structural/proxy
  - /design-patterns/structural/adapter
  - /design-patterns/structural/composite
estimatedMinutes: 15
---

# Decorator Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Attach additional responsibilities to an object dynamically. Decorators provide a flexible alternative to subclassing for extending functionality.

---

## Problem

You need to add behaviour to objects without modifying their class — and the behaviour combinations should be flexible at runtime, not hardcoded in a class hierarchy.

---

## Java Example: Coffee Shop

```java
// Component interface
public interface Coffee {
    String getDescription();
    double getCost();
}

// Concrete Component
public class SimpleCoffee implements Coffee {
    @Override public String getDescription() { return "Coffee"; }
    @Override public double getCost() { return 1.00; }
}

// Abstract Decorator — wraps a Coffee, delegates by default
public abstract class CoffeeDecorator implements Coffee {
    protected final Coffee wrapped;
    public CoffeeDecorator(Coffee coffee) { this.wrapped = coffee; }

    @Override public String getDescription() { return wrapped.getDescription(); }
    @Override public double getCost() { return wrapped.getCost(); }
}

// Concrete Decorators
public class MilkDecorator extends CoffeeDecorator {
    public MilkDecorator(Coffee c) { super(c); }
    @Override public String getDescription() { return super.getDescription() + ", Milk"; }
    @Override public double getCost() { return super.getCost() + 0.25; }
}

public class SugarDecorator extends CoffeeDecorator {
    public SugarDecorator(Coffee c) { super(c); }
    @Override public String getDescription() { return super.getDescription() + ", Sugar"; }
    @Override public double getCost() { return super.getCost() + 0.10; }
}

public class WhipDecorator extends CoffeeDecorator {
    public WhipDecorator(Coffee c) { super(c); }
    @Override public String getDescription() { return super.getDescription() + ", Whip"; }
    @Override public double getCost() { return super.getCost() + 0.50; }
}

// Usage — compose at runtime
Coffee order = new WhipDecorator(new MilkDecorator(new SugarDecorator(new SimpleCoffee())));
System.out.println(order.getDescription()); // Coffee, Sugar, Milk, Whip
System.out.println(order.getCost());        // 1.85
```

---

## Decorator in Java I/O

The classic Java I/O library is built on decorators:

```java
// Each layer adds behaviour:
InputStream raw         = new FileInputStream("data.txt");
InputStream buffered    = new BufferedInputStream(raw);       // adds buffering
InputStream counted     = new CountingInputStream(buffered);  // counts bytes
Reader charReader       = new InputStreamReader(buffered, StandardCharsets.UTF_8); // charset conversion
Reader lineReader       = new BufferedReader(charReader);     // adds readLine()
```

Every `FilterInputStream` / `FilterReader` is a decorator.

---

## Decorator in Spring Security

Spring Security's filter chain is a decorator chain:

```
Request → LoggingFilter → AuthenticationFilter → AuthorizationFilter → YourController
```

Each filter wraps the next and adds a cross-cutting concern.

---

## Decorator vs Inheritance

| Aspect | Inheritance | Decorator |
|--------|------------|-----------|
| Extensibility | Compile-time only | Runtime composition |
| Combinations | Exponential class explosion | O(n) classes |
| Coupling | Tight | Loose |
| When | Stable, few variants | Many optional combinations |

---

## Summary

- Decorator wraps an object and adds behaviour without modifying its class.
- Stacks of decorators compose at runtime — flexible and avoids class explosion.
- The Java I/O library is the canonical example.
- Used in Spring Security filters, logging wrappers, and caching layers.

<RelatedTopics :topics="['/design-patterns/structural/proxy', '/design-patterns/structural/composite', '/spring/aop']" />
