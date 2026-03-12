---
title: Modern Java (8–21) — Overview
description: Java evolution from Java 8 lambdas and streams through Java 21 virtual threads and pattern matching
category: modern-java
pageClass: layout-modern-java
---

# Modern Java (8–21)

<DifficultyBadge level="intermediate" />

Java has evolved dramatically since Java 8. Knowing what was added when helps you write idiomatic, modern Java code.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [Java 8 Features](./java8) | Lambdas, Streams, Optional, Functional interfaces, default methods |
| [Java 9–12 Features](./java9-12) | Modules, `var`, `List.of()`, `Optional.ifPresentOrElse()`, switch expressions |
| [Streams Deep Dive](./streams-deep-dive) | Collectors, parallel streams, `flatMap`, `reduce`, custom collectors |

---

## Release Timeline

| Version | Year | Headline Features |
|---------|------|------------------|
| Java 8 | 2014 | Lambdas, Streams, Optional, Default methods, `java.time` |
| Java 9 | 2017 | Module system (JPMS), JShell, `List.of()`, `Stream.takeWhile()` |
| Java 10 | 2018 | `var` (local type inference) |
| Java 11 | 2018 | `String.isBlank()`, `Files.readString()`, `var` in lambdas |
| Java 12 | 2019 | Switch expressions (preview) |
| Java 14 | 2020 | Records (preview), `instanceof` pattern matching (preview) |
| Java 15 | 2020 | Text blocks, sealed classes (preview) |
| Java 16 | 2021 | Records (stable), `instanceof` pattern matching (stable) |
| Java 17 | 2021 | Sealed classes (stable), pattern matching for switch (preview) |
| Java 21 | 2023 | Virtual threads, `SequencedCollection`, pattern matching in switch (stable) |

<RelatedTopics :topics="['/java-core/', '/collections/interfaces', '/concurrency/']" />
