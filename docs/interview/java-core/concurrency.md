# Concurrency & Multithreading

**Part III — Q10 to Q16** · [← Core Java Overview](./index)

---

## Q10: `volatile` keyword

> Solves **visibility**, not atomicity. One of the most misunderstood keywords.

In a modern CPU, each core has its own cache (L1, L2). A thread modifying a variable may leave the new value in its CPU cache without writing to main memory immediately — other threads on different cores keep reading stale values.

`volatile` guarantees:
1. Every **READ** comes from main memory (never from CPU cache)
2. Every **WRITE** is immediately flushed to main memory

```java
public class Worker implements Runnable {
    private volatile boolean running = true;  // visibility guaranteed

    public void run() {
        while (running) {   // reads from main memory every iteration
            doWork();
        }
    }

    public void stop() {
        running = false;    // flushed to main memory immediately
    }
}
```

Without `volatile`, the worker thread may cache `running = true` in its CPU register and **never** see the update — the thread runs forever.

::: details Full model answer

**What `volatile` does NOT do — atomicity:**

`counter++` is three operations: read → add 1 → write back. Even with `volatile`, two threads can read the same value simultaneously, both add 1, and both write the same result — losing one increment (race condition). For atomic compound operations, use `AtomicInteger` or `synchronized`.

**Double-checked locking Singleton — `volatile` is essential:**
```java
public class Singleton {
    private static volatile Singleton instance;  // volatile is ESSENTIAL

    public static Singleton getInstance() {
        if (instance == null) {                  // first check (no locking)
            synchronized (Singleton.class) {
                if (instance == null) {          // second check (with lock)
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}
```
Without `volatile`, the JVM may reorder instructions in `instance = new Singleton()` such that the reference is assigned **before** the constructor finishes. Another thread could see a non-null but partially constructed object. `volatile` prevents this reordering — it acts as a **memory barrier**.

**`volatile` vs `synchronized` — the decision:**
| | `volatile` | `synchronized` |
|--|-----------|----------------|
| Visibility | ✅ | ✅ |
| Atomicity | ❌ | ✅ |
| Mutual exclusion | ❌ | ✅ |
| Performance | Faster | Slower (thread blocking) |
| Use when | Simple flag, single write | Compound operations |

:::

> [!TIP] Golden Tip
> **`volatile` = visibility. `synchronized` = visibility + mutual exclusion.** If you only need visibility for a simple boolean flag, use `volatile`. If you need atomic compound operations (`check-then-act`, `read-modify-write`), use `synchronized` or Atomic classes. Knowing this distinction precisely is what separates junior from senior.

**Follow-up questions:**
- Why is `volatile` not enough for `counter++`?
- Why does the double-checked locking Singleton need `volatile`?
- What is a memory barrier / happens-before relationship?

---

## Q11: `synchronized` vs `ReentrantLock`

> Both provide mutual exclusion. `ReentrantLock` adds control; `synchronized` adds simplicity.

```java
// synchronized — automatic lock/unlock, simple
public synchronized void increment() { counter++; }

// ReentrantLock — manual, must unlock in finally
ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    counter++;
} finally {
    lock.unlock();  // MUST be in finally — forgetting causes permanent deadlock
}
```

::: details Full model answer

**`synchronized`:**
Every Java object has an internal monitor. `synchronized` acquires it on entry and releases it automatically on exit — even if an exception is thrown. The same thread can re-enter a `synchronized` block on the same monitor without deadlocking (reentrant).

Limitations:
- No `tryLock` — must wait forever if the lock is held
- No timeout
- No fairness control (threads can be starved)
- Cannot interrupt a waiting thread
- Only one `wait/notify` condition per monitor

**`ReentrantLock` extra features:**

```java
// tryLock — non-blocking attempt
if (lock.tryLock()) {
    try { /* critical section */ }
    finally { lock.unlock(); }
} else {
    // do something else — no blocking
}

// tryLock with timeout — prevents indefinite waiting
if (lock.tryLock(1, TimeUnit.SECONDS)) { ... }

// lockInterruptibly — can be cancelled
lock.lockInterruptibly();  // throws InterruptedException if interrupted

// Fair lock — threads acquire in FIFO order (prevents starvation)
ReentrantLock fairLock = new ReentrantLock(true);

// Multiple conditions — for producer-consumer
Condition notFull  = lock.newCondition();
Condition notEmpty = lock.newCondition();
// synchronized only has one wait/notify set per monitor
```

**Virtual Threads and pinning (Java 21):**
`synchronized` causes **pinning** — a virtual thread inside a `synchronized` block is pinned to its carrier (platform) thread. Even if it blocks on I/O, the JVM cannot unmount it, defeating the purpose of virtual threads. `ReentrantLock` does NOT cause pinning.

**Recommendation for Java 21+:** replace `synchronized` with `ReentrantLock` in code that will run on virtual threads.

**Decision framework:**
- `synchronized` — simple cases, low contention, no Java 21 virtual threads
- `ReentrantLock` — need `tryLock`/timeout/fairness/multiple conditions, or using Virtual Threads

:::

> [!TIP] Golden Tip
> Mention **Virtual Thread pinning** — it's a Java 21 detail that shows you're up to date. `synchronized` pins virtual threads to carrier threads; `ReentrantLock` doesn't. This is becoming a real migration reason in Spring Boot 3.2+ codebases that enable virtual threads.

**Follow-up questions:**
- What is a reentrant lock and why does it matter?
- What happens if you forget to call `lock.unlock()`?
- What is a fair lock and what is the trade-off vs an unfair lock?
- How does `synchronized` interact with Java 21 virtual threads?

---

## Q12: Deadlock

> Deadlock is when two threads each hold a lock the other needs — neither can proceed.

```java
// Thread 1                        // Thread 2
synchronized (lockA) {             synchronized (lockB) {
    // holds lockA, wants lockB        // holds lockB, wants lockA
    synchronized (lockB) { ... }      synchronized (lockA) { ... }
}                                  }
// → Thread 1 waits for lockB
// → Thread 2 waits for lockA
// → Neither releases → deadlock
```

::: details Full model answer

**Four Coffman conditions — ALL must hold for deadlock:**
1. **Mutual exclusion** — resource held by only one thread at a time
2. **Hold and wait** — thread holding a resource waits for another
3. **No preemption** — can't forcibly take a resource from a thread
4. **Circular wait** — circular chain of threads, each waiting for a resource held by the next

To prevent deadlock, **break at least one condition**.

**Prevention strategies:**

**1. Lock ordering** — always acquire locks in the same global order:
```java
// WRONG — Thread 1 acquires A then B; Thread 2 acquires B then A
// RIGHT — both threads always acquire A before B
void transfer(Account from, Account to) {
    Account first  = from.id < to.id ? from : to;   // consistent order by ID
    Account second = from.id < to.id ? to   : from;
    synchronized (first) {
        synchronized (second) {
            // transfer
        }
    }
}
```

**2. `tryLock` with timeout:**
```java
if (lockA.tryLock(1, TimeUnit.SECONDS)) {
    try {
        if (lockB.tryLock(1, TimeUnit.SECONDS)) {
            try { /* work */ }
            finally { lockB.unlock(); }
        }
    } finally { lockA.unlock(); }
} else {
    // back off, retry later — no infinite wait
}
```

**3. Avoid nested locks** — the fewer locks held simultaneously, the lower the risk.

**4. Use higher-level concurrency utilities** — `ConcurrentHashMap`, `BlockingQueue`, `AtomicReference` handle synchronization internally with well-tested algorithms.

**Detection:**
- `jstack <PID>` — prints all thread stack traces, automatically detects deadlocks
- `ThreadMXBean.findDeadlockedThreads()` — programmatic detection
- VisualVM, JConsole, IntelliJ debugger

:::

> [!TIP] Golden Tip
> Give the pragmatic answer: *"I prevent deadlocks through lock ordering and by minimising nested locks. When I must hold multiple locks, I use `ReentrantLock.tryLock()` with a timeout so threads can back off instead of waiting forever."* Also mention `jstack` for detection — it shows you know how to diagnose it in production.

**Follow-up questions:**
- What are the four Coffman conditions?
- How would you detect a deadlock in a running production application?
- What is livelock and how does it differ from deadlock?
- How does lock ordering prevent deadlock?

---

## Q13: `Runnable` vs `Callable` vs `Future` vs `CompletableFuture`

> The evolution of async programming in Java — each solved a limitation of the previous.

| | `Runnable` | `Callable` | `Future` | `CompletableFuture` |
|--|-----------|-----------|---------|-------------------|
| Since | Java 1.0 | Java 5 | Java 5 | Java 8 |
| Returns value | ❌ | ✅ | ✅ (via `get()`) | ✅ (non-blocking) |
| Throws checked exception | ❌ | ✅ | — | — |
| Non-blocking callbacks | ❌ | ❌ | ❌ | ✅ |
| Composable | ❌ | ❌ | ❌ | ✅ |

::: details Full model answer

**`Runnable` (Java 1.0)** — fire-and-forget:
```java
Runnable task = () -> System.out.println("Running in background");
new Thread(task).start();
// no return value, no checked exceptions
```

**`Callable<V>` (Java 5)** — returns a value, can throw:
```java
Callable<Integer> task = () -> expensiveComputation();  // returns value + can throw
```

**`Future<V>` (Java 5)** — handle to async result:
```java
ExecutorService executor = Executors.newFixedThreadPool(4);
Future<Integer> future = executor.submit(() -> expensiveComputation());

// do other work...
Integer result = future.get();                      // BLOCKS until done
Integer result = future.get(5, TimeUnit.SECONDS);   // blocks with timeout
future.isDone();                                    // check completion
future.cancel(true);                                // attempt cancellation
```
**Main limitation:** `get()` BLOCKS the calling thread. No way to attach a callback — you either block (waste a thread) or poll (`isDone()` in a loop).

**`CompletableFuture<V>` (Java 8)** — non-blocking, composable:
```java
CompletableFuture.supplyAsync(() -> fetchUserFromDatabase(userId))
    .thenApply(user  -> enrichWithDetails(user))     // transform (like map)
    .thenCompose(user -> loadOrders(user))            // chain CF (like flatMap)
    .thenAccept(user -> sendEmail(user))              // consume (void)
    .exceptionally(ex -> { log.error("Failed", ex); return null; });
```

**Key methods:**
- `supplyAsync(supplier)` — run task returning a value in a thread pool
- `thenApply(fn)` — transform result (sync, same thread)
- `thenApplyAsync(fn)` — transform result (async, new thread)
- `thenCompose(fn)` — chain when transformation returns another CF (flatMap)
- `thenAccept(consumer)` — consume without returning
- `exceptionally(fn)` — handle error, return fallback
- `handle(biFunction)` — handle both success and failure
- `allOf(cf1, cf2, cf3)` — wait for ALL to complete
- `anyOf(cf1, cf2, cf3)` — wait for FIRST to complete

**Parallel service calls pattern:**
```java
CompletableFuture<User>         userFuture    = CompletableFuture.supplyAsync(() -> userService.getUser(id));
CompletableFuture<List<Order>>  ordersFuture  = CompletableFuture.supplyAsync(() -> orderService.getOrders(id));
CompletableFuture<Balance>      balanceFuture = CompletableFuture.supplyAsync(() -> paymentService.getBalance(id));

CompletableFuture.allOf(userFuture, ordersFuture, balanceFuture)
    .thenApply(v -> new Dashboard(
        userFuture.join(), ordersFuture.join(), balanceFuture.join()))
    .thenAccept(dashboard -> cache.put(id, dashboard));
```

**Production note:**
By default, `CompletableFuture` uses `ForkJoinPool.commonPool()` — shared across the entire JVM. Provide a dedicated executor in production: `supplyAsync(task, myExecutor)`. In Spring Boot, `@Async` + `@EnableAsync` + `CompletableFuture` return type achieves the same declaratively.

:::

> [!TIP] Golden Tip
> The **parallel service calls pattern** (`allOf` + multiple `supplyAsync`) is a real-world use case every senior developer should know. Also: don't use `CompletableFuture.get()` — that defeats the purpose. Use `.thenApply()/.thenAccept()` chains. And always provide a custom executor in production — never rely on the default `commonPool`.

**Follow-up questions:**
- What is the difference between `thenApply` and `thenCompose`?
- What happens if you call `get()` on a `CompletableFuture`?
- How would you handle errors in a chain of `CompletableFuture` calls?
- How does Spring Boot's `@Async` relate to `CompletableFuture`?

---

## Q14: ThreadPool & `ExecutorService`

> Never create a raw `Thread` per task in production. Know the dangers of factory methods.

```java
// Production-safe thread pool — always use ThreadPoolExecutor directly
ExecutorService executor = new ThreadPoolExecutor(
    10,                              // corePoolSize
    50,                              // maximumPoolSize
    60, TimeUnit.SECONDS,            // keepAliveTime for idle threads
    new ArrayBlockingQueue<>(200),   // BOUNDED queue — prevents OOM
    new ThreadPoolExecutor.CallerRunsPolicy()  // back-pressure
);
```

::: details Full model answer

**Why not create raw threads?**
Each platform thread uses ~1MB of stack memory and requires OS scheduling. Creating one per request wastes memory and causes context switching overhead.

**`ExecutorService` factory methods — and their dangers:**

| Factory method | Queue | Thread limit | Risk |
|---------------|-------|-------------|------|
| `newFixedThreadPool(n)` | Unbounded `LinkedBlockingQueue` | Fixed n | OOM if tasks pile up |
| `newCachedThreadPool()` | `SynchronousQueue` (no buffer) | Unlimited | JVM crash under load |
| `newSingleThreadExecutor()` | Unbounded queue | 1 | OOM if tasks pile up |
| `newScheduledThreadPool(n)` | Unbounded | n | OOM for scheduled tasks |
| `newVirtualThreadPerTaskExecutor()` | — | Unlimited (virtual) | Safe — virtual threads are cheap |

**`ThreadPoolExecutor` — production best practice:**
```java
ExecutorService executor = new ThreadPoolExecutor(
    10,                              // corePoolSize: always-alive threads
    50,                              // maximumPoolSize: max under load
    60, TimeUnit.SECONDS,            // idle threads above core kept 60s
    new ArrayBlockingQueue<>(200),   // bounded queue — key safety measure
    new CustomThreadFactory("order-processor"),  // named threads for debugging
    new ThreadPoolExecutor.CallerRunsPolicy()    // back-pressure on overflow
);
```

**Rejection policies (when queue is full AND max threads reached):**
- `AbortPolicy` (default) — throws `RejectedExecutionException`, task lost
- `CallerRunsPolicy` (**recommended**) — calling thread executes the task itself; creates natural back-pressure — if pool is overwhelmed, callers slow down automatically
- `DiscardPolicy` — silently drops task (dangerous — silent data loss)
- `DiscardOldestPolicy` — drops the oldest queued task and retries

**Proper shutdown:**
```java
executor.shutdown();                              // stop accepting new tasks
if (!executor.awaitTermination(30, SECONDS)) {   // wait for running tasks
    executor.shutdownNow();                       // interrupt remaining tasks
}
```

**Java 21 — Virtual Threads:**
```java
// No pooling needed — virtual threads are cheap (~few KB each)
ExecutorService vExecutor = Executors.newVirtualThreadPerTaskExecutor();
// Or: Spring Boot 3.2+ sets this globally with spring.threads.virtual.enabled=true
```

:::

> [!TIP] Golden Tip
> **Alibaba's Java Coding Guidelines explicitly prohibit `Executors` factory methods** — `newFixedThreadPool` has an unbounded queue (OOM risk), `newCachedThreadPool` creates unlimited threads (JVM crash). Always use `ThreadPoolExecutor` directly with a **bounded queue** and **`CallerRunsPolicy`**. Knowing this shows production experience.

**Follow-up questions:**
- What is the difference between `corePoolSize` and `maximumPoolSize`?
- What happens when both the queue is full and `maximumPoolSize` is reached?
- Why is `CallerRunsPolicy` considered a back-pressure mechanism?
- When would you use `newVirtualThreadPerTaskExecutor()` in Java 21?

---

## Q15: Atomic classes & CAS (Compare-And-Swap)

> Lock-free thread safety via CPU-level atomic instructions.

`counter++` looks simple but is three operations: read → add 1 → write. Two threads can read the same value simultaneously, both add 1, both write the same result — one increment is lost. This is a **race condition**.

```java
// Wrong — not thread-safe
private int counter = 0;
public void increment() { counter++; }  // read-modify-write, not atomic

// Right — lock-free via CAS
private AtomicInteger counter = new AtomicInteger(0);
public void increment() { counter.incrementAndGet(); }
```

::: details Full model answer

**How CAS works:**
CAS is a single atomic CPU instruction: *"Read the current value, compare it with expected. IF they match → swap to new value. IF they don't match → do nothing, report failure."*

```java
// Pseudocode of AtomicInteger.incrementAndGet():
int incrementAndGet() {
    do {
        int current = get();           // read current
        int next    = current + 1;     // calculate new
    } while (!compareAndSet(current, next));  // retry if another thread changed it
    return next;
}
```
This is called a **spin loop** or **optimistic locking** — assume no conflict, retry on failure. Under low contention, much faster than `synchronized` (no thread blocking, no context switching).

**Common Atomic classes:**
```java
AtomicInteger counter = new AtomicInteger(0);
counter.incrementAndGet();          // ++counter, returns new value
counter.getAndIncrement();          // counter++, returns old value
counter.addAndGet(5);               // counter += 5, returns new value
counter.compareAndSet(10, 20);      // if value == 10, set to 20; returns boolean

AtomicBoolean flag = new AtomicBoolean(false);
flag.compareAndSet(false, true);    // one-time initialization flag

AtomicReference<Config> config = new AtomicReference<>(initial);
config.compareAndSet(current, newConfig);  // atomic reference swap
```

**`LongAdder` (Java 8+) — for high-contention counters:**

`AtomicLong` has one cell all threads fight over → CAS retries under heavy contention → performance degrades.

`LongAdder` distributes writes across multiple cells (striped). `sum()` adds all cells together. Under high write contention (e.g., request metrics), `LongAdder` is **significantly faster** than `AtomicLong`.

```java
LongAdder requestCount = new LongAdder();
requestCount.increment();    // on each request — very fast under contention
long total = requestCount.sum();  // read the total
```

Use `AtomicLong` when you need `compareAndSet`. Use `LongAdder` for pure counters/accumulators.

:::

> [!TIP] Golden Tip
> Mention **`LongAdder` for high-contention counters** (request counts, metrics) — it's significantly faster than `AtomicLong` when many threads write simultaneously. Also: `ConcurrentHashMap` uses CAS internally for lock-free insertion into empty buckets — connecting these concepts shows systems-level understanding.

**Follow-up questions:**
- What is the ABA problem in CAS, and how does `AtomicStampedReference` solve it?
- When would you choose `AtomicLong` over `LongAdder`?
- How does optimistic locking differ from pessimistic locking?

---

## Q16: `ConcurrentHashMap` internals

> Thread-safe HashMap replacement. Know the Java 7 vs Java 8 difference and the null key prohibition.

`ConcurrentHashMap` allows concurrent reads and writes without locking the entire map. It uses per-bucket locking — far finer-grained than `Collections.synchronizedMap()` which locks everything.

```java
// WRONG — race condition even with ConcurrentHashMap
if (!map.containsKey(key)) {
    map.put(key, value);  // another thread can put between check and put!
}

// CORRECT — atomic compound operation
map.putIfAbsent(key, value);
map.computeIfAbsent(key, k -> createExpensiveObject());  // runs lambda only if absent
```

::: details Full model answer

**Java 7 — segment-based locking:**
The map was divided into 16 segments, each with its own `ReentrantLock`. Threads writing to **different** segments could proceed simultaneously. Threads writing to the **same** segment blocked each other. Concurrency level = number of segments.

**Java 8+ — per-bucket locking (current):**
Segments removed entirely. Finer-grained approach:
- **Empty bucket** — CAS to insert the first node. Lock-free, very fast.
- **Occupied bucket** — `synchronized` on the **first node** of that bucket only. Thousands of independent locks instead of 16.

**Key differences from `HashMap`:**

| | `HashMap` | `ConcurrentHashMap` |
|--|-----------|---------------------|
| Thread-safe | ❌ | ✅ |
| Null keys | ✅ (one) | ❌ |
| Null values | ✅ | ❌ |
| Iterator | Fail-fast (throws `ConcurrentModificationException`) | Weakly consistent (no exception) |
| `size()` | Exact | Approximate under concurrency |

**Why no null keys/values?**
Ambiguity: if `map.get(key)` returns `null`, does it mean the key isn't present, or that the stored value is `null`? In a single-threaded `HashMap`, you can call `containsKey()` to disambiguate. In a concurrent context, the state could change between the two calls — the distinction is meaningless. Null is prohibited to eliminate this ambiguity.

**Atomic compound operations:**
```java
map.putIfAbsent(key, value);
map.computeIfAbsent(key, k -> expensiveInit());   // lazy init pattern — lambda runs only if absent
map.computeIfPresent(key, (k, v) -> v + 1);       // update only if key exists
map.compute(key, (k, v) -> v == null ? 1 : v + 1); // always compute
map.merge(key, 1, Integer::sum);                   // accumulate values

// size() is approximate — use mappingCount() for large maps
long count = map.mappingCount();  // returns long, more accurate
```

**Weakly consistent iteration:**
Iterators reflect the map state at some point during or after creation. They will NOT throw `ConcurrentModificationException` — safe to iterate while other threads modify. However, you may or may not see concurrent inserts depending on timing.

:::

> [!TIP] Golden Tip
> **`computeIfAbsent` is the go-to for thread-safe lazy initialization and caching.** It's atomic — the lambda runs only if the key is absent, and the result is stored atomically. Also mention that `size()` can be inaccurate under concurrent modification — use `mappingCount()` which returns a `long` and is more accurate for large maps.

**Follow-up questions:**
- Why doesn't `ConcurrentHashMap` allow null keys?
- What is the difference between `putIfAbsent` and `computeIfAbsent`?
- How did the implementation change between Java 7 and Java 8?
- What does "weakly consistent" iteration mean?
