---
title: Collections Framework — Overview
description: Java 21 Collections framework overview — from the Iterable root to SequencedCollection, immutable collections, and choosing the right implementation
category: collections
pageClass: layout-collections
---

# Collections Framework

<DifficultyBadge level="intermediate" />

The Collections framework is Java's standard library for managing groups of objects. Mastering it — especially the `HashMap` internals — is essential for interviews and production code alike.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [Collection Interfaces](./interfaces) | `Iterable`, `Collection`, `List`, `Set`, `Queue`, `Map`, `Deque` |
| [Implementations](./implementations) | `ArrayList`, `LinkedList`, `HashSet`, `TreeMap`, `PriorityQueue`, Java 21 additions |
| [HashMap Internals](./hashmap-internals) | Buckets, load factor, red-black tree, resize, thread safety |
| [equals & hashCode](./equals-hashcode) | The contract, common mistakes, and correct implementation patterns |

---

## The Hierarchy at a Glance

```
Iterable<E>
  └── Collection<E>
        ├── List<E>       — ordered, duplicates allowed
        │     ├── ArrayList
        │     └── LinkedList
        ├── Set<E>        — no duplicates
        │     ├── HashSet
        │     ├── LinkedHashSet
        │     └── TreeSet (SortedSet)
        └── Queue<E>      — FIFO ordering
              ├── LinkedList
              ├── PriorityQueue
              └── Deque<E> (double-ended)
                    ├── ArrayDeque
                    └── LinkedList

Map<K,V>   — key-value pairs (NOT a Collection)
  ├── HashMap
  ├── LinkedHashMap
  ├── TreeMap (SortedMap)
  └── Hashtable (legacy)
```

---

## Quick Decision Guide

| Need | Use |
|------|-----|
| Fast random access | `ArrayList` |
| Fast insert/delete at ends | `ArrayDeque` |
| No duplicates, fast lookup | `HashSet` |
| No duplicates, sorted | `TreeSet` |
| Key-value, fast lookup | `HashMap` |
| Key-value, insertion order | `LinkedHashMap` |
| Key-value, sorted keys | `TreeMap` |
| Priority queue / min-heap | `PriorityQueue` |
| Thread-safe map | `ConcurrentHashMap` |
| Immutable list | `List.of(...)` |

<RelatedTopics :topics="['/java-core/object-class', '/collections/hashmap-internals', '/quizzes/collections-quiz']" />
