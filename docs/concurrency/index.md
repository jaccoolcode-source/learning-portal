---
title: Concurrency — Overview
description: Java concurrency from Thread basics through synchronized, locks, Executors, CompletableFuture, Virtual Threads, and Structured Concurrency
category: concurrency
pageClass: layout-concurrency
difficulty: advanced
tags: [java, concurrency, threads, synchronization, virtual-threads, completablefuture, executor]
related:
  - /concurrency/threads
  - /concurrency/synchronization
  - /concurrency/concurrent-utils
  - /concurrency/virtual-threads
  - /java-memory/jvm-structure
estimatedMinutes: 10
---

# Concurrency

<DifficultyBadge level="advanced" />

Concurrency is one of the most challenging aspects of Java development. This section covers threads, synchronisation, the `java.util.concurrent` toolkit, and Virtual Threads introduced in Java 21.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [Threads](./threads) | `Thread`, `Runnable`, `Callable`, thread states, daemon threads, `ThreadLocal`, thread confinement |
| [Synchronization](./synchronization) | `synchronized`, `volatile`, happens-before, atomic classes, `ReadWriteLock`, `StampedLock`, deadlock |
| [Concurrent Utilities](./concurrent-utils) | `ExecutorService`, `CompletableFuture`, `ForkJoinPool`, `BlockingQueue`, concurrent collections, `ReentrantLock` |
| [Virtual Threads (Java 21)](./virtual-threads) | Project Loom, carrier threads, pinning, `StructuredTaskScope`, Spring Boot integration |

---

## The Core Problem

Multiple threads share heap memory. Without coordination:
- **Race conditions** — outcome depends on thread scheduling
- **Visibility issues** — one thread's write is invisible to another
- **Deadlocks** — threads wait for each other forever

```
Thread 1: count++  (read count=0, write count=1)
Thread 2: count++  (read count=0, write count=1) ← both read before either writes!
Final: count=1  (should be 2!)
```

---

## Key Mental Models

- **Atomicity** — an operation completes without interruption
- **Visibility** — when one thread's write becomes visible to others
- **Ordering** — the order operations appear to execute in

The Java Memory Model (JMM) defines rules for all three via **happens-before** relationships.

---

## Choosing the Right Tool

```
Single async task with result → CompletableFuture.supplyAsync()
Many short I/O-bound tasks  → Executors.newVirtualThreadPerTaskExecutor() (Java 21)
Fan-out + join results      → StructuredTaskScope (Java 21)
CPU-bound parallel split    → ForkJoinPool / parallelStream()
Producer-consumer           → BlockingQueue + ExecutorService
Simple shared counter       → AtomicInteger / LongAdder
Complex shared state        → ReentrantLock or synchronized block
Flag between threads        → volatile boolean
Read-heavy shared state     → ReadWriteLock / StampedLock
```

---

## Interview Quick-Fire

**Q: What are the three properties the Java Memory Model governs?**
Atomicity (operations complete without interruption), visibility (writes becoming visible to other threads), and ordering (the apparent execution order). `synchronized` provides all three; `volatile` provides visibility and ordering but not atomicity for compound operations.

**Q: What is the difference between `synchronized` and `ReentrantLock`?**
Both provide mutual exclusion and visibility. `ReentrantLock` adds: `tryLock()` with timeout (prevents deadlock), interruptible lock acquisition, `Condition` objects (multiple wait sets), and fairness policy. `synchronized` is simpler and good enough for most cases. Virtual threads require `ReentrantLock` instead of `synchronized` when blocking I/O is involved — `synchronized` pins the carrier thread.

**Q: When should you use virtual threads instead of a fixed thread pool?**
For I/O-bound workloads (HTTP calls, DB queries, file I/O) where threads spend most time waiting. Virtual threads make blocking cheap — millions can wait concurrently. Use a fixed platform thread pool for CPU-bound work, where blocking doesn't occur and parallelism is bounded by CPU cores.

<RelatedTopics :topics="['/concurrency/threads', '/concurrency/synchronization', '/concurrency/concurrent-utils', '/concurrency/virtual-threads', '/java-memory/jvm-structure']" />
