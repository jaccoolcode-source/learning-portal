---
title: Threads
description: Java Thread basics — Thread, Runnable, Callable, thread states, daemon threads, thread groups
category: concurrency
pageClass: layout-concurrency
difficulty: intermediate
tags: [java, threads, runnable, callable, thread-states, daemon]
related:
  - /concurrency/synchronization
  - /concurrency/concurrent-utils
  - /java-memory/jvm-structure
estimatedMinutes: 20
---

# Threads

<DifficultyBadge level="intermediate" />

A thread is the smallest unit of execution. Java programs have at least one thread (the main thread) and can spawn additional threads for parallel work.

---

## Creating Threads

### 1. Extend Thread

```java
public class MyThread extends Thread {
    @Override
    public void run() {
        System.out.println("Running in: " + Thread.currentThread().getName());
    }
}

MyThread t = new MyThread();
t.start(); // starts a new thread; calling run() directly would execute on current thread!
```

### 2. Implement Runnable (preferred)

```java
Runnable task = () -> System.out.println("Task running in: " + Thread.currentThread().getName());

Thread t = new Thread(task);
t.start();

// Or via executor (better for production):
ExecutorService pool = Executors.newFixedThreadPool(4);
pool.submit(task);
```

### 3. Callable — returns a result

```java
Callable<Integer> computation = () -> {
    Thread.sleep(1000);
    return 42;
};

ExecutorService executor = Executors.newSingleThreadExecutor();
Future<Integer> future = executor.submit(computation);

// Block until result is ready
Integer result = future.get(); // may throw InterruptedException, ExecutionException
Integer result = future.get(5, TimeUnit.SECONDS); // with timeout
```

---

## Thread States

```
NEW
  │ start()
  ↓
RUNNABLE ←──────────────────┐
  │                         │
  │ waiting for lock        │
  ↓                         │
BLOCKED ────────────────────┤
  │                         │
  │ wait() / sleep() / join │
  ↓                         │
WAITING / TIMED_WAITING ────┘
  │
  │ thread method returns / uncaught exception
  ↓
TERMINATED
```

| State | Description |
|-------|-------------|
| `NEW` | Thread object created, not started |
| `RUNNABLE` | Running or ready to run |
| `BLOCKED` | Waiting to acquire a monitor lock |
| `WAITING` | Waiting indefinitely (wait/join with no timeout) |
| `TIMED_WAITING` | Waiting with a timeout (sleep/wait(n)/join(n)) |
| `TERMINATED` | Thread has finished |

---

## Thread Methods

```java
Thread t = new Thread(() -> { /* work */ });

t.start();                  // start a new thread
t.join();                   // current thread waits for t to finish
t.join(1000);               // wait at most 1 second
t.interrupt();              // set interrupt flag
t.isInterrupted();          // check interrupt flag (doesn't clear it)
Thread.interrupted();       // check AND clear interrupt flag

Thread.sleep(1000);         // sleep current thread (releases no locks)
Thread.yield();             // hint to scheduler (rarely useful)
Thread.currentThread();     // get current thread reference

t.setDaemon(true);          // must be called before start()
t.setPriority(Thread.MAX_PRIORITY); // 1-10, hint only
t.setName("worker-1");
```

---

## Daemon Threads

The JVM exits when only daemon threads are running.

```java
Thread daemon = new Thread(() -> {
    while (true) {
        System.out.println("Heartbeat...");
        Thread.sleep(1000);
    }
});
daemon.setDaemon(true); // must set before start!
daemon.start();
// JVM exits when main thread finishes — daemon thread killed automatically
```

Use daemon threads for: background housekeeping, monitoring, heartbeats. Non-daemon threads should do critical work (DB writes, etc.).

---

## Interruption

```java
Thread worker = new Thread(() -> {
    try {
        while (!Thread.currentThread().isInterrupted()) {
            doWork();
        }
    } catch (InterruptedException e) {
        // Restore interrupt status when catching InterruptedException
        Thread.currentThread().interrupt();
        // Clean up and exit
    }
});

// From another thread:
worker.interrupt(); // sets interrupt flag; wakes thread if in sleep/wait
```

::: tip InterruptedException contract
When you catch `InterruptedException`, either:
1. **Re-throw it** (propagate up), or
2. **Call `Thread.currentThread().interrupt()`** to restore the flag

Never silently swallow `InterruptedException` — it prevents clean thread shutdown.
:::

---

## ThreadLocal

Per-thread storage — each thread gets its own copy.

```java
ThreadLocal<SimpleDateFormat> dateFormat = ThreadLocal.withInitial(
    () -> new SimpleDateFormat("yyyy-MM-dd")
);

// Each thread has its own SimpleDateFormat instance
String formatted = dateFormat.get().format(new Date());

// CRITICAL: Always remove ThreadLocal values in thread pool threads!
try {
    // use dateFormat.get()
} finally {
    dateFormat.remove(); // prevent memory leaks in thread pools
}
```

---

## Thread Confinement

Avoid sharing state at all — confine mutable data to a single thread.

```java
// Stack confinement — local variables are never shared
void processOrder(long id) {
    // 'order' lives on the stack — no other thread can see it
    Order order = repository.findById(id);
    order.setStatus(PROCESSING);
    repository.save(order);
}

// Object confinement — object only reachable from one thread
class SingleThreadedCache {
    // Only ever accessed from the dedicated cache thread
    private final Map<String, Object> data = new HashMap<>();
}

// Ad-hoc confinement — document the threading requirement
// @NotThreadSafe — CallerMustSynchronize
class UnsafeFormatter {
    private final SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd");
    // caller is responsible for single-thread access
}
```

---

## Common Concurrency Patterns

### Immutability

Immutable objects are always thread-safe — no synchronisation needed.

```java
// Immutable value object — safe to share across all threads
public final class Money {
    private final BigDecimal amount;
    private final Currency currency;

    public Money(BigDecimal amount, Currency currency) {
        this.amount = Objects.requireNonNull(amount);
        this.currency = Objects.requireNonNull(currency);
    }

    // All fields final, no setters, defensive copy if needed
    public Money add(Money other) {
        if (!this.currency.equals(other.currency)) throw new IllegalArgumentException();
        return new Money(this.amount.add(other.amount), this.currency);
    }

    public BigDecimal getAmount()  { return amount; }
    public Currency getCurrency()  { return currency; }
}
```

Rules for immutability:
1. All fields `private final`
2. No setter methods
3. Class declared `final` (or no subclasses)
4. Defensive copies for mutable field types (arrays, `Date`, collections)
5. `this` reference doesn't escape during construction

### Double-Checked Locking (Lazy Singleton)

```java
public class HeavyService {
    // volatile is REQUIRED — without it, another thread may see a
    // partially constructed object due to instruction reordering
    private static volatile HeavyService instance;

    private HeavyService() { /* expensive init */ }

    public static HeavyService getInstance() {
        if (instance == null) {                    // first check (no lock)
            synchronized (HeavyService.class) {
                if (instance == null) {            // second check (with lock)
                    instance = new HeavyService();
                }
            }
        }
        return instance;
    }
}

// Simpler alternative — class-level lazy initialisation (holder idiom)
public class HeavyService {
    private HeavyService() { }

    private static class Holder {
        static final HeavyService INSTANCE = new HeavyService();
    }

    public static HeavyService getInstance() { return Holder.INSTANCE; }
    // Holder class only loaded on first call to getInstance() — lazy + thread-safe
}
```

### Publication Safety

An object is *safely published* if all threads see its fully constructed state.

```java
// ❌ Unsafe publication — reference visible before object is fully built
private Helper helper;
public void init() { helper = new Helper(); }   // write not guaranteed visible

// ✓ Safe publication methods:
private volatile Helper helper;          // volatile guarantees visibility
private final Helper helper = new Helper(); // final — visibility guaranteed after constructor
// Or: publish via synchronized, Atomic reference, or concurrent collection
```

---

## Summary

- `Runnable` for fire-and-forget; `Callable` for tasks that return results.
- Always use `ExecutorService` in production — don't create threads manually.
- Thread states: NEW → RUNNABLE → BLOCKED/WAITING → TERMINATED.
- Handle `InterruptedException` correctly — restore interrupt flag or re-throw.
- Use `ThreadLocal` carefully — always `remove()` in finally blocks.
- Prefer **immutability** and **thread confinement** — avoid sharing state where possible.

---

## Interview Quick-Fire

**Q: Why is `volatile` required for double-checked locking?**
Without `volatile`, the JVM may reorder the write to `instance` before the constructor finishes — another thread could see a non-null but partially initialised object. `volatile` prevents this reordering by establishing a happens-before relationship between the write and any subsequent read.

**Q: What is thread confinement and why does it help?**
Thread confinement means that mutable data is only accessed by one thread — no sharing, no synchronisation needed. Stack confinement (local variables) is automatic. For object-level confinement, you document and enforce the single-thread access contract. It eliminates the root cause of race conditions.

**Q: What are the requirements for an immutable class?**
All fields private and final; no setter methods; class declared final (or effectively final); mutable field types use defensive copies; `this` reference doesn't escape the constructor. Immutable objects are inherently thread-safe and can be freely shared.

<RelatedTopics :topics="['/concurrency/synchronization', '/concurrency/concurrent-utils', '/concurrency/virtual-threads', '/java-memory/jvm-structure']" />

[→ Back to Concurrency Overview](/concurrency/)
