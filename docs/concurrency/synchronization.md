---
title: Synchronization
description: Thread synchronization in Java — synchronized, volatile, happens-before, atomic operations, deadlocks
category: concurrency
pageClass: layout-concurrency
difficulty: advanced
tags: [java, synchronization, synchronized, volatile, deadlock, happens-before, atomic]
related:
  - /concurrency/threads
  - /concurrency/concurrent-utils
estimatedMinutes: 25
---

# Synchronization

<DifficultyBadge level="advanced" />

Synchronisation ensures that threads coordinate access to shared mutable state — preventing race conditions, visibility bugs, and deadlocks.

---

## The Problem: Race Condition

```java
public class Counter {
    private int count = 0;

    public void increment() {
        count++; // NOT atomic! Read → Increment → Write (3 operations)
    }

    public int getCount() { return count; }
}

// Two threads calling increment 1000 times each
// Expected: 2000, Actual: 1337 (or any number ≤ 2000)
```

`count++` compiles to: `GETFIELD`, `IADD 1`, `PUTFIELD` — three separate bytecode instructions. Another thread can interleave between them.

---

## synchronized

`synchronized` acquires a monitor lock on an object (or class for static methods).

### Instance method

```java
public class SafeCounter {
    private int count = 0;

    public synchronized void increment() { count++; } // lock on 'this'
    public synchronized int getCount()   { return count; }
}
```

### Synchronized block — finer control

```java
public class BankAccount {
    private final Object lock = new Object(); // dedicated lock object
    private double balance;

    public void deposit(double amount) {
        synchronized (lock) {
            balance += amount;
        }
    }

    public void withdraw(double amount) {
        synchronized (lock) {
            if (balance >= amount) balance -= amount;
        }
    }
}
```

::: tip Prefer synchronized blocks over synchronized methods
- Smaller critical section = less contention
- Use a private `final Object lock` as the monitor (not `this`, which callers can also synchronise on)
:::

### Static synchronized — class-level lock

```java
public class IdGenerator {
    private static int counter = 0;

    public static synchronized int nextId() {
        return ++counter; // lock on IdGenerator.class
    }
}
```

---

## volatile

`volatile` ensures **visibility** — writes by one thread are immediately visible to all others. Does NOT ensure atomicity.

```java
public class StopFlag {
    private volatile boolean stopped = false;

    public void run() {
        while (!stopped) { doWork(); } // without volatile, may never see stopped=true
    }

    public void stop() { stopped = true; }
}
```

### volatile vs synchronized

| Aspect | volatile | synchronized |
|--------|---------|-------------|
| Visibility | ✅ yes | ✅ yes |
| Atomicity | ❌ no (only r/w of field) | ✅ yes (entire block) |
| Mutual exclusion | ❌ no | ✅ yes |
| Performance | Cheaper | More expensive |

Use `volatile` for:
- Single-writer, multi-reader flags
- `double-checked locking` (with `volatile`)

Use `synchronized` for:
- Compound operations (read-modify-write)
- Multiple related fields that must be consistent

---

## Happens-Before

The Java Memory Model defines **happens-before** relationships — guarantees about which writes are visible to which reads.

Key relationships:
- **Monitor lock rule:** A `synchronized` unlock happens-before a subsequent lock on the same monitor
- **volatile write:** A volatile write happens-before a subsequent volatile read of the same variable
- **Thread start:** `thread.start()` happens-before any action in the started thread
- **Thread join:** All actions in thread T happen-before `T.join()` returns
- **Transitivity:** If A hb B and B hb C, then A hb C

---

## Atomic Operations

`java.util.concurrent.atomic` package provides lock-free atomic operations using CAS (Compare-And-Swap):

```java
AtomicInteger counter = new AtomicInteger(0);

counter.incrementAndGet()    // atomic ++
counter.getAndIncrement()    // atomic (get then ++)
counter.addAndGet(5)         // atomic += 5
counter.compareAndSet(old, new) // only updates if current == expected

// Long, Boolean, Reference variants:
AtomicLong, AtomicBoolean, AtomicReference<T>

// LongAdder — better than AtomicLong for high-contention counting
LongAdder adder = new LongAdder();
adder.increment();
adder.sum();  // get total

// LongAccumulator — custom accumulator function
LongAccumulator max = new LongAccumulator(Long::max, Long.MIN_VALUE);
max.accumulate(42);
max.get();
```

---

## Deadlock

Four conditions must ALL be present:
1. **Mutual exclusion** — resource can only be held by one thread
2. **Hold and wait** — thread holds one lock and waits for another
3. **No preemption** — locks can't be forcibly taken
4. **Circular wait** — thread A waits for B, B waits for A

```java
// Classic deadlock
Object lockA = new Object();
Object lockB = new Object();

Thread t1 = new Thread(() -> {
    synchronized (lockA) {
        Thread.sleep(100);
        synchronized (lockB) { /* work */ } // waiting for lockB
    }
});

Thread t2 = new Thread(() -> {
    synchronized (lockB) {           // holds lockB
        synchronized (lockA) { /* work */ } // waiting for lockA → DEADLOCK
    }
});
```

### Prevention

- **Lock ordering** — always acquire locks in the same order
- **Use `tryLock()` with timeout** (`ReentrantLock`)
- **Use higher-level abstractions** — `java.util.concurrent` classes handle locking internally

```java
// Lock ordering — both threads always take lockA before lockB
synchronized (lockA) {
    synchronized (lockB) { /* ... */ }
}
```

---

## Livelock and Starvation

- **Livelock** — threads keep responding to each other, never progressing (e.g., two people stepping aside for each other in a hallway)
- **Starvation** — low-priority thread never gets CPU time because high-priority threads always run

---

## ReadWriteLock

Allows multiple concurrent readers OR one exclusive writer — better throughput than `synchronized` for read-heavy access patterns.

```java
ReadWriteLock rwLock = new ReentrantReadWriteLock();
Lock readLock  = rwLock.readLock();
Lock writeLock = rwLock.writeLock();

private final Map<String, Object> cache = new HashMap<>();

// Many threads can hold the read lock simultaneously
public Object get(String key) {
    readLock.lock();
    try {
        return cache.get(key);
    } finally {
        readLock.unlock();
    }
}

// Only one thread can hold the write lock; blocks all readers
public void put(String key, Object value) {
    writeLock.lock();
    try {
        cache.put(key, value);
    } finally {
        writeLock.unlock();
    }
}
```

**When to use:** Read-heavy, write-rare shared state (caches, configuration maps, routing tables).

**When NOT to use:** High write frequency — write lock contention negates the benefit. Use `ConcurrentHashMap` instead for maps, or `StampedLock` for more aggressive optimisation.

---

## StampedLock (Java 8+)

`StampedLock` adds **optimistic reads** — try a read without acquiring any lock, then validate it wasn't interrupted by a write. Fastest path for reads in low-contention scenarios.

```java
StampedLock sl = new StampedLock();
private double x, y;

// Optimistic read — no lock acquired
public double distanceFromOrigin() {
    long stamp = sl.tryOptimisticRead();       // get a stamp (no lock)
    double cx = x, cy = y;                    // snapshot values
    if (!sl.validate(stamp)) {                // was there a write? stamp invalidated?
        // fall back to a real read lock
        stamp = sl.readLock();
        try {
            cx = x; cy = y;
        } finally {
            sl.unlockRead(stamp);
        }
    }
    return Math.sqrt(cx * cx + cy * cy);
}

// Write lock
public void move(double deltaX, double deltaY) {
    long stamp = sl.writeLock();
    try {
        x += deltaX;
        y += deltaY;
    } finally {
        sl.unlockWrite(stamp);
    }
}

// Lock upgrade — read to write
public void conditionalUpdate(double newX) {
    long stamp = sl.readLock();
    try {
        if (x < newX) {
            long writeStamp = sl.tryConvertToWriteLock(stamp);
            if (writeStamp != 0L) {
                stamp = writeStamp;
                x = newX;
            } else {
                // couldn't upgrade atomically — acquire write lock separately
                sl.unlockRead(stamp);
                stamp = sl.writeLock();
                x = newX;
            }
        }
    } finally {
        sl.unlock(stamp);
    }
}
```

::: warning StampedLock is not reentrant
Unlike `ReentrantLock`, calling `writeLock()` from a thread that already holds the write lock will **deadlock**. Use it only in simple, non-recursive scenarios.

Also: StampedLock does NOT support `Condition`. Use `ReentrantLock` when you need `await()`/`signal()`.
:::

### Lock Type Comparison

| Lock | Reentrant | Condition | Optimistic Read | Virtual Thread Safe |
|------|-----------|-----------|-----------------|---------------------|
| `synchronized` | ✅ | `wait()`/`notify()` | ❌ | ❌ (pins carrier) |
| `ReentrantLock` | ✅ | ✅ `newCondition()` | ❌ | ✅ |
| `ReadWriteLock` | ✅ | ❌ | ❌ | ✅ |
| `StampedLock` | ❌ | ❌ | ✅ | ✅ |

---

## Summary

- `synchronized` provides mutual exclusion and visibility guarantees.
- `volatile` provides visibility only — not atomicity for compound operations.
- The happens-before relationship defines JMM visibility guarantees.
- Atomic classes (`AtomicInteger`, etc.) provide lock-free thread-safe operations.
- Prevent deadlocks with consistent lock ordering or `tryLock()`.
- `ReadWriteLock` improves throughput for read-heavy, write-rare access.
- `StampedLock` adds optimistic reads — fastest path, but not reentrant and no Condition.
- Use `ReentrantLock` instead of `synchronized` when blocking I/O inside the critical section (virtual thread pinning).

---

## Interview Quick-Fire

**Q: What is the difference between `ReadWriteLock` and `StampedLock`?**
Both allow concurrent readers and exclusive writers. `StampedLock` adds *optimistic reads* — a read attempt without acquiring a lock, validated afterwards. If no write occurred, it's free; if a write happened, fall back to a real read lock. `StampedLock` is faster under low write contention but is not reentrant and has no `Condition`. `ReadWriteLock` is simpler and safer for general use.

**Q: Why does `synchronized` cause problems with virtual threads?**
When a virtual thread holds a `synchronized` monitor and performs a blocking operation (I/O, sleep), it *pins* to its carrier (OS) thread — the carrier can't serve other virtual threads while pinned. Replace `synchronized` with `ReentrantLock` to allow the JVM to unmount the virtual thread and free the carrier during the blocking call.

**Q: When would you choose `AtomicInteger` over `synchronized`?**
`AtomicInteger` uses hardware CAS (Compare-And-Swap) — lock-free and non-blocking. Ideal for independent counters with high contention from many threads. Use `synchronized` when the critical section involves multiple operations that must be atomic together (compound check-then-act, updating multiple related fields), because CAS only works on a single variable at a time.

<RelatedTopics :topics="['/concurrency/threads', '/concurrency/concurrent-utils', '/concurrency/virtual-threads', '/java-memory/jvm-structure']" />

[→ Back to Concurrency Overview](/concurrency/)
