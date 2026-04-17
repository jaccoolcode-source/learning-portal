---
title: Kotlin Coroutines
description: Kotlin coroutines — suspend functions, launch vs async, structured concurrency, Flow, exception handling, and Spring Boot integration
category: kotlin
pageClass: layout-kotlin
difficulty: advanced
tags: [kotlin, coroutines, suspend, async, flow, structured-concurrency, spring-boot]
estimatedMinutes: 35
---

# Kotlin Coroutines

<DifficultyBadge level="advanced" />

Coroutines are Kotlin's solution for asynchronous programming. They let you write async code that looks sequential, without blocking threads.

---

## What is a Coroutine?

A coroutine is a **suspendable computation** — it can pause (suspend) at a `suspend` function call and resume later, freeing the thread while waiting.

```
Thread model (traditional):
  Thread 1: [waiting for DB...]  ← blocked, OS thread wasted
  Thread 2: [waiting for HTTP...] ← blocked

Coroutine model:
  Thread 1: [coroutine A runs] → suspends (waiting for DB) →
            [coroutine B runs] → suspends →
            [coroutine A resumes with DB result] → completes
  → One thread handles many coroutines
```

A coroutine is not a thread — it's a lightweight unit of work that can be suspended and resumed. Millions of coroutines can run on a handful of threads.

---

## suspend Functions

A `suspend` function can be paused and resumed. It can only be called from another `suspend` function or a coroutine builder.

```kotlin
// suspend marks a function as potentially asynchronous
suspend fun fetchOrder(id: String): Order {
    delay(100)   // suspend for 100ms — doesn't block the thread
    return orderRepository.findById(id)
}

suspend fun fetchUser(id: String): User {
    return userRepository.findById(id)
}

// Sequential — reads like synchronous code
suspend fun processOrder(orderId: String): OrderSummary {
    val order = fetchOrder(orderId)    // suspends, resumes when done
    val user  = fetchUser(order.customerId)
    return OrderSummary(order, user)
}
```

---

## Coroutine Builders

### launch — fire and forget

```kotlin
import kotlinx.coroutines.*

fun main() = runBlocking {
    launch {
        delay(1000)
        println("World!")
    }
    println("Hello,")
    // Output: Hello,  World!   (in that order)
}
```

### async / await — return a value

```kotlin
suspend fun parallelFetch(orderId: String): Dashboard = coroutineScope {
    // Both start immediately and run concurrently
    val orderDeferred  = async { fetchOrder(orderId) }
    val profileDeferred = async { fetchUserProfile(orderId) }

    // await() suspends until each result is ready
    Dashboard(
        order   = orderDeferred.await(),
        profile = profileDeferred.await()
    )
    // Total time = max(fetchOrder time, fetchUserProfile time)  — not sum
}
```

### runBlocking — bridge to blocking world

```kotlin
// Used in main() and tests only — blocks the current thread until coroutines complete
fun main() = runBlocking {
    val result = fetchOrder("ord-1")
    println(result)
}
```

---

## Structured Concurrency

Structured concurrency ensures coroutines don't leak. Every coroutine must run within a **CoroutineScope** — when the scope is cancelled, all child coroutines are cancelled too.

```kotlin
// coroutineScope — creates a scope; suspends until all children complete
suspend fun loadDashboard(): Dashboard = coroutineScope {
    val orders = async { fetchOrders() }
    val news   = async { fetchNews() }
    Dashboard(orders.await(), news.await())
}
// If fetchOrders() throws, fetchNews() is cancelled automatically

// supervisorScope — children are independent; one failure doesn't cancel siblings
suspend fun loadDashboard(): Dashboard = supervisorScope {
    val orders = async { fetchOrders() }
    val news   = async { runCatching { fetchNews() }.getOrNull() }  // optional
    Dashboard(orders.await(), news.await())
}
```

---

## Coroutine Scope and Context

```kotlin
// CoroutineContext defines the thread pool, job, and dispatcher
launch(Dispatchers.IO) {
    // Runs on a thread pool optimised for blocking I/O (up to 64 threads)
    val data = blockingNetworkCall()
}

launch(Dispatchers.Default) {
    // CPU-intensive work — thread count = CPU cores
    val result = computeIntensiveTask()
}

launch(Dispatchers.Main) {
    // Android main thread / UI updates
}

// withContext switches dispatcher mid-coroutine
suspend fun fetchAndParse(url: String): Data {
    val raw = withContext(Dispatchers.IO) { httpClient.get(url) }  // IO thread
    return withContext(Dispatchers.Default) { parseJson(raw) }     // CPU thread
}
```

---

## Flow — Asynchronous Streams

`Flow<T>` is a cold, asynchronous stream of values — like a lazy `Sequence` but with suspend support.

```kotlin
// Producer — emits values lazily
fun orderUpdates(orderId: String): Flow<OrderStatus> = flow {
    while (true) {
        val status = fetchStatus(orderId)  // suspend function
        emit(status)
        delay(5000)  // poll every 5 seconds
    }
}

// Consumer — collects values
suspend fun watchOrder(orderId: String) {
    orderUpdates(orderId)
        .filter { it != OrderStatus.PENDING }
        .map { status -> "Order is now: $status" }
        .take(3)                          // collect only first 3 updates
        .collect { message ->
            println(message)              // suspends until each value arrives
        }
}
```

### Flow vs Java Stream vs RxJava

| | Flow | Java Stream | RxJava Observable |
|--|------|-------------|------------------|
| **Async** | Yes (suspend) | No (blocking) | Yes (callbacks) |
| **Cold** | Yes | Yes | Depends (cold/hot) |
| **Cancellation** | Structured (scope) | Manual | Disposable |
| **Backpressure** | Built-in | N/A | Flowable |
| **Code style** | Sequential | Functional chain | Reactive chain |

### StateFlow and SharedFlow (hot flows)

```kotlin
// StateFlow — always has a current value (like LiveData)
val _status = MutableStateFlow(OrderStatus.PENDING)
val status: StateFlow<OrderStatus> = _status.asStateFlow()

// Update state
_status.value = OrderStatus.PAID

// SharedFlow — broadcast to multiple collectors
val _events = MutableSharedFlow<OrderEvent>()
val events: SharedFlow<OrderEvent> = _events.asSharedFlow()

// Emit an event
_events.emit(OrderCreatedEvent(orderId))
```

---

## Exception Handling

```kotlin
// try-catch works normally inside coroutines
launch {
    try {
        val order = fetchOrder("ord-1")
        processOrder(order)
    } catch (e: NetworkException) {
        log.error("Network error", e)
    }
}

// CoroutineExceptionHandler — catches uncaught exceptions in launch
val handler = CoroutineExceptionHandler { _, exception ->
    log.error("Unhandled coroutine exception", exception)
}

launch(handler) {
    throw RuntimeException("Oops")
}

// async exceptions are deferred until await()
val deferred = async { riskyOperation() }
try {
    val result = deferred.await()  // exception thrown here
} catch (e: Exception) {
    log.error("async failed", e)
}
```

---

## Spring Boot + Kotlin Coroutines

Spring WebFlux and Spring MVC (Spring 6+) both support suspend functions natively.

```kotlin
// build.gradle.kts
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-webflux")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactor")
}
```

```kotlin
@RestController
@RequestMapping("/orders")
class OrderController(private val orderService: OrderService) {

    // suspend function — Spring handles the coroutine lifecycle
    @GetMapping("/{id}")
    suspend fun getOrder(@PathVariable id: String): Order =
        orderService.findById(id)

    @PostMapping
    suspend fun createOrder(@RequestBody request: CreateOrderRequest): ResponseEntity<Order> {
        val order = orderService.create(request)
        return ResponseEntity.created(URI("/orders/${order.id}")).body(order)
    }
}

@Service
class OrderService(private val repository: OrderRepository) {

    // suspend + @Transactional — Spring handles transaction in coroutine context
    @Transactional
    suspend fun create(request: CreateOrderRequest): Order {
        val order = Order(UUID.randomUUID().toString(), request.customerId, request.amount)
        return repository.save(order)  // R2DBC suspend repository
    }
}

// R2DBC repository — coroutine-based (no blocking)
interface OrderRepository : CoroutineCrudRepository<Order, String>
```

---

## Interview Quick-Fire

**Q: What is the difference between `launch` and `async`?**
`launch` starts a coroutine for side effects — it returns a `Job` and doesn't produce a result. `async` starts a coroutine that returns a value — it returns `Deferred<T>` and you call `.await()` to get the result. Both start immediately.

**Q: What does `suspend` mean?**
A `suspend` function can be paused mid-execution (suspending the coroutine) without blocking the underlying thread. The thread is freed while waiting and can run other coroutines. Execution resumes on (potentially a different) thread when the awaited operation completes.

**Q: What is structured concurrency?**
Coroutines must run within a scope. When the scope is cancelled or throws, all child coroutines are automatically cancelled — no coroutines leak or run indefinitely. This mirrors how structured programming (if/for/try blocks) brought discipline to control flow.

**Q: What is a Flow and when would you use it over a suspend function?**
A `suspend` function returns one value. `Flow<T>` emits multiple values over time — like an async sequence. Use Flow for streaming data: real-time updates, paginated results, sensor readings, event streams. `StateFlow` and `SharedFlow` are hot flows for sharing state across multiple collectors.

<RelatedTopics :topics="['/kotlin/kotlin-basics', '/kotlin/kotlin-vs-java', '/concurrency/']" />

[→ Back to Kotlin Overview](/kotlin/)
