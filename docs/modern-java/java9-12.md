---
title: Java 9–21 Features
description: Key Java features from Java 9 to Java 21 — var, Records, Sealed Classes, Pattern Matching, Text Blocks, Virtual Threads
category: modern-java
pageClass: layout-modern-java
difficulty: intermediate
tags: [java, var, records, sealed-classes, pattern-matching, text-blocks, virtual-threads]
related:
  - /modern-java/java8
  - /modern-java/streams-deep-dive
  - /concurrency/
estimatedMinutes: 25
---

# Java 9–21 Features

<DifficultyBadge level="intermediate" />

Java releases annually since Java 10. Here are the most impactful features from Java 9 through Java 21.

---

## Java 9: Collection Factory Methods

```java
// Before Java 9
List<String> list = Collections.unmodifiableList(Arrays.asList("a", "b", "c"));

// Java 9+
List<String>        list = List.of("a", "b", "c");
Set<String>         set  = Set.of("x", "y", "z");
Map<String, Integer> map = Map.of("key1", 1, "key2", 2);
Map<String, Integer> bigMap = Map.ofEntries(
    Map.entry("k1", 1),
    Map.entry("k2", 2)
);

// All are truly immutable — no add/remove/set!
```

### Stream additions (Java 9)

```java
// takeWhile — take elements while predicate is true
Stream.of(1, 2, 3, 4, 5, 1)
    .takeWhile(n -> n < 4)  // [1, 2, 3] — stops at first false
    .toList();

// dropWhile — skip while predicate is true
Stream.of(1, 2, 3, 4, 5)
    .dropWhile(n -> n < 3)  // [3, 4, 5]

// ofNullable
Stream.ofNullable(maybeNull) // Stream of 0 or 1 element

// iterate with predicate (finite stream)
Stream.iterate(0, n -> n < 100, n -> n + 2)  // 0, 2, 4, ..., 98
```

### Optional additions (Java 9)

```java
Optional.of("hello").ifPresentOrElse(
    System.out::println,     // if present
    () -> System.out.println("empty") // if empty
);

Optional.empty().or(() -> Optional.of("default")); // Java 9

Optional.of("hello").stream() // Stream<String> — Java 9
```

---

## Java 10: var — Local Variable Type Inference

```java
// Before — verbose
ArrayList<Map<String, List<Integer>>> data = new ArrayList<>();

// Java 10 — var infers the type
var data = new ArrayList<Map<String, List<Integer>>>();
var list = List.of("a", "b", "c");  // ArrayList<String>
var now  = LocalDateTime.now();       // LocalDateTime

// In for-each loops
for (var entry : map.entrySet()) {
    System.out.println(entry.getKey() + "=" + entry.getValue());
}

// In try-with-resources
try (var stream = Files.lines(Path.of("file.txt"))) {
    stream.forEach(System.out::println);
}
```

::: warning var rules
- Only for local variables (not fields, parameters, return types)
- Type must be inferable from the right-hand side
- Can't use with `null` literal (`var x = null` — no type info)
:::

---

## Java 11: String Methods

```java
"  hello  ".strip()        // "hello" — Unicode-aware trim
"  hello  ".stripLeading() // "hello  "
"  hello  ".stripTrailing()// "  hello"
"".isEmpty()               // true
"  ".isBlank()             // true — Java 11
"ha".repeat(3)             // "hahaha" — Java 11
"a\nb\nc".lines()          // Stream<String>: "a", "b", "c"
```

---

## Java 14: Records

Records are immutable data carriers with auto-generated `equals`, `hashCode`, `toString`, and accessor methods:

```java
public record Point(int x, int y) {}

// Generates automatically:
// - constructor: Point(int x, int y)
// - accessors: x(), y()
// - equals(), hashCode(), toString()

Point p = new Point(1, 2);
p.x();        // 1
p.y();        // 2
p.toString(); // "Point[x=1, y=2]"

// Custom compact constructor for validation
public record Range(int min, int max) {
    public Range {  // compact constructor — no param list
        if (min > max) throw new IllegalArgumentException("min > max");
    }
}

// Records can implement interfaces
public record Name(String first, String last) implements Comparable<Name> {
    @Override
    public int compareTo(Name other) { return first.compareTo(other.first); }
}
```

---

## Java 14: Pattern Matching for instanceof

```java
// Before Java 14
if (obj instanceof String) {
    String s = (String) obj; // explicit cast
    System.out.println(s.length());
}

// Java 16+ (stable)
if (obj instanceof String s) {
    System.out.println(s.length()); // s is already cast and scoped here
}

// Negation
if (!(obj instanceof String s)) {
    return; // s not in scope here
}
System.out.println(s.length()); // s IS in scope after the return
```

---

## Java 15: Text Blocks

```java
// Before — ugly escaping
String json = "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}";

// Java 15+ — text block (triple quote)
String json = """
        {
          "name": "Alice",
          "age": 30
        }
        """;
// Indentation based on position of closing """

String sql = """
        SELECT u.id, u.name, o.total
        FROM users u
        JOIN orders o ON o.user_id = u.id
        WHERE u.active = true
        ORDER BY o.total DESC
        """;
```

---

## Java 17: Sealed Classes

Restrict which classes can extend/implement a type. Enables exhaustive pattern matching.

```java
public sealed interface Shape permits Circle, Rectangle, Triangle {}

public record Circle(double radius) implements Shape {}
public record Rectangle(double width, double height) implements Shape {}
public record Triangle(double base, double height) implements Shape {}

// Compiler knows all subtypes — switch can be exhaustive
public double area(Shape shape) {
    return switch (shape) {
        case Circle c    -> Math.PI * c.radius() * c.radius();
        case Rectangle r -> r.width() * r.height();
        case Triangle t  -> 0.5 * t.base() * t.height();
        // No default needed — all cases covered!
    };
}
```

---

## Java 21: Pattern Matching in Switch

```java
Object obj = getObject();

String result = switch (obj) {
    case Integer i when i > 0 -> "Positive: " + i;   // guarded pattern
    case Integer i             -> "Non-positive: " + i;
    case String s              -> "String: " + s;
    case null                  -> "null";              // explicit null case
    default                    -> "Other: " + obj;
};
```

---

## Java 21: Virtual Threads (Project Loom)

Virtual threads are lightweight threads managed by the JVM — not OS threads. Millions can run concurrently.

```java
// Create virtual thread
Thread vt = Thread.ofVirtual().start(() -> {
    System.out.println("Running on virtual thread: " + Thread.currentThread());
});

// Virtual thread executor (optimal for I/O-bound tasks)
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 1_000_000; i++) {
        executor.submit(() -> {
            Thread.sleep(Duration.ofMillis(100)); // blocks virtual thread, not OS thread
            return "done";
        });
    }
}
// All 1 million tasks ran, using only a handful of OS threads
```

::: info Virtual threads vs Platform threads
- **Platform thread** = wrapper around OS thread (~1 MB stack, limited to thousands)
- **Virtual thread** = JVM-managed (~few KB, millions possible)
- Virtual threads are ideal for I/O-bound tasks; CPU-bound tasks still benefit from platform threads
:::

---

## Java 21: SequencedCollection

See [Collection Interfaces](/collections/interfaces) for the full coverage.

---

## Summary by Version

| Version | Key Feature |
|---------|------------|
| Java 9 | `List.of()`, `Stream.takeWhile()`, `Optional.ifPresentOrElse()` |
| Java 10 | `var` type inference |
| Java 11 | `String.isBlank()`, `repeat()`, `lines()` |
| Java 14 | Records, `instanceof` pattern matching |
| Java 15 | Text blocks, sealed classes (preview) |
| Java 17 | Sealed classes (stable) |
| Java 21 | Virtual threads, pattern matching in switch |

<RelatedTopics :topics="['/modern-java/java8', '/collections/interfaces', '/concurrency/']" />
