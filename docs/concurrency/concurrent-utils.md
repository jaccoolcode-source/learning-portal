---
title: Concurrent Utilities
description: java.util.concurrent — ExecutorService, CompletableFuture, ForkJoinPool, BlockingQueue, ConcurrentHashMap
category: concurrency
pageClass: layout-concurrency
difficulty: advanced
tags: [java, executor, completablefuture, forkjoin, blockingqueue, concurrenthashmap]
related:
  - /concurrency/threads
  - /concurrency/synchronization
  - /modern-java/java9-12
estimatedMinutes: 25
---

# Concurrent Utilities

<DifficultyBadge level="advanced" />

`java.util.concurrent` provides high-level abstractions for thread management, async programming, and thread-safe data structures. Prefer these over raw `Thread` and `synchronized`.

---

## ExecutorService

Manages a pool of threads. Reuses threads instead of creating new ones.

```java
// Common factory methods
ExecutorService fixed   = Executors.newFixedThreadPool(4);         // 4 worker threads
ExecutorService single  = Executors.newSingleThreadExecutor();     // 1 thread, ordered tasks
ExecutorService cached  = Executors.newCachedThreadPool();         // grows/shrinks dynamically
ExecutorService virtual = Executors.newVirtualThreadPerTaskExecutor(); // Java 21

// Submit tasks
Future<String> future = executor.submit(() -> fetchData()); // Callable
executor.execute(() -> fireAndForget());                     // Runnable

// Proper shutdown
executor.shutdown();                // no new tasks, wait for running ones
executor.shutdownNow();            // interrupt running tasks
executor.awaitTermination(30, TimeUnit.SECONDS);

// Try-with-resources (Java 19+ AutoCloseable)
try (ExecutorService pool = Executors.newFixedThreadPool(4)) {
    pool.submit(() -> task1());
    pool.submit(() -> task2());
} // auto-shuts down
```

### Custom ThreadPoolExecutor

```java
ThreadPoolExecutor executor = new ThreadPoolExecutor(
    4,                                      // corePoolSize
    8,                                      // maximumPoolSize
    60, TimeUnit.SECONDS,                   // keepAliveTime for excess threads
    new LinkedBlockingQueue<>(100),         // work queue (bounded!)
    new ThreadFactory() {                   // thread naming
        final AtomicInteger counter = new AtomicInteger();
        public Thread newThread(Runnable r) {
            return new Thread(r, "worker-" + counter.getAndIncrement());
        }
    },
    new ThreadPoolExecutor.CallerRunsPolicy() // rejection policy
);
```

**Rejection policies (when queue is full):**
- `AbortPolicy` — throws `RejectedExecutionException` (default)
- `CallerRunsPolicy` — caller thread runs the task (natural backpressure)
- `DiscardPolicy` — silently drop task
- `DiscardOldestPolicy` — drop oldest queued task

### Thread Pool Sizing Formula

Pool sizing depends on whether tasks are CPU-bound or I/O-bound.

```
N_cpus = Runtime.getRuntime().availableProcessors()

// CPU-bound (heavy computation, no blocking I/O)
corePoolSize = N_cpus + 1
// The +1 handles the case when one thread is briefly paused (GC, page fault)

// I/O-bound (DB calls, HTTP calls, file I/O)
corePoolSize = N_cpus * (1 + wait_time / compute_time)
// Example: if a thread spends 90% of time waiting on DB (9ms wait, 1ms compute):
// corePoolSize = 4 * (1 + 9/1) = 40 threads
```

```java
// Practical example — DB-heavy service on 4-core machine
int cpus = Runtime.getRuntime().availableProcessors(); // 4
// Assume ~50ms DB wait, ~5ms CPU work → ratio = 10
int poolSize = cpus * (1 + 10); // = 44

ThreadPoolExecutor dbPool = new ThreadPoolExecutor(
    poolSize, poolSize,                   // core == max for stable pools
    0L, TimeUnit.MILLISECONDS,
    new LinkedBlockingQueue<>(500),       // bounded — reject if overwhelmed
    r -> {
        Thread t = new Thread(r, "db-worker-" + counter.getAndIncrement());
        t.setDaemon(true);
        return t;
    },
    new ThreadPoolExecutor.CallerRunsPolicy()
);
```

::: tip Pool sizing in practice
- **Always bound the queue** (`LinkedBlockingQueue(capacity)`) — unbounded queues hide overload and cause OOM under sustained load.
- Monitor `executor.getActiveCount()`, `executor.getQueue().size()`, and rejected tasks in production.
- For Java 21+ I/O-bound tasks, prefer **virtual threads** (`Executors.newVirtualThreadPerTaskExecutor()`) — the JVM handles blocking efficiently without thread-per-CPU limits.
:::

---

## CompletableFuture

Async, non-blocking computation pipeline with callbacks.

```java
// Create
CompletableFuture<String> cf = CompletableFuture.supplyAsync(() -> {
    return fetchUser(id); // runs on ForkJoinPool.commonPool() by default
});

// Transform result
CompletableFuture<Integer> length = cf.thenApply(String::length);

// Chain (flatMap equivalent)
CompletableFuture<User> user = CompletableFuture.supplyAsync(() -> userId)
    .thenCompose(id -> fetchUserAsync(id));

// Side effect (no return value)
cf.thenAccept(user -> System.out.println("Got user: " + user));

// Run after completion (no input, no output)
cf.thenRun(() -> System.out.println("Done!"));

// Exception handling
cf.exceptionally(ex -> "default")             // recover from exception
cf.handle((result, ex) -> ex != null ? "error" : result); // always runs

// Combine two futures
CompletableFuture<String> user   = fetchUserAsync(id);
CompletableFuture<List<Order>> orders = fetchOrdersAsync(id);

CompletableFuture<UserDashboard> dashboard = user.thenCombine(orders,
    (u, o) -> new UserDashboard(u, o));

// Wait for all
CompletableFuture.allOf(cf1, cf2, cf3).join(); // waits for all

// First to complete
CompletableFuture.anyOf(cf1, cf2, cf3).join(); // first result

// Custom executor
CompletableFuture.supplyAsync(() -> compute(), myExecutor);
```

### Async variants

Each operation has an `*Async` suffix to run on a different thread:
```java
cf.thenApply(fn)       // runs on same thread that completed cf
cf.thenApplyAsync(fn)  // runs on ForkJoinPool.commonPool()
cf.thenApplyAsync(fn, executor)  // runs on custom executor
```

---

## ForkJoinPool

Designed for **recursive decomposition** of large tasks. Uses **work-stealing** — idle threads steal tasks from busy threads' queues.

```java
ForkJoinPool pool = ForkJoinPool.commonPool(); // shared pool

// Recursive task (returns a result)
class SumTask extends RecursiveTask<Long> {
    private final long[] arr;
    private final int from, to;
    private static final int THRESHOLD = 1000;

    public SumTask(long[] arr, int from, int to) {
        this.arr = arr; this.from = from; this.to = to;
    }

    @Override
    protected Long compute() {
        if (to - from <= THRESHOLD) {
            long sum = 0;
            for (int i = from; i < to; i++) sum += arr[i];
            return sum;
        }
        int mid = (from + to) / 2;
        SumTask left  = new SumTask(arr, from, mid);
        SumTask right = new SumTask(arr, mid, to);
        left.fork();              // submit left to pool
        long rightResult = right.compute(); // compute right inline
        return left.join() + rightResult;   // wait for left result
    }
}

long[] data = new long[1_000_000];
Long sum = pool.invoke(new SumTask(data, 0, data.length));
```

---

## BlockingQueue

Thread-safe queues with blocking operations — foundation of producer-consumer patterns.

```java
BlockingQueue<Task> queue = new LinkedBlockingQueue<>(100);

// Producer thread
Runnable producer = () -> {
    while (running) {
        Task task = generateTask();
        queue.put(task); // blocks if queue full
    }
};

// Consumer thread
Runnable consumer = () -> {
    while (running || !queue.isEmpty()) {
        Task task = queue.poll(1, TimeUnit.SECONDS); // blocks up to 1s
        if (task != null) process(task);
    }
};
```

| Queue | Behaviour |
|-------|---------|
| `LinkedBlockingQueue` | Optionally bounded, linked nodes |
| `ArrayBlockingQueue` | Bounded, array-backed |
| `PriorityBlockingQueue` | Unbounded, priority ordering |
| `SynchronousQueue` | Zero capacity — handoff between threads |
| `DelayQueue` | Elements available after a delay |

---

## ConcurrentHashMap

Thread-safe HashMap with segment-level locking (Java 8+: per-bucket CAS).

```java
ConcurrentHashMap<String, Integer> map = new ConcurrentHashMap<>();

// Thread-safe operations
map.put("key", 1);
map.get("key");
map.putIfAbsent("key", 2);       // only if absent
map.computeIfAbsent("key", k -> computeValue(k)); // compute if absent
map.computeIfPresent("key", (k, v) -> v + 1);     // update if present
map.compute("key", (k, v) -> v == null ? 1 : v + 1);
map.merge("key", 1, Integer::sum); // merge with existing

// Aggregate operations (Java 8+)
map.forEach(2, (k, v) -> process(k, v)); // parallel threshold
map.reduce(2, (k, v) -> v, Integer::sum); // parallel reduce
```

---

## ReentrantLock

Explicit lock with more control than `synchronized`:

```java
ReentrantLock lock = new ReentrantLock();

lock.lock();
try {
    // critical section
} finally {
    lock.unlock(); // ALWAYS unlock in finally
}

// Try-lock without blocking
if (lock.tryLock()) {
    try { /* work */ } finally { lock.unlock(); }
} else {
    // do something else
}

// Try with timeout
if (lock.tryLock(1, TimeUnit.SECONDS)) { ... }

// Condition — replacement for wait/notify
Condition condition = lock.newCondition();
condition.await();         // release lock, wait
condition.signal();        // wake one
condition.signalAll();     // wake all
```

---

## CountDownLatch / CyclicBarrier / Semaphore

```java
// CountDownLatch — wait for N events
CountDownLatch latch = new CountDownLatch(3);
// Workers count down
executor.submit(() -> { doWork(); latch.countDown(); });
// Main thread waits
latch.await(30, TimeUnit.SECONDS); // wait for all 3

// CyclicBarrier — all threads wait at a point
CyclicBarrier barrier = new CyclicBarrier(3, () -> System.out.println("All ready!"));
// Each thread:
barrier.await(); // wait for all participants

// Semaphore — limit concurrent access
Semaphore sem = new Semaphore(10); // allow 10 concurrent
sem.acquire(); // blocks if 10 already holding
try { /* use limited resource */ }
finally { sem.release(); }
```

---

## Concurrent Collections

Beyond `ConcurrentHashMap`, `java.util.concurrent` provides a full set of thread-safe collections.

### CopyOnWriteArrayList

Every write creates a new copy of the underlying array. Reads are lock-free.

```java
CopyOnWriteArrayList<String> list = new CopyOnWriteArrayList<>();

list.add("a");           // creates a new array internally
list.add("b");

// Safe to iterate while other threads write (iterates over snapshot)
for (String s : list) {
    System.out.println(s);   // no ConcurrentModificationException
}

// Bulk add is more efficient than individual adds
list.addAllAbsent(List.of("c", "d"));
```

**Use when:** Very few writes, many reads, iteration safety matters (event listeners, observer lists, rarely-changing config).
**Avoid when:** High write frequency — each write copies the entire array.

### ConcurrentLinkedQueue / ConcurrentLinkedDeque

Lock-free, non-blocking thread-safe queue using CAS.

```java
ConcurrentLinkedQueue<Task> queue = new ConcurrentLinkedQueue<>();

queue.offer(task);           // add (never blocks)
Task t = queue.poll();       // remove head (null if empty, never blocks)
Task t2 = queue.peek();      // inspect head without removing

// Deque (double-ended)
ConcurrentLinkedDeque<Task> deque = new ConcurrentLinkedDeque<>();
deque.addFirst(task);
deque.addLast(task);
deque.pollFirst();
deque.pollLast();
```

**Use when:** High-throughput non-blocking queue without backpressure. Use `BlockingQueue` when you need blocking `put()`/`take()` semantics.

### ConcurrentSkipListMap / ConcurrentSkipListSet

Sorted, concurrent alternatives to `TreeMap`/`TreeSet`. Lock-free with skip-list structure.

```java
ConcurrentSkipListMap<Long, Order> orderBook = new ConcurrentSkipListMap<>();

orderBook.put(order.getId(), order);
orderBook.firstKey();                          // lowest key
orderBook.lastKey();                           // highest key
orderBook.headMap(1000L);                      // keys < 1000
orderBook.tailMap(500L);                       // keys >= 500
orderBook.subMap(100L, 900L);                  // keys in [100, 900)
orderBook.ceilingKey(123L);                    // smallest key >= 123

// ConcurrentSkipListSet — sorted unique elements
ConcurrentSkipListSet<String> sortedTags = new ConcurrentSkipListSet<>();
```

**Use when:** You need a concurrent, sorted map or set (leaderboards, order books, scheduled event maps).

### Collection Summary

| Collection | Thread-safe | Blocking | Sorted | Best for |
|-----------|-------------|----------|--------|----------|
| `ConcurrentHashMap` | ✅ | ❌ | ❌ | General concurrent map |
| `ConcurrentSkipListMap` | ✅ | ❌ | ✅ | Sorted concurrent map |
| `CopyOnWriteArrayList` | ✅ | ❌ | ❌ | Read-heavy, rarely written lists |
| `ConcurrentLinkedQueue` | ✅ | ❌ | ❌ | Non-blocking FIFO queue |
| `LinkedBlockingQueue` | ✅ | ✅ | ❌ | Producer-consumer |
| `ArrayBlockingQueue` | ✅ | ✅ | ❌ | Bounded producer-consumer |
| `PriorityBlockingQueue` | ✅ | ✅ | ✅ | Priority-ordered work queue |
| `SynchronousQueue` | ✅ | ✅ | ❌ | Direct thread handoff |
| `DelayQueue` | ✅ | ✅ | ✅ | Delayed task scheduling |

---

## Summary

- Use `ExecutorService` (not raw threads) for all production concurrency.
- `CompletableFuture` for async pipelines — chain, combine, handle errors.
- `ForkJoinPool` for recursive divide-and-conquer tasks.
- `BlockingQueue` for producer-consumer patterns.
- `ConcurrentHashMap` over `HashMap` or `Hashtable` for concurrent maps.
- `ReentrantLock` for explicit lock management with try-lock and conditions.
- `CopyOnWriteArrayList` for read-heavy, rarely-written lists (no CME on iteration).
- `ConcurrentSkipListMap` for sorted concurrent access.
- For Java 21+ I/O-bound work, prefer `Executors.newVirtualThreadPerTaskExecutor()` over a fixed thread pool.

---

## Interview Quick-Fire

**Q: When would you use `CopyOnWriteArrayList` over `Collections.synchronizedList()`?**
`CopyOnWriteArrayList` is ideal when iteration dominates (many threads traverse the list) and mutations are rare. Iteration is always safe — it works on a snapshot. `synchronizedList` requires external locking during iteration (or you get `ConcurrentModificationException`). For write-heavy lists, neither is ideal — prefer `ConcurrentLinkedQueue` or `BlockingQueue`.

**Q: What is the difference between `LinkedBlockingQueue` and `ConcurrentLinkedQueue`?**
`LinkedBlockingQueue` is *blocking* — `put()` blocks when full, `take()` blocks when empty. Used for producer-consumer where you want backpressure. `ConcurrentLinkedQueue` is *non-blocking* — `offer()` and `poll()` return immediately (never block). Use it when you need a lock-free queue and handle the empty case yourself.

**Q: What problem does `CompletableFuture.allOf()` solve and what's its limitation?**
`allOf()` waits for all given futures to complete before proceeding — useful for fan-out-then-join patterns (fetch user + orders + inventory in parallel, then combine). Limitation: `allOf()` returns `CompletableFuture<Void>` — you must retrieve each result individually from the original futures. For Java 21+, `StructuredTaskScope.ShutdownOnFailure` is the cleaner replacement with built-in cancellation on failure.

<RelatedTopics :topics="['/concurrency/threads', '/concurrency/synchronization', '/concurrency/virtual-threads', '/modern-java/java9-12']" />

[→ Back to Concurrency Overview](/concurrency/)
