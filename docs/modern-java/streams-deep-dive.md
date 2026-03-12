---
title: Streams Deep Dive
description: Advanced Streams — Collectors, groupingBy, flatMap, reduce, parallel streams, and custom collectors
category: modern-java
pageClass: layout-modern-java
difficulty: advanced
tags: [java, streams, collectors, parallel-streams, flatmap, reduce, groupingby]
related:
  - /modern-java/java8
  - /collections/implementations
estimatedMinutes: 25
---

# Streams Deep Dive

<DifficultyBadge level="advanced" />

Advanced Streams topics — going beyond `filter/map/collect` to grouping, partitioning, reducing, flattening, and parallel execution.

---

## Collectors

### groupingBy — group into a Map

```java
List<Employee> employees = getEmployees();

// Group by department
Map<String, List<Employee>> byDept =
    employees.stream()
             .collect(Collectors.groupingBy(Employee::getDepartment));

// Count per department
Map<String, Long> countPerDept =
    employees.stream()
             .collect(Collectors.groupingBy(
                 Employee::getDepartment,
                 Collectors.counting()
             ));

// Average salary per department
Map<String, Double> avgSalaryPerDept =
    employees.stream()
             .collect(Collectors.groupingBy(
                 Employee::getDepartment,
                 Collectors.averagingDouble(Employee::getSalary)
             ));

// Get max salary employee per department
Map<String, Optional<Employee>> topEarnerByDept =
    employees.stream()
             .collect(Collectors.groupingBy(
                 Employee::getDepartment,
                 Collectors.maxBy(Comparator.comparingDouble(Employee::getSalary))
             ));

// Multi-level grouping
Map<String, Map<String, List<Employee>>> byDeptThenCity =
    employees.stream()
             .collect(Collectors.groupingBy(
                 Employee::getDepartment,
                 Collectors.groupingBy(Employee::getCity)
             ));
```

### partitioningBy — split into true/false groups

```java
Map<Boolean, List<Employee>> juniorSenior =
    employees.stream()
             .collect(Collectors.partitioningBy(
                 e -> e.getSalary() >= 100_000
             ));

List<Employee> senior = juniorSenior.get(true);
List<Employee> junior = juniorSenior.get(false);
```

### joining — string concatenation

```java
String csv = employees.stream()
    .map(Employee::getName)
    .collect(Collectors.joining(", "));

String bracketed = employees.stream()
    .map(Employee::getName)
    .collect(Collectors.joining(", ", "[", "]")); // [Alice, Bob, Charlie]
```

### toMap — collect to Map

```java
// Warning: throws if duplicate keys
Map<Long, Employee> byId = employees.stream()
    .collect(Collectors.toMap(Employee::getId, e -> e));

// Handle duplicates with merge function
Map<String, Employee> byName = employees.stream()
    .collect(Collectors.toMap(
        Employee::getName,
        e -> e,
        (e1, e2) -> e1  // keep first on duplicate
    ));

// Collect to specific Map implementation
Map<String, Employee> sortedByName = employees.stream()
    .collect(Collectors.toMap(
        Employee::getName,
        e -> e,
        (e1, e2) -> e1,
        TreeMap::new      // use TreeMap
    ));
```

### teeing (Java 12+)

Split a stream into two collectors and combine results:

```java
record Stats(double min, double max) {}

Stats stats = employees.stream()
    .mapToDouble(Employee::getSalary)
    .collect(Collectors.teeing(
        Collectors.minBy(Double::compareTo),
        Collectors.maxBy(Double::compareTo),
        (min, max) -> new Stats(min.orElse(0), max.orElse(0))
    ));
```

---

## flatMap — Flattening Nested Structures

```java
// Each order has multiple items
List<Order> orders = getOrders();

// Get all items across all orders (flattened)
List<OrderItem> allItems = orders.stream()
    .flatMap(order -> order.getItems().stream())
    .collect(Collectors.toList());

// Get unique product IDs ordered by any customer
Set<Long> productIds = orders.stream()
    .flatMap(o -> o.getItems().stream())
    .map(OrderItem::getProductId)
    .collect(Collectors.toSet());

// Find all tags across all articles
List<String> allTags = articles.stream()
    .flatMap(a -> a.getTags().stream())
    .distinct()
    .sorted()
    .collect(Collectors.toList());
```

---

## reduce — Custom Aggregation

```java
// Sum (using reduce)
int sum = IntStream.rangeClosed(1, 10)
    .reduce(0, Integer::sum); // 55

// Product
int product = Stream.of(1, 2, 3, 4, 5)
    .reduce(1, (a, b) -> a * b); // 120

// String concatenation
String words = Stream.of("Hello", " ", "World")
    .reduce("", String::concat); // "Hello World"

// Combine objects
Optional<Employee> highestPaid = employees.stream()
    .reduce((e1, e2) -> e1.getSalary() >= e2.getSalary() ? e1 : e2);

// 3-arg reduce (for parallel streams)
int sumParallel = employees.parallelStream()
    .reduce(
        0,                                          // identity
        (acc, e) -> acc + (int) e.getSalary(),      // accumulator
        Integer::sum                                 // combiner (merges partial results)
    );
```

---

## Parallel Streams

```java
// Sequential
long count = employees.stream()
    .filter(e -> e.getSalary() > 50_000)
    .count();

// Parallel — splits work across ForkJoinPool.commonPool()
long count = employees.parallelStream()
    .filter(e -> e.getSalary() > 50_000)
    .count();

// Or convert mid-stream
long count = employees.stream()
    .parallel()
    .filter(e -> e.getSalary() > 50_000)
    .count();
```

### When parallel helps

- Large data sets (thousands+ elements)
- Computationally expensive operations per element
- Stateless, independent operations

### When parallel hurts

- Small data sets (parallel overhead > sequential work)
- Ordered operations (`forEachOrdered`, `limit` on sorted stream)
- Shared mutable state
- I/O-bound operations

```java
// BAD: shared mutable state
List<String> results = new ArrayList<>();
employees.parallelStream()
    .map(Employee::getName)
    .forEach(results::add); // ArrayList not thread-safe! → ConcurrentModificationException

// GOOD: collect
List<String> results = employees.parallelStream()
    .map(Employee::getName)
    .collect(Collectors.toList()); // thread-safe collect
```

---

## Numeric Streams

Avoid boxing overhead with primitive specialisations:

```java
// IntStream, LongStream, DoubleStream
IntStream.range(0, 10).sum()  // 45
IntStream.range(0, 10).average() // OptionalDouble: 4.5

employees.stream()
    .mapToDouble(Employee::getSalary)
    .average()
    .orElse(0.0);

employees.stream()
    .mapToLong(Employee::getId)
    .max();

// Statistics
DoubleSummaryStatistics stats = employees.stream()
    .mapToDouble(Employee::getSalary)
    .summaryStatistics();
stats.getMin(); stats.getMax(); stats.getAverage(); stats.getCount(); stats.getSum();
```

---

## collect(toList()) vs .toList() (Java 16+)

```java
// Java 8 — returns mutable list
.collect(Collectors.toList())

// Java 10 — returns unmodifiable list
.collect(Collectors.toUnmodifiableList())

// Java 16+ — unmodifiable, best option
.toList()
```

---

## Summary

- `groupingBy` + `Collectors.*` enable SQL-like aggregations.
- `flatMap` flattens nested structures — essential for one-to-many relationships.
- `reduce` builds custom aggregations; use the 3-arg form for parallel streams.
- Parallel streams help for large CPU-bound tasks; avoid with mutable state.
- Use `IntStream`/`DoubleStream` for numeric operations to avoid boxing.
- Prefer `.toList()` (Java 16+) over `collect(Collectors.toList())`.

<RelatedTopics :topics="['/modern-java/java8', '/collections/implementations', '/concurrency/']" />
