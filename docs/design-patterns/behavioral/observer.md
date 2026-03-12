---
title: Observer Pattern
description: Define a one-to-many dependency so that when one object changes state, all dependents are notified automatically
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [observer, behavioral, java, design-patterns, events]
related:
  - /design-patterns/behavioral/mediator
  - /design-patterns/behavioral/command
  - /spring/ioc-di
estimatedMinutes: 15
---

# Observer Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Define a one-to-many dependency between objects so that when one object changes state, all its dependents are notified and updated automatically.

Also known as: **Publish-Subscribe**, **Event Listener**

---

## Problem

An object (the **subject**) needs to notify other objects (the **observers**) about state changes, without knowing who or how many observers there are.

---

## Java Example

```java
// Observer interface
public interface StockObserver {
    void onPriceChange(String ticker, double newPrice);
}

// Subject (Observable)
public class StockMarket {
    private final Map<String, List<StockObserver>> observers = new HashMap<>();
    private final Map<String, Double> prices = new HashMap<>();

    public void subscribe(String ticker, StockObserver observer) {
        observers.computeIfAbsent(ticker, k -> new ArrayList<>()).add(observer);
    }

    public void unsubscribe(String ticker, StockObserver observer) {
        List<StockObserver> list = observers.get(ticker);
        if (list != null) list.remove(observer);
    }

    public void updatePrice(String ticker, double price) {
        prices.put(ticker, price);
        notifyObservers(ticker, price);
    }

    private void notifyObservers(String ticker, double price) {
        List<StockObserver> list = observers.getOrDefault(ticker, List.of());
        for (StockObserver o : list) {
            o.onPriceChange(ticker, price);
        }
    }
}

// Concrete Observers
public class Portfolio implements StockObserver {
    @Override
    public void onPriceChange(String ticker, double price) {
        System.out.printf("Portfolio update: %s = %.2f%n", ticker, price);
    }
}

public class PriceAlert implements StockObserver {
    private final double threshold;
    public PriceAlert(double threshold) { this.threshold = threshold; }

    @Override
    public void onPriceChange(String ticker, double price) {
        if (price > threshold) {
            System.out.printf("ALERT: %s exceeded %.2f (now %.2f)%n", ticker, threshold, price);
        }
    }
}

// Usage
StockMarket market = new StockMarket();
market.subscribe("AAPL", new Portfolio());
market.subscribe("AAPL", new PriceAlert(180.0));

market.updatePrice("AAPL", 175.50); // Portfolio updated
market.updatePrice("AAPL", 185.00); // Portfolio + Alert triggered
```

---

## Java Built-in: PropertyChangeListener

```java
import java.beans.*;

public class User {
    private final PropertyChangeSupport support = new PropertyChangeSupport(this);
    private String name;

    public void addListener(PropertyChangeListener l) { support.addPropertyChangeListener(l); }
    public void removeListener(PropertyChangeListener l) { support.removePropertyChangeListener(l); }

    public void setName(String name) {
        String old = this.name;
        this.name = name;
        support.firePropertyChange("name", old, name);
    }
}
```

---

## Spring ApplicationEventPublisher

```java
// Define event
public class OrderPlacedEvent extends ApplicationEvent {
    private final Order order;
    public OrderPlacedEvent(Object source, Order order) {
        super(source);
        this.order = order;
    }
    public Order getOrder() { return order; }
}

// Publish
@Service
public class OrderService {
    @Autowired ApplicationEventPublisher publisher;

    public void placeOrder(Order order) {
        // ... save order
        publisher.publishEvent(new OrderPlacedEvent(this, order));
    }
}

// Listen (can be in different beans/packages)
@Component
public class EmailNotifier {
    @EventListener
    public void onOrderPlaced(OrderPlacedEvent event) {
        sendConfirmationEmail(event.getOrder());
    }
}

@Component
public class InventoryUpdater {
    @EventListener
    public void onOrderPlaced(OrderPlacedEvent event) {
        updateInventory(event.getOrder());
    }
}
```

---

## Real-World Examples

- `java.util.Observer` / `Observable` (legacy, deprecated Java 9)
- `PropertyChangeListener` / `PropertyChangeSupport`
- Spring `ApplicationEventPublisher` / `@EventListener`
- Swing event listeners (`ActionListener`, `MouseListener`)
- RxJava `Observable` / `Observer`
- `java.util.concurrent.Flow` (Java 9 reactive streams)

---

## Summary

- Observer decouples subjects from observers — neither knows the other's concrete type.
- Spring's `@EventListener` is the idiomatic Java/Spring approach.
- Prefer event buses over direct observer registration for complex systems.
- Clean up observers to avoid memory leaks (always unsubscribe).

<RelatedTopics :topics="['/design-patterns/behavioral/mediator', '/spring/ioc-di', '/modern-java/java8']" />
