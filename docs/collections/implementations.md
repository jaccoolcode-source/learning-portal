---
title: Collection Implementations
description: When to use ArrayList vs LinkedList, HashSet vs TreeSet, HashMap vs TreeMap — complexity guarantees and practical guidance
category: collections
pageClass: layout-collections
difficulty: intermediate
tags: [java, arraylist, linkedlist, hashset, treeset, hashmap, treemap, priorityqueue]
related:
  - /collections/interfaces
  - /collections/hashmap-internals
  - /collections/equals-hashcode
estimatedMinutes: 25
---

# Collection Implementations

<DifficultyBadge level="intermediate" />

Choosing the right implementation matters for both correctness and performance. Every choice has complexity trade-offs.

---

## List Implementations

### ArrayList

Backed by a resizable array. The workhorse of Java development.

```java
List<String> list = new ArrayList<>();  // initial capacity 10
List<String> list = new ArrayList<>(100); // pre-size to avoid resizing
```

| Operation | Complexity |
|-----------|-----------|
| `get(i)` | O(1) |
| `add(e)` at end | O(1) amortised |
| `add(i, e)` at index | O(n) — shifts elements |
| `remove(i)` | O(n) — shifts elements |
| `contains(o)` | O(n) linear scan |
| Memory | Contiguous — cache-friendly |

**When to use:** Default choice for lists. Random access by index, iteration, appending at end.

**When NOT:** Frequent insertions/deletions in the middle.

### LinkedList

Doubly-linked list. Each node holds prev/next pointers.

```java
LinkedList<String> ll = new LinkedList<>();
ll.addFirst("a");
ll.addLast("b");
ll.removeFirst();
ll.removeLast();
```

| Operation | Complexity |
|-----------|-----------|
| `get(i)` | O(n) — traversal |
| `addFirst/Last` | O(1) |
| `removeFirst/Last` | O(1) |
| `add(i, e)` after traversal | O(n) |
| Memory | Extra overhead per node (24+ bytes) |

**When to use:** Need efficient head/tail operations (use as Deque). Frequent insertions at both ends.

**When NOT:** Random access, general-purpose list, iteration-heavy (poor cache locality).

::: tip In practice, prefer ArrayDeque over LinkedList as a queue
`ArrayDeque` is faster and more memory-efficient for queue/stack use cases.
:::

---

## Set Implementations

### HashSet

Backed by a `HashMap` (keys only). Fastest Set.

```java
Set<String> set = new HashSet<>();
set.add("java");
set.contains("java"); // O(1) average
```

| Operation | Complexity |
|-----------|-----------|
| `add(e)` | O(1) average |
| `contains(e)` | O(1) average |
| `remove(e)` | O(1) average |
| Ordering | **None** — iteration order undefined |

**When to use:** De-duplication, fast membership testing, no ordering needed.

### LinkedHashSet

`HashSet` + doubly-linked list maintaining **insertion order**.

```java
Set<String> set = new LinkedHashSet<>();
set.add("c"); set.add("a"); set.add("b");
// Iteration order: c, a, b (insertion order preserved)
```

**When to use:** Need HashSet speed + predictable iteration order.

### TreeSet

Implements `SortedSet`. Elements stored in a red-black tree, always sorted.

```java
SortedSet<Integer> ts = new TreeSet<>(List.of(3, 1, 4, 1, 5, 9, 2, 6));
// {1, 2, 3, 4, 5, 6, 9} — sorted, no duplicates

ts.first();       // 1
ts.last();        // 9
ts.floor(5);      // 5 (≤ 5)
ts.ceiling(5);    // 5 (≥ 5)
ts.lower(5);      // 4 (< 5)
ts.higher(5);     // 6 (> 5)
ts.headSet(5);    // [1, 2, 3, 4]
ts.tailSet(5);    // [5, 6, 9]
ts.subSet(3, 7);  // [3, 4, 5, 6]
```

| Operation | Complexity |
|-----------|-----------|
| `add/remove/contains` | O(log n) |
| `first/last` | O(log n) |
| `headSet/tailSet` | O(log n) |
| Ordering | **Natural or Comparator** |

**When to use:** Need sorted Set, range queries, floor/ceiling operations.

---

## Map Implementations

### HashMap

Most commonly used. Backed by array of buckets with linked lists / red-black trees.

```java
Map<String, Integer> map = new HashMap<>();       // default capacity 16, load factor 0.75
Map<String, Integer> map = new HashMap<>(64);     // pre-size
```

| Operation | Complexity |
|-----------|-----------|
| `get/put/remove/containsKey` | O(1) average, O(log n) worst (with tree bins) |
| Ordering | **None** |
| `null` keys | 1 allowed |

See [HashMap Internals](/collections/hashmap-internals) for deep dive.

### LinkedHashMap

HashMap + doubly-linked list. Maintains insertion order (or access order).

```java
// LRU Cache pattern — access-order LinkedHashMap
Map<Integer, String> lruCache = new LinkedHashMap<>(16, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<Integer, String> eldest) {
        return size() > 100;  // evict when over 100 entries
    }
};
```

**When to use:** Predictable iteration order, LRU cache implementations.

### TreeMap

Implements `SortedMap`. Keys stored in red-black tree, always sorted.

```java
SortedMap<String, Integer> tm = new TreeMap<>();
tm.put("banana", 2);
tm.put("apple", 5);
tm.put("cherry", 1);

tm.firstKey();          // "apple"
tm.lastKey();           // "cherry"
tm.headMap("cherry");   // {apple=5, banana=2}
tm.tailMap("banana");   // {banana=2, cherry=1}
tm.floorKey("c");       // "cherry"
```

| Operation | Complexity |
|-----------|-----------|
| `get/put/remove` | O(log n) |
| `firstKey/lastKey` | O(log n) |
| Range views | O(log n) |

**When to use:** Need sorted Map, range queries on keys, floor/ceiling key lookups.

### Hashtable (Legacy)

Synchronised, null keys/values not allowed. **Do not use in new code.**

```java
// Use ConcurrentHashMap instead:
Map<String, Integer> map = new ConcurrentHashMap<>();
```

---

## Queue / Deque Implementations

### ArrayDeque

Resizable circular array. Best general-purpose Deque/Stack.

```java
Deque<String> deque = new ArrayDeque<>();
deque.push("a");  deque.push("b");  // stack
deque.pop();      // "b"
deque.offer("x"); deque.offer("y"); // queue
deque.poll();     // "x"
```

No null elements. Faster than `LinkedList` for all Deque operations.

### PriorityQueue

Min-heap. `poll()` always returns the smallest element (by natural order or Comparator).

```java
PriorityQueue<Integer> pq = new PriorityQueue<>();
pq.offer(5); pq.offer(1); pq.offer(3);
pq.poll(); // 1  ← always smallest
pq.poll(); // 3
pq.poll(); // 5

// Max-heap
PriorityQueue<Integer> maxPQ = new PriorityQueue<>(Comparator.reverseOrder());

// Custom priority
PriorityQueue<Task> taskPQ = new PriorityQueue<>(
    Comparator.comparingInt(Task::getPriority)
);
```

| Operation | Complexity |
|-----------|-----------|
| `offer(e)` | O(log n) |
| `poll()` | O(log n) |
| `peek()` | O(1) |
| `contains(e)` | O(n) |

---

## Complexity Quick Reference

| Structure | Get | Add | Remove | Contains | Order |
|-----------|-----|-----|--------|----------|-------|
| `ArrayList` | O(1) | O(1)* | O(n) | O(n) | Insertion |
| `LinkedList` | O(n) | O(1) head | O(1) head | O(n) | Insertion |
| `HashSet` | — | O(1) | O(1) | O(1) | None |
| `TreeSet` | — | O(log n) | O(log n) | O(log n) | Sorted |
| `HashMap` | O(1) | O(1) | O(1) | O(1) key | None |
| `TreeMap` | O(log n) | O(log n) | O(log n) | O(log n) | Sorted |
| `PriorityQueue` | O(1) peek | O(log n) | O(log n) | O(n) | Priority |
| `ArrayDeque` | — | O(1) | O(1) | O(n) | FIFO/LIFO |

*Amortised — occasional resize is O(n)

---

## Summary

- Default choices: `ArrayList`, `HashMap`, `HashSet`.
- Need sorted? `TreeMap` / `TreeSet`.
- Need insertion order? `LinkedHashMap` / `LinkedHashSet`.
- Queue/Stack? `ArrayDeque`.
- Priority ordering? `PriorityQueue`.
- Thread safety? `ConcurrentHashMap` / `CopyOnWriteArrayList`.

<RelatedTopics :topics="['/collections/hashmap-internals', '/collections/interfaces', '/concurrency/concurrent-utils']" />

[→ Take the Collections Quiz](/quizzes/collections-quiz)
