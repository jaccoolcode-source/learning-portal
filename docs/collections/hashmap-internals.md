---
title: HashMap Internals
description: How HashMap works under the hood — buckets, hash function, load factor, red-black tree treeification, and resize
category: collections
pageClass: layout-collections
difficulty: advanced
tags: [java, hashmap, buckets, red-black-tree, load-factor, hashing]
related:
  - /collections/equals-hashcode
  - /collections/implementations
  - /java-core/object-class
estimatedMinutes: 25
quizLink: /quizzes/collections-quiz
---

# HashMap Internals

<DifficultyBadge level="advanced" />

`HashMap` is the most-asked Java data structure in interviews. Understanding its internals — buckets, load factor, treeification — explains its O(1) average complexity and worst-case behaviour.

---

## Why This Matters

Misusing HashMap (e.g., using mutable keys, wrong `hashCode`) causes silent bugs. Understanding internals helps you:
- Tune initial capacity to avoid resizes
- Diagnose sudden O(n) performance degradation
- Understand why `equals`/`hashCode` must be correct

---

## Data Structure Overview

```
HashMap<K, V>
│
├── Node<K,V>[] table  ← backing array of buckets
│     ├── [0]  → null
│     ├── [1]  → Node{ key="a", value=1, hash=h1, next=null }
│     ├── [2]  → Node{ key="b", value=2 } → Node{ key="c", value=3 }  (collision chain)
│     ├── [3]  → TreeNode (red-black tree if ≥ 8 nodes in bucket)
│     └── ...
│
├── int size            ← number of key-value pairs
├── int threshold       ← capacity × loadFactor (resize trigger)
├── float loadFactor    ← default 0.75
└── int modCount        ← for fail-fast iterators
```

---

## Step-by-Step: How put() Works

```java
map.put("name", "Alice");
```

### 1. Compute hash

```java
// Java HashMap spreads the hash to reduce collisions
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

The `^ (h >>> 16)` XOR with the upper 16 bits is called **hash spreading** — it mixes high bits into low bits so the bucket index uses information from the entire hash, not just the lower bits.

### 2. Find bucket index

```java
int index = (table.length - 1) & hash;
// table.length is always a power of 2, so this is equivalent to hash % table.length
```

### 3. Handle the bucket

- **Empty bucket** → create new `Node`, place it
- **Non-empty, same key** → update value
- **Non-empty, different key (collision)** → add to chain or tree

### 4. Check threshold

If `size > threshold` (capacity × 0.75): **resize** — double capacity, rehash all entries.

---

## Collision Resolution: Linked List → Red-Black Tree

| Bucket size | Structure |
|-------------|-----------|
| < 8 entries | Singly-linked list |
| ≥ 8 entries AND table.length ≥ 64 | **Treeify** → red-black tree |
| After remove, < 6 entries | **Untreeify** → linked list |

**Treeification** (Java 8+) converts a bucket's chain into a red-black tree when it becomes too long, changing worst-case lookup from O(n) to O(log n).

```
Before treeify (chain):
  bucket[7] → "a"→"m"→"b"→"n"→"c"→"o"→"d"→"p"  ← O(n) search

After treeify (red-black tree):
  bucket[7] →       "d"
                   /    \
                 "b"    "n"
                /   \  /   \
               "a" "c""m" "o"
                          \
                          "p"                    ← O(log n) search
```

---

## Default Parameters

| Parameter | Value | Meaning |
|-----------|-------|---------|
| Initial capacity | `16` | Starting array size |
| Load factor | `0.75` | Resize when 75% full |
| Treeify threshold | `8` | Chain → tree at 8 nodes |
| Untreeify threshold | `6` | Tree → chain at 6 nodes |
| Min treeify capacity | `64` | Table must be ≥ 64 before treeifying |

---

## Resize (Rehashing)

When `size > capacity × loadFactor`:
1. Allocate new array of **double** capacity
2. Rehash every existing entry: `newIndex = hash & (newCapacity - 1)`
3. Entries may split between old index and `oldIndex + oldCapacity`

```java
// Pre-size to avoid resize if you know the expected size:
Map<String, Integer> map = new HashMap<>((int)(expectedSize / 0.75) + 1);
```

---

## null Key Handling

`HashMap` allows exactly **one null key**, always stored in bucket `[0]`:

```java
map.put(null, "value");
map.get(null);   // "value"
```

---

## Thread Safety

`HashMap` is **NOT thread-safe**. Concurrent modifications can cause:
- **Infinite loops** (Java 7 — resize race condition creating a circular chain)
- **Lost updates** (Java 8+)
- `ConcurrentModificationException`

### Thread-safe alternatives

| Option | Notes |
|--------|-------|
| `ConcurrentHashMap` | Segment-level locking, best for concurrent use |
| `Collections.synchronizedMap(map)` | Wraps every method — coarse lock |
| `Hashtable` | Legacy, synchronised — avoid in new code |

---

## Keys Must Be Immutable (and Override equals/hashCode)

```java
// WRONG — mutable key!
List<String> key = new ArrayList<>(List.of("a"));
Map<List<String>, String> map = new HashMap<>();
map.put(key, "value");

key.add("b");  // key changes!
map.get(key);  // null — hash changed, wrong bucket!
```

Always use immutable objects as keys: `String`, `Integer`, `UUID`, records, etc.

---

## How get() Works

```java
map.get("name");
```

1. Compute hash of `"name"`
2. Find bucket: `index = hash & (capacity - 1)`
3. Search bucket:
   - **Empty** → return `null`
   - **Linked list** → traverse, checking `hash == e.hash && key.equals(e.key)`
   - **Tree** → binary search using `compareTo` or `System.identityHashCode`
4. Return found value or `null`

---

## Quick Reference

| Aspect | Detail |
|--------|--------|
| Default capacity | 16 |
| Default load factor | 0.75 |
| Resize trigger | size > capacity × 0.75 |
| Resize amount | Double |
| Collision strategy | Chaining (list → tree) |
| Treeify at | ≥ 8 in bucket + table ≥ 64 |
| null keys | 1 allowed |
| Thread safety | Not safe — use `ConcurrentHashMap` |
| Java version | Java 8 added treeification |

---

## Summary

- HashMap uses a backing array of buckets; bucket index = `hash & (capacity-1)`.
- Collisions are resolved by chaining; long chains treeify into red-black trees (Java 8+).
- Resize doubles capacity and rehashes all entries.
- Load factor 0.75 balances time vs. space; pre-size if expected size is known.
- `equals()` and `hashCode()` must be correct — mutable keys break everything.

<RelatedTopics :topics="['/collections/equals-hashcode', '/collections/implementations', '/java-core/object-class']" />

[→ Take the Collections Quiz](/quizzes/collections-quiz)
1