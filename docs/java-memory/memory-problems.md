---
title: Memory Problems
description: Java OutOfMemoryError types, memory leak patterns, heap dump analysis, and profiling tools
category: java-memory
pageClass: layout-java-memory
difficulty: advanced
tags: [jvm, oom, memory-leak, heap-dump, profiling, outofmemoryerror]
related:
  - /java-memory/jvm-structure
  - /java-memory/garbage-collection
estimatedMinutes: 20
---

# Memory Problems

<DifficultyBadge level="advanced" />

OutOfMemoryErrors and memory leaks are silent killers in production. Recognising the patterns and knowing how to diagnose them with heap dumps and profilers is a senior-level skill.

---

## Types of OutOfMemoryError

### `java.lang.OutOfMemoryError: Java heap space`

Most common. The heap (Old Gen) is full and GC cannot free enough memory.

**Causes:**
- Genuine data growth (process more data than heap can hold)
- Memory leak (objects accumulate and never get GC'd)
- Heap too small for workload

**Diagnosis:**
```
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/dumps/
```
Analyse with VisualVM, Eclipse MAT, or JProfiler.

---

### `java.lang.OutOfMemoryError: GC overhead limit exceeded`

JVM spends > 98% of time in GC but frees < 2% of heap. Application is effectively hung.

**Cause:** Usually a memory leak or heap too small.

---

### `java.lang.OutOfMemoryError: Metaspace`

Metaspace is full — class metadata fills up.

**Common causes:**
- Application servers redeploying apps without restarting (ClassLoader leak)
- Dynamic code generation frameworks (Groovy, CGLIB, Hibernate)
- OSGI environments with many class loaders

**Fix:**
```
-XX:MaxMetaspaceSize=256m   # set a ceiling to see the problem early
```

---

### `java.lang.StackOverflowError`

Thread stack exhausted — too many nested method calls (usually infinite recursion).

```java
// Classic infinite recursion
void factorial(int n) {
    return n * factorial(n - 1); // forgot base case → StackOverflowError
}
```

---

### `java.lang.OutOfMemoryError: unable to create native thread`

OS ran out of resources to create more threads — too many threads in the JVM.

**Fix:**
- Reduce thread count (use thread pools)
- Increase OS thread limit
- Use Virtual Threads (Java 21)

---

## Memory Leak Patterns

A memory leak in Java means objects are **reachable** (GC can't collect them) but **logically unnecessary**.

### 1. Static Collections

```java
public class Cache {
    // Static Map grows forever, never cleared
    private static final Map<String, byte[]> DATA = new HashMap<>();

    public static void cache(String key, byte[] data) {
        DATA.put(key, data);  // entries never removed!
    }
}
```

**Fix:** Use `WeakHashMap`, `SoftReference`, or a proper cache like Caffeine.

### 2. Listeners/Callbacks Not Deregistered

```java
eventBus.subscribe(this::handleEvent); // holds reference to 'this'
// If the component is destroyed but never unsubscribed, it can't be GC'd
```

**Fix:** Always unsubscribe/remove listeners in destroy/close methods.

### 3. ThreadLocal Leaks

```java
// ThreadLocal in a thread pool — threads are reused, ThreadLocals aren't cleaned
private static final ThreadLocal<LargeObject> TL = new ThreadLocal<>();

public void processRequest() {
    TL.set(new LargeObject());  // stored per-thread
    // ... forget to call TL.remove()!
}
```

**Fix:** Always call `ThreadLocal.remove()` in a `finally` block.

```java
public void processRequest() {
    TL.set(new LargeObject());
    try {
        // use TL.get()
    } finally {
        TL.remove(); // critical!
    }
}
```

### 4. Unclosed Resources

```java
// File handles, DB connections, etc.
InputStream is = new FileInputStream("data.txt");
// OOM doesn't happen, but FD leak → "Too many open files"
```

**Fix:** Always use try-with-resources.

### 5. Large Caches Without Eviction

```java
// Cache that grows without bound
Map<Long, UserData> userCache = new HashMap<>();
// Millions of users = millions of entries = OOM
```

**Fix:** Use `LinkedHashMap` with `removeEldestEntry` or Caffeine/Guava Cache with max size + TTL.

### 6. Inner Classes Holding Outer Class References

```java
public class OuterService {
    private byte[] largeBuffer = new byte[10_000_000];

    // Non-static inner class holds implicit reference to OuterService!
    class Inner implements Runnable {
        public void run() { /* use largeBuffer? */ }
    }
}

// Even if OuterService goes out of scope, Inner keeps it alive
```

**Fix:** Make inner classes `static` if they don't need the outer reference.

---

## Heap Dump Analysis Workflow

1. **Capture the dump:**
```bash
# On OOM (set JVM flags):
-XX:+HeapDumpOnOutOfMemoryError -XX:HeapDumpPath=/dumps/

# Manually via jmap:
jmap -dump:format=b,file=/dumps/heap.hprof <pid>

# Via jcmd:
jcmd <pid> GC.heap_dump /dumps/heap.hprof
```

2. **Open with a tool:** Eclipse MAT (free), VisualVM (free), JProfiler (paid), YourKit (paid)

3. **Look for:**
   - **Leak suspects** — MAT's automatic leak detection
   - **Dominator tree** — which objects hold the most memory
   - **Object count by class** — if millions of one class → leak
   - **Retained heap** — how much memory is freed if this object is GC'd

---

## JVM Monitoring Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `jps` | List JVM processes | `jps -l` |
| `jstat` | GC statistics | `jstat -gcutil <pid> 1000` |
| `jmap` | Heap info / dumps | `jmap -heap <pid>` |
| `jstack` | Thread dump | `jstack <pid>` |
| `jcmd` | Multi-purpose | `jcmd <pid> help` |
| VisualVM | GUI profiler | `jvisualvm` |
| JConsole | Basic JMX monitor | `jconsole` |
| Java Flight Recorder | Low-overhead profiling | `-XX:+FlightRecorder` |
| Java Mission Control | Analyse JFR recordings | `jmc` |

---

## GC Tuning Checklist

```
□ Set -Xms == -Xmx to avoid heap resizing in production
□ Set -XX:+HeapDumpOnOutOfMemoryError with -XX:HeapDumpPath
□ Enable GC logging: -Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=20m
□ Monitor GC pause times and frequency
□ Alert on heap usage > 80%
□ Use G1GC (default since Java 9) — tune MaxGCPauseMillis if needed
□ Consider ZGC for sub-ms latency requirements
□ Profile before tuning — don't guess
```

---

## Summary

- **Heap space OOM** — leak or heap too small; diagnose with heap dump.
- **Metaspace OOM** — ClassLoader leak; common in hot-reload environments.
- **StackOverflow** — infinite recursion; fix the logic.
- Common leak patterns: static collections, unreleased listeners, forgotten ThreadLocals, unclosed resources.
- Always set `HeapDumpOnOutOfMemoryError` in production.
- Use Eclipse MAT or VisualVM for heap dump analysis.

<RelatedTopics :topics="['/java-memory/jvm-structure', '/java-memory/garbage-collection', '/concurrency/threads']" />

[→ Take the Java Memory Quiz](/quizzes/java-memory-quiz)
