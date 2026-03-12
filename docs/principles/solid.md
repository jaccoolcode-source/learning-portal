---
title: SOLID Principles
description: All five SOLID design principles explained with practical Java examples, violations, and fixes
category: principles
pageClass: layout-principles
difficulty: intermediate
tags: [solid, srp, ocp, lsp, isp, dip, java, design]
related:
  - /principles/oop
  - /design-patterns/
  - /spring/ioc-di
estimatedMinutes: 30
quizLink: /quizzes/solid-quiz
---

# SOLID Principles

<DifficultyBadge level="intermediate" />

SOLID is a set of five object-oriented design principles coined by Robert C. Martin. They guide you towards code that is **easy to change, test, and extend**.

---

## S — Single Responsibility Principle

> *"A class should have only one reason to change."*

Each class should do one thing. If a class changes for two different reasons, it has two responsibilities.

### ❌ Violation

```java
public class Report {
    public String generateContent() { /* ... */ }
    public void saveToFile(String path) { /* ... */ }   // IO responsibility
    public void sendByEmail(String to) { /* ... */ }   // email responsibility
}
```

### ✅ Fixed

```java
public class Report {
    public String generateContent() { /* ... */ }
}

public class ReportSaver {
    public void save(Report r, String path) { /* ... */ }
}

public class ReportEmailer {
    public void send(Report r, String to) { /* ... */ }
}
```

::: tip Heuristic
If you need the word "and" to describe what a class does, it probably has more than one responsibility.
:::

---

## O — Open/Closed Principle

> *"Classes should be open for extension but closed for modification."*

Add new behaviour by adding new code — not by editing existing, tested code.

### ❌ Violation — switch on type

```java
public class AreaCalculator {
    public double calculate(Object shape) {
        if (shape instanceof Circle c)
            return Math.PI * c.radius() * c.radius();
        else if (shape instanceof Rectangle r)
            return r.width() * r.height();
        // add Triangle? Modify this class!
        return 0;
    }
}
```

### ✅ Fixed — polymorphism

```java
public interface Shape {
    double area();
}

public record Circle(double radius) implements Shape {
    public double area() { return Math.PI * radius * radius; }
}

public record Rectangle(double width, double height) implements Shape {
    public double area() { return width * height; }
}

// Adding Triangle = new class, zero changes to AreaCalculator
public class AreaCalculator {
    public double calculate(Shape shape) { return shape.area(); }
}
```

---

## L — Liskov Substitution Principle

> *"Subtypes must be substitutable for their base types without altering correctness."*

Every subclass should be usable wherever the parent class is expected. If you need an `instanceof` check, LSP is likely violated.

### ❌ Violation — Square extends Rectangle

```java
public class Rectangle {
    protected int width, height;

    public void setWidth(int w)  { width = w; }
    public void setHeight(int h) { height = h; }
    public int area()            { return width * height; }
}

public class Square extends Rectangle {
    @Override
    public void setWidth(int w)  { width = height = w; }  // ⚠️ breaks rectangle contract
    @Override
    public void setHeight(int h) { width = height = h; }
}

// This breaks for Square!
Rectangle r = new Square();
r.setWidth(5);
r.setHeight(4);
System.out.println(r.area()); // Expected 20, got 16
```

### ✅ Fixed — separate interfaces

```java
public interface Shape { int area(); }

public class Rectangle implements Shape {
    private int width, height;
    // setters independent
    public int area() { return width * height; }
}

public class Square implements Shape {
    private int side;
    public int area() { return side * side; }
}
```

::: warning LSP in practice
Pre-conditions in overridden methods must be ≤ parent's. Post-conditions must be ≥ parent's. Invariants must be preserved. If a subclass throws where the parent doesn't, that's an LSP violation.
:::

---

## I — Interface Segregation Principle

> *"Clients should not be forced to depend on interfaces they do not use."*

Fat interfaces force implementors to provide methods they don't need (often throwing `UnsupportedOperationException`).

### ❌ Violation — fat interface

```java
public interface Worker {
    void work();
    void eat();    // robots don't eat!
    void sleep();  // robots don't sleep!
}

public class Robot implements Worker {
    public void work() { /* ... */ }
    public void eat()  { throw new UnsupportedOperationException(); } // forced!
    public void sleep(){ throw new UnsupportedOperationException(); }
}
```

### ✅ Fixed — segregated interfaces

```java
public interface Workable  { void work(); }
public interface Eatable   { void eat(); }
public interface Sleepable { void sleep(); }

public class Human  implements Workable, Eatable, Sleepable { /* all */ }
public class Robot  implements Workable { /* only work() */ }
```

---

## D — Dependency Inversion Principle

> *"High-level modules should not depend on low-level modules. Both should depend on abstractions."*

### ❌ Violation — concrete dependency

```java
public class OrderService {
    private MySQLDatabase db = new MySQLDatabase(); // tightly coupled!

    public void save(Order order) {
        db.insert(order);
    }
}
```

### ✅ Fixed — depend on interface

```java
public interface OrderRepository {
    void save(Order order);
}

public class OrderService {
    private final OrderRepository repository; // interface, not concrete class

    public OrderService(OrderRepository repository) {
        this.repository = repository;
    }

    public void save(Order order) {
        repository.save(order);
    }
}

// Can now inject MySQL, Postgres, or a mock!
```

This is the foundation of Spring's dependency injection — Spring manages the concrete implementation, your code depends only on the interface.

---

## Quick Reference

| Letter | Principle | One Line |
|--------|-----------|----------|
| **S** | Single Responsibility | One reason to change |
| **O** | Open/Closed | Extend, don't modify |
| **L** | Liskov Substitution | Subtypes must behave like parents |
| **I** | Interface Segregation | Small, focused interfaces |
| **D** | Dependency Inversion | Depend on abstractions |

---

## Summary

- SRP keeps classes focused and easy to test.
- OCP prevents regression bugs when adding features.
- LSP ensures polymorphism actually works as expected.
- ISP keeps implementations clean — no forced stubs.
- DIP decouples layers, enabling testability and flexibility.

SOLID violations compound: an OCP violation often means SRP is also broken. Fixing one usually improves the others.

<RelatedTopics :topics="['/principles/oop', '/principles/kiss-dry-yagni', '/design-patterns/', '/spring/ioc-di']" />

[→ Take the SOLID Quiz](/quizzes/solid-quiz)
