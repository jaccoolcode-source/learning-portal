---
title: Java 8 Features
description: Java 8 fundamentals — lambdas, functional interfaces, method references, Streams, Optional, and the new Date/Time API
category: modern-java
pageClass: layout-modern-java
difficulty: intermediate
tags: [java8, lambda, streams, optional, functional-interface, method-reference]
related:
  - /modern-java/streams-deep-dive
  - /modern-java/java9-12
  - /java-core/generics
estimatedMinutes: 30
---

# Java 8 Features

<DifficultyBadge level="intermediate" />

Java 8 (2014) was the most significant Java release since Java 5. It introduced functional programming to Java — lambdas, streams, and `Optional` transformed how we write everyday code.

---

## Functional Interfaces

A **functional interface** has exactly one abstract method. The `@FunctionalInterface` annotation enforces this.

```java
@FunctionalInterface
public interface Predicate<T> {
    boolean test(T t);
}

@FunctionalInterface
public interface Function<T, R> {
    R apply(T t);
}
```

### Built-in Functional Interfaces

| Interface | Method | Signature | Use case |
|-----------|--------|-----------|---------|
| `Predicate<T>` | `test(T t)` | `T → boolean` | Filter conditions |
| `Function<T, R>` | `apply(T t)` | `T → R` | Transformations |
| `Consumer<T>` | `accept(T t)` | `T → void` | Side effects |
| `Supplier<T>` | `get()` | `() → T` | Factory / lazy eval |
| `BiFunction<T,U,R>` | `apply(T,U)` | `T, U → R` | Two-arg transform |
| `UnaryOperator<T>` | `apply(T t)` | `T → T` | Same type transform |
| `BinaryOperator<T>` | `apply(T,T)` | `T, T → T` | Reduction |

---

## Lambdas

A lambda is an anonymous implementation of a functional interface.

```java
// Anonymous class (before Java 8)
Runnable r = new Runnable() {
    @Override
    public void run() { System.out.println("Running"); }
};

// Lambda (Java 8)
Runnable r = () -> System.out.println("Running");

// Examples
Predicate<String>  isLong   = s -> s.length() > 10;
Function<String, Integer> len = String::length; // method reference!
Comparator<String> byLen    = (a, b) -> Integer.compare(a.length(), b.length());
```

---

## Method References

Shorthand for lambdas that call an existing method.

```java
// Static method
Function<String, Integer> parse = Integer::parseInt;
// Equivalent: s -> Integer.parseInt(s)

// Instance method on a specific object
String prefix = "Hello";
Predicate<String> startsWithHello = prefix::startsWith;

// Instance method on arbitrary instance (type reference)
Function<String, String> upper = String::toUpperCase;
// Equivalent: s -> s.toUpperCase()

// Constructor reference
Supplier<ArrayList<String>> listFactory = ArrayList::new;
// Equivalent: () -> new ArrayList<>()
```

---

## Streams API

Streams provide a declarative, pipeline-based way to process collections.

```java
List<String> names = List.of("Alice", "Bob", "Charlie", "Dave", "Eve");

// Imperative approach
List<String> result = new ArrayList<>();
for (String name : names) {
    if (name.length() > 3) {
        result.add(name.toUpperCase());
    }
}
result.sort(Comparator.naturalOrder());

// Declarative stream approach
List<String> result = names.stream()
    .filter(n -> n.length() > 3)      // intermediate: predicate
    .map(String::toUpperCase)          // intermediate: transform
    .sorted()                          // intermediate: sort
    .collect(Collectors.toList());     // terminal: collect to list
```

### Creating Streams

```java
Stream.of("a", "b", "c")
List.of(1, 2, 3).stream()
Arrays.stream(new int[]{1, 2, 3})
Stream.generate(Math::random).limit(10) // infinite
Stream.iterate(0, n -> n + 2).limit(5) // 0, 2, 4, 6, 8
IntStream.range(0, 5)   // 0, 1, 2, 3, 4
IntStream.rangeClosed(1, 5) // 1, 2, 3, 4, 5
```

### Common Operations

```java
// filter — keep elements matching predicate
.filter(s -> s.startsWith("A"))

// map — transform each element
.map(String::length)

// flatMap — flatten nested streams
List.of(List.of(1,2), List.of(3,4)).stream()
    .flatMap(Collection::stream) // [1, 2, 3, 4]

// distinct, sorted, limit, skip
.distinct().sorted().limit(5).skip(2)

// Collectors
.collect(Collectors.toList())
.collect(Collectors.toSet())
.collect(Collectors.joining(", ", "[", "]"))
.collect(Collectors.groupingBy(String::length))
.collect(Collectors.counting())
.collect(Collectors.toMap(Person::getName, Person::getAge))

// Terminal operations
.forEach(System.out::println)
.count()
.findFirst()  // Optional<T>
.findAny()    // Optional<T>
.anyMatch(s -> s.isEmpty())
.allMatch(s -> !s.isEmpty())
.noneMatch(String::isEmpty)
.min(Comparator.naturalOrder())  // Optional<T>
.max(Comparator.naturalOrder())  // Optional<T>
.reduce(0, Integer::sum)
```

---

## Optional\<T\>

`Optional` represents a value that may or may not be present. It's an explicit alternative to returning `null`.

```java
// Creating
Optional<String> present = Optional.of("hello");
Optional<String> empty   = Optional.empty();
Optional<String> nullable = Optional.ofNullable(maybeNull); // safe

// Using
optional.isPresent()
optional.isEmpty()   // Java 11+
optional.get()       // throws if empty — avoid
optional.orElse("default")
optional.orElseGet(() -> computeDefault())
optional.orElseThrow(() -> new NoSuchElementException())

optional.map(String::toUpperCase)           // Optional<String>
optional.flatMap(this::findRelated)         // Optional<T>
optional.filter(s -> s.length() > 3)       // Optional<String>
optional.ifPresent(System.out::println)     // void
optional.ifPresentOrElse(              // Java 9+
    System.out::println,
    () -> System.out.println("empty")
);
```

::: warning Don't use Optional as a field or parameter
`Optional` is designed for return types only. Using it as a field or parameter is considered bad practice — it adds wrapping overhead and complicates the API unnecessarily.
:::

---

## Default and Static Methods in Interfaces

```java
public interface Validator<T> {
    boolean validate(T t);

    // Default method — provides implementation
    default Validator<T> and(Validator<T> other) {
        return t -> this.validate(t) && other.validate(t);
    }

    default Validator<T> or(Validator<T> other) {
        return t -> this.validate(t) || other.validate(t);
    }

    // Static factory method in interface
    static <T> Validator<T> notNull() {
        return t -> t != null;
    }
}

// Usage
Validator<String> notEmpty = s -> !s.isEmpty();
Validator<String> notTooLong = s -> s.length() <= 100;
Validator<String> valid = Validator.<String>notNull().and(notEmpty).and(notTooLong);
```

---

## java.time API (JSR-310)

Replaces the broken `java.util.Date` and `Calendar`.

```java
// Immutable date/time types
LocalDate    today     = LocalDate.now();           // date only: 2024-01-15
LocalTime    now       = LocalTime.now();            // time only: 14:30:00
LocalDateTime dt       = LocalDateTime.now();        // date + time
ZonedDateTime zdt      = ZonedDateTime.now(ZoneId.of("Europe/Warsaw"));
Instant      instant   = Instant.now();              // UTC timestamp

// Create specific date
LocalDate birthday = LocalDate.of(1990, Month.MARCH, 15);

// Arithmetic (immutable — always returns new instance)
LocalDate nextWeek = today.plusWeeks(1);
LocalDate lastYear = today.minusYears(1);

// Difference
Period period = Period.between(birthday, today);
period.getYears();

Duration duration = Duration.between(startTime, endTime);
duration.toHours();
duration.toMinutes();

// Formatting
DateTimeFormatter fmt = DateTimeFormatter.ofPattern("dd-MM-yyyy HH:mm");
String formatted = dt.format(fmt);
LocalDateTime parsed = LocalDateTime.parse("15-01-2024 14:30", fmt);
```

---

## Summary

- Lambdas are anonymous implementations of functional interfaces.
- Method references are compact lambda shorthand.
- Streams pipeline: create → intermediate ops → terminal op.
- `Optional` eliminates null returns — use it for return types only.
- `java.time` API is immutable and thread-safe; replace `Date`/`Calendar`.

<RelatedTopics :topics="['/modern-java/streams-deep-dive', '/modern-java/java9-12', '/collections/implementations']" />
