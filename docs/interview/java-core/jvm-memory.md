# JVM & Memory

**Part IV — Q17 to Q18** · [← Core Java Overview](./index)

---

## Q17: Java Memory Model — Stack vs Heap

> Every Java developer knows "objects go on the heap" — seniors know *why* and can explain Metaspace and Escape Analysis.

| Area | Per-thread or shared | Stores | Size limit |
|------|---------------------|--------|------------|
| Stack | Per-thread | Local vars, method params, references, return addresses | ~512KB–1MB (`-Xss`) |
| Heap | Shared (all threads) | All objects and arrays | `-Xmx` |
| Metaspace | Shared | Class metadata, bytecode, constant pool | Native memory (`-XX:MaxMetaspaceSize`) |

```java
public void processOrder() {
    int count = 5;                      // STACK — primitive value
    String name = "Jan";                // STACK — reference; "Jan" object on HEAP (String Pool)
    Person customer = new Person();     // STACK — reference; Person object on HEAP
    List<Order> orders = new ArrayList<>(); // STACK — reference; ArrayList on HEAP
}
// When processOrder() returns:
// → stack frame popped (count, name, customer, orders references gone)
// → Person and ArrayList on heap become eligible for GC
// → "Jan" stays in String Pool
```

::: details Full model answer

**Stack:**
Each thread has its own private stack. Every method call pushes a new **stack frame** onto the stack — containing local variables, method parameters, the return address, and partial results. When the method returns, the frame is popped (LIFO).

The stack only stores:
- Primitive values (`int`, `boolean`, `double`, etc.) directly
- **References** to objects — not the objects themselves. Objects always live on the heap.

Stack allocation is extremely fast — just incrementing/decrementing a pointer. Stack size is fixed per thread (default ~512KB–1MB, configurable with `-Xss`). Exceed it (typically via infinite recursion) → `StackOverflowError`.

**Heap:**
Shared across all threads. Stores all objects (`new Person()`, arrays, `String` objects). Managed by the Garbage Collector. Divided into **generations**:
- **Young Generation** (Eden + Survivor spaces) — new objects
- **Old Generation** (Tenured) — long-lived objects that survived many GC cycles

Size configured with:
- `-Xms` — initial heap size
- `-Xmx` — maximum heap size
- `-XX:MaxRAMPercentage=75` — preferred in containers (respects container memory limits)

**Metaspace (Java 8+):**
Stores class metadata — class structures, method bytecode, constant pool. Uses **native memory** (not the heap), so it is NOT subject to `-Xmx`. Grows dynamically. Can be capped with `-XX:MaxMetaspaceSize`.

Replaced **PermGen** (Java 7 and earlier), which was fixed-size and frequently caused `OutOfMemoryError: PermGen space` in applications that load many classes (e.g., hot-deploying WARs, scripting engines).

**Common OOM types and their meaning:**
| OOM message | Cause |
|-------------|-------|
| `Java heap space` | Heap full — increase `-Xmx` or fix memory leak |
| `Metaspace` | Too many classes loaded — increase `-XX:MaxMetaspaceSize` or fix classloader leak |
| `GC overhead limit exceeded` | GC spending >98% of time, recovering <2% of heap — likely memory leak |
| `unable to create native thread` | Too many threads — each needs stack space |

**Escape Analysis (JIT optimization):**
The JIT compiler analyses whether an object "escapes" a method — is it returned? stored in a field? passed to another thread? If it doesn't escape, the JVM can allocate it **on the stack** instead of the heap (called **scalar replacement**). This eliminates GC pressure for short-lived objects entirely. Enabled by default with `-XX:+DoEscapeAnalysis`.

:::

> [!TIP] Golden Tip
> Mention **Escape Analysis** — most candidates stop at "objects go on heap, primitives on stack." Explaining that the JIT can allocate non-escaping objects on the stack (scalar replacement) shows deep JVM knowledge. Also: use `-XX:MaxRAMPercentage=75` instead of `-Xmx` in Docker containers — `-Xmx` is a fixed value that doesn't adapt to the container's memory limit.

**Follow-up questions:**
- What is the difference between PermGen and Metaspace?
- What causes `StackOverflowError` vs `OutOfMemoryError`?
- Where does a `static` field live in memory?
- What is Escape Analysis and how does it help performance?

---

## Q18: Garbage Collection

> Know the generational hypothesis, the GC algorithms, and what Stop-the-World means.

The GC automatically reclaims memory from objects that are no longer **reachable** from any live thread. The fundamental insight behind Java's GC design: **most objects die young**.

**GC algorithms comparison:**

| Algorithm | Default since | STW pauses | Goal |
|-----------|-------------|-----------|------|
| Serial GC | — | Long (single-threaded) | Simplicity, small apps |
| Parallel GC | Java 8 (was default) | Short (multi-threaded) | Throughput |
| **G1GC** | **Java 9** | Low (~200ms target) | Balance throughput + latency |
| ZGC | Java 15 (stable) | **Sub-millisecond** | Ultra-low latency |
| Shenandoah | — | Sub-millisecond | Ultra-low latency (Red Hat) |

::: details Full model answer

**The generational hypothesis:**
Newly created objects are very likely to die quickly (local variables, temporary objects). Objects that survive a few GC cycles are likely to live long (cached data, configuration). Based on this, the heap is split into generations with different collection strategies.

**Heap structure:**
```
Heap
├── Young Generation
│   ├── Eden space       ← all new objects born here
│   ├── Survivor S0      ← live objects copied here during GC
│   └── Survivor S1      ← live objects alternate between S0 and S1
└── Old Generation (Tenured)  ← objects promoted after ~15 GC cycles
```

**Minor GC (Young Generation collection):**
1. New objects fill Eden
2. Eden full → Minor GC runs
3. Live objects copied from Eden + one Survivor space to the other Survivor space
4. Dead objects discarded (no sweep needed — copying GC)
5. Survivors alternate between S0 and S1 each cycle
6. After surviving a threshold (default 15 cycles, `-XX:MaxTenuringThreshold`), objects promoted to Old Generation

Minor GC is **fast** — most objects are dead, and copying only the live objects is efficient.

**Major GC / Full GC (Old Generation):**
Slower and less frequent because: more live objects, larger space, some algorithms require compaction (moving objects to eliminate fragmentation). Full GC = Young + Old + Metaspace collected together. Avoid frequent Full GCs.

**GC Algorithms in depth:**

**Serial GC** (`-XX:+UseSerialGC`):
Single-threaded. Stops all application threads (Stop-the-World) for both minor and major GC. Simple but causes long pauses. Use only for small apps or CLI tools.

**Parallel GC** (`-XX:+UseParallelGC`):
Multi-threaded GC threads for Young and Old generations. Maximises throughput (time running app vs GC). Was the default before Java 9. Still best for batch jobs where pause times don't matter.

**G1GC** (`-XX:+UseG1GC`, default since Java 9):
Divides the heap into ~2048 equally-sized regions (not fixed Young/Old boundaries). Prioritises collecting regions with the most garbage ("Garbage First"). Target pause time: 200ms by default (configurable with `-XX:MaxGCPauseMillis`). Balances throughput and latency. Best for most server applications.

**ZGC** (`-XX:+UseZGC`, stable since Java 15):
Designed for ultra-low latency. Pauses are **sub-millisecond** regardless of heap size — even terabyte heaps. Achieves this via:
- **Concurrent relocation** — moves objects while the application runs
- **Colored pointers** — stores GC metadata in unused bits of object references

Java 21 adds **Generational ZGC** (`-XX:+ZGenerational`) for better throughput alongside low latency.

**Stop-the-World (STW):**
During certain GC phases, ALL application threads are paused. The GC needs a consistent snapshot — objects must not move while references are being analysed. G1GC and ZGC minimise STW by doing most work concurrently. STW pauses show up as latency spikes in production monitoring.

**Production JVM flags:**
```bash
# Container-friendly heap sizing
-XX:MaxRAMPercentage=75        # use 75% of container memory (not fixed -Xmx)
-XX:InitialRAMPercentage=50    # start at 50%

# GC logging (Java 9+)
-Xlog:gc*:file=/var/log/app/gc.log:time,uptime:filecount=5,filesize=20m

# G1GC tuning
-XX:MaxGCPauseMillis=200       # target pause time
-XX:G1HeapRegionSize=16m       # region size for large heaps

# Switch to ZGC for ultra-low latency
-XX:+UseZGC -XX:+ZGenerational
```

**GC log analysis tools:** GCEasy (gcease.io), GCViewer, IntelliJ profiler.

:::

> [!TIP] Golden Tip
> Four production tips that show real-world experience: **(1)** Use `-XX:MaxRAMPercentage=75` in containers — fixed `-Xmx` doesn't adapt to container limits. **(2)** Enable GC logging with `-Xlog:gc` — you can't tune what you don't measure. **(3)** For most Spring Boot apps, G1GC (default) is fine. **(4)** Switch to ZGC only for sub-millisecond latency requirements or very large heaps (>32GB). Randomly switching GC without profiling data is an anti-pattern.

**Follow-up questions:**
- What is Stop-the-World and why is it necessary?
- What is the difference between Minor GC and Full GC?
- When would you choose ZGC over G1GC?
- What JVM flags would you set for a Spring Boot app running in a Docker container?
- How do you detect and diagnose a memory leak in a Java application?
