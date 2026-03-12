---
title: OOP Principles
description: The four pillars of object-oriented programming — Encapsulation, Inheritance, Polymorphism, Abstraction — with Java code examples
category: principles
pageClass: layout-principles
difficulty: beginner
tags: [oop, java, encapsulation, inheritance, polymorphism, abstraction]
related:
  - /principles/solid
  - /java-core/object-class
  - /design-patterns/
estimatedMinutes: 15
---

# OOP Principles

<DifficultyBadge level="beginner" />

Object-Oriented Programming (OOP) organises code around **objects** — bundles of state and behaviour — rather than functions and procedures. Java is built on four pillars.

---

## 1. Encapsulation

**Hide implementation details; expose only what is necessary.**

Fields are private; access is controlled through methods. This means you can change internals without breaking callers.

```java
public class BankAccount {
    private double balance; // hidden

    public void deposit(double amount) {
        if (amount <= 0) throw new IllegalArgumentException("Amount must be positive");
        this.balance += amount;
    }

    public double getBalance() { return balance; } // controlled access
}
```

::: tip Why it matters
Encapsulation enforces invariants. Without it, any code can set `balance = -1000` and your business logic breaks silently.
:::

---

## 2. Inheritance

**A subclass acquires the fields and methods of its parent, enabling code reuse and specialisation.**

```java
public abstract class Animal {
    protected String name;

    public Animal(String name) { this.name = name; }

    public abstract String speak();  // subclasses must implement

    public String describe() {
        return name + " says: " + speak();
    }
}

public class Dog extends Animal {
    public Dog(String name) { super(name); }

    @Override
    public String speak() { return "Woof!"; }
}

public class Cat extends Animal {
    public Cat(String name) { super(name); }

    @Override
    public String speak() { return "Meow!"; }
}
```

::: warning Favour composition over inheritance
Deep inheritance hierarchies are fragile. Use inheritance for true *is-a* relationships; use interfaces and composition for everything else.
:::

---

## 3. Polymorphism

**The same interface behaves differently depending on the underlying type.**

Two forms in Java:

### Compile-time (Method Overloading)

```java
public class Calculator {
    public int add(int a, int b) { return a + b; }
    public double add(double a, double b) { return a + b; }
    public int add(int a, int b, int c) { return a + b + c; }
}
```

### Runtime (Method Overriding)

```java
List<Animal> animals = List.of(new Dog("Rex"), new Cat("Whiskers"));

for (Animal a : animals) {
    System.out.println(a.describe()); // correct speak() called at runtime
}
// Rex says: Woof!
// Whiskers says: Meow!
```

The variable type is `Animal`, but Java dispatches to the *actual* object's method — this is **dynamic dispatch**.

---

## 4. Abstraction

**Expose what something does; hide how it does it.**

Abstraction is achieved through abstract classes and interfaces.

```java
public interface PaymentProcessor {
    void processPayment(double amount);
    boolean refund(String transactionId);
}

// Callers depend on the interface, not the implementation
public class OrderService {
    private final PaymentProcessor processor;

    public OrderService(PaymentProcessor processor) {
        this.processor = processor;
    }

    public void placeOrder(Order order) {
        processor.processPayment(order.getTotal());
    }
}
```

`OrderService` doesn't know if it's using Stripe, PayPal, or a mock — and it doesn't need to.

---

## Quick Reference

| Pillar | What it hides | Key Java tool |
|--------|--------------|---------------|
| Encapsulation | State / implementation | `private` + getters/setters |
| Inheritance | Shared code | `extends`, `abstract` |
| Polymorphism | Concrete type | Overriding, interfaces |
| Abstraction | "How" details | `interface`, `abstract class` |

---

## Summary

- OOP models the world as objects with state and behaviour.
- Encapsulation protects invariants; abstraction reduces coupling.
- Inheritance shares code; polymorphism enables flexible, extensible APIs.
- These four pillars are the foundation that SOLID principles refine.

<RelatedTopics :topics="['/principles/solid', '/principles/kiss-dry-yagni', '/design-patterns/']" />

[→ Take the SOLID Quiz](/quizzes/solid-quiz)
