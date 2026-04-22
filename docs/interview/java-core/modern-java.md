# Modern Java Features (8–21)

**Part V — Q19 to Q25** · [← Core Java Overview](./index)

---

## Q19: Functional Interfaces & Lambda Expressions

> A functional interface has exactly one abstract method. Lambdas are concise implementations of them.

```java
// Before lambdas — anonymous class
Comparator<String> comp = new Comparator<String>() {
    @Override public int compare(String a, String b) { return a.compareTo(b); }
};

// With lambda — same thing, one line
Comparator<String> comp = (a, b) -> a.compareTo(b);

// With method reference — even shorter
Comparator<String> comp = String::compareTo;
```

**Built-in functional interfaces (`java.util.function`):**

| Interface | Signature | Use case | Key method |
|-----------|-----------|----------|-----------|
| `Predicate<T>` | `T → boolean` | Filtering | `test()` |
| `Function<T,R>` | `T → R` | Transformation | `apply()` |
| `Consumer<T>` | `T → void` | Side effects | `accept()` |
| `Supplier<T>` | `() → T` | Factory / lazy value | `get()` |
| `UnaryOperator<T>` | `T → T` | In-place transform | `apply()` |
| `BiFunction<T,U,R>` | `(T,U) → R` | Two-input transform | `apply()` |

::: details Full model answer

**`@FunctionalInterface` annotation:**
Optional but recommended — the compiler verifies there is exactly one abstract method. Prevents accidental addition of a second abstract method that would break all lambdas using that interface.

```java
@FunctionalInterface
public interface Validator<T> {
    boolean validate(T value);
    // default methods and static methods are allowed
    default Validator<T> and(Validator<T> other) {
        return value -> this.validate(value) && other.validate(value);
    }
}
```

**Method references — four types:**
```java
// 1. Static method reference
Function<Double, Double> sqrt = Math::sqrt;

// 2. Bound instance — specific object
String prefix = "Hello";
Predicate<String> startsWithHello = prefix::startsWith;  // "hello"::startsWith bound to "hello"

// 3. Unbound instance — any object of that type
Function<String, String> toUpper = String::toUpperCase;  // s -> s.toUpperCase()

// 4. Constructor reference
Supplier<ArrayList<String>> listFactory = ArrayList::new;
```

**Functional composition:**
```java
Predicate<String> notEmpty  = s -> !s.isEmpty();
Predicate<String> notNull   = s -> s != null;
Predicate<String> valid     = notNull.and(notEmpty);  // both must be true
Predicate<String> either    = notNull.or(notEmpty);   // at least one

Function<String, String> trim      = String::trim;
Function<String, String> toUpper   = String::toUpperCase;
Function<String, String> normalize = trim.andThen(toUpper);  // trim first, then uppercase
// compose() reverses the order: toUpper.compose(trim) = trim first, then uppercase
```

**Effectively final and lambda capture:**
Lambdas can capture local variables only if they are `final` or **effectively final** (never reassigned). They can always access instance fields and static fields.
```java
int multiplier = 3;       // effectively final — never reassigned
Function<Integer, Integer> triple = x -> x * multiplier;  // OK

multiplier = 5;            // reassignment → no longer effectively final
Function<Integer, Integer> fn = x -> x * multiplier;      // COMPILATION ERROR
```

:::

> [!TIP] Golden Tip
> Show fluency with **functional composition** — `Predicate.and/or`, `Function.andThen/compose`. Also explain the four types of method references — most candidates know static and unbound instance but forget bound instance and constructor references. These details signal modern Java thinking.

**Follow-up questions:**
- What is the difference between `Function.andThen()` and `Function.compose()`?
- Why can lambdas only capture effectively final variables?
- What is the difference between `Predicate.and()` and `&&` inside a lambda?
- Can a functional interface have default methods?

---

## Q20: Stream API

> A pipeline of lazy operations on data. Not a data structure — never stores data.

```java
List<String> topEngineers = employees.stream()
    .filter(e -> e.getDepartment().equals("Engineering"))
    .filter(e -> e.getSalary() > 100_000)
    .sorted(Comparator.comparing(Employee::getSalary).reversed())
    .limit(5)
    .map(Employee::getName)
    .collect(Collectors.toList());
```

**Pipeline:** Source → Intermediate operations (lazy) → Terminal operation (triggers execution)

::: details Full model answer

**Key property: lazy evaluation**
Intermediate operations (filter, map, sorted, etc.) are NOT executed until a terminal operation is called. This enables short-circuiting — `findFirst()` stops as soon as one match is found, even with `filter` before it.

**Important intermediate operations:**
```java
stream.filter(e -> e.isActive())           // keep matching elements
stream.map(e -> e.getName())               // transform T → R
stream.flatMap(e -> e.getOrders().stream()) // flatten: Stream<List<T>> → Stream<T>
stream.sorted(Comparator.comparing(...))   // sort
stream.distinct()                          // remove duplicates (uses equals/hashCode)
stream.limit(10)                           // take first 10
stream.skip(5)                             // skip first 5
stream.peek(e -> log.debug(e))             // side-effect without consuming (debug only)
```

**Important terminal operations:**
```java
stream.collect(Collectors.toList())        // mutable ArrayList
stream.toList()                            // Java 16+: unmodifiable list (preferred)
stream.collect(Collectors.toSet())
stream.collect(Collectors.joining(", "))   // concatenate strings

// Grouping — like SQL GROUP BY
Map<String, List<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::getDepartment));

// Counting per group
Map<String, Long> countByDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::getDepartment, Collectors.counting()));

stream.reduce(0, Integer::sum)             // combine all elements into one
stream.forEach(e -> process(e))            // side effects
stream.findFirst()                         // Optional — first element (ordered)
stream.findAny()                           // Optional — any element (better for parallel)
stream.anyMatch(e -> e.getSalary() > 100k) // short-circuits
stream.count()
stream.min(comparator) / stream.max(comparator)  // both return Optional
```

**`flatMap` — the important one:**
```java
// Each order has a list of items — get ALL items across all orders
List<Item> allItems = orders.stream()
    .flatMap(order -> order.getItems().stream())  // Order → Stream<Item>
    .collect(Collectors.toList());
// Without flatMap: Stream<List<Item>> — nested, useless
// With flatMap: Stream<Item> — flattened, useful
```

**Parallel streams:**
```java
long count = largeList.parallelStream()  // uses ForkJoinPool.commonPool()
    .filter(...)
    .count();
```
Use with caution:
- Effective only for CPU-bound operations on large collections
- **Avoid for I/O operations** — blocking I/O on commonPool starves other parallel operations
- Thread-safety issues if reduction/collect operations have side effects
- Splitting and merging overhead can make parallel slower than sequential for small collections

:::

> [!TIP] Golden Tip
> Four things that separate senior answers: **(1)** Streams are single-use — reusing after a terminal operation throws `IllegalStateException`. **(2)** Know `flatMap` for nested collections — it's always asked. **(3)** `toList()` (Java 16+) returns an **unmodifiable** list; `Collectors.toList()` returns a mutable `ArrayList`. **(4)** Parallel streams use `ForkJoinPool.commonPool()` — never use for I/O, only for CPU-bound work on large data sets.

**Follow-up questions:**
- What is the difference between `map` and `flatMap`?
- What does lazy evaluation mean and why does it matter for performance?
- When would you use parallel streams, and when would you avoid them?
- What is the difference between `stream.toList()` and `Collectors.toList()`?

---

## Q21: Optional

> A container that may or may not hold a value. Designed to make null-handling explicit.

```java
// Creating
Optional<User> opt = Optional.of(user);           // throws NPE if user is null
Optional<User> opt = Optional.ofNullable(user);   // empty if null — use this
Optional<User> opt = Optional.empty();

// Good patterns
String name = optional.map(User::getName).orElse("Unknown");
User   user = optional.orElseThrow(() -> new UserNotFoundException(id));
optional.ifPresent(u -> sendEmail(u));
optional.ifPresentOrElse(u -> process(u), () -> handleAbsent());  // Java 9+

// Bad patterns — defeats the purpose
if (optional.isPresent()) { optional.get(); }  // just use orElse/orElseThrow
optional.get();  // throws NoSuchElementException if empty
```

::: details Full model answer

**`orElse` vs `orElseGet` — critical difference:**
```java
// orElse — ALWAYS evaluates the argument, even if Optional has a value
user.orElse(createDefaultUser());  // createDefaultUser() runs even if user is present!

// orElseGet — lazy, only evaluates if Optional is empty
user.orElseGet(() -> createDefaultUser());  // runs ONLY if empty
```
This matters for expensive defaults (database queries, HTTP calls). Always use `orElseGet` for expensive fallbacks.

**Chaining:**
```java
Optional<String> email = findUser(id)
    .map(User::getContact)
    .map(Contact::getEmail)
    .filter(e -> e.contains("@"));
// Each step only runs if the previous Optional was non-empty
// No null checks, no NPE
```

**Java 9+ additions:**
```java
optional.or(() -> findInCache(id))           // return another Optional if empty
optional.ifPresentOrElse(action, emptyAction)
optional.stream()                             // empty or single-element stream
```

**Best practices:**
- ✅ Use as **method return type** when a result may be absent
- ❌ Do NOT use as method parameter — just pass `null` and check inside
- ❌ Do NOT use as class field — use `null` internally, return `Optional` from accessor
- ❌ Do NOT use for collections — return an empty collection instead
- ❌ Do NOT call `.get()` without checking — use `.orElseThrow()` which is explicit about the intent

**Why not just use `null`?**
`null` is invisible in a method's signature — the caller doesn't know whether to expect null or not. `Optional<User>` communicates "this might be absent" at the type level, making null-handling deliberate rather than accidental.

:::

> [!TIP] Golden Tip
> The **`orElse` vs `orElseGet`** difference is a classic interview question. `orElse(expensiveCall())` wastes resources because the argument is always evaluated. Always use `orElseGet(() -> expensiveCall())` for costly defaults. This is a real production bug that catches many developers.

**Follow-up questions:**
- What is the difference between `orElse` and `orElseGet`?
- Why shouldn't `Optional` be used as a method parameter or class field?
- What does `Optional.of()` vs `Optional.ofNullable()` do differently?

---

## Q22: Generics & Type Erasure

> Generics are compile-time only. At runtime, `List<String>` and `List<Integer>` are both just `List`.

```java
// Without generics — unsafe cast
List list = new ArrayList();
list.add("hello");
String s = (String) list.get(0);  // ClassCastException risk at runtime

// With generics — type-safe
List<String> list = new ArrayList<>();
list.add("hello");
String s = list.get(0);  // no cast needed, compiler checks types
```

::: details Full model answer

**Type Erasure:**
Generics exist ONLY at compile time. The compiler checks types, then **erases** all generic type information from bytecode. At runtime `List<String>`, `List<Integer>`, and `List` are all identical — just `List`.

Consequences:
- Cannot check `list instanceof List<String>` — compiler error
- Cannot create `new T()` or `new T[]` — type unknown at runtime
- Cannot use primitives: `List<int>` is illegal, must use `List<Integer>`
- Overloading `method(List<String>)` and `method(List<Integer>)` is impossible — same erasure

**PECS — Producer Extends, Consumer Super:**
The #1 generics interview question. Determines when to use `? extends T` vs `? super T`.

```java
// PRODUCER (you READ from it) → use extends
void printAll(List<? extends Number> list) {
    for (Number n : list) { System.out.println(n); }  // read OK
    // list.add(42);  // COMPILE ERROR — can't write (type unknown)
}
printAll(List.of(1, 2, 3));      // works with List<Integer>
printAll(List.of(1.0, 2.0));     // works with List<Double>

// CONSUMER (you WRITE to it) → use super
void addNumbers(List<? super Integer> list) {
    list.add(42);    // write OK
    list.add(100);   // write OK
    // Integer n = list.get(0);  // COMPILE ERROR — reading gives Object
}
addNumbers(new ArrayList<Number>());  // works
addNumbers(new ArrayList<Object>());  // works
```

The perfect example: `Collections.copy(List<? super T> dest, List<? extends T> src)`
- Destination = consumer (we write to it) → `super`
- Source = producer (we read from it) → `extends`

**Unbounded wildcard `<?>`:**
Used when the type doesn't matter at all:
```java
void printSize(List<?> list) { System.out.println(list.size()); }
// Can accept List<String>, List<Integer>, List<anything>
// Cannot add to the list (except null)
```

**Generic methods:**
```java
public <T extends Comparable<T>> T max(T a, T b) {
    return a.compareTo(b) >= 0 ? a : b;
}
// Works for any type that implements Comparable
String larger = max("apple", "banana");
Integer larger = max(3, 7);
```

:::

> [!TIP] Golden Tip
> **PECS** is the key generics question. If you explain it clearly with the `Collections.copy()` example — destination is consumer (`super`), source is producer (`extends`) — you've demonstrated senior-level understanding. Most candidates know generics exist but can't explain PECS or type erasure consequences.

**Follow-up questions:**
- Why can't you create `new T()` inside a generic method?
- What is the difference between `List<?>` and `List<Object>`?
- Explain PECS with an example.
- What are the consequences of type erasure?

---

## Q23: Records & Sealed Classes

> Records eliminate data class boilerplate. Sealed classes create closed type hierarchies.

```java
// Before records — ~30 lines of boilerplate
public class Person {
    private final String name;
    private final int age;
    // constructor, getters, equals(), hashCode(), toString() — 25+ lines
}

// With records (Java 16) — 1 line, everything generated
public record Person(String name, int age) {}

Person p = new Person("Jan", 30);
p.name();         // accessor — NOT getName()
p.age();
p.toString();     // "Person[name=Jan, age=30]"
p.equals(other);  // compares all fields
```

::: details Full model answer

**Records — what the compiler generates:**
- Canonical constructor (all fields)
- Accessor methods named after fields: `name()`, `age()` — NOT `getName()`
- `equals()` based on all fields
- `hashCode()` based on all fields
- `toString()` with all fields

All fields are `private final` — records are **immutable**.

**Compact constructor — validation and normalisation:**
```java
public record Person(String name, int age) {
    public Person {  // no parameters, no this.field assignments
        if (age < 0) throw new IllegalArgumentException("Age cannot be negative");
        name = name.trim();  // can transform before assignment
        // fields assigned automatically after compact constructor body
    }
}
```

**Records as excellent HashMap keys:**
Immutable + auto-generated `equals()`/`hashCode()` = perfect keys with zero boilerplate.

**Records can implement interfaces** (but not extend classes — already extends `Record`):
```java
public record Point(double x, double y) implements Shape {
    @Override public double area() { return 0; }
}
```

**Sealed Classes (Java 17):**
Restrict which classes can extend or implement them. Creates a **known, closed set of subtypes**.

```java
public sealed interface Shape permits Circle, Rectangle, Triangle {}
public record Circle(double radius)         implements Shape {}
public record Rectangle(double w, double h) implements Shape {}
public record Triangle(double base, double h) implements Shape {}
```

Each permitted subtype must be: `final`, `sealed` (further restriction), or `non-sealed` (open again).

**Pattern matching in switch (Java 21):**
```java
double area = switch (shape) {
    case Circle c     -> Math.PI * c.radius() * c.radius();
    case Rectangle r  -> r.w() * r.h();
    case Triangle t   -> 0.5 * t.base() * t.h();
    // NO default needed — compiler knows all subtypes!
};
```

If you add a new type to `permits`, every `switch` statement without a default becomes a compile error — the compiler ensures exhaustiveness. This replaces the Visitor pattern for many use cases.

:::

> [!TIP] Golden Tip
> **Records + sealed interfaces = algebraic data types in Java.** This pattern replaces the Visitor pattern and is the foundation of modern Java domain modelling. Showing you understand the connection between sealed classes, records, and exhaustive pattern matching in switch signals awareness of where Java is heading as a language.

**Follow-up questions:**
- Can a record extend another class?
- What is the difference between a canonical constructor and a compact constructor?
- What does `non-sealed` mean for a permitted subtype?
- How do sealed classes enable exhaustive `switch` without a `default` branch?

---

## Q24: Virtual Threads (Java 21)

> Solves the scalability problem of thread-per-request without reactive programming complexity.

**The problem:** Traditional platform threads = OS threads = ~1MB stack each. 10,000 concurrent I/O-bound requests = 10,000 threads sitting idle = 10GB RAM wasted.

**The solution:** Virtual threads are JVM-managed, ultra-lightweight (~few KB). The JVM **unmounts** a virtual thread when it blocks on I/O, freeing the carrier thread for other work.

```java
// Java 21 — 100,000 virtual threads with simple sequential code
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 100_000; i++) {
        executor.submit(() -> processRequest());  // each on its own virtual thread
    }
}

// Spring Boot 3.2+
// application.properties:
// spring.threads.virtual.enabled=true
// → Tomcat handles each request on a virtual thread. Zero code changes.
```

::: details Full model answer

**How virtual threads work:**
Virtual threads run on a pool of **carrier threads** (platform threads, typically `ForkJoinPool` sized to CPU cores). When a virtual thread calls a blocking operation (database query, HTTP call, file read):

1. JVM **unmounts** the virtual thread from its carrier thread
2. Saves the virtual thread's state as a **continuation** (call stack snapshot) on the heap
3. Carrier thread picks up another virtual thread to run
4. When I/O completes, virtual thread is **remounted** on any available carrier

Result: carrier threads are never idle. A handful of carrier threads can multiplex millions of virtual threads — achieving reactive throughput with simple blocking code.

**Creating virtual threads:**
```java
// Individual thread
Thread t = Thread.startVirtualThread(() -> handleRequest());
Thread t = Thread.ofVirtual().name("request-handler").start(() -> handleRequest());

// Via ExecutorService (most common)
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    executor.submit(task);
}

// Spring Boot 3.2+
spring.threads.virtual.enabled=true  // that's it
```

**Key pitfalls:**

**1. Pinning with `synchronized`:**
`synchronized` pins the virtual thread to its carrier — the JVM cannot unmount it during blocking I/O. The carrier thread is blocked too. Fix: replace `synchronized` with `ReentrantLock`.

```java
// PROBLEM — pins carrier thread during blocking I/O
synchronized (lock) {
    database.query();  // carrier thread blocked here
}

// FIX
lock.lock();
try { database.query(); } finally { lock.unlock(); }
```

**2. ThreadLocal with millions of threads:**
`ThreadLocal` stores per-thread data. With millions of virtual threads, large `ThreadLocal` values multiply memory usage. Java 21 introduces **Scoped Values** (preview → standard in Java 23) as a better alternative: immutable, automatically cleaned up, safer for virtual threads.

**3. Don't pool virtual threads:**
Virtual threads are so cheap (~few KB) that pooling them is an anti-pattern. Create as many as needed — the JVM manages them. Using `newFixedThreadPool(200)` with virtual threads defeats the purpose.

**Virtual threads vs Reactive (WebFlux):**
| | Virtual Threads | Reactive (WebFlux) |
|--|----------------|-------------------|
| Code style | Sequential, simple | Functional, reactive pipelines |
| Debugging | Easy — normal stack traces | Hard — async stack traces |
| Learning curve | None | Steep |
| Performance | Excellent for I/O-bound | Excellent for I/O-bound |
| CPU-bound | Same as platform threads | Same |
| Recommendation | **Prefer for new apps** | Legacy or specific cases |

:::

> [!TIP] Golden Tip
> Virtual threads make **reactive programming unnecessary for I/O-bound workloads**. The **pinning problem with `synchronized`** is the #1 interview pitfall — know that `ReentrantLock` is the fix. Also: Spring Boot 3.2+ enables virtual threads with a single property (`spring.threads.virtual.enabled=true`) — showing this signals you're current with the ecosystem.

**Follow-up questions:**
- What is thread pinning and how do you fix it?
- What is the difference between a virtual thread and a platform thread?
- Why is pooling virtual threads an anti-pattern?
- How do virtual threads compare to reactive programming (WebFlux)?

---

## Q25: Key features by Java version

> Know the LTS versions — 8, 11, 17, 21. Most enterprises run on these.

| Version | LTS | Key features |
|---------|-----|-------------|
| **Java 8** (2014) | ✅ | Lambdas, Stream API, `Optional`, default methods, `java.time` API, `CompletableFuture` |
| Java 9 (2017) | | JPMS modules, `List.of()`/`Set.of()`/`Map.of()`, JShell, Compact Strings (`byte[]`), `invokedynamic` concat |
| Java 10 (2018) | | `var` local variable type inference |
| **Java 11** (2018) | ✅ | `HttpClient` API, `String.isBlank()`/`strip()`/`lines()`/`repeat()`, `var` in lambdas, single-file execution |
| Java 14 (2020) | | Switch expressions (standard), helpful NPE messages |
| Java 15 (2020) | | Text blocks (multi-line strings), ZGC stable |
| Java 16 (2021) | | Records (standard), `instanceof` pattern matching, `Stream.toList()` |
| **Java 17** (2021) | ✅ | Sealed classes (standard) |
| **Java 21** (2023) | ✅ | Virtual threads, pattern matching in switch, record patterns, Sequenced Collections, Generational ZGC |

::: details Full model answer

**Java 8 highlights (most important release ever):**
```java
// Lambdas + Streams
List<String> names = employees.stream()
    .filter(e -> e.isActive())
    .map(Employee::getName)
    .collect(Collectors.toList());

// Optional
Optional<User> user = repo.findById(id);
String name = user.map(User::getName).orElse("Unknown");

// java.time — replaces Calendar
LocalDate today = LocalDate.now();
LocalDateTime now = LocalDateTime.now();
ZonedDateTime zoned = ZonedDateTime.now(ZoneId.of("Europe/Warsaw"));
Duration d = Duration.between(start, end);
```

**Java 9 — `List.of()` immutable collections:**
```java
List<String> list = List.of("a", "b", "c");   // unmodifiable, no null
Map<String, Integer> map = Map.of("key", 1);
Set<String> set = Set.of("x", "y");
```

**Java 10 — `var`:**
```java
var list = new ArrayList<String>();  // infers ArrayList<String>
var map = new HashMap<String, List<Integer>>();  // saves verbose type declarations
// Only for local variables — not fields, parameters, or return types
```

**Java 11 — new String methods:**
```java
"  hello  ".strip();           // Unicode-aware trim (better than trim())
"".isBlank();                   // true if empty or whitespace
"a\nb\nc".lines().count();      // 3 — splits into stream of lines
"ha".repeat(3);                 // "hahaha"
```

**Java 14 — helpful NPE messages:**
```java
// Before Java 14:
// NullPointerException (no details)

// Java 14+:
// Cannot invoke "String.length()" because "name" is null
// Tells you EXACTLY which variable was null
```

**Java 15 — text blocks:**
```java
String json = """
    {
        "name": "Jan",
        "age": 30
    }
    """;
// Preserves formatting, no escape sequences needed for quotes
```

**Java 16 — pattern matching instanceof:**
```java
// Before
if (obj instanceof String) {
    String s = (String) obj;  // redundant cast
    System.out.println(s.length());
}

// Java 16+
if (obj instanceof String s) {
    System.out.println(s.length());  // s is already String
}
```

**Java 21 — Sequenced Collections:**
```java
// New interfaces: SequencedCollection, SequencedSet, SequencedMap
List<String> list = List.of("a", "b", "c");
list.getFirst();  // "a"
list.getLast();   // "c"
list.reversed();  // ["c", "b", "a"]
```

:::

> [!TIP] Golden Tip
> Know the **LTS versions: 8, 11, 17, 21**. Most enterprises run on one of these. When asked "what Java features do you use daily?", mention: **records** (replace data classes), **text blocks** (SQL/JSON in code), **pattern matching instanceof** (cleaner type checks), **`var`** (less verbosity), and **virtual threads** (if on Java 21). These show you've actually adopted modern Java, not just read about it.

**Follow-up questions:**
- What are the LTS releases and why do enterprises prefer them?
- What changed in the Java release cadence after Java 9?
- What features would you use to migrate a Java 8 codebase to Java 21?
