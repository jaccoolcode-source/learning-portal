---
title: Virtual Threads (Java 21)
description: Virtual Threads and Structured Concurrency — Project Loom, carrier threads, pinning, StructuredTaskScope, Spring Boot integration, and when to use virtual threads
category: concurrency
pageClass: layout-concurrency
difficulty: advanced
tags: [java21, virtual-threads, project-loom, structured-concurrency, spring-boot, concurrency]
related:
  - /concurrency/
  - /concurrency/threads
  - /concurrency/concurrent-utils
  - /modern-java/java9-12
estimatedMinutes: 25
---

# Virtual Threads (Java 21)

<DifficultyBadge level="advanced" />

Virtual Threads (Project Loom, GA in Java 21) fundamentally change how Java handles I/O-bound concurrency. They allow millions of concurrent tasks without the overhead of OS threads — enabling thread-per-request models at scale without reactive programming.

---

## The Problem with Platform Threads

```
Blocking I/O on a platform thread:

┌───────────────────────────────────────────────────────────┐
│  Platform Thread (OS thread, ~1 MB stack)                 │
│  ├── active: 5 ms  (actual CPU work)                      │
│  └── blocked: 995 ms  (waiting for DB/HTTP response)      │
└───────────────────────────────────────────────────────────┘
```

- Each platform thread maps 1:1 to an OS thread
- OS threads are expensive: ~1 MB stack, kernel context-switch cost
- Typical server: 200–500 threads max before memory/scheduling degrades
- 95%+ of time spent *waiting*, not computing — threads wasted
- Solution before Java 21: reactive programming (WebFlux, Project Reactor) — complex, hard to debug

---

## Virtual Threads — The Solution

```
Virtual Thread (user-space, ~few KB stack)

┌─────────────────────────────────────────────────────────────┐
│  ForkJoinPool (carrier threads — one per CPU core)          │
│  ├── Carrier 1: runs VT-A (active) → VT-A blocks → runs VT-B│
│  ├── Carrier 2: runs VT-C (active) → VT-C blocks → runs VT-D│
│  └── ... millions of virtual threads, few carrier threads   │
└─────────────────────────────────────────────────────────────┘
```

When a virtual thread blocks (on I/O, `Thread.sleep`, `lock.lock()`, etc.), the JVM **unmounts** it from the carrier thread and parks it. The carrier thread immediately picks up another runnable virtual thread. The blocking is cheap.

| | Platform Thread | Virtual Thread |
|--|----------------|----------------|
| Managed by | OS | JVM |
| Stack size | ~1 MB (fixed) | ~few KB (grows/shrinks) |
| Max count | Thousands | Millions |
| Context switch | Kernel (expensive) | User-space (cheap) |
| Blocking cost | Wastes OS thread | Unmounts, no waste |
| Best for | CPU-bound tasks | I/O-bound tasks |

---

## Creating Virtual Threads

```java
// 1. Thread.ofVirtual() — explicit creation
Thread vt = Thread.ofVirtual()
    .name("vt-worker")
    .start(() -> System.out.println("Running on virtual thread: "
        + Thread.currentThread().isVirtual()));

vt.join();

// 2. Thread.startVirtualThread() — shorthand
Thread vt2 = Thread.startVirtualThread(() -> fetchData());

// 3. Executor — most common in production
ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

try (executor) {
    for (int i = 0; i < 100_000; i++) {
        executor.submit(() -> processRequest());  // 100k virtual threads — no problem
    }
}

// 4. ThreadFactory for use with thread pools / Spring
ThreadFactory factory = Thread.ofVirtual().name("app-vt-", 0).factory();
```

```java
// Check if current thread is virtual
Thread.currentThread().isVirtual();   // true for virtual threads
```

---

## Virtual Threads with ExecutorService

```java
// newVirtualThreadPerTaskExecutor — one VT per submitted task
// DO NOT use a fixed-size pool — defeats the purpose
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    List<Future<String>> futures = IntStream.range(0, 10_000)
        .mapToObj(i -> executor.submit(() -> callExternalApi(i)))
        .toList();

    for (Future<String> f : futures) {
        System.out.println(f.get());
    }
}
// executor auto-closes (AutoCloseable since Java 19)
```

::: warning Don't pool virtual threads
Thread pools exist to limit the number of expensive platform threads. Virtual threads are cheap — pooling them adds overhead without benefit. Create a new VT per task.
:::

---

## Structured Concurrency (Java 21 Preview, Java 23 GA)

Structured Concurrency treats a group of concurrent tasks as a single unit of work with a defined lifetime — all tasks start together and all complete (or are cancelled) before the enclosing block exits.

```java
import java.util.concurrent.StructuredTaskScope;

String processOrder(long orderId) throws InterruptedException, ExecutionException {
    try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
        // Fork subtasks
        Subtask<User>      user      = scope.fork(() -> fetchUser(orderId));
        Subtask<Inventory> inventory = scope.fork(() -> checkInventory(orderId));
        Subtask<Payment>   payment   = scope.fork(() -> validatePayment(orderId));

        scope.join()           // wait for all three to complete
             .throwIfFailed(); // propagate first exception (cancels others)

        // All succeeded — results available
        return buildResponse(user.get(), inventory.get(), payment.get());
    }
    // scope closes → any unfinished subtasks are cancelled
}
```

### ShutdownOnFailure

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var a = scope.fork(() -> fetchA());
    var b = scope.fork(() -> fetchB());

    scope.join().throwIfFailed();  // if either fails, both are cancelled
    return combine(a.get(), b.get());
}
```

### ShutdownOnSuccess — First to Complete Wins

```java
// Race two implementations — use whoever responds first
try (var scope = new StructuredTaskScope.ShutdownOnSuccess<String>()) {
    scope.fork(() -> fetchFromPrimaryCache(id));
    scope.fork(() -> fetchFromSecondaryCache(id));

    return scope.join().result();  // returns first successful result
    // losing task is cancelled automatically
}
```

### Custom Scope

```java
class TimeoutScope<T> extends StructuredTaskScope<T> {
    private final Duration timeout;

    TimeoutScope(Duration timeout) {
        super(null, Thread.ofVirtual().factory());
        this.timeout = timeout;
    }

    @Override
    protected void handleComplete(Subtask<? extends T> subtask) {
        // custom completion logic
    }

    public StructuredTaskScope<T> joinWithTimeout() throws InterruptedException, TimeoutException {
        return joinUntil(Instant.now().plus(timeout));
    }
}
```

---

## Pinning — When Virtual Threads Block Carrier Threads

A virtual thread is **pinned** to its carrier thread when it holds a `synchronized` monitor during a blocking call. While pinned, the carrier cannot be reused — negating the benefit.

```java
// ❌ Causes pinning — synchronized + blocking I/O
synchronized (this) {
    String result = httpClient.get(url).body();  // blocks carrier thread while synchronized!
}

// ✓ Use ReentrantLock instead — virtual-thread friendly
private final ReentrantLock lock = new ReentrantLock();

lock.lock();
try {
    String result = httpClient.get(url).body();  // VT unmounts, carrier is free
} finally {
    lock.unlock();
}
```

### Detecting Pinning

```java
// JVM flag — logs pinning events
-Djdk.tracePinnedThreads=full

// Or with JFR (Java Flight Recorder)
jcmd <pid> JFR.start name=pinning settings=default
```

Common sources of pinning:
- `synchronized` blocks/methods with blocking I/O (JDBC drivers, old libraries)
- Native methods (`synchronized` + JNI)

::: tip JDBC and pinning
Traditional JDBC drivers use `synchronized` internally — every DB call pins the carrier. Use R2DBC (reactive) or wait for JDBC drivers to migrate to `ReentrantLock`. HikariCP and PostgreSQL JDBC driver are working on this. For now, virtual threads still help if the pool is large enough to not exhaust carriers.
:::

---

## ScopedValue — Replacing ThreadLocal

`ThreadLocal` with virtual threads has a problem: if you create millions of VTs, each gets its own `ThreadLocal` copy — potential memory pressure. `ScopedValue` (Java 21 Preview, Java 23) is the replacement.

```java
// ThreadLocal — mutable, inherited by child threads, leaked if not removed
static ThreadLocal<String> REQUEST_ID = new ThreadLocal<>();
REQUEST_ID.set("req-123");
// must call REQUEST_ID.remove() in finally block

// ScopedValue — immutable, scoped to a block, no cleanup needed
static final ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();

ScopedValue.where(REQUEST_ID, "req-123")
           .run(() -> {
               processRequest();   // REQUEST_ID.get() returns "req-123" here
           });
// automatically unset after run() completes — no cleanup needed
```

```java
// Read in nested code (like ThreadLocal.get())
String id = REQUEST_ID.get();      // throws NoSuchElementException if not bound
String id = REQUEST_ID.orElse("unknown");   // safe default
boolean bound = REQUEST_ID.isBound();
```

---

## Spring Boot 3.2 — Virtual Thread Support

Enable virtual threads for all web request handling with a single property:

```yaml
# application.yml
spring:
  threads:
    virtual:
      enabled: true   # Tomcat / Jetty / Undertow uses virtual threads per request
```

```java
// Or configure programmatically
@Configuration
public class VirtualThreadConfig {

    @Bean
    public TomcatProtocolHandlerCustomizer<?> virtualThreadsProtocolHandler() {
        return protocolHandler ->
            protocolHandler.setExecutor(Executors.newVirtualThreadPerTaskExecutor());
    }

    // Also configure @Async to use virtual threads
    @Bean
    public AsyncTaskExecutor applicationTaskExecutor() {
        return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    }

    // Configure @Scheduled
    @Bean
    public ScheduledExecutorService scheduledExecutorService() {
        return Executors.newScheduledThreadPool(1, Thread.ofVirtual().factory());
    }
}
```

With `spring.threads.virtual.enabled=true`, Spring also configures:
- `@Async` executor
- `@Scheduled` executor
- Spring MVC thread pool
- Spring Data async operations

---

## Concurrency Model Comparison

```
Request handling — 10,000 concurrent requests to a DB-heavy API:

Platform Thread Pool (200 threads):
  → 9,800 requests queued, ~200 active
  → high latency, potential queue overflow

Reactive (WebFlux):
  → ~8 event-loop threads, non-blocking
  → complex code, callback chains, difficult debugging

Virtual Threads (Spring Boot 3.2 + Loom):
  → 10,000 virtual threads, each blocked on I/O
  → simple imperative code, stack traces, debugger works
  → JVM manages scheduling transparently
```

| Model | Code Style | Throughput | Debugging | Blocking Safe? |
|-------|-----------|------------|-----------|----------------|
| Platform thread pool | Imperative | Limited by pool | Easy | Yes (but wastes threads) |
| Reactive (WebFlux) | Reactive chain | Very high | Hard | Yes (non-blocking) |
| Virtual threads | Imperative | Very high | Easy | Yes (cheap blocking) |

---

## When NOT to Use Virtual Threads

Virtual threads shine for **I/O-bound** work. Avoid for:

- **CPU-bound tasks** — a VT on a carrier doesn't yield. Use `ForkJoinPool` or a fixed platform thread pool.
- **Tasks with `synchronized` + blocking I/O** — pinning negates the benefit. Migrate to `ReentrantLock`.
- **Long-lived stateful threads** — virtual threads are designed for short-lived tasks.

```java
// CPU-bound: use ForkJoinPool (platform threads for compute)
ForkJoinPool.commonPool().submit(() -> crunchNumbers(data));

// I/O-bound: use virtual threads
Executors.newVirtualThreadPerTaskExecutor().submit(() -> callDatabase());
```

---

## Migration Path

```
1. Update to Java 21+
2. Replace Executors.newFixedThreadPool(n) with Executors.newVirtualThreadPerTaskExecutor()
   → for I/O-bound workloads
3. Spring Boot 3.2+: set spring.threads.virtual.enabled=true
4. Audit synchronized blocks with blocking I/O → replace with ReentrantLock
5. Run with -Djdk.tracePinnedThreads=full and resolve pinning
6. Replace ThreadLocal with ScopedValue where lifetime is request-scoped
```

---

## Interview Quick-Fire

**Q: What is a virtual thread and how does it differ from a platform thread?**
A virtual thread is a lightweight JVM-managed thread that maps many-to-few onto OS (platform) threads called carrier threads. When a virtual thread blocks (I/O, sleep, lock), the JVM unmounts it from the carrier thread — the carrier is immediately available for another virtual thread. Platform threads map 1:1 to OS threads; blocking wastes the OS thread. Virtual threads allow millions of concurrent tasks with simple imperative code, without reactive programming.

**Q: What is thread pinning and how do you avoid it?**
Pinning occurs when a virtual thread holds a `synchronized` monitor during a blocking operation — the carrier thread is stuck until the VT unblocks. This negates virtual thread benefits. Fix: replace `synchronized` with `ReentrantLock`, which the JVM can safely unmount from. Detect pinning with `-Djdk.tracePinnedThreads=full`.

**Q: What is Structured Concurrency and what problem does it solve?**
Structured Concurrency (`StructuredTaskScope`) ensures that concurrent subtasks started in a scope all complete (or are cancelled) before the scope exits. This solves fork/join lifecycle management: if one subtask fails, others are automatically cancelled; if the scope exits, no subtask outlives it. It prevents thread leaks, makes error handling explicit, and makes concurrent code readable with a clear start/end boundary — similar to how structured programming (try/catch) replaced goto.

**Q: Should you still use reactive programming (WebFlux) with virtual threads available?**
For most I/O-bound Spring Boot services, virtual threads (`spring.threads.virtual.enabled=true`) provide equivalent throughput with much simpler imperative code. Reactive (WebFlux) still makes sense for streaming data (SSE, WebSocket), backpressure control, or when deep reactive library integration is needed. For most CRUD/API services, virtual threads eliminate the complexity tradeoff.

<RelatedTopics :topics="['/concurrency/', '/concurrency/threads', '/concurrency/concurrent-utils', '/modern-java/java9-12']" />

[→ Back to Concurrency Overview](/concurrency/)
