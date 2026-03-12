---
title: JVM Structure
description: JVM memory areas explained — Heap (Young/Old Gen), Stack, Metaspace, Code Cache, and what lives where
category: java-memory
pageClass: layout-java-memory
difficulty: intermediate
tags: [jvm, heap, stack, metaspace, memory, young-gen, old-gen]
related:
  - /java-memory/garbage-collection
  - /java-memory/memory-problems
  - /concurrency/threads
estimatedMinutes: 20
---

# JVM Structure

<DifficultyBadge level="intermediate" />

The JVM divides memory into distinct regions. Each region has a specific purpose, lifecycle, and potential OOM error. Knowing which region holds what is fundamental to JVM tuning and debugging.

---

## Memory Areas Overview

```
┌─────────────────────── JVM Process ──────────────────────────┐
│                                                               │
│  ┌─────────────────────── HEAP ─────────────────────────┐    │
│  │                                                       │    │
│  │  ┌─── Young Generation ───┐  ┌─── Old Generation ──┐ │    │
│  │  │  ┌──────┐ ┌──┐  ┌──┐  │  │                     │ │    │
│  │  │  │ Eden │ │S0│  │S1│  │  │  Tenured Objects    │ │    │
│  │  │  └──────┘ └──┘  └──┘  │  │                     │ │    │
│  │  │  (new objects born)    │  │  (survived 15+ GCs) │ │    │
│  │  └────────────────────────┘  └─────────────────────┘ │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────┐  ┌─────────────────────────────────────┐   │
│  │  Metaspace   │  │           Thread Stacks             │   │
│  │ (class meta) │  │  [Thread-1 Stack] [Thread-2 Stack]  │   │
│  └──────────────┘  └─────────────────────────────────────┘   │
│                                                               │
│  ┌────────────────┐  ┌───────────────────────────────────┐   │
│  │   Code Cache   │  │     Direct Memory (off-heap)      │   │
│  │  (JIT bytecode)│  │  (NIO ByteBuffer.allocateDirect)  │   │
│  └────────────────┘  └───────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

---

## The Heap

All object instances and arrays live in the heap. GC manages heap memory automatically.

### Young Generation

| Area | Purpose |
|------|---------|
| **Eden** | New objects are allocated here |
| **Survivor 0 (S0)** | Objects that survived at least one Minor GC |
| **Survivor 1 (S1)** | Objects copy between S0/S1 each Minor GC |

**Minor GC lifecycle:**
1. New object → Eden
2. Eden full → Minor GC fires
3. Surviving Eden objects → S0 (or S1); age counter incremented
4. After enough Minor GCs (default: age 15) → promoted to Old Gen

```
Object lifecycle:
  new MyObject()  →  Eden
  Minor GC #1    →  Survivor 0, age=1
  Minor GC #2    →  Survivor 1, age=2
  ...
  Minor GC #15   →  Old Generation (tenured)
```

### Old Generation (Tenured)

Long-lived objects. Collected by **Major GC** (much slower, stop-the-world).

Typical occupants:
- Static objects
- Objects cached for the lifetime of the app
- Thread-local objects with long-lived threads

---

## Thread Stack

Each thread gets its own **stack** — separate from the heap.

### What lives on the stack

- **Stack frames** — one per method invocation
- **Local primitive variables** (`int`, `long`, `boolean`, ...)
- **Object references** (the reference variable, not the object itself — objects always live on the heap)
- **Partial results** of expressions

```java
void method() {
    int x = 42;              // on stack
    String s = "hello";      // reference on stack; object on heap (String pool)
    Point p = new Point(1,2); // reference on stack; Point object on heap
}
// After method returns, stack frame is popped — x, s, p references gone
// The Point object is now eligible for GC (if no other references)
```

### Stack size

Default: 512 KB – 1 MB per thread (JVM-dependent). Recursive calls can exhaust it:

```java
public void infiniteRecursion() {
    infiniteRecursion(); // → StackOverflowError
}
```

Tune with: `-Xss512k`

---

## Metaspace

Replaced PermGen in Java 8. Stores **class metadata** in native memory.

| Stored in Metaspace | Not stored in Metaspace |
|--------------------|------------------------|
| Class names and field names | Object instances |
| Method bytecode | Static field *values* (on heap) |
| Constant pool entries | Local variables |
| Annotations | |
| `static` field metadata | |

::: info Static fields
The *values* of static reference fields live on the heap (in a special Class object). The metadata about the static field itself lives in Metaspace.
:::

By default, Metaspace grows as needed (no fixed limit). Set a limit to prevent runaway growth:

```
-XX:MaxMetaspaceSize=256m
```

**`OutOfMemoryError: Metaspace`** — usually means class loading leak (e.g., OSGI, hot-reload in dev mode creating new ClassLoaders).

---

## Code Cache

JIT-compiled native code is stored here. Exhaustion causes the JVM to fall back to interpreted mode (significant slowdown).

```
-XX:ReservedCodeCacheSize=256m
```

---

## JVM Flags Reference

| Flag | Purpose |
|------|---------|
| `-Xms512m` | Initial heap size |
| `-Xmx2g` | Maximum heap size |
| `-Xss512k` | Thread stack size |
| `-XX:MetaspaceSize=64m` | Initial Metaspace size |
| `-XX:MaxMetaspaceSize=256m` | Max Metaspace size |
| `-XX:NewRatio=2` | Old:Young ratio (default: Young = 1/3 heap) |
| `-XX:SurvivorRatio=8` | Eden:Survivor ratio (default: Eden = 8/10 Young) |
| `-XX:MaxTenuringThreshold=15` | Age before promotion to Old Gen |
| `-verbose:gc` | Print GC events |
| `-XX:+PrintGCDetails` | Detailed GC output |
| `-XX:+HeapDumpOnOutOfMemoryError` | Write heap dump on OOM |

---

## Common Confusions

| Question | Answer |
|----------|--------|
| Where do object instances live? | Heap (always) |
| Where do local variables live? | Stack (primitives and references) |
| Where does the actual String content live? | Heap (String pool or regular heap) |
| Where does class metadata live? | Metaspace |
| Where do static fields live? | Heap (as part of the Class object) |
| Where does JIT-compiled code live? | Code Cache |

---

## Summary

- **Heap** = object instances and arrays; divided into Young (Eden + Survivors) and Old Gen.
- **Stack** = one per thread; local variables, references, method frames.
- **Metaspace** = class metadata; grows in native memory.
- **Code Cache** = JIT-compiled code.
- Young Gen is collected frequently (fast); Old Gen is collected rarely (slow).
- Minor GC promotes objects when their age reaches `MaxTenuringThreshold`.

<RelatedTopics :topics="['/java-memory/garbage-collection', '/java-memory/memory-problems', '/concurrency/threads']" />

[→ Take the Java Memory Quiz](/quizzes/java-memory-quiz)
