---
title: Kotlin vs Java
description: Side-by-side comparison of Kotlin and Java — null safety, data classes, coroutines, interop, and when to choose each
category: kotlin
pageClass: layout-kotlin
difficulty: intermediate
tags: [kotlin, java, comparison, interop, null-safety, coroutines, data-class, sealed]
estimatedMinutes: 30
---

# Kotlin vs Java

<DifficultyBadge level="intermediate" />

Kotlin and Java compile to the same bytecode and run on the same JVM. This page compares them feature by feature so you can make informed decisions about when to use each.

---

## Null Safety

```java
// Java — NullPointerException lurks everywhere
public String getUpperCaseName(User user) {
    if (user == null) return "UNKNOWN";
    String name = user.getName();
    if (name == null) return "UNKNOWN";
    return name.toUpperCase();
}

// Java with Optional (partial solution — not enforced by compiler)
public String getUpperCaseName(Optional<User> user) {
    return user.map(User::getName)
               .map(String::toUpperCase)
               .orElse("UNKNOWN");
}
```

```kotlin
// Kotlin — null safety enforced at compile time
fun getUpperCaseName(user: User?): String =
    user?.name?.uppercase() ?: "UNKNOWN"

// The compiler won't let you call .uppercase() on String? without handling null first
```

**Verdict:** Kotlin's null safety is enforced by the type system — misuse is a compile error, not a runtime crash. Java's Optional is a convention, not a guarantee.

---

## Data Classes vs Records vs Lombok

```java
// Java 16+ Record — immutable, concise
record Order(String id, String customerId, double amount) {}

// Java with Lombok — mutable builder, more flexible
@Data
@Builder
@AllArgsConstructor
public class Order {
    private String id;
    private String customerId;
    private double amount;
}
```

```kotlin
// Kotlin data class — concise, immutable by default, copy() built in
data class Order(
    val id: String,
    val customerId: String,
    val amount: Double
)

val updated = order.copy(amount = 149.99)  // create modified copy
```

**Verdict:** Kotlin data classes are more flexible than Java records (mutable fields with `var`, default values, copy with specific fields). Kotlin doesn't need Lombok at all.

---

## Boilerplate Comparison

```java
// Java — creating a service with dependency injection
@Service
public class OrderService {
    private final OrderRepository repository;
    private final PaymentService paymentService;

    public OrderService(OrderRepository repository, PaymentService paymentService) {
        this.repository = repository;
        this.paymentService = paymentService;
    }

    public Order createOrder(String customerId, double amount) {
        Order order = new Order(UUID.randomUUID().toString(), customerId, amount);
        return repository.save(order);
    }
}
```

```kotlin
// Kotlin — same service, much less boilerplate
@Service
class OrderService(
    private val repository: OrderRepository,
    private val paymentService: PaymentService
) {
    fun createOrder(customerId: String, amount: Double): Order =
        repository.save(Order(UUID.randomUUID().toString(), customerId, amount))
}
```

---

## Extension Functions vs Utility Classes

```java
// Java — utility class
public class StringUtils {
    public static boolean isPalindrome(String s) {
        return s.equals(new StringBuilder(s).reverse().toString());
    }
}
StringUtils.isPalindrome("racecar");   // call site is verbose
```

```kotlin
// Kotlin — extension function (reads naturally)
fun String.isPalindrome() = this == this.reversed()
"racecar".isPalindrome()   // reads like a method on String
```

Extension functions don't modify the class — they compile to static methods. They can be imported selectively and add functionality without inheritance.

---

## Coroutines vs CompletableFuture vs Virtual Threads

```java
// Java CompletableFuture — callback chaining
CompletableFuture<Order> future = fetchUser(userId)
    .thenCompose(user -> validateUser(user))
    .thenCompose(user -> createOrder(user, amount))
    .thenApply(order -> {
        notifyCustomer(order);
        return order;
    })
    .exceptionally(ex -> {
        log.error("Failed", ex);
        return null;
    });

// Java 21 Virtual Threads — blocking style, no chaining
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    Order order = executor.submit(() -> {
        User user = fetchUser(userId);   // blocks virtual thread, not OS thread
        validateUser(user);
        return createOrder(user, amount);
    }).get();
}
```

```kotlin
// Kotlin Coroutines — sequential style, truly async
suspend fun processOrder(userId: String, amount: Double): Order {
    val user = fetchUser(userId)      // suspends, doesn't block a thread
    validateUser(user)
    val order = createOrder(user, amount)
    notifyCustomer(order)             // can run concurrently with other coroutines
    return order
}

// Parallel execution
suspend fun fetchDashboard(userId: String): Dashboard {
    val ordersDeferred = async { fetchOrders(userId) }
    val profileDeferred = async { fetchProfile(userId) }
    return Dashboard(ordersDeferred.await(), profileDeferred.await())
}
```

**Verdict:** Coroutines write like synchronous code but run asynchronously. Java 21 virtual threads achieve similar readability for blocking I/O. Coroutines are more flexible for non-blocking reactive pipelines, cancellation, and backpressure (Flow).

---

## Sealed Classes

```java
// Java 17+ sealed class
public sealed interface Shape permits Circle, Rectangle, Triangle {}
public record Circle(double radius) implements Shape {}
public record Rectangle(double width, double height) implements Shape {}

double area = switch (shape) {
    case Circle c    -> Math.PI * c.radius() * c.radius();
    case Rectangle r -> r.width() * r.height();
    case Triangle t  -> /* ... */;
};
```

```kotlin
// Kotlin sealed class/interface
sealed interface Shape
data class Circle(val radius: Double) : Shape
data class Rectangle(val width: Double, val height: Double) : Shape

val area = when (shape) {
    is Circle    -> Math.PI * shape.radius * shape.radius
    is Rectangle -> shape.width * shape.height
}   // exhaustive — no else needed, compiler enforces completeness
```

Both handle exhaustiveness in switch/when. Kotlin has had sealed classes since Kotlin 1.0 (2016); Java added them in Java 17 (2021).

---

## Interoperability

### Calling Java from Kotlin

```kotlin
// Java classes work seamlessly
val list = ArrayList<String>()   // java.util.ArrayList
list.add("hello")
Collections.sort(list)

// Platform types — Java types without nullability annotation are String! (unknown nullability)
val javaString: String! = javaClass.getName()   // treat carefully
```

### Calling Kotlin from Java

```kotlin
// Kotlin file: OrderUtils.kt
object OrderUtils {
    @JvmStatic fun createOrderId() = UUID.randomUUID().toString()
}

data class Order(val id: String, val amount: Double) {
    companion object {
        @JvmStatic fun empty() = Order("", 0.0)
    }
}
```

```java
// Java calling Kotlin
String id = OrderUtils.createOrderId();   // @JvmStatic makes it look like static
Order empty = Order.empty();

// Without @JvmStatic, Java would need:
OrderUtils.INSTANCE.createOrderId();
Order.Companion.empty();
```

**Key annotations for Java interop:**

| Annotation | Effect |
|-----------|--------|
| `@JvmStatic` | Generates a static method (in addition to the instance method on companion/object) |
| `@JvmField` | Exposes a Kotlin property as a public Java field (no getter/setter) |
| `@JvmOverloads` | Generates Java overloads for functions with default parameters |
| `@Throws(IOException::class)` | Adds `throws` declaration to bytecode (Java checked exceptions) |

---

## When to Choose Kotlin vs Java

| Choose Kotlin when… | Choose Java when… |
|--------------------|------------------|
| New Android development | Team has deep Java expertise with no Kotlin knowledge |
| New Spring Boot service (greenfield) | Large existing Java codebase — incremental migration risk |
| You want concise, expressive code | You need maximum Java library/framework compatibility |
| Coroutines are needed for reactive workloads | Java 21 virtual threads suffice for your use case |
| Null safety is a priority | Team prefers explicit verbosity and Optional |

::: tip Mixed projects work well
Kotlin and Java files can coexist in the same Maven/Gradle project. A common migration strategy: write new classes in Kotlin, leave existing Java untouched.
:::

---

## Interview Quick-Fire

**Q: Is Kotlin slower than Java?**
No — both compile to the same JVM bytecode and have similar runtime performance. Inline functions in Kotlin can actually be faster than Java equivalents (no lambda allocation). Kotlin coroutines are faster than Java thread-per-request for high-concurrency I/O workloads.

**Q: What is a platform type in Kotlin?**
When Kotlin calls Java code that has no `@Nullable`/`@NonNull` annotations, it can't determine nullability. Such types are "platform types" (notated `String!`). The compiler skips null checks for them — they're treated as if they could be either nullable or non-nullable. This is where NPEs can still occur in Kotlin when interoperating with Java.

**Q: Does Kotlin replace Java?**
Not entirely. Java remains dominant in enterprise and legacy systems. Kotlin is the default for Android and increasingly popular for new backend services. JetBrains designed Kotlin to coexist with Java, not replace it.

<RelatedTopics :topics="['/kotlin/kotlin-basics', '/kotlin/coroutines', '/modern-java/']" />

[→ Back to Kotlin Overview](/kotlin/)
