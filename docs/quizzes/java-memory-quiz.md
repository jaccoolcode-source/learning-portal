---
title: Java Memory & GC Quiz
---

<script setup>
const questions = [
  {
    question: "Where does the JVM store object instances created with 'new'?",
    options: [
      "Stack",
      "Metaspace",
      "Heap",
      "Code Cache"
    ],
    answer: 2,
    explanation: "All object instances created with 'new' are allocated on the heap, which is shared across all threads. The stack stores local variables, method call frames, and references — but the actual objects those references point to live on the heap."
  },
  {
    question: "What is stored in the JVM's Metaspace (Java 8+)?",
    options: [
      "Object instances and arrays",
      "Thread stacks and local variables",
      "Class metadata, method bytecode, and constant pools",
      "Compiled native code from the JIT compiler"
    ],
    answer: 2,
    explanation: "Metaspace replaced PermGen in Java 8 and stores class-level metadata: class structures, method bytecode, constant pools, and annotations. Unlike PermGen, Metaspace uses native memory and grows automatically by default, though it can still throw OutOfMemoryError if unconstrained growth is not configured."
  },
  {
    question: "What is the default maximum GC pause target for the G1 Garbage Collector?",
    options: [
      "50 ms",
      "100 ms",
      "200 ms",
      "500 ms"
    ],
    answer: 2,
    explanation: "G1GC's default pause target is 200 ms, configurable via -XX:MaxGCPauseMillis. G1 uses this as a soft goal when deciding how many heap regions to collect in each GC cycle, trading throughput for predictable pause times."
  },
  {
    question: "What is the most common cause of OutOfMemoryError: Metaspace?",
    options: [
      "Too many object instances on the heap",
      "A classloader leak causing an ever-growing number of loaded classes",
      "Excessively large String literals",
      "Running too many threads simultaneously"
    ],
    answer: 1,
    explanation: "Metaspace OOM typically results from a classloader leak — frameworks (e.g., dynamic proxies, scripting engines, hot-deployment in app servers) keep creating new classloaders with new classes without allowing old ones to be GC'd. Each loaded class occupies Metaspace; accumulated unloadable classes eventually exhaust it."
  },
  {
    question: "What is the difference between a minor GC and a major (full) GC?",
    options: [
      "Minor GC collects the old generation; major GC collects the young generation",
      "Minor GC collects only the young generation (Eden + Survivors); major GC collects the old generation (and sometimes the whole heap)",
      "Minor GC runs once at startup; major GC runs continuously in the background",
      "They are the same operation with different names"
    ],
    answer: 1,
    explanation: "Minor GC collects the young generation (Eden + two Survivor spaces) and is typically fast because most short-lived objects die there (generational hypothesis). Major GC (or Full GC) collects the old generation (tenured objects) and is significantly more expensive, often causing noticeable pauses."
  },
  {
    question: "What is a memory leak in a managed language like Java?",
    options: [
      "When the JVM fails to allocate native memory for the heap",
      "When an object is garbage collected before the program finishes using it",
      "When objects are still reachable through references but are no longer needed by the application logic",
      "When the stack grows larger than the configured -Xss size"
    ],
    answer: 2,
    explanation: "Java prevents true memory leaks at the language level (GC handles unreachable objects). But logical memory leaks occur when the application holds references to objects it no longer needs, preventing GC from reclaiming them. Common causes: static collections growing unbounded, listeners never deregistered, caches without eviction."
  },
  {
    question: "Which regions make up the Young Generation in the G1 Garbage Collector?",
    options: [
      "Old and Humongous regions",
      "Eden and two Survivor regions",
      "Eden, Old, and Metaspace regions",
      "Survivor and Tenured regions"
    ],
    answer: 1,
    explanation: "G1 divides the heap into equal-sized regions but logically maintains the generational model. The Young Generation consists of Eden regions (where new objects are allocated) and two Survivor regions (S0 and S1). Objects surviving enough minor GCs are promoted to Old generation regions."
  },
  {
    question: "Under what condition is an object promoted from the young generation to the old generation?",
    options: [
      "When it is larger than 1 MB",
      "Immediately after its first garbage collection",
      "After surviving a configured number of minor GC cycles (tenuring threshold)",
      "When the Eden space is more than 50% full"
    ],
    answer: 2,
    explanation: "Each time a minor GC runs, surviving objects have their age incremented. When an object's age reaches the tenuring threshold (default 15, tunable via -XX:MaxTenuringThreshold), it is promoted to the old generation. Large objects may also be allocated directly in the old generation (or G1 Humongous regions)."
  },
  {
    question: "What do the JVM flags -Xms and -Xmx control?",
    options: [
      "-Xms sets the stack size; -Xmx sets the maximum Metaspace size",
      "-Xms sets the initial heap size; -Xmx sets the maximum heap size",
      "-Xms sets the minimum thread count; -Xmx sets the maximum thread count",
      "-Xms sets the minimum GC pause; -Xmx sets the maximum GC pause"
    ],
    answer: 1,
    explanation: "-Xms sets the initial (starting) heap size allocated at JVM startup. -Xmx sets the maximum heap size the JVM can expand to. Setting them equal (e.g., -Xms512m -Xmx512m) avoids heap resizing overhead in production at the cost of reserving memory upfront."
  },
  {
    question: "How does the garbage collector treat an object referenced only by a WeakReference?",
    options: [
      "It is never garbage collected as long as the WeakReference exists",
      "It is collected only during full GC, not minor GC",
      "It can be collected at any GC cycle when no strong or soft references point to it",
      "It is collected only after the WeakReference is explicitly set to null"
    ],
    answer: 2,
    explanation: "A WeakReference does not prevent garbage collection. When the GC runs and finds an object with only weak (or weaker) references pointing to it, it is eligible for collection. The WeakReference.get() method returns null after collection. This is used in WeakHashMap and some caching implementations."
  }
]
</script>

# Java Memory & GC Quiz

Test your knowledge of JVM memory structure, garbage collection algorithms, and common memory problems.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Java Memory study pages](/java-memory/).
