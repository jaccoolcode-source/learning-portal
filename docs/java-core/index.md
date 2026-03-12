---
title: Java Core — Overview
description: Core Java concepts every developer must know — Object class, Strings, Generics, and I/O
category: java-core
pageClass: layout-java-core
---

# Java Core

<DifficultyBadge level="intermediate" />

These topics appear in every Java interview and underpin the Collections framework, Spring, and everything else. Master them before moving on.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [Object Class](./object-class) | `equals`, `hashCode`, `toString`, `wait`/`notify` |
| [Strings & Immutability](./strings) | String pool, `intern()`, `StringBuilder` vs `StringBuffer` |
| [Generics](./generics) | Type erasure, wildcards (`? extends`, `? super`), bounded types |
| [I/O & NIO](./io) | `Reader`/`InputStream` hierarchy, `Path`, `Files`, `Channel` |

---

## Prerequisites

- OOP fundamentals (see [OOP Principles](/principles/oop))
- Basic Java syntax

---

## Quick Facts to Know

- `equals()` and `hashCode()` must be overridden together — always.
- Strings are immutable; every concatenation in a loop creates garbage.
- Generics are erased at runtime — `List<String>` and `List<Integer>` are the same class at runtime.
- NIO (`java.nio`) is non-blocking and more efficient for large data.

<RelatedTopics :topics="['/collections/equals-hashcode', '/collections/hashmap-internals', '/modern-java/java8']" />
