---
title: Concurrency Quiz
---

<script setup>
const questions = [
  {
    question: "What are the valid states in the Java thread lifecycle?",
    options: [
      "NEW, RUNNING, BLOCKED, DEAD",
      "NEW, RUNNABLE, BLOCKED, WAITING, TIMED_WAITING, TERMINATED",
      "CREATED, STARTED, SLEEPING, STOPPED",
      "INIT, ACTIVE, SUSPENDED, FINISHED"
    ],
    answer: 1,
    explanation: "Java defines six thread states in Thread.State: NEW (created but not started), RUNNABLE (executing or ready), BLOCKED (waiting for a monitor lock), WAITING (waiting indefinitely), TIMED_WAITING (waiting with a timeout), and TERMINATED (finished execution)."
  },
  {
    question: "What is the key difference between `synchronized` method and `synchronized` block?",
    options: [
      "synchronized method locks on the class object, synchronized block locks on `this`",
      "synchronized method holds the lock for the entire method, synchronized block can lock on any object for a narrower scope",
      "synchronized block is faster because it uses hardware instructions",
      "There is no difference — they are equivalent in all cases"
    ],
    answer: 1,
    explanation: "A synchronized method locks `this` (or the class for static methods) for the entire method body. A synchronized block can specify any object as the lock and limits the critical section to just the block, reducing contention and improving throughput."
  },
  {
    question: "What guarantee does the `volatile` keyword provide in Java?",
    options: [
      "Atomicity of compound operations like i++",
      "Visibility: writes by one thread are immediately visible to all other threads, and ordering is not reordered across the volatile access",
      "Mutual exclusion — only one thread can read the variable at a time",
      "The variable is stored in CPU registers for faster access"
    ],
    answer: 1,
    explanation: "volatile guarantees visibility (changes are flushed to main memory) and prevents certain instruction reorderings around the volatile access. It does NOT provide atomicity for compound operations like i++ (read-modify-write). Use AtomicInteger for that."
  },
  {
    question: "Which ExecutorService method blocks the calling thread until all submitted tasks complete or the timeout expires?",
    options: [
      "shutdown()",
      "shutdownNow()",
      "awaitTermination(long timeout, TimeUnit unit)",
      "invokeAll(Collection<Callable> tasks)"
    ],
    answer: 2,
    explanation: "awaitTermination() blocks until all tasks finish after a shutdown() call, or the timeout elapses. shutdown() initiates orderly shutdown without waiting. shutdownNow() attempts to cancel running tasks. invokeAll() submits and waits for a collection of callables."
  },
  {
    question: "What is a deadlock, and which condition is NOT required for one to occur?",
    options: [
      "Circular wait — threads form a cycle waiting for each other's locks",
      "Hold and wait — a thread holds a resource while waiting for another",
      "Preemption — the OS forcibly takes resources from threads",
      "Mutual exclusion — only one thread can hold a resource at a time"
    ],
    answer: 2,
    explanation: "Deadlock requires four conditions: mutual exclusion, hold-and-wait, no preemption, and circular wait. Preemption (the OS can forcibly reclaim resources) would PREVENT deadlock, not cause it. If resources could be preempted, deadlocks would be broken automatically."
  },
  {
    question: "What is a race condition?",
    options: [
      "When two threads run at exactly the same CPU clock cycle",
      "When the program outcome depends on the non-deterministic relative timing of thread executions",
      "When a thread reads a stale cached value from its CPU register",
      "When one thread is permanently starved of CPU time by higher-priority threads"
    ],
    answer: 1,
    explanation: "A race condition occurs when program correctness depends on the order or timing of thread scheduling, which is non-deterministic. The classic example: two threads read balance=100, both add 50, and both write 150 — instead of the correct 200."
  },
  {
    question: "What does CompletableFuture.thenCompose() do, and how does it differ from thenApply()?",
    options: [
      "thenCompose() chains a Function that returns a CompletableFuture (flat-maps), thenApply() chains a Function that returns a plain value (maps)",
      "thenCompose() runs the next stage on a new thread pool, thenApply() reuses the same thread",
      "thenCompose() is synchronous, thenApply() is asynchronous",
      "There is no difference — they are aliases"
    ],
    answer: 0,
    explanation: "thenApply(T -> U) maps the result like Stream.map(). thenCompose(T -> CompletableFuture<U>) flat-maps it like Stream.flatMap(), avoiding a nested CompletableFuture<CompletableFuture<U>>. Use thenCompose when the next step itself returns a CompletableFuture."
  },
  {
    question: "What are Java Virtual Threads (Project Loom, Java 21)?",
    options: [
      "Threads managed entirely in hardware by the JVM's JIT compiler",
      "Lightweight threads managed by the JVM scheduler, not OS threads — allowing millions of concurrent tasks without OS thread-per-request overhead",
      "A new type of daemon thread with lower priority than regular threads",
      "Threads that run exclusively on virtual machine hypervisors"
    ],
    answer: 1,
    explanation: "Virtual threads (Java 21) are cheap JVM-managed threads. When a virtual thread blocks (e.g., on I/O), the JVM unmounts it from the OS carrier thread without blocking it. This allows millions of concurrent virtual threads, making thread-per-request models scalable again."
  },
  {
    question: "Which class provides a thread-safe counter supporting atomic increment without explicit synchronization?",
    options: [
      "volatile int",
      "synchronized int wrapper",
      "AtomicInteger",
      "ThreadLocal<Integer>"
    ],
    answer: 2,
    explanation: "AtomicInteger uses CAS (Compare-And-Swap) hardware instructions for lock-free atomic operations like incrementAndGet(), getAndAdd(), compareAndSet(). volatile alone doesn't make i++ atomic. ThreadLocal gives each thread its own copy — no sharing at all."
  },
  {
    question: "What is the purpose of CountDownLatch?",
    options: [
      "To limit the number of threads that can access a resource concurrently",
      "To allow one or more threads to wait until a set of operations in other threads completes",
      "To coordinate a fixed number of threads to reach a barrier point simultaneously",
      "To schedule tasks at fixed time intervals"
    ],
    answer: 1,
    explanation: "CountDownLatch is initialized with a count. Threads call await() to block until the count reaches zero. Other threads call countDown() to decrement. Unlike CyclicBarrier, a CountDownLatch cannot be reset. Use it for 'wait until N tasks complete' scenarios."
  },
  {
    question: "What is the difference between `wait()` and `sleep()` in Java?",
    options: [
      "wait() pauses for a fixed time, sleep() pauses indefinitely until notified",
      "wait() releases the monitor lock and waits to be notified, sleep() pauses the thread but retains all locks",
      "wait() is from Thread class, sleep() is from Object class",
      "They are equivalent — both release the lock and pause execution"
    ],
    answer: 1,
    explanation: "Object.wait() must be called inside a synchronized block. It releases the monitor lock and suspends the thread until notify()/notifyAll() is called. Thread.sleep() pauses the thread for a duration but holds all locks it has acquired. This makes wait() suitable for inter-thread communication."
  },
  {
    question: "What problem does the ForkJoinPool solve, and what is work-stealing?",
    options: [
      "It limits memory usage by forking tasks to separate JVM processes",
      "It is designed for divide-and-conquer tasks; idle threads steal tasks from the queues of busy threads to maximize CPU utilization",
      "It provides a thread pool where each thread is pinned to a specific CPU core",
      "It replaces ExecutorService with a simpler API for sequential task processing"
    ],
    answer: 1,
    explanation: "ForkJoinPool is optimized for recursive divide-and-conquer parallelism (RecursiveTask/RecursiveAction). Work-stealing: each thread has its own deque of tasks. When idle, a thread steals tasks from the tail of another thread's deque, keeping all cores busy without a single shared queue bottleneck."
  }
]
</script>

# Concurrency Quiz

Test your understanding of Java threading, synchronization primitives, concurrent utilities, and modern concurrency with virtual threads.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Concurrency study pages](/concurrency/).
