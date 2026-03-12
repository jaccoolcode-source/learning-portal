---
title: Strategy Pattern
description: Define a family of algorithms, encapsulate each one, and make them interchangeable at runtime
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [strategy, behavioral, java, design-patterns, functional]
related:
  - /design-patterns/behavioral/template-method
  - /design-patterns/behavioral/command
  - /modern-java/java8
estimatedMinutes: 15
---

# Strategy Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Define a family of algorithms, encapsulate each one, and make them interchangeable. Strategy lets the algorithm vary independently from clients that use it.

---

## Problem

You have multiple ways to perform a task (sort, pay, compress, validate) and want to switch between them at runtime — without conditional logic.

---

## Classic Java Example: Payment

```java
// Strategy interface
public interface PaymentStrategy {
    void pay(double amount);
}

// Concrete strategies
public class CreditCardPayment implements PaymentStrategy {
    private final String cardNumber;
    public CreditCardPayment(String cardNumber) { this.cardNumber = cardNumber; }

    @Override
    public void pay(double amount) {
        System.out.printf("Charged $%.2f to card ending in %s%n",
            amount, cardNumber.substring(cardNumber.length() - 4));
    }
}

public class PayPalPayment implements PaymentStrategy {
    private final String email;
    public PayPalPayment(String email) { this.email = email; }

    @Override
    public void pay(double amount) {
        System.out.printf("Sent $%.2f via PayPal to %s%n", amount, email);
    }
}

public class CryptoPayment implements PaymentStrategy {
    private final String wallet;
    public CryptoPayment(String wallet) { this.wallet = wallet; }

    @Override
    public void pay(double amount) {
        System.out.printf("Transferred $%.2f in BTC to %s%n", amount, wallet);
    }
}

// Context
public class ShoppingCart {
    private PaymentStrategy paymentStrategy;

    public void setPaymentStrategy(PaymentStrategy strategy) {
        this.paymentStrategy = strategy;
    }

    public void checkout(double total) {
        if (paymentStrategy == null) throw new IllegalStateException("No payment strategy set");
        paymentStrategy.pay(total);
    }
}

// Usage
ShoppingCart cart = new ShoppingCart();
cart.setPaymentStrategy(new CreditCardPayment("1234-5678-9012-3456"));
cart.checkout(99.99);

cart.setPaymentStrategy(new PayPalPayment("user@example.com"));
cart.checkout(49.99);
```

---

## Modern Java: Lambdas as Strategies

Since `PaymentStrategy` is a functional interface (one abstract method), lambda replaces entire class:

```java
// No need for CreditCardPayment class
PaymentStrategy creditCard = amount ->
    System.out.printf("Card charged: $%.2f%n", amount);

PaymentStrategy paypal = amount ->
    System.out.printf("PayPal sent: $%.2f%n", amount);

cart.setPaymentStrategy(creditCard);
cart.checkout(99.99);
```

---

## Comparator as Strategy

`Comparator<T>` is the canonical Java Strategy — swap sorting algorithms at runtime:

```java
List<Employee> staff = new ArrayList<>(employees);

// Sort by salary (strategy 1)
staff.sort(Comparator.comparingDouble(Employee::getSalary));

// Sort by name (strategy 2)
staff.sort(Comparator.comparing(Employee::getName));

// Sort by department then salary (composed strategy)
staff.sort(Comparator.comparing(Employee::getDepartment)
                     .thenComparingDouble(Employee::getSalary));
```

---

## Real-World Examples

- `Comparator<T>` — sorting strategy
- `javax.servlet.Filter` — filtering strategy in filter chain
- Spring `AuthenticationProvider` — pluggable auth strategies
- Spring `HandlerMapping` — request routing strategy
- `java.util.function.Function` — transformation strategy
- Validation frameworks — pluggable validation rules

---

## Strategy vs Template Method

| Aspect | Strategy | Template Method |
|--------|----------|----------------|
| Mechanism | Composition | Inheritance |
| Varies | Entire algorithm | Steps of algorithm |
| When | Multiple complete algorithms | Algorithms with shared skeleton |

---

## Summary

- Strategy encapsulates algorithms behind a common interface.
- In modern Java, use lambdas instead of strategy classes for simple cases.
- `Comparator` is the most widely used Strategy in Java.
- Prefer composition over inheritance — Strategy is more flexible than Template Method.

<RelatedTopics :topics="['/design-patterns/behavioral/template-method', '/modern-java/java8', '/principles/solid']" />
