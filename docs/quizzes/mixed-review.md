---
title: Mixed Review Quiz
---

<script setup>
const questions = [
  {
    question: "What does String.intern() do in Java?",
    options: [
      "Creates a new String object on the heap with the same content",
      "Converts the String to a char array stored in native memory",
      "Returns a canonical representation of the String from the string pool, adding it if absent",
      "Marks the String for garbage collection on the next GC cycle"
    ],
    answer: 2,
    explanation: "String.intern() looks up the string pool (part of the heap since Java 7). If an equal string already exists in the pool, that pooled instance is returned. If not, the string is added to the pool and returned. This allows == comparison and reduces memory when many equal strings exist."
  },
  {
    question: "What is the key difference between HashMap and Hashtable?",
    options: [
      "HashMap supports null keys/values and is not synchronized; Hashtable is synchronized and forbids null keys/values",
      "Hashtable maintains insertion order; HashMap does not",
      "HashMap uses a linked list internally; Hashtable uses a red-black tree",
      "They are identical - Hashtable is just the older name for HashMap"
    ],
    answer: 0,
    explanation: "HashMap is unsynchronized (not thread-safe), allows one null key and multiple null values, and is part of the modern Collections Framework. Hashtable is a legacy synchronized class that allows no nulls and uses coarse-grained locking. For concurrent use, prefer ConcurrentHashMap over both."
  },
  {
    question: "A system has a large Worker interface with 20 methods. A new class only needs 3 but must implement all 20. Which SOLID principle does this violate?",
    options: [
      "Single Responsibility Principle",
      "Open/Closed Principle",
      "Interface Segregation Principle",
      "Dependency Inversion Principle"
    ],
    answer: 2,
    explanation: "Interface Segregation Principle states that clients should not be forced to depend on methods they do not use. A fat interface forces all implementors to provide stubs for methods they do not need. The fix is to split into smaller, role-specific interfaces."
  },
  {
    question: "Which design pattern is applied when you pass a Comparator to java.util.Collections.sort() or List.sort()?",
    options: [
      "Template Method - the sort algorithm calls back to your comparison logic",
      "Strategy - the sorting algorithm is the same, but the comparison behavior is swappable",
      "Command - the Comparator encapsulates a comparison command",
      "Observer - the list observes comparison results"
    ],
    answer: 1,
    explanation: "Passing a Comparator is the Strategy pattern: the sorting algorithm stays the same, but you swap in different comparison strategies at runtime. Each Comparator is an interchangeable algorithm for ordering. Template Method would require subclassing the sort class."
  },
  {
    question: "When exactly is a method annotated with @PostConstruct called in the Spring bean lifecycle?",
    options: [
      "Before Spring injects any dependencies",
      "After the bean is instantiated and all dependencies are injected, but before the bean is put into service",
      "At the moment the ApplicationContext is closed",
      "Only when the bean is explicitly requested for the first time"
    ],
    answer: 1,
    explanation: "@PostConstruct runs after the constructor and after all @Autowired dependencies are injected, making it the correct place for initialization logic that depends on injected fields. It is called before the bean is available for use by other beans."
  },
  {
    question: "Which garbage collector became the default in Java 9 and remains default through modern LTS releases?",
    options: [
      "CMS (Concurrent Mark Sweep)",
      "Parallel GC (Throughput Collector)",
      "G1GC (Garbage-First Garbage Collector)",
      "ZGC (Z Garbage Collector)"
    ],
    answer: 2,
    explanation: "G1GC became the default GC in Java 9, replacing the Parallel GC. G1 is designed for heaps larger than 4 GB and targets predictable pause times. ZGC and Shenandoah are available for ultra-low-latency requirements but are not the default."
  },
  {
    question: "What is a race condition in concurrent programming?",
    options: [
      "When two threads compete to see which can complete a task faster",
      "When program correctness depends on the relative timing or interleaving of multiple threads, producing incorrect or unpredictable results",
      "When a thread holds a lock for too long, causing other threads to time out",
      "When the CPU scheduler preempts a thread before it finishes its quantum"
    ],
    answer: 1,
    explanation: "A race condition occurs when the correctness of a program depends on the sequence or timing of thread execution. For example, two threads reading and incrementing a counter without synchronization can both read the same value and write back the same incremented result, losing one increment."
  },
  {
    question: "If a.equals(b) returns true, what must be true about a.hashCode() and b.hashCode()?",
    options: [
      "They must return different values",
      "They must return the same value",
      "hashCode() values are independent of equals() results",
      "a.hashCode() must be greater than b.hashCode()"
    ],
    answer: 1,
    explanation: "This is the equals/hashCode contract: equal objects must produce equal hash codes. The converse is not required - unequal objects may share a hash code (a collision). Violating this contract causes objects to be silently lost in hash-based collections like HashMap and HashSet."
  },
  {
    question: "What exceptions trigger an automatic rollback by default in Spring @Transactional?",
    options: [
      "All exceptions (checked and unchecked)",
      "Only checked exceptions (subclasses of Exception but not RuntimeException)",
      "Only unchecked exceptions (subclasses of RuntimeException and Error)",
      "No automatic rollback - you must call TransactionStatus.setRollbackOnly() manually"
    ],
    answer: 2,
    explanation: "By default, @Transactional rolls back only on unchecked exceptions (RuntimeException and its subclasses) and Errors. Checked exceptions do not trigger rollback. Customize with rollbackFor or noRollbackFor attributes."
  },
  {
    question: "In Spring, when you declare a bean with the default singleton scope, what does singleton actually mean?",
    options: [
      "One instance per JVM process, shared across all ApplicationContexts",
      "One instance per thread that requests the bean",
      "One instance per Spring ApplicationContext",
      "One instance per HTTP request"
    ],
    answer: 2,
    explanation: "Spring singleton scope means one instance per ApplicationContext - not per JVM. If you have multiple ApplicationContexts (e.g., in tests or a parent/child context hierarchy), each context has its own singleton instance. This contrasts with the GoF Singleton pattern, which is per-classloader."
  },
  {
    question: "What is the average time complexity of HashMap.get(key)?",
    options: [
      "O(log n)",
      "O(n)",
      "O(1)",
      "O(n log n)"
    ],
    answer: 2,
    explanation: "HashMap.get() has O(1) average-case complexity. It computes the key hash, maps it to a bucket index, then does a constant-time lookup. Worst case degrades to O(n) for a linked list bucket or O(log n) for a tree bucket (Java 8+). Good hash functions make O(1) the practical reality."
  },
  {
    question: "In REST architecture, what does stateless mean?",
    options: [
      "The server stores no data at all - all state is in the database",
      "Each request contains all information needed; the server stores no client session state between requests",
      "REST services cannot use cookies or headers",
      "Stateless means the API response is always the same regardless of input"
    ],
    answer: 1,
    explanation: "REST statelessness means each request from a client must contain all the information the server needs - authentication tokens, parameters, context. The server holds no session state between requests. This improves scalability (any server instance can handle any request) and reliability."
  },
  {
    question: "What are Stream Gatherers (finalized in Java 24) and how do they differ from Collectors?",
    options: [
      "Gatherers are terminal operations that collect elements into a List; Collectors produce any type of result",
      "Gatherers are custom intermediate operations that can transform, filter, or expand a stream; Collectors are terminal operations that fold a stream into a final result",
      "Gatherers replace Collectors entirely in Java 24",
      "Gatherers are parallel-only operations; Collectors work in both sequential and parallel streams"
    ],
    answer: 1,
    explanation: "Stream Gatherers (JEP 485, final in Java 24) are custom intermediate stream operations — inserted between source and terminal op, like a custom filter or map. Collectors are terminal: they fold the stream into a final result (List, Map, etc.). Built-in gatherers include Gatherers.windowFixed(), scan(), and mapConcurrent()."
  },
  {
    question: "What was the virtual thread 'pinning' problem fixed in Java 24 (JEP 491)?",
    options: [
      "Virtual threads could not be created inside synchronized methods",
      "Virtual threads blocked inside synchronized blocks could not unmount from their carrier platform thread, wasting platform threads",
      "Virtual threads were pinned to a specific CPU core and could not be migrated",
      "Pinning caused virtual threads to never be garbage collected"
    ],
    answer: 1,
    explanation: "Before Java 24, a virtual thread entering a synchronized block while blocking on I/O was pinned — it stayed mounted on its carrier platform thread even while waiting, preventing other virtual threads from using that thread. Java 24 fixes this: synchronized blocks no longer pin virtual threads. Existing synchronized code now works correctly with virtual threads without rewriting to ReentrantLock."
  },
  {
    question: "What does the unnamed variable _ (underscore) introduced in Java 22 signal?",
    options: [
      "A variable that will be lazily initialized on first use",
      "A variable that is intentionally unused — the developer explicitly does not need its value",
      "A private field accessible only within the same class",
      "A variable that is automatically final and cannot be reassigned"
    ],
    answer: 1,
    explanation: "The unnamed variable _ (JEP 456, final in Java 22) explicitly signals intent: this variable is not needed. Uses include catch blocks (catch (IOException _)), unused loop variables, and unnamed patterns in switch expressions. It prevents misleading names like 'ignored' or 'unused' and generates a compiler error if you try to read its value."
  }
]
</script>

# Mixed Review Quiz

A cross-topic quiz covering Java Core, Collections, SOLID, Design Patterns, Spring, JVM Memory, Concurrency, and Architecture.

<Quiz :questions="questions" />

---

This quiz draws from all study sections. Browse the full portal from the [home page](/).
