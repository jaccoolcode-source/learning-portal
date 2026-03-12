---
title: Garbage Collection
description: JVM garbage collection algorithms compared — Serial, Parallel, CMS, G1, ZGC, Shenandoah — with trade-offs and when to use each
category: java-memory
pageClass: layout-java-memory
difficulty: advanced
tags: [jvm, gc, garbage-collection, g1, zgc, shenandoah, stop-the-world]
related:
  - /java-memory/jvm-structure
  - /java-memory/memory-problems
estimatedMinutes: 25
quizLink: /quizzes/java-memory-quiz
---

# Garbage Collection

<DifficultyBadge level="advanced" />

GC is automatic memory management — the JVM identifies objects that are no longer reachable and reclaims their memory. The choice of GC algorithm affects **throughput** (total work done) vs **latency** (pause duration).

---

## How GC Determines What to Collect

An object is **eligible for GC** when it is no longer reachable from any **GC root**:

- Active thread stacks
- Static variables
- JNI references
- `Thread` objects

The JVM traces from GC roots and marks everything reachable. Unmarked objects are garbage.

---

## The Two Key Trade-offs

| Dimension | Description |
|-----------|-------------|
| **Throughput** | Total CPU time spent doing useful work vs. GC |
| **Latency** | How long application threads are paused during GC |

These are in tension: minimising pauses requires more concurrent GC work, which costs CPU.

---

## GC Algorithms

### 1. Serial GC

Simple, single-threaded collector. Only one CPU core used for GC.

```
-XX:+UseSerialGC
```

- **Stop-the-world** for all collections
- Suitable for: single-core JVMs, small heaps, embedded devices

### 2. Parallel GC (Throughput Collector)

Multiple GC threads. Goal: maximise throughput.

```
-XX:+UseParallelGC       (default in Java 8)
-XX:ParallelGCThreads=8
```

- Stop-the-world Minor and Major GC
- Good for batch processing where throughput matters more than pauses
- Pauses can be seconds for large heaps

### 3. CMS (Concurrent Mark Sweep)

Designed to minimise Old Gen collection pauses by doing most work concurrently.

```
-XX:+UseConcMarkSweepGC  (deprecated in Java 9, removed Java 14)
```

**Phases:**
1. Initial Mark (STW) — mark GC roots
2. Concurrent Mark — trace reachability (concurrent, no pause)
3. Remark (STW) — catch changes during step 2
4. Concurrent Sweep — reclaim garbage (concurrent, no pause)

Problem: **Memory fragmentation** — CMS doesn't compact, so eventually a Full GC is needed.

### 4. G1 GC (Garbage-First)

Default since Java 9. Designed for large heaps (>4 GB) with predictable pause targets.

```
-XX:+UseG1GC              (default)
-XX:MaxGCPauseMillis=200  (target pause time)
```

**Key innovation:** The heap is divided into equal-size **regions** (1–32 MB each). Regions are dynamically assigned as Eden, Survivor, or Old.

```
G1 Heap (example: 4 GB, 2048 regions of 2 MB each):

[E][E][E][E][S][S][O][O][O][E][O][H][H][ ][ ][ ][ ]...
 E=Eden  S=Survivor  O=Old  H=Humongous (large objects)
```

**Phases:**
1. Young GC (STW) — collect all Eden and Survivor regions
2. Concurrent Marking — mark live objects in Old regions
3. Mixed GC — collect Young + selected Old regions (those with most garbage = "garbage first")
4. Full GC (fallback) — single-threaded, if mixed GC can't keep up

**Humongous objects:** Objects ≥ 50% of region size are allocated directly in Old Gen. Tune region size if you have many large objects:
```
-XX:G1HeapRegionSize=4m
```

### 5. ZGC (Z Garbage Collector)

Java 15+ production-ready. Goal: **sub-millisecond pauses** regardless of heap size.

```
-XX:+UseZGC
-Xmx16g
```

- Nearly all work done concurrently (load barriers for object access)
- Pause times typically < 1 ms even on 16 TB heaps
- Cost: 5–15% CPU overhead for concurrent marking

### 6. Shenandoah

Similar goals to ZGC, developed by Red Hat.

```
-XX:+UseShenandoahGC
```

- Concurrent compaction (unique vs. G1/ZGC)
- Good for large heaps needing low latency

---

## Comparison Table

| GC | Default Version | Stop-the-World | Best For |
|----|----------------|---------------|---------|
| Serial | Any | Full pause | Single-core, tiny heaps |
| Parallel | Java 8 | Full pause | High throughput, batch jobs |
| CMS | Java 6–8 | Short pauses | Low latency (deprecated) |
| G1 | Java 9+ | Short pauses | General purpose, >4 GB heaps |
| ZGC | Java 15+ | ~1 ms | Very large heaps, ultra-low latency |
| Shenandoah | Java 12+ | ~1 ms | Low latency, large heaps |

---

## Minor GC, Major GC, Full GC

| Type | What it collects | Speed | Trigger |
|------|-----------------|-------|---------|
| **Minor GC** | Young Gen (Eden + Survivors) | Fast (< 100 ms) | Eden full |
| **Major GC** | Old Gen | Slow | Old Gen threshold |
| **Full GC** | Entire heap + Metaspace | Slowest | Explicit `System.gc()`, OOM risk, CMS failure |

::: warning Avoid System.gc()
Calling `System.gc()` is a hint, not a guarantee. In production, it can cause unexpected Full GC pauses. Disable it with `-XX:+DisableExplicitGC`.
:::

---

## GC Tuning Flags

```bash
# G1 tuning
-XX:MaxGCPauseMillis=200        # target max pause (G1 will try to meet this)
-XX:G1HeapRegionSize=4m         # region size (1–32 MB, power of 2)
-XX:G1NewSizePercent=20         # min % of heap for Young Gen
-XX:G1MaxNewSizePercent=60      # max % of heap for Young Gen
-XX:InitiatingHeapOccupancyPercent=45  # % of heap before concurrent marking starts

# Logging (Java 9+ unified GC log)
-Xlog:gc*:file=/logs/gc.log:time,uptime:filecount=5,filesize=20m

# Heap dump on OOM
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/dumps/
```

---

## Reading GC Logs

```
[2.345s][info][gc] GC(5) Pause Young (Normal) (G1 Evacuation Pause) 256M->89M(1024M) 12.345ms
```

| Part | Meaning |
|------|---------|
| `2.345s` | JVM uptime |
| `GC(5)` | 6th GC event |
| `Pause Young` | Minor GC |
| `256M->89M` | Heap before → after |
| `(1024M)` | Total heap capacity |
| `12.345ms` | Pause duration |

---

## Summary

- GC automatically reclaims unreachable objects; no manual `free()` in Java.
- **G1** is the right default for most applications.
- **ZGC or Shenandoah** for very large heaps needing sub-millisecond latency.
- Minor GC is fast; avoid triggering Full GC in production.
- Set `-XX:+HeapDumpOnOutOfMemoryError` on all production JVMs.

<RelatedTopics :topics="['/java-memory/jvm-structure', '/java-memory/memory-problems']" />

[→ Take the Java Memory Quiz](/quizzes/java-memory-quiz)
