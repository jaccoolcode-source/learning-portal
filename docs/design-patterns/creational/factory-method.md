---
title: Factory Method Pattern
description: Define an interface for creating an object but let subclasses decide which class to instantiate
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [factory-method, creational, java, design-patterns]
related:
  - /design-patterns/creational/abstract-factory
  - /design-patterns/creational/builder
  - /principles/solid
estimatedMinutes: 15
---

# Factory Method Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Define an interface for creating an object, but let subclasses decide which class to instantiate. Factory Method lets a class defer instantiation to subclasses.

---

## Problem

You have a framework that creates objects, but the exact type of object depends on context — and you don't want the framework to hardcode the concrete class.

---

## Structure

```
Creator (abstract)
  ├── factoryMethod(): Product   ← abstract or default
  └── someOperation()            ← calls factoryMethod()

ConcreteCreatorA extends Creator
  └── factoryMethod(): returns ConcreteProductA

ConcreteCreatorB extends Creator
  └── factoryMethod(): returns ConcreteProductB
```

---

## Java Example

```java
// Product interface
public interface Notification {
    void send(String message);
}

// Concrete Products
public class EmailNotification implements Notification {
    private final String email;
    public EmailNotification(String email) { this.email = email; }

    @Override
    public void send(String message) {
        System.out.println("Sending email to " + email + ": " + message);
    }
}

public class SmsNotification implements Notification {
    private final String phone;
    public SmsNotification(String phone) { this.phone = phone; }

    @Override
    public void send(String message) {
        System.out.println("Sending SMS to " + phone + ": " + message);
    }
}

// Creator — abstract class with factory method
public abstract class NotificationService {
    // Factory Method — subclasses override this
    protected abstract Notification createNotification(String recipient);

    // Template — uses the factory method
    public void notifyUser(String recipient, String message) {
        Notification notification = createNotification(recipient);
        notification.send(message);
    }
}

// Concrete Creators
public class EmailService extends NotificationService {
    @Override
    protected Notification createNotification(String email) {
        return new EmailNotification(email);
    }
}

public class SmsService extends NotificationService {
    @Override
    protected Notification createNotification(String phone) {
        return new SmsNotification(phone);
    }
}

// Usage
NotificationService service = new EmailService();
service.notifyUser("user@example.com", "Your order is ready!");
```

---

## Static Factory Method Variant

In practice, the term "factory method" often refers to a **static factory method** — a static method that creates and returns instances:

```java
public class Connection {
    private Connection() {}

    public static Connection ofJdbc(String url)   { /* ... */ return new Connection(); }
    public static Connection ofInMemory()         { /* ... */ return new Connection(); }
    public static Connection ofMock()             { /* ... */ return new Connection(); }
}

// Usage — clear intent
Connection conn = Connection.ofInMemory();
```

Used throughout Java: `List.of()`, `Optional.of()`, `LocalDate.now()`, `Path.of()`.

---

## Real-World Usage

- `java.util.Calendar.getInstance()` — returns appropriate Calendar subclass
- `NumberFormat.getInstance()` — locale-specific formatter
- Spring's `BeanFactory` — creates beans by name/type
- `javax.xml.parsers.DocumentBuilderFactory` — parser factory

---

## Factory Method vs. Abstract Factory

| Aspect | Factory Method | Abstract Factory |
|--------|---------------|-----------------|
| Creates | One product | Families of products |
| Mechanism | Subclass overrides method | Compose factory object |
| When to use | One type varies | Multiple related types vary together |

---

## Summary

- Factory Method separates object creation from usage via inheritance.
- Static factory methods are a common, simpler variant.
- Supports the Open/Closed Principle — add new types without modifying existing code.

<RelatedTopics :topics="['/design-patterns/creational/abstract-factory', '/design-patterns/creational/builder', '/principles/solid']" />
