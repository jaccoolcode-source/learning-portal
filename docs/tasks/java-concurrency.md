---
title: Java Concurrency Tasks
description: 9 practical Java concurrency tasks — producer-consumer, thread-safe data structures, deadlock, CompletableFuture — with suggested solutions
---

# Java Concurrency Tasks

Tasks 21–29 covering threads, locks, executors, and async pipelines.

---

### Task 21 — Producer-Consumer with `BlockingQueue`

**Difficulty:** Easy

**Problem:** Implement a producer-consumer where one thread produces integers 1–20 and two consumer threads each print `"Consumer-N consumed: X"`. Use `BlockingQueue` for coordination — no manual `wait`/`notify`.

**Suggested Solution**
```java
public class ProducerConsumer {
    private static final int POISON = -1;

    public static void main(String[] args) throws InterruptedException {
        BlockingQueue<Integer> queue = new LinkedBlockingQueue<>(5);
        int consumers = 2;

        Thread producer = new Thread(() -> {
            try {
                for (int i = 1; i <= 20; i++) queue.put(i);
                for (int i = 0; i < consumers; i++) queue.put(POISON); // one poison per consumer
            } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
        });

        List<Thread> consumerThreads = new ArrayList<>();
        for (int n = 1; n <= consumers; n++) {
            int id = n;
            consumerThreads.add(new Thread(() -> {
                try {
                    while (true) {
                        int val = queue.take();
                        if (val == POISON) break;
                        System.out.println("Consumer-" + id + " consumed: " + val);
                    }
                } catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }));
        }

        producer.start();
        consumerThreads.forEach(Thread::start);
        producer.join();
        for (Thread t : consumerThreads) t.join();
    }
}
```

**Why this approach:** `BlockingQueue` handles synchronisation internally — `put` blocks when full, `take` blocks when empty. The poison-pill pattern signals consumers to shut down cleanly without needing a shared `volatile` flag.

---

### Task 22 — Thread-Safe Counter Without `synchronized`

**Difficulty:** Easy

**Problem:** Implement a counter that can be safely incremented by multiple threads, using `AtomicLong` rather than `synchronized` or locks.

**Suggested Solution**
```java
public class AtomicCounter {
    private final AtomicLong count = new AtomicLong(0);

    public void increment()      { count.incrementAndGet(); }
    public void add(long delta)  { count.addAndGet(delta); }
    public long get()            { return count.get(); }
    public long getAndReset()    { return count.getAndSet(0); }
}

// Demo
public static void main(String[] args) throws InterruptedException {
    AtomicCounter counter = new AtomicCounter();
    List<Thread> threads = new ArrayList<>();
    for (int i = 0; i < 10; i++) {
        threads.add(new Thread(() -> {
            for (int j = 0; j < 1000; j++) counter.increment();
        }));
    }
    threads.forEach(Thread::start);
    for (Thread t : threads) t.join();
    System.out.println("Expected 10000, got: " + counter.get());
}
```

**Why this approach:** `AtomicLong` uses compare-and-swap (CAS) hardware instructions — faster than `synchronized` under low-to-medium contention. No lock acquisition means no thread suspension overhead.

---

### Task 23 — Simple Thread Pool

**Difficulty:** Medium

**Problem:** Implement a fixed-size thread pool that accepts `Runnable` tasks via `submit(Runnable)` and executes them across N worker threads. Support a `shutdown()` method that waits for in-flight tasks to finish.

**Suggested Solution**
```java
public class SimpleThreadPool {
    private final BlockingQueue<Runnable> taskQueue = new LinkedBlockingQueue<>();
    private final List<Thread> workers = new ArrayList<>();
    private volatile boolean shutdown = false;

    public SimpleThreadPool(int size) {
        for (int i = 0; i < size; i++) {
            Thread worker = new Thread(() -> {
                while (!shutdown || !taskQueue.isEmpty()) {
                    try {
                        Runnable task = taskQueue.poll(100, TimeUnit.MILLISECONDS);
                        if (task != null) task.run();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            });
            worker.start();
            workers.add(worker);
        }
    }

    public void submit(Runnable task) {
        if (shutdown) throw new RejectedExecutionException("Pool is shut down");
        taskQueue.offer(task);
    }

    public void shutdown() throws InterruptedException {
        shutdown = true;
        for (Thread w : workers) w.join();
    }
}
```

**Why this approach:** Workers poll with a timeout so they can notice the `shutdown` flag without blocking forever. The pool drains the queue after shutdown so no submitted tasks are lost.

---

### Task 24 — Deadlock Demonstration and Fix

**Difficulty:** Medium

**Problem:** Write code that demonstrates a deadlock between two threads locking two resources in opposite order, then fix it.

**Suggested Solution — Deadlock Version**
```java
Object lock1 = new Object(), lock2 = new Object();

Thread t1 = new Thread(() -> {
    synchronized (lock1) {
        sleep(50);
        synchronized (lock2) { System.out.println("T1 done"); }
    }
});
Thread t2 = new Thread(() -> {
    synchronized (lock2) {
        sleep(50);
        synchronized (lock1) { System.out.println("T2 done"); }
    }
});
// T1 holds lock1, waits for lock2; T2 holds lock2, waits for lock1 → deadlock
```

**Fixed Version — Consistent Lock Ordering**
```java
// Always acquire lock1 before lock2, in both threads
Thread t1 = new Thread(() -> {
    synchronized (lock1) { synchronized (lock2) { System.out.println("T1 done"); } }
});
Thread t2 = new Thread(() -> {
    synchronized (lock1) { synchronized (lock2) { System.out.println("T2 done"); } }
});
```

**Alternative Fix — `tryLock` with timeout**
```java
ReentrantLock l1 = new ReentrantLock(), l2 = new ReentrantLock();

void transfer(ReentrantLock from, ReentrantLock to) throws InterruptedException {
    while (true) {
        if (from.tryLock(50, TimeUnit.MILLISECONDS)) {
            try {
                if (to.tryLock(50, TimeUnit.MILLISECONDS)) {
                    try { /* do work */ return; } finally { to.unlock(); }
                }
            } finally { from.unlock(); }
        }
        Thread.sleep(10); // back off before retry
    }
}
```

**Why this approach:** Consistent lock ordering is the simplest fix — it's impossible to have a cycle if all threads acquire locks in the same global order. `tryLock` with back-off is useful when consistent ordering can't be imposed (e.g., dynamic resource sets).

---

### Task 25 — Parallel Task Aggregation with `CountDownLatch`

**Difficulty:** Easy

**Problem:** Fire 5 tasks in parallel. Each task fetches a "price" (simulate with `Thread.sleep` + random). After all complete, print the total.

**Suggested Solution**
```java
public static void main(String[] args) throws InterruptedException {
    int n = 5;
    CountDownLatch latch = new CountDownLatch(n);
    AtomicLong total = new AtomicLong(0);
    Random rng = new Random();

    ExecutorService pool = Executors.newFixedThreadPool(n);
    for (int i = 0; i < n; i++) {
        pool.submit(() -> {
            try {
                Thread.sleep(rng.nextInt(300));
                long price = rng.nextInt(100) + 1;
                total.addAndGet(price);
                System.out.println("Fetched: " + price);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            } finally {
                latch.countDown();
            }
        });
    }

    latch.await(); // blocks until all 5 tasks countDown
    pool.shutdown();
    System.out.println("Total: " + total.get());
}
```

**Why this approach:** `CountDownLatch` is a one-shot barrier — perfect for "wait for N things to finish." `AtomicLong` accumulates the total thread-safely without a lock.

---

### Task 26 — Cache with Read/Write Lock

**Difficulty:** Medium

**Problem:** Implement an in-memory cache backed by a `HashMap` where concurrent reads are allowed simultaneously but writes are exclusive.

**Suggested Solution**
```java
public class ReadWriteCache<K, V> {
    private final Map<K, V> store = new HashMap<>();
    private final ReadWriteLock lock = new ReentrantReadWriteLock();

    public V get(K key) {
        lock.readLock().lock();
        try { return store.get(key); }
        finally { lock.readLock().unlock(); }
    }

    public void put(K key, V value) {
        lock.writeLock().lock();
        try { store.put(key, value); }
        finally { lock.writeLock().unlock(); }
    }

    public V computeIfAbsent(K key, Function<K, V> loader) {
        // Check with read lock first
        lock.readLock().lock();
        try { if (store.containsKey(key)) return store.get(key); }
        finally { lock.readLock().unlock(); }

        // Upgrade to write lock and double-check
        lock.writeLock().lock();
        try {
            return store.computeIfAbsent(key, loader);
        } finally { lock.writeLock().unlock(); }
    }
}
```

**Why this approach:** `ReadWriteLock` allows many concurrent readers; writers get exclusive access. The double-check in `computeIfAbsent` prevents redundant loading if another thread already populated the entry between the read-lock check and write-lock acquisition.

---

### Task 27 — Scheduled Task with `ScheduledExecutorService`

**Difficulty:** Easy

**Problem:** Schedule a task that prints `"Tick: N"` every 2 seconds, starting immediately, and cancels after 10 seconds.

**Suggested Solution**
```java
public static void main(String[] args) throws InterruptedException {
    ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);
    AtomicInteger count = new AtomicInteger(0);

    ScheduledFuture<?> handle = scheduler.scheduleAtFixedRate(
        () -> System.out.println("Tick: " + count.incrementAndGet()),
        0, 2, TimeUnit.SECONDS
    );

    Thread.sleep(10_000);
    handle.cancel(false); // let current execution finish
    scheduler.shutdown();
}
```

**Why this approach:** `scheduleAtFixedRate` fires every 2 seconds regardless of how long the task takes. `cancel(false)` avoids interrupting a running task. The `scheduler.shutdown()` after cancel ensures the thread pool terminates cleanly.

---

### Task 28 — `CompletableFuture` Pipeline

**Difficulty:** Medium

**Problem:** Model a pipeline: `fetchUser(id)` → `enrichWithOrders(user)` → `saveToCache(enriched)`. Each step is async. The final result is the cached `EnrichedUser`. Handle errors by returning a fallback `EnrichedUser`.

**Suggested Solution**
```java
CompletableFuture<EnrichedUser> pipeline(String userId, ExecutorService pool) {
    return CompletableFuture
        .supplyAsync(() -> fetchUser(userId), pool)
        .thenApplyAsync(user -> enrichWithOrders(user), pool)
        .thenApplyAsync(enriched -> { saveToCache(enriched); return enriched; }, pool)
        .exceptionally(ex -> {
            log.warn("Pipeline failed for {}: {}", userId, ex.getMessage());
            return EnrichedUser.empty(userId);
        });
}
```

**Why this approach:** `thenApplyAsync` keeps each step non-blocking on a separate thread-pool thread. `exceptionally` catches any stage's failure and returns a fallback — the caller sees a result either way, never an unhandled exception.

---

### Task 29 — Non-Blocking Stack with `AtomicReference`

**Difficulty:** Hard

**Problem:** Implement a thread-safe stack using `AtomicReference` and compare-and-swap, with no locks or `synchronized`.

**Suggested Solution**
```java
public class LockFreeStack<T> {
    private static class Node<T> {
        final T val;
        final Node<T> next;
        Node(T val, Node<T> next) { this.val = val; this.next = next; }
    }

    private final AtomicReference<Node<T>> top = new AtomicReference<>();

    public void push(T val) {
        Node<T> newNode;
        do {
            newNode = new Node<>(val, top.get());
        } while (!top.compareAndSet(newNode.next, newNode)); // retry if another thread changed top
    }

    public T pop() {
        Node<T> node;
        do {
            node = top.get();
            if (node == null) return null;
        } while (!top.compareAndSet(node, node.next));
        return node.val;
    }
}
```

**Why this approach:** CAS (`compareAndSet`) ensures atomicity without a lock. If another thread modified `top` between reading it and applying the CAS, the operation retries from scratch. This is the foundation of many lock-free data structures (ABA problem aside — not an issue here since nodes are short-lived).

---

<RelatedTopics :topics="['/tasks/java-core', '/concurrency/', '/tasks/modern-java']" />

[→ Back to Tasks Overview](/tasks/)
