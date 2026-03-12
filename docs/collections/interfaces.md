---
title: Collection Interfaces
description: Deep dive into Java's Collection hierarchy — List, Set, Queue, Deque, Map, and the Java 21 SequencedCollection interface
category: collections
pageClass: layout-collections
difficulty: intermediate
tags: [java, collections, list, set, queue, map, sequencedcollection]
related:
  - /collections/implementations
  - /collections/hashmap-internals
  - /java-core/generics
estimatedMinutes: 20
---

# Collection Interfaces

<DifficultyBadge level="intermediate" />

Understanding the interfaces (not just the concrete classes) lets you write flexible, decoupled code. Always type variables and parameters to the most general interface your code needs.

---

## Iterable\<E\>

The root of the collection hierarchy. Provides the `for-each` loop.

```java
public interface Iterable<T> {
    Iterator<T> iterator();
    default void forEach(Consumer<? super T> action) { ... }
    default Spliterator<T> spliterator() { ... }
}
```

Any class implementing `Iterable` can be used in a for-each loop.

---

## Collection\<E\>

Adds basic operations: add, remove, contains, size, iteration.

```java
Collection<String> c = new ArrayList<>();
c.add("Java");
c.remove("Java");
c.contains("Spring"); // false
c.size();
c.isEmpty();
c.clear();
c.addAll(List.of("a", "b", "c"));
c.retainAll(Set.of("a"));  // intersection
c.removeAll(Set.of("b"));  // difference
```

---

## List\<E\>

An **ordered** collection with positional access. Duplicates are allowed.

```java
public interface List<E> extends Collection<E>, SequencedCollection<E> {
    E get(int index);
    E set(int index, E element);
    void add(int index, E element);
    E remove(int index);
    int indexOf(Object o);
    int lastIndexOf(Object o);
    List<E> subList(int from, int to);
    default void sort(Comparator<? super E> c) { ... }
    static <E> List<E> of(E... elements) { ... }     // immutable
    static <E> List<E> copyOf(Collection<? extends E> c) { ... }
}
```

```java
List<String> list = new ArrayList<>(List.of("a", "b", "c"));
list.add(1, "x");               // [a, x, b, c]
list.get(2);                    // "b"
list.subList(1, 3);             // [x, b]
list.sort(Comparator.naturalOrder());
```

---

## Set\<E\>

A collection with **no duplicates**. Equality is determined by `equals()`.

```java
Set<String> set = new HashSet<>();
set.add("java");
set.add("java");  // silently ignored — no duplicate
set.contains("java"); // true
set.size();       // 1

// Immutable sets (Java 9+)
Set<String> immutable = Set.of("a", "b", "c");

// SortedSet
SortedSet<Integer> sorted = new TreeSet<>(List.of(3, 1, 4, 1, 5, 9));
sorted.first();   // 1
sorted.last();    // 9
sorted.headSet(5); // [1, 3, 4]
sorted.tailSet(5); // [5, 9]
```

---

## Queue\<E\>

FIFO ordering. Offers two sets of methods — one throws exceptions, one returns null/false.

| Operation | Throws exception | Returns null/false |
|-----------|-----------------|-------------------|
| Insert | `add(e)` | `offer(e)` |
| Remove head | `remove()` | `poll()` |
| Inspect head | `element()` | `peek()` |

```java
Queue<Integer> queue = new LinkedList<>();
queue.offer(1);
queue.offer(2);
queue.peek();   // 1 (head, not removed)
queue.poll();   // 1 (removed)
queue.peek();   // 2
```

---

## Deque\<E\>

Double-ended queue — add/remove from both ends. Used as stack or queue.

```java
Deque<String> deque = new ArrayDeque<>();

// Queue mode (FIFO)
deque.offerLast("a");
deque.offerLast("b");
deque.pollFirst(); // "a"

// Stack mode (LIFO)
deque.push("x");   // addFirst
deque.push("y");
deque.pop();       // "y" — removeFirst
```

::: tip Prefer ArrayDeque over Stack and LinkedList
`ArrayDeque` is faster than `Stack` (which is synchronised) and more memory-efficient than `LinkedList` for both queue and stack operations.
:::

---

## Map\<K, V\>

Key-value pairs. NOT a `Collection`. Each key maps to exactly one value.

```java
Map<String, Integer> scores = new HashMap<>();
scores.put("Alice", 95);
scores.put("Bob", 87);
scores.getOrDefault("Charlie", 0);  // 0
scores.putIfAbsent("Alice", 100);   // no-op, Alice already exists
scores.computeIfAbsent("Dave", k -> k.length());  // 4
scores.merge("Alice", 5, Integer::sum);  // 95 + 5 = 100

// Iteration
for (Map.Entry<String, Integer> entry : scores.entrySet()) {
    System.out.println(entry.getKey() + "=" + entry.getValue());
}

scores.forEach((k, v) -> System.out.println(k + "=" + v));

// Views (backed by map — changes reflect)
scores.keySet()
scores.values()
scores.entrySet()

// Immutable map (Java 9+)
Map<String, Integer> immutable = Map.of("a", 1, "b", 2);
Map<String, Integer> fromEntries = Map.ofEntries(
    Map.entry("a", 1),
    Map.entry("b", 2)
);
```

---

## SequencedCollection (Java 21)

New in Java 21: `SequencedCollection`, `SequencedSet`, `SequencedMap` add methods to access the first/last element and get a reversed view.

```java
SequencedCollection<String> sc = new ArrayList<>(List.of("a", "b", "c"));
sc.getFirst();     // "a"
sc.getLast();      // "c"
sc.addFirst("x");  // [x, a, b, c]
sc.addLast("z");   // [x, a, b, c, z]
sc.reversed();     // [z, c, b, a, x] — reversed view

SequencedMap<String, Integer> sm = new LinkedHashMap<>();
sm.firstEntry();   // Map.Entry with first inserted key
sm.lastEntry();
sm.reversed();
```

---

## Immutable Collections (Java 9+)

```java
// Factory methods — elements cannot be added, removed, or changed
List<String> list    = List.of("a", "b", "c");
Set<String> set      = Set.of("x", "y");
Map<String, Integer> map = Map.of("key", 1);

// Collections.unmodifiableX — wrapper, original can still mutate!
List<String> mutable = new ArrayList<>(List.of("a", "b"));
List<String> unmod   = Collections.unmodifiableList(mutable);
mutable.add("c");  // unmod now shows ["a", "b", "c"] — not truly immutable!
```

::: warning `List.of()` vs `Collections.unmodifiableList()`
`List.of()` creates a truly immutable list — the contents can never change.
`Collections.unmodifiableList()` creates a read-only *view* — the underlying list can still change.
:::

---

## Summary

- Type variables to interfaces: `List<E>`, `Map<K,V>`, not `ArrayList<E>`.
- `List` = ordered + duplicates; `Set` = no duplicates; `Queue/Deque` = FIFO/LIFO.
- `Map` is NOT a `Collection` — it has its own hierarchy.
- Java 21 adds `SequencedCollection` for first/last access and reversed views.
- Prefer `List.of()`/`Set.of()` for immutable collections over `unmodifiableList()`.

<RelatedTopics :topics="['/collections/implementations', '/collections/hashmap-internals', '/collections/equals-hashcode']" />

[→ Take the Collections Quiz](/quizzes/collections-quiz)
