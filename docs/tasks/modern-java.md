---
title: Modern Java & Streams Tasks
description: 6 practical tasks covering the Java Streams API, collectors, records, sealed classes, and pattern matching — with suggested solutions
---

# Modern Java & Streams Tasks

Tasks 30–35 covering Streams, Collectors, records, and sealed classes (Java 16–21).

---

### Task 30 — Word Frequency Map

**Difficulty:** Easy

**Problem:** Given a `List<String>` of words, return a `Map<String, Long>` counting how many times each word appears. Use the Streams API.

**Example:**
```
["apple", "banana", "apple", "cherry", "banana", "apple"]
→ {apple=3, banana=2, cherry=1}
```

**Suggested Solution**
```java
public static Map<String, Long> wordFrequency(List<String> words) {
    return words.stream()
        .collect(Collectors.groupingBy(
            Function.identity(),
            Collectors.counting()
        ));
}
```

**Why this approach:** `groupingBy` + `counting()` is the idiomatic one-liner. `Function.identity()` avoids a redundant lambda `w -> w`.

---

### Task 31 — Top-5 Most Frequent Words

**Difficulty:** Easy

**Problem:** Given a `List<String>` of words (already lowercased), return the 5 most frequent words in descending frequency order. If fewer than 5 exist, return all.

**Suggested Solution**
```java
public static List<String> top5(List<String> words) {
    return words.stream()
        .collect(Collectors.groupingBy(Function.identity(), Collectors.counting()))
        .entrySet().stream()
        .sorted(Map.Entry.<String, Long>comparingByValue().reversed())
        .limit(5)
        .map(Map.Entry::getKey)
        .collect(Collectors.toList());
}
```

**Why this approach:** Two streams — one to build the frequency map, one to sort and slice it. `comparingByValue().reversed()` reads cleanly. Sorting the entry set (O(n log n)) is fine for typical word counts; a `PriorityQueue` of size 5 would be O(n log 5) if lists are huge.

---

### Task 32 — FlatMap: Sentences to Words

**Difficulty:** Easy

**Problem:** Given a `List<String>` of sentences, return a single `List<String>` of all individual words (split on whitespace), lowercased and with punctuation stripped.

**Example:**
```
["Hello, World!", "Java is fun."]
→ ["hello", "world", "java", "is", "fun"]
```

**Suggested Solution**
```java
public static List<String> allWords(List<String> sentences) {
    return sentences.stream()
        .flatMap(sentence -> Arrays.stream(sentence.split("\\s+")))
        .map(w -> w.replaceAll("[^a-zA-Z0-9]", "").toLowerCase())
        .filter(w -> !w.isEmpty())
        .collect(Collectors.toList());
}
```

**Why this approach:** `flatMap` converts each sentence into a stream of tokens, then all streams are merged into one. Stripping punctuation after splitting (not before) avoids splitting on hyphens inside compound words inadvertently.

---

### Task 33 — Custom Collector: Join With Prefix/Suffix

**Difficulty:** Medium

**Problem:** Implement a custom `Collector<String, ?, String>` that joins strings with a separator, prefix, and suffix — similar to `Collectors.joining` but as a hand-rolled implementation to demonstrate the collector contract.

**Suggested Solution**
```java
public static Collector<String, StringJoiner, String> joining(
    String delimiter, String prefix, String suffix) {

    return Collector.of(
        () -> new StringJoiner(delimiter, prefix, suffix),   // supplier
        StringJoiner::add,                                    // accumulator
        StringJoiner::merge,                                  // combiner (for parallel)
        StringJoiner::toString                                // finisher
    );
}

// Usage
String result = Stream.of("a", "b", "c")
    .collect(joining(", ", "[", "]"));
// → "[a, b, c]"
```

**Why this approach:** The four-part collector contract is: create a mutable container (supplier), add an element (accumulator), merge two containers for parallel streams (combiner), and convert to the final result (finisher). `StringJoiner` already implements merge, making this a clean delegation.

---

### Task 34 — Sealed Class + Pattern Matching (Shape Area)

**Difficulty:** Medium

**Problem:** Define a `Shape` sealed interface with `Circle(double radius)`, `Rectangle(double width, double height)`, and `Triangle(double base, double height)` as records. Write a method `double area(Shape shape)` using pattern matching.

**Suggested Solution**
```java
public sealed interface Shape permits Circle, Rectangle, Triangle {}
public record Circle(double radius)                      implements Shape {}
public record Rectangle(double width, double height)     implements Shape {}
public record Triangle(double base, double height)       implements Shape {}

public static double area(Shape shape) {
    return switch (shape) {
        case Circle    c -> Math.PI * c.radius() * c.radius();
        case Rectangle r -> r.width() * r.height();
        case Triangle  t -> 0.5 * t.base() * t.height();
    };
}
```

**Why this approach:** Sealed classes make the `switch` exhaustive — the compiler ensures every permitted subtype is handled, eliminating the need for a `default` branch and catching missed cases at compile time rather than runtime.

---

### Task 35 — Record-Based DTO with Compact Constructor Validation

**Difficulty:** Easy

**Problem:** Define a `CreateOrderRequest` record with `customerId` (String), `amount` (BigDecimal), and `currency` (String). The compact constructor should validate that `customerId` is non-blank, `amount` is positive, and `currency` is a 3-letter ISO code.

**Suggested Solution**
```java
public record CreateOrderRequest(String customerId, BigDecimal amount, String currency) {

    public CreateOrderRequest {  // compact constructor — fields auto-assigned after this block
        if (customerId == null || customerId.isBlank())
            throw new IllegalArgumentException("customerId must not be blank");
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0)
            throw new IllegalArgumentException("amount must be positive");
        if (currency == null || !currency.matches("[A-Z]{3}"))
            throw new IllegalArgumentException("currency must be a 3-letter ISO code");
        // normalise
        customerId = customerId.trim();
        currency   = currency.toUpperCase();
    }
}
```

**Why this approach:** Records are ideal for immutable DTOs — all fields are `final` and `equals`/`hashCode`/`toString` are auto-generated. The compact constructor runs before field assignment, so validation fires on every construction path without boilerplate.

---

<RelatedTopics :topics="['/tasks/java-core', '/modern-java/', '/tasks/kotlin']" />

[→ Back to Tasks Overview](/tasks/)
