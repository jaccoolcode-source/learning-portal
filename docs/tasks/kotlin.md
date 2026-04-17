---
title: Kotlin Tasks
description: 9 practical Kotlin tasks — null safety, extension functions, coroutines, Flow, sealed state machines — with suggested solutions
---

# Kotlin Tasks

Tasks 36–44 covering idiomatic Kotlin, coroutines, and functional patterns.

---

### Task 36 — Null-Safe Config Chain

**Difficulty:** Easy

**Problem:** Parse a config map of type `Map<String, String>?`. Retrieve key `"timeout"`, parse it as an `Int`, and return it. If the map is null, the key is missing, or the value is not a valid integer, return the default `30`.

**Suggested Solution**
```kotlin
fun getTimeout(config: Map<String, String>?): Int =
    config?.get("timeout")?.toIntOrNull() ?: 30
```

**Why this approach:** The safe-call chain (`?.`) short-circuits to `null` at the first missing link. `toIntOrNull()` returns `null` for invalid strings instead of throwing. The Elvis operator (`?:`) provides the fallback — all in one expression with no `if`/`try` clutter.

---

### Task 37 — Extension Function: `String.toSlug()`

**Difficulty:** Easy

**Problem:** Add a `toSlug()` extension function to `String` that converts a title like `"  Hello, World! 123  "` into a URL slug `"hello-world-123"`.

Rules: lowercase, trim, replace non-alphanumeric characters with hyphens, collapse multiple hyphens, strip leading/trailing hyphens.

**Suggested Solution**
```kotlin
fun String.toSlug(): String = this
    .trim()
    .lowercase()
    .replace(Regex("[^a-z0-9]+"), "-")
    .trim('-')

// Usage
"  Hello, World! 123  ".toSlug()  // → "hello-world-123"
"Java & Kotlin -- Best Practices".toSlug() // → "java-kotlin-best-practices"
```

**Why this approach:** Extension functions add behaviour to existing types without inheritance. The `[^a-z0-9]+` regex with `+` collapses consecutive non-alphanumeric characters into a single hyphen, avoiding double hyphens. `trim('-')` removes edge hyphens cleanly.

---

### Task 38 — Data Class + `copy` for Immutable Updates

**Difficulty:** Easy

**Problem:** Model an `Order` data class with `id`, `status`, `items: List<String>`, and `total: BigDecimal`. Write a function `addItem(order: Order, item: String, price: BigDecimal): Order` that returns a new `Order` with the item added and total updated — without mutating the original.

**Suggested Solution**
```kotlin
data class Order(
    val id: String,
    val status: String,
    val items: List<String>,
    val total: BigDecimal
)

fun addItem(order: Order, item: String, price: BigDecimal): Order =
    order.copy(
        items = order.items + item,           // creates a new list
        total = order.total + price
    )

// Usage
val original = Order("o1", "DRAFT", emptyList(), BigDecimal.ZERO)
val updated  = addItem(original, "Widget", BigDecimal("9.99"))
// original is unchanged; updated has items=["Widget"], total=9.99
```

**Why this approach:** `copy()` creates a new instance with only the specified fields changed — all other fields are preserved. `order.items + item` creates a new `List` (Kotlin's `+` on immutable lists returns a new list), so the original `Order` is never mutated.

---

### Task 39 — Sealed Class State Machine

**Difficulty:** Medium

**Problem:** Model an `Order` lifecycle as a sealed class. Valid transitions: `Draft → Confirmed → Shipped → Delivered`. Any invalid transition should throw `IllegalStateException`. Implement a `transition(event: OrderEvent): OrderState` function.

**Suggested Solution**
```kotlin
sealed class OrderState {
    object Draft     : OrderState()
    object Confirmed : OrderState()
    object Shipped   : OrderState()
    object Delivered : OrderState()
}

sealed class OrderEvent {
    object Confirm : OrderEvent()
    object Ship    : OrderEvent()
    object Deliver : OrderEvent()
}

fun OrderState.transition(event: OrderEvent): OrderState = when (this) {
    is OrderState.Draft     -> when (event) {
        is OrderEvent.Confirm -> OrderState.Confirmed
        else -> throw IllegalStateException("Cannot $event in Draft state")
    }
    is OrderState.Confirmed -> when (event) {
        is OrderEvent.Ship -> OrderState.Shipped
        else -> throw IllegalStateException("Cannot $event in Confirmed state")
    }
    is OrderState.Shipped   -> when (event) {
        is OrderEvent.Deliver -> OrderState.Delivered
        else -> throw IllegalStateException("Cannot $event in Shipped state")
    }
    is OrderState.Delivered -> throw IllegalStateException("Order already delivered")
}
```

**Why this approach:** Sealed classes make the state set closed — the compiler verifies all states are handled in `when` expressions. Extension functions keep the state machine logic decoupled from the data classes themselves.

---

### Task 40 — Coroutine: Parallel API Calls

**Difficulty:** Medium

**Problem:** Given a list of user IDs, fetch each user's profile and order count concurrently (simulated with `delay`). Return a list of `UserSummary(id, name, orderCount)`. Total time should be roughly the time of the slowest single call, not the sum.

**Suggested Solution**
```kotlin
data class UserSummary(val id: String, val name: String, val orderCount: Int)

suspend fun fetchSummaries(userIds: List<String>): List<UserSummary> = coroutineScope {
    userIds.map { id ->
        async {
            val profile    = async { fetchProfile(id) }    // both start immediately
            val orderCount = async { fetchOrderCount(id) }
            UserSummary(id, profile.await().name, orderCount.await())
        }
    }.awaitAll()
}

// Simulated suspending functions
suspend fun fetchProfile(id: String): UserProfile { delay(200); return UserProfile(id, "User $id") }
suspend fun fetchOrderCount(id: String): Int { delay(150); return (1..10).random() }
```

**Why this approach:** `async` inside `coroutineScope` launches coroutines that run concurrently within the scope. `awaitAll()` collects all results and propagates the first exception if any call fails, cancelling remaining coroutines automatically.

---

### Task 41 — Flow: Paginated Results

**Difficulty:** Medium

**Problem:** Implement a `Flow<Product>` that lazily fetches paginated products from a (simulated) API. Each page has 10 items. The flow stops when a page returns fewer than 10 items (last page). The caller should be able to cancel mid-stream.

**Suggested Solution**
```kotlin
data class Product(val id: Int, val name: String)

fun productFlow(pageSize: Int = 10): Flow<Product> = flow {
    var page = 0
    while (true) {
        val products = fetchPage(page++, pageSize)  // suspend API call
        products.forEach { emit(it) }
        if (products.size < pageSize) break         // last page
    }
}

// Simulated page fetch
suspend fun fetchPage(page: Int, size: Int): List<Product> {
    delay(100) // network delay
    val start = page * size
    return (start until minOf(start + size, 35))  // 35 total products
        .map { Product(it, "Product $it") }
}

// Usage
suspend fun main() {
    productFlow()
        .filter { it.id % 2 == 0 }
        .take(5)
        .collect { println(it) }
}
```

**Why this approach:** `flow { }` builder is lazy — nothing executes until a collector subscribes. Emitting item-by-item with `emit` lets downstream operators like `filter` and `take` work on individual elements without buffering the entire dataset.

---

### Task 42 — Scope Functions: `let`/`apply`/`also`/`run`

**Difficulty:** Easy

**Problem:** Demonstrate the four main scope functions by building a `User` object, logging it, validating it, and making an API call — each using the most appropriate scope function and explaining the choice.

**Suggested Solution**
```kotlin
data class User(var name: String = "", var email: String = "")

fun processUser(rawName: String?, rawEmail: String?): User? {
    // let — transform a nullable value; result is the lambda return
    val name = rawName?.let { it.trim().takeIf { n -> n.isNotEmpty() } }
        ?: return null  // short-circuit if name is blank

    // apply — configure an object; returns the object itself
    val user = User().apply {
        this.name  = name
        this.email = rawEmail?.trim() ?: ""
    }

    // also — side effects without changing the object; returns the object
    user.also { log.info("Created user: $it") }

    // run — execute a block and return its result; used for validation
    val isValid = user.run {
        email.contains("@") && name.length >= 2
    }

    return if (isValid) user else null
}
```

**Why this approach:**
- `let` — nullable receiver, result is the lambda value (transform/unwrap)
- `apply` — configuring a newly created object (builder-style)
- `also` — side effects like logging (doesn't change the pipeline)
- `run` — compute something from the object without needing a local variable

---

### Task 43 — Higher-Order Function: Retry with Exponential Backoff

**Difficulty:** Medium

**Problem:** Write a generic suspend function `retryWithBackoff<T>(times: Int, initialDelay: Long, block: suspend () -> T): T` that retries the block on exception, doubling the delay each time.

**Suggested Solution**
```kotlin
suspend fun <T> retryWithBackoff(
    times: Int,
    initialDelayMs: Long = 100,
    maxDelayMs: Long = 10_000,
    block: suspend () -> T
): T {
    var delayMs = initialDelayMs
    repeat(times - 1) { attempt ->
        try {
            return block()
        } catch (e: Exception) {
            log.warn("Attempt ${attempt + 1} failed: ${e.message}. Retrying in ${delayMs}ms")
            delay(delayMs)
            delayMs = minOf(delayMs * 2, maxDelayMs)
        }
    }
    return block() // last attempt — let exception propagate
}

// Usage
val result = retryWithBackoff(times = 4, initialDelayMs = 200) {
    httpClient.get("https://api.example.com/data")
}
```

**Why this approach:** Higher-order suspend functions compose cleanly with coroutines. `minOf(delay * 2, maxDelay)` caps the backoff to avoid unbounded waits. The last call outside `repeat` propagates the exception naturally rather than catching and re-throwing.

---

### Task 44 — Inline Reified Generic: `parseJson<T>`

**Difficulty:** Medium

**Problem:** Write an `inline fun <reified T> parseJson(json: String): T` that uses Jackson's `ObjectMapper` to deserialise a JSON string to any type `T` without passing a `Class<T>` parameter.

**Suggested Solution**
```kotlin
val mapper = ObjectMapper().apply {
    registerModule(KotlinModule.Builder().build())
    configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false)
}

inline fun <reified T> parseJson(json: String): T =
    mapper.readValue(json, object : TypeReference<T>() {})

// Usage — no Class<T> needed at call site
data class Order(val id: String, val amount: Double)

val order  = parseJson<Order>("""{"id":"o1","amount":9.99}""")
val orders = parseJson<List<Order>>("""[{"id":"o1","amount":9.99}]""")
```

**Why this approach:** Kotlin's `reified` type parameters preserve the actual type at runtime (unlike Java generics). `TypeReference<T>()` captures generic type info that Jackson needs for parameterised types like `List<Order>`. Without `reified`, you'd have to pass `Order::class.java` manually.

---

<RelatedTopics :topics="['/kotlin/', '/tasks/modern-java', '/tasks/java-concurrency']" />

[→ Back to Tasks Overview](/tasks/)
