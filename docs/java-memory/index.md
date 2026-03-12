---
title: JVM & Memory — Overview
description: JVM memory model, garbage collection algorithms, and diagnosing memory problems
category: java-memory
pageClass: layout-java-memory
---

# JVM & Memory

<DifficultyBadge level="intermediate" /> → <DifficultyBadge level="advanced" />

Understanding how the JVM manages memory separates senior engineers from juniors. GC tuning, OOM diagnosis, and memory leak detection are critical production skills.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [JVM Structure](./jvm-structure) | Heap regions, Stack, Metaspace, Code Cache |
| [Garbage Collection](./garbage-collection) | Serial, Parallel, CMS, G1, ZGC, Shenandoah |
| [Memory Problems](./memory-problems) | OOM types, memory leaks, heap dump analysis |

---

## Key Mental Models

```
JVM Memory Areas:
┌────────────────────────────────────────────┐
│  Heap                                       │
│  ┌──────────────┐  ┌─────────────────────┐ │
│  │  Young Gen   │  │    Old Generation   │ │
│  │ ┌──┬──┬────┐ │  │                     │ │
│  │ │E0│E1│ S0 │ │  │  Long-lived objects │ │
│  │ └──┴──┴────┘ │  │                     │ │
│  │   Eden  Surv │  │                     │ │
│  └──────────────┘  └─────────────────────┘ │
└────────────────────────────────────────────┘
┌────────────────┐  ┌──────────────────────┐
│    Metaspace   │  │   Thread Stacks (n×) │
│  Class metadata│  │  Stack frames, locals│
└────────────────┘  └──────────────────────┘
```

---

## Quick Facts

- **Young GC (Minor GC)** — collects Eden + Survivor; very fast
- **Full GC** — collects entire heap; causes stop-the-world pauses
- **G1 GC** is the default since JDK 9; good for most applications
- **ZGC / Shenandoah** target sub-millisecond pauses for very large heaps

<RelatedTopics :topics="['/java-memory/jvm-structure', '/java-memory/garbage-collection', '/java-memory/memory-problems']" />
