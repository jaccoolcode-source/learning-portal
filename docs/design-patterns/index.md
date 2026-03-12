---
title: Design Patterns — Overview
description: All 23 GoF design patterns organised by category — Creational, Structural, Behavioral — with Java examples
category: design-patterns
pageClass: layout-design-patterns
---

# Design Patterns

<DifficultyBadge level="intermediate" />

Design patterns are **reusable solutions to common problems** in software design. The 23 patterns from the Gang of Four (GoF) book are the lingua franca of object-oriented design.

> "A design pattern is not a finished design — it is a description or template for how to solve a problem that can be used in many different situations."

---

## Categories

### Creational (5 patterns)
How objects are created. Goal: decouple object creation from usage.

| Pattern | Intent |
|---------|--------|
| [Singleton](./creational/singleton) | One instance, global access point |
| [Factory Method](./creational/factory-method) | Subclasses decide which class to instantiate |
| [Abstract Factory](./creational/abstract-factory) | Families of related objects without specifying concrete classes |
| [Builder](./creational/builder) | Construct complex objects step by step |
| [Prototype](./creational/prototype) | Copy existing objects |

### Structural (7 patterns)
How objects and classes are composed. Goal: flexible, efficient structures.

| Pattern | Intent |
|---------|--------|
| [Adapter](./structural/adapter) | Convert interface to another expected interface |
| [Bridge](./structural/bridge) | Separate abstraction from implementation |
| [Composite](./structural/composite) | Tree structures — treat objects and groups uniformly |
| [Decorator](./structural/decorator) | Add responsibilities to objects dynamically |
| [Facade](./structural/facade) | Simplified interface to a complex subsystem |
| [Flyweight](./structural/flyweight) | Share fine-grained objects efficiently |
| [Proxy](./structural/proxy) | Control access to another object |

### Behavioral (11 patterns)
How objects communicate and assign responsibilities.

| Pattern | Intent |
|---------|--------|
| [Observer](./behavioral/observer) | Notify dependents of state changes |
| [Strategy](./behavioral/strategy) | Define family of algorithms, swap them at runtime |
| [Chain of Responsibility](./behavioral/chain-of-responsibility) | Pass request along a chain of handlers |
| [Command](./behavioral/command) | Encapsulate requests as objects |
| [Iterator](./behavioral/iterator) | Sequential access without exposing internals |
| [Mediator](./behavioral/mediator) | Centralise complex communications |
| [Memento](./behavioral/memento) | Capture and restore object state |
| [State](./behavioral/state) | Object behaviour changes based on internal state |
| [Template Method](./behavioral/template-method) | Define skeleton of algorithm, defer steps to subclasses |
| [Visitor](./behavioral/visitor) | Add operations to objects without modifying them |
| [Interpreter](./behavioral/interpreter) | Define grammar for a language |

---

## How to Study Patterns

1. **Understand the problem** — what pain does this pattern solve?
2. **Know the structure** — participants and their relationships
3. **Recognise it in real code** — Spring uses Factory, Proxy, Template Method, Observer, Decorator extensively
4. **Know the trade-offs** — when NOT to use a pattern

---

## Patterns in the Java/Spring Ecosystem

| Pattern | Where you see it |
|---------|-----------------|
| Singleton | Spring Beans (default scope) |
| Factory Method | `BeanFactory`, `DocumentBuilderFactory` |
| Builder | `StringBuilder`, Lombok `@Builder`, Spring `UriComponentsBuilder` |
| Decorator | `BufferedInputStream`, Spring Security filter chain |
| Proxy | Spring AOP (`@Transactional`, `@Cacheable`) |
| Observer | Spring `ApplicationEventPublisher`, Java `EventListener` |
| Template Method | `JdbcTemplate`, `RestTemplate`, `AbstractBeanFactory` |
| Strategy | `Comparator`, `javax.servlet.Filter` chain |
| Iterator | `java.util.Iterator`, enhanced for-each |
| Composite | Spring `HandlerMapping` chain |
| Facade | Spring `JdbcTemplate` (wraps JDBC), `RestTemplate` |

<RelatedTopics :topics="['/principles/solid', '/spring/aop', '/spring/ioc-di']" />

[→ Take the Design Patterns Quiz](/quizzes/design-patterns-quiz)
