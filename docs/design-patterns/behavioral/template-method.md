---
title: Template Method Pattern
description: Define the skeleton of an algorithm, deferring some steps to subclasses — Spring JdbcTemplate and RestTemplate
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [template-method, behavioral, java, design-patterns, spring]
related:
  - /design-patterns/behavioral/strategy
  - /spring/spring-data
estimatedMinutes: 15
---

# Template Method Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Define the skeleton of an algorithm in an operation, deferring some steps to subclasses. Template Method lets subclasses redefine certain steps of an algorithm without changing the algorithm's structure.

---

## Problem

You have multiple classes that share the same algorithm structure but differ in specific steps. Without this pattern, you'd duplicate the skeleton in every class.

---

## Classic Example: Data Exporter

```java
// Abstract class defines the template
public abstract class DataExporter {

    // Template method — final to prevent reordering steps
    public final void export(String destination) {
        List<Object> data = readData();       // step 1
        List<Object> processed = process(data); // step 2
        write(processed, destination);        // step 3
        notify(destination);                  // step 4 (optional hook)
    }

    protected abstract List<Object> readData();
    protected abstract List<Object> process(List<Object> data);
    protected abstract void write(List<Object> data, String destination);

    // Hook — default implementation, subclasses may override
    protected void notify(String destination) {
        System.out.println("Export complete: " + destination);
    }
}

// Concrete implementations — only fill in the blanks
public class CsvExporter extends DataExporter {
    @Override
    protected List<Object> readData() { return readFromDatabase(); }

    @Override
    protected List<Object> process(List<Object> data) { return applyCsvFormatting(data); }

    @Override
    protected void write(List<Object> data, String destination) { writeCsvFile(data, destination); }
}

public class XmlExporter extends DataExporter {
    @Override
    protected List<Object> readData() { return readFromDatabase(); }

    @Override
    protected List<Object> process(List<Object> data) { return wrapInXmlTags(data); }

    @Override
    protected void write(List<Object> data, String destination) { writeXmlFile(data, destination); }

    @Override
    protected void notify(String destination) {
        super.notify(destination);
        sendXmlWebhook(destination); // extra step
    }
}
```

---

## Spring JdbcTemplate

`JdbcTemplate` uses Template Method to handle the boilerplate:

```java
// Spring handles: get connection, create statement, handle exceptions, close resources
// You provide: the SQL and the row mapper

List<User> users = jdbcTemplate.query(
    "SELECT id, name, email FROM users",
    (rs, rowNum) -> new User(
        rs.getLong("id"),
        rs.getString("name"),
        rs.getString("email")
    )
);
```

The "template" is: acquire connection → prepare statement → execute → map results → close resources.
You fill in the variable parts (SQL + mapper).

---

## Hooks vs Abstract Methods

| Type | Must Override? | Default Behaviour |
|------|---------------|------------------|
| Abstract method | Yes | None (compile error if not) |
| Hook (concrete method) | No | Default implementation |

Use **abstract methods** for required steps. Use **hooks** for optional extension points.

---

## Template Method vs Strategy

| Aspect | Template Method | Strategy |
|--------|----------------|---------|
| Mechanism | Inheritance | Composition |
| Varies | Steps of algorithm | Entire algorithm |
| Coupling | Tight (subclass) | Loose (injected) |
| Modern preference | Less favoured | Preferred (lambdas) |

Template Method is inheritance-based. Modern Java often replaces it with Strategy + lambdas.

---

## Real-World Examples

- `JdbcTemplate` — SQL execution template
- `RestTemplate` — HTTP request template
- `AbstractBeanFactory` in Spring
- `HttpServlet.service()` → `doGet()` / `doPost()`
- JUnit's `TestCase.runTest()` (classic JUnit 3)

---

## Summary

- Template Method defines algorithm skeleton in a base class; steps vary in subclasses.
- Use `final` on the template method to prevent reordering.
- Hooks provide optional extension points with default behaviour.
- Spring's template classes (`JdbcTemplate`, `RestTemplate`) are the best real-world examples.

<RelatedTopics :topics="['/design-patterns/behavioral/strategy', '/spring/spring-data', '/spring/ioc-di']" />
