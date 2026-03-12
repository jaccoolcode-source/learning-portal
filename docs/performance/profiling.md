---
title: Profiling & Benchmarking
description: JMH microbenchmarks, Java Flight Recorder, async-profiler, flame graph interpretation, and common profiling pitfalls
category: performance
pageClass: layout-performance
difficulty: advanced
tags: [profiling, jmh, jfr, async-profiler, flame-graphs, benchmarking]
related:
  - /performance/jvm-tuning
  - /java-memory/memory-problems
  - /performance/load-testing
estimatedMinutes: 35
---

# Profiling & Benchmarking

<DifficultyBadge level="advanced" />

Profiling tells you where time is actually spent. Benchmarking tells you whether a change made things faster or slower. Both are required before any performance optimisation.

---

## JMH — Java Microbenchmark Harness

JMH is the standard tool for measuring the performance of small Java code units. Writing benchmarks without JMH gives misleading results because of JIT warm-up, dead code elimination, and constant folding.

### Setup

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.openjdk.jmh</groupId>
    <artifactId>jmh-core</artifactId>
    <version>1.37</version>
    <scope>test</scope>
</dependency>
<dependency>
    <groupId>org.openjdk.jmh</groupId>
    <artifactId>jmh-generator-annprocess</artifactId>
    <version>1.37</version>
    <scope>test</scope>
</dependency>
```

### Basic Benchmark

```java
@BenchmarkMode(Mode.AverageTime)          // measure average execution time
@OutputTimeUnit(TimeUnit.NANOSECONDS)
@State(Scope.Benchmark)                   // state shared across all threads
@Warmup(iterations = 5, time = 1)        // 5 warmup iterations (let JIT compile)
@Measurement(iterations = 10, time = 1)  // 10 measurement iterations
@Fork(2)                                  // run in 2 separate JVM processes
public class StringConcatBenchmark {

    private final String a = "Hello";
    private final String b = "World";

    @Benchmark
    public String stringConcat() {
        return a + b;                    // JIT may compile this to StringBuilder
    }

    @Benchmark
    public String stringBuilder() {
        return new StringBuilder()
            .append(a).append(b)
            .toString();
    }

    @Benchmark
    public String stringFormat() {
        return String.format("%s%s", a, b);  // reflective — usually slower
    }

    public static void main(String[] args) throws Exception {
        org.openjdk.jmh.Main.main(args);
    }
}
```

Run: `mvn package && java -jar target/benchmarks.jar`

### Benchmark Modes

| Mode | Measures | Use When |
|------|---------|----------|
| `AverageTime` | Average time per operation | General latency |
| `Throughput` | Operations per second | Maximum throughput |
| `SampleTime` | Distribution (percentiles) | Latency with outliers |
| `SingleShotTime` | Cold start (no warmup) | Startup, init cost |

### State Scopes

```java
@State(Scope.Benchmark)  // one instance shared across all threads (benchmark-wide)
@State(Scope.Thread)     // one instance per thread (default — safest for mutable state)
@State(Scope.Group)      // one instance per thread group
```

### Avoiding JMH Pitfalls

```java
// PITFALL 1: Dead code elimination
// JIT detects result is unused → removes computation entirely
@Benchmark
public void badBenchmark() {
    Math.sqrt(42.0);   // result discarded → JIT removes this!
}

// FIX: return the result OR use Blackhole
@Benchmark
public double goodBenchmark() {
    return Math.sqrt(42.0);  // returned → JIT can't eliminate
}

@Benchmark
public void goodBenchmarkBlackhole(Blackhole bh) {
    bh.consume(Math.sqrt(42.0));  // Blackhole prevents elimination
}

// PITFALL 2: Constant folding
// JIT sees input never changes → pre-computes result at compile time
@State(Scope.Thread)
public class BenchmarkState {
    // NOT constant folded — JMH prevents this
    public double x = Math.PI;
}

@Benchmark
public double computeBenchmark(BenchmarkState state) {
    return Math.sqrt(state.x);  // correct: reads from state
}

// PITFALL 3: Not enough warmup
// JIT needs ~10,000 invocations to fully compile a method
// Too few warmup iterations → measuring interpreted bytecode, not JIT output
@Warmup(iterations = 5, time = 2)  // at least 5 iterations × 2 seconds
```

### Benchmark Example: Collection Choice

```java
@BenchmarkMode(Mode.Throughput)
@OutputTimeUnit(TimeUnit.MILLISECONDS)
@State(Scope.Thread)
@Warmup(iterations = 3)
@Measurement(iterations = 5)
@Fork(1)
public class CollectionBenchmark {

    private final List<Integer> arrayList = new ArrayList<>(List.of(1,2,3,4,5));
    private final LinkedList<Integer> linkedList = new LinkedList<>(List.of(1,2,3,4,5));

    @Benchmark
    public int arrayListGet() {
        return arrayList.get(2);       // O(1) random access
    }

    @Benchmark
    public int linkedListGet() {
        return linkedList.get(2);      // O(n) traversal
    }

    @Benchmark
    public void arrayListAddFirst() {
        arrayList.add(0, 99);          // O(n) shift
        arrayList.remove(0);
    }

    @Benchmark
    public void linkedListAddFirst() {
        linkedList.addFirst(99);       // O(1) pointer change
        linkedList.removeFirst();
    }
}
```

---

## Java Flight Recorder (JFR)

JFR is a low-overhead (< 1% overhead) continuous profiling framework built into the JVM. It records CPU usage, allocations, GC events, I/O, locks, thread activity, and exceptions.

### Starting JFR

```bash
# Start recording with application
java -XX:StartFlightRecording=duration=60s,filename=recording.jfr \
     -jar myapp.jar

# Or attach to running process
jcmd <pid> JFR.start duration=60s filename=recording.jfr

# Continuous mode (always on, low overhead)
java -XX:StartFlightRecording=name=continuous,maxage=6h,maxsize=500m \
     -jar myapp.jar

# Dump current continuous recording
jcmd <pid> JFR.dump filename=dump.jfr
```

### Programmatic JFR

```java
// Trigger recording from code (e.g., on test completion)
Recording recording = new Recording();
recording.enable("jdk.CPUSample").withPeriod(Duration.ofMillis(20));
recording.enable("jdk.ObjectAllocationInNewTLAB");
recording.enable("jdk.GCHeapSummary");
recording.enable("jdk.ThreadSleep");
recording.enable("jdk.MonitorEnter");  // lock contention
recording.start();

// ... run the code under test ...

recording.stop();
recording.dump(Path.of("test.jfr"));
```

### Reading JFR in JMC (JDK Mission Control)

Download JMC from [adoptium.net](https://adoptium.net). Key views:

```
Automated Analysis → high-level findings (allocations, blocking, GC)
Method Profiling   → CPU hotspots (which methods are on the CPU most)
Memory → Allocation by Class → what's allocating the most objects
Lock Instances     → which locks are most contended
I/O → File/Socket → which I/O calls are blocking longest
GC → pause duration, GC cause, heap usage over time
```

### Custom JFR Events

```java
// Define a custom event (zero-overhead when disabled)
@Label("Order Processed")
@Category("Business Events")
@Description("Tracks order processing duration and outcome")
public class OrderProcessedEvent extends Event {
    @Label("Order ID")
    public long orderId;

    @Label("Processing Time ms")
    public long processingTimeMs;

    @Label("Status")
    public String status;
}

// Emit the event
public Order processOrder(OrderRequest request) {
    OrderProcessedEvent event = new OrderProcessedEvent();
    event.begin();

    try {
        Order order = doProcess(request);
        event.orderId = order.getId();
        event.status = "SUCCESS";
        return order;
    } catch (Exception e) {
        event.status = "FAILED";
        throw e;
    } finally {
        event.processingTimeMs = /* duration */;
        event.commit(); // noop if JFR not recording
    }
}
```

---

## async-profiler

async-profiler is a low-overhead sampling profiler that captures CPU, allocation, and lock profiles. Unlike JFR's CPU sampler, it uses OS-level `perf_events` — it correctly profiles both JVM code AND native code.

### Installation & Usage

```bash
# Download from: https://github.com/async-profiler/async-profiler
# Linux: uses perf_events (requires kernel.perf_event_paranoid ≤ 1)

# CPU profile — 30 seconds
./asprof -d 30 -f profile.html <pid>

# Allocation profile — what's creating the most objects
./asprof -e alloc -d 30 -f alloc.html <pid>

# Lock contention profile
./asprof -e lock -d 30 -f lock.html <pid>

# Wall-clock profile (includes I/O wait, sleep — good for latency analysis)
./asprof -e wall -d 30 -f wall.html <pid>

# Java agent (attach at startup)
java -agentpath:/path/to/libasyncProfiler.so=start,event=cpu,file=profile.html \
     -jar myapp.jar
```

### As a Maven/Spring Boot Plugin

```xml
<!-- Compile with -g flag for better line numbers -->
<compilerArg>-g</compilerArg>
```

---

## Flame Graphs

Flame graphs are the output of async-profiler (and JFR). They visualise call stacks.

### How to Read a Flame Graph

```
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ processRequest (40% of samples)
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
queryDatabase (25%)    renderResponse (15%)
▓▓▓▓▓▓▓▓▓▓▓▓    ▓▓▓▓▓▓▓▓▓▓▓▓▓▓
executeSQL (20%) connectionPool (5%)

- X-axis: sorted alphabetically (NOT time) — width = % of samples
- Y-axis: call stack depth (bottom = on-CPU, top = what's running)
- Wide bars = hot code paths (spend most time there)
- Look for: wide bars at the TOP of the flame (the actual work being done)
- Ignore: wide bars at the bottom (framework/JVM infrastructure)
```

### Flame Graph Patterns

```
Pattern: Tall, narrow spike
→ Deep recursion or long call chain to a leaf function
→ Check the leaf — that's where time is spent

Pattern: Many thin spikes across the top
→ CPU time spread across many places — no single bottleneck
→ Often seen in GC-heavy workloads

Pattern: Wide bar in the middle, many narrow bars above
→ One method calling many different things — likely the dispatcher
→ Look at what it calls

Pattern: Flat line at the top (one wide bar with nothing above)
→ This IS your bottleneck — this method is spending its time doing work
→ Optimise this method or call it less often

Pattern: "Sleeping" or "wait" bars wide
→ Wall-clock profile showing threads blocked on I/O or locks
→ Use -e lock or check external call latency
```

---

## Profiling Workflow

```
1. Reproduce the problem
   → Run load test or replay production traffic
   → Ensure problem is visible (latency spike, high CPU, etc.)

2. CPU profile first (async-profiler -e cpu)
   → Is CPU > 80%? Where is it spent?
   → CPU-bound: optimise the hot method
   → Low CPU but high latency → I/O or lock bound (use wall-clock profile)

3. Wall-clock profile if low CPU (-e wall)
   → Shows what threads are doing including waits
   → Wide "sleep" or "park" bars → threads blocked
   → Check JFR Lock Instances to find contended locks

4. Allocation profile if GC is frequent (-e alloc)
   → Which classes are being allocated most?
   → Target: reduce allocation of short-lived objects
   → Object pooling or caching if allocation is avoidable

5. Confirm fix with JMH or load test
   → Measure before and after
   → A/B test at the same load level
```

---

## Common Profiling Findings and Fixes

| Finding | Fix |
|---------|-----|
| `JSON serialisation` wide in CPU flame | Use streaming serialiser, reduce payload size, enable caching |
| `Statement.executeQuery` wide | Add index, fix N+1, use batch queries |
| `Object.wait` / `park` wide in wall clock | Thread contention — reduce lock scope or switch to lock-free |
| `GC` events frequent in JFR | Increase heap, tune GC, reduce allocation rate |
| `HttpClient.send` wide | Async HTTP calls, connection pooling, timeout tuning |
| `String.format` / `+` wide | Use `StringBuilder`, `String.formatted()`, or log guard: `if (log.isDebugEnabled())` |
| `reflection` wide | Cache `Method.invoke` results, use code generation |

---

## Interview Quick-Fire

**Q: Why shouldn't you write performance benchmarks without JMH?**
JIT compilation, dead code elimination, and constant folding make naive benchmarks wildly inaccurate. A simple `for` loop timing `System.nanoTime()` around a method may measure the JIT-eliminated no-op. JMH handles warm-up (letting JIT compile), prevents dead code elimination via `Blackhole`, separates measurement from warm-up, and forks into separate JVM processes to avoid cross-benchmark pollution.

**Q: What's the difference between CPU profiling and wall-clock profiling?**
CPU profiling (`-e cpu`) samples threads only when they are on-CPU — it shows where CPU cycles are consumed. Wall-clock profiling (`-e wall`) samples all threads at fixed intervals regardless of state — it shows everything including time spent blocking on I/O, sleeping, or waiting for locks. Use CPU profiling when CPU is high; use wall-clock profiling when latency is high but CPU is normal (the thread is waiting, not working).

**Q: What does a wide bar at the top of a flame graph indicate?**
The top of a flame graph is where actual CPU work is done (leaf frames). A wide top bar means that method consumes a large fraction of total CPU samples — it is a hot spot. This is the primary target for optimisation. Wide bars in the middle indicate dispatchers or frameworks; wide bars at the bottom are typically JVM/OS infrastructure.

<RelatedTopics :topics="['/performance/jvm-tuning', '/performance/load-testing', '/java-memory/memory-problems', '/java-memory/garbage-collection']" />

[→ Back to Performance Overview](/performance/)
