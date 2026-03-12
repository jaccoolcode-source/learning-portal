---
title: JVM Tuning
description: GC selection guide (G1 vs ZGC vs Shenandoah), heap sizing, JIT tuning, code cache, string deduplication, and GC log analysis
category: performance
pageClass: layout-performance
difficulty: advanced
tags: [jvm, gc, g1gc, zgc, shenandoah, heap-tuning, jit, code-cache]
related:
  - /java-memory/garbage-collection
  - /java-memory/jvm-structure
  - /performance/profiling
estimatedMinutes: 35
---

# JVM Tuning

<DifficultyBadge level="advanced" />

JVM tuning is about matching GC behaviour to your application's latency and throughput requirements. The wrong defaults can cause seconds-long GC pauses or waste CPU on unnecessary collection cycles.

> **Prerequisites:** This page focuses on tuning decisions. For GC algorithm internals (how G1/ZGC work), see [Garbage Collection](/java-memory/garbage-collection).

---

## GC Selection Guide

The single most important tuning decision is choosing the right GC.

```
What matters most?

Throughput (batch jobs, data pipelines, offline processing)?
  → G1GC (default) or ParallelGC

Low latency (APIs, real-time, interactive)?
  → ZGC (Java 15+, production-ready Java 17+)
  → Shenandoah (Red Hat-backed, available in OpenJDK builds)

Consistent pause times with large heaps (> 32 GB)?
  → ZGC (sub-millisecond pauses regardless of heap size)

Simplicity + good all-around performance?
  → G1GC (default since Java 9 — good for most apps)
```

### GC Comparison

| GC | Pause Type | Heap Size | Throughput | Max Pause | Best For |
|----|-----------|-----------|-----------|-----------|----------|
| **Serial** | Stop-the-world | Small (< 256 MB) | High | 100s ms | Single-core, CLI tools |
| **Parallel** | Stop-the-world | Medium | Highest | 100s ms | Batch jobs, throughput priority |
| **G1** | Mostly concurrent | Medium–Large | Good | ~200ms target | General purpose — **default** |
| **ZGC** | Fully concurrent | Any (TB scale) | Slightly lower | **< 1ms** | Low-latency APIs, large heaps |
| **Shenandoah** | Fully concurrent | Any | Slightly lower | **< 10ms** | Low-latency, Red Hat ecosystem |

---

## G1GC Tuning (Default)

G1 is a good default. These are the knobs worth touching:

```bash
# Basic heap sizing
-Xms4g                         # initial heap = max heap (avoids resize pauses)
-Xmx4g                         # max heap

# Pause time target (G1 tries to stay under this)
-XX:MaxGCPauseMillis=200       # default 200ms — reduce to 100ms for APIs

# Region size (must be power of 2, 1MB–32MB)
# Larger regions = fewer humongous object promotions
# Rule: HeapSize / 2048 (aim for ~2048 regions)
-XX:G1HeapRegionSize=4m        # for 8GB heap: 8192/2048 = 4MB

# Initiate concurrent mark when heap is N% full (default 45%)
# Too low: GC too frequent; too high: GC can't finish before OOM
-XX:InitiatingHeapOccupancyPercent=40

# Reserve space for promotion (default 10%)
-XX:G1ReservePercent=10

# Young generation size (let G1 manage this unless you have problems)
# -XX:NewRatio=2     ← rarely needed with G1
```

### G1 Tuning for Low-Latency APIs

```bash
# Reduce pause target
-XX:MaxGCPauseMillis=100

# Increase heap to reduce GC frequency (less pressure)
-Xms8g -Xmx8g

# More concurrent threads (default: Runtime.availableProcessors()/4)
-XX:ConcGCThreads=4

# G1 adaptive IHOP — let G1 auto-tune the trigger point
-XX:+G1UseAdaptiveIHOP          # enabled by default Java 9+
```

### When G1 is Struggling

Symptoms:
```
Full GC in logs → heap too small or humongous object leaks
Mixed GC not finishing → reduce MaxGCPauseMillis or increase heap
Evacuation failure → increase heap or reduce promotion rate (fewer old gen objects)
```

---

## ZGC — Sub-Millisecond Pauses (Java 17+)

ZGC performs all expensive work concurrently. Stop-the-world pauses are for root scanning only — typically < 1ms regardless of heap size.

```bash
# Enable ZGC (production-ready since Java 17)
-XX:+UseZGC

# For generational ZGC (Java 21+ — much better throughput)
-XX:+UseZGC -XX:+ZGenerational

# Heap sizing — ZGC needs headroom to do concurrent GC
# Rule: max heap ≥ 3× live data set
-Xms8g -Xmx16g

# ZGC auto-tunes most parameters — fewer flags needed than G1
# Optionally set: concurrent GC threads
-XX:ConcGCThreads=4
```

### ZGC Gotchas

```
1. Higher memory overhead — ZGC uses colored pointers (extra heap space)
   → Need more RAM than G1 for the same workload

2. Slightly lower throughput than G1 — concurrent work steals CPU
   → Acceptable for latency-sensitive APIs, not for batch jobs

3. Java < 17: ZGC is experimental — upgrade before using in production

4. Large heap but low allocation rate: ZGC shines
   Large heap with high allocation rate: generational ZGC (-XX:+ZGenerational)
```

---

## Shenandoah (OpenJDK / Red Hat)

Similar goals to ZGC — fully concurrent, sub-10ms pauses. Available in standard OpenJDK builds (not just Red Hat).

```bash
-XX:+UseShenandoahGC

# Heuristic (how aggressive GC starts)
-XX:ShenandoahGCHeuristics=adaptive     # default — reactive to allocation
-XX:ShenandoahGCHeuristics=compact      # for very low heap headroom
-XX:ShenandoahGCHeuristics=aggressive   # minimal pauses, maximum CPU
```

**ZGC vs Shenandoah:** Both are excellent. ZGC is Oracle-backed and has better Java 21 generational support. Shenandoah is preferred if you're on Red Hat/Fedora distributions. For most teams, ZGC with `-XX:+ZGenerational` (Java 21) is the go-to choice.

---

## Heap Sizing

```bash
# Set Xms = Xmx to avoid heap resize pauses
-Xms4g -Xmx4g

# Leave memory for OS + off-heap:
# Container with 8GB RAM → -Xmx6g (leave 2GB for OS, metaspace, off-heap)

# Rule of thumb for containers:
-XX:MaxRAMPercentage=75.0    # use 75% of container RAM as max heap
# replaces -Xmx in containerised environments (Java 10+)
```

### Metaspace

Metaspace holds class metadata and is off-heap. Unbounded by default — cap it:

```bash
-XX:MetaspaceSize=256m         # initial metaspace (avoid early resize)
-XX:MaxMetaspaceSize=512m      # cap — prevents runaway class loading leaks

# If you see: java.lang.OutOfMemoryError: Metaspace
# → class loader leak (common with reflection-heavy frameworks, hot reload)
```

---

## JIT Compilation

The JIT (Just-In-Time) compiler translates frequently-executed bytecode into native machine code. Most optimisation happens automatically — these are edge-case tuning knobs.

### JIT Compilation Thresholds

```bash
# Tiered compilation (default since Java 8):
# Tier 1-3: client compiler (C1) — fast compile, moderate optimisation
# Tier 4: server compiler (C2) — slow compile, aggressive optimisation

# Threshold: how many invocations before C2 compilation
-XX:CompileThreshold=10000     # default — lower for faster warm-up
-XX:+TieredCompilation         # enabled by default

# View what JIT is compiling (verbose — development only)
-XX:+PrintCompilation
```

### Code Cache

The code cache stores JIT-compiled native code. If it fills up, JIT stops compiling and performance degrades to interpreted mode.

```bash
# Default code cache: 240MB (often insufficient for large Spring apps)
-XX:ReservedCodeCacheSize=512m    # increase for large apps
-XX:InitialCodeCacheSize=64m

# Alert when code cache fills
-XX:+UseCodeCacheFlushing         # enabled by default — flushes old compiled code

# Detect code cache issues
jcmd <pid> VM.native_memory summary

# Log code cache usage
-XX:+PrintCodeCache               # print on JVM exit
```

Signs of code cache exhaustion:
```
Log: "CodeCache is full"
Log: "Compiler is disabled"
JFR: low JIT compilation events, falling "CodeCache" metric
Symptom: performance degrades slowly over time after warm-up
```

---

## String Deduplication (G1)

In many applications, 20–30% of heap is identical `String` objects. G1 can deduplicate them:

```bash
# Only works with G1GC, adds minor overhead
-XX:+UseStringDeduplication

# Minimum string age before deduplication (default 3 GC cycles)
-XX:StringDeduplicationAgeThreshold=3

# Report deduplication statistics
-XX:+PrintStringDeduplicationStatistics
```

Effective when: many repeated strings from JSON parsing, database results, configuration values.

---

## GC Log Analysis

Always enable GC logging in production. It has negligible overhead and is essential for diagnosing pauses.

```bash
# Java 9+ unified logging
-Xlog:gc*:file=/var/log/app/gc.log:time,uptime,level,tags:filecount=10,filesize=50m

# What to log:
-Xlog:gc                    # basic GC events
-Xlog:gc*                   # everything (verbose — for troubleshooting)
-Xlog:gc+heap               # heap usage at each GC
-Xlog:gc+pause              # pause times
```

### Reading GC Logs

```
[2024-01-15T10:30:00.123+0000] GC(42) Pause Young (Normal) (G1 Evacuation Pause)
[2024-01-15T10:30:00.123+0000] GC(42)   Eden: 512.0M(512.0M)->0.0B(512.0M)
[2024-01-15T10:30:00.124+0000] GC(42)   Survivors: 64.0M->80.0M
[2024-01-15T10:30:00.124+0000] GC(42)   Heap: 2048.0M(4096.0M)->1600.0M(4096.0M)
[2024-01-15T10:30:00.124+0000] GC(42) Pause Young (Normal) 1.2ms

Key fields:
- "Pause Young" → minor GC (Young gen collected) — expected, usually fast
- "Pause Full"  → Full GC — problematic, should be rare
- "1.2ms"       → pause duration — compare against MaxGCPauseMillis target
- Eden/Survivors → young gen sizes
- Heap: used(committed)->used(committed)
```

### GCeasy.io

Upload GC logs to [gceasy.io](https://gceasy.io) for automatic analysis:
- Pause time distribution
- Allocation rate
- Promotion rate
- Recommendations

---

## JVM Flags Quick Reference

```bash
# ── Core heap sizing ──────────────────────────────────────────────────────
-Xms4g -Xmx4g                              # heap min/max (set equal)
-XX:MaxRAMPercentage=75.0                  # container-friendly alternative to -Xmx

# ── GC selection ──────────────────────────────────────────────────────────
-XX:+UseG1GC                               # default Java 9+
-XX:+UseZGC -XX:+ZGenerational            # low latency, Java 21+
-XX:+UseShenandoahGC                       # low latency alternative
-XX:+UseParallelGC                         # max throughput (batch)

# ── G1 tuning ─────────────────────────────────────────────────────────────
-XX:MaxGCPauseMillis=200                   # pause target
-XX:G1HeapRegionSize=4m                    # region size
-XX:InitiatingHeapOccupancyPercent=40      # when to start marking

# ── Metaspace ─────────────────────────────────────────────────────────────
-XX:MetaspaceSize=256m
-XX:MaxMetaspaceSize=512m

# ── Code cache ────────────────────────────────────────────────────────────
-XX:ReservedCodeCacheSize=512m

# ── GC logging ────────────────────────────────────────────────────────────
-Xlog:gc*:file=/var/log/gc.log:time,uptime,level,tags:filecount=10,filesize=50m

# ── Diagnostics ───────────────────────────────────────────────────────────
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=/var/log/heapdump.hprof
-XX:+ExitOnOutOfMemoryError                # fail fast — don't limp on
-XX:StartFlightRecording=maxage=6h,maxsize=500m  # always-on JFR
```

---

## Kubernetes / Container Flags

```bash
# Java 11+ container awareness (auto-detects cgroup limits)
# No longer need: -XX:+UnlockExperimentalVMOptions -XX:+UseCGroupMemoryLimitForHeap

# Use percentage-based sizing in containers
-XX:MaxRAMPercentage=75.0
-XX:InitialRAMPercentage=50.0

# Reduce footprint in small containers
-XX:+UseSerialGC                           # for very small containers < 512MB
-Xss256k                                   # reduce thread stack (default 512k–1MB)
-XX:TieredStopAtLevel=1                    # disable C2 JIT — faster startup, lower throughput

# GraalVM native-image (Spring Boot 3 AOT):
# No JVM flags needed — compiled ahead-of-time
# Startup: ms instead of seconds, memory: 10× lower
```

---

## Interview Quick-Fire

**Q: When would you choose ZGC over G1GC?**
ZGC when you need sub-millisecond GC pause times — typically for user-facing APIs with strict latency SLOs (p99 < 100ms), or when the heap is very large (> 32 GB) where G1 pauses scale with heap size. G1 is the better default for most applications: simpler to tune, slightly better throughput, and sufficient for apps tolerating 100–200ms pauses. With Java 21, use `-XX:+UseZGC -XX:+ZGenerational` for the best of both worlds.

**Q: What causes Full GC and why is it dangerous?**
Full GC collects the entire heap stop-the-world — all application threads pause until it completes. Causes: (1) Old generation fills up because objects survive too long (tuning failure); (2) Humongous object allocations that don't fit in young gen; (3) Explicit `System.gc()` calls. Duration scales with heap size — a 32 GB heap can pause for 10–30 seconds. Mitigations: increase heap, reduce object tenure (faster death of short-lived objects), switch to ZGC/Shenandoah for concurrent collection.

**Q: What is the code cache and what happens when it fills up?**
The code cache stores native machine code produced by the JIT compiler. When it fills up, the JIT stops compiling new methods — all subsequent method calls execute as interpreted bytecode, which is 10–100× slower than JIT-compiled code. Symptom: application performance gradually degrades after warm-up. Fix: increase `-XX:ReservedCodeCacheSize` (default 240MB is often not enough for large Spring Boot apps; use 512MB).

<RelatedTopics :topics="['/java-memory/garbage-collection', '/java-memory/jvm-structure', '/performance/profiling', '/performance/load-testing']" />

[→ Back to Performance Overview](/performance/)
