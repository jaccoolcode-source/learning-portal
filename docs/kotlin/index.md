---
title: Kotlin
description: Kotlin overview — why Kotlin, key advantages over Java, and where it's used
category: kotlin
pageClass: layout-kotlin
difficulty: beginner
tags: [kotlin, jvm, java-interop, android, spring-boot]
estimatedMinutes: 10
---

# Kotlin

<DifficultyBadge level="beginner" />

Kotlin is a statically typed JVM language developed by JetBrains. It compiles to JVM bytecode (and JavaScript or native), is 100% interoperable with Java, and is the primary language for Android development.

---

## Why Kotlin?

```kotlin
// Java (verbose)
public class User {
    private final String name;
    private final String email;
    public User(String name, String email) { this.name = name; this.email = email; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    // equals, hashCode, toString... (or Lombok)
}

// Kotlin (concise)
data class User(val name: String, val email: String)
```

**Key advantages over Java:**

| Advantage | What it means |
|-----------|--------------|
| **Null safety** | Nullable types are part of the type system — `NullPointerException` is nearly impossible |
| **Conciseness** | Data classes, extension functions, lambdas reduce boilerplate by ~40% |
| **Coroutines** | Structured concurrency built into the language — simpler than CompletableFuture |
| **Interop** | Calls Java libraries directly — no wrapper needed |
| **Smart casts** | Compiler tracks null checks and instanceof — no explicit cast needed |
| **Functional** | First-class functions, extension functions, inline functions |

---

## Where Kotlin Is Used

| Domain | Notes |
|--------|-------|
| **Android** | Official primary language since 2019 (replacing Java) |
| **Spring Boot** | Full support since Spring 5 — idiomatic Kotlin APIs |
| **Backend services** | Ktor (JetBrains), Micronaut, Quarkus all support Kotlin |
| **Multiplatform** | Kotlin Multiplatform shares business logic across Android, iOS, web |
| **Scripting** | `.kts` files for Gradle build scripts (replacing Groovy) |

---

## Kotlin and Java Interoperability

Kotlin compiles to the same JVM bytecode as Java. You can:
- Call Java libraries from Kotlin with no adapters
- Call Kotlin code from Java (with minor adjustments)
- Mix Kotlin and Java files in the same project

---

## Sections

- [Kotlin Basics](./kotlin-basics) — syntax, null safety, data classes, extension functions
- [Kotlin vs Java](./kotlin-vs-java) — side-by-side feature comparison
- [Coroutines](./coroutines) — structured concurrency, suspend functions, Flow
