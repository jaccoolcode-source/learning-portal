---
title: Learning Paths
description: Structured learning tracks for different goals — Java interview prep, Spring developer, and senior engineer
---

<script setup>
const track1 = `flowchart TD
    A([Start]) --> B[OOP and SOLID]
    B --> C[Java Core]
    C --> D[Collections Framework]
    D --> E[HashMap Internals]
    E --> F[JVM and Memory]
    F --> G[Concurrency]
    G --> H[Modern Java]
    H --> I[Design Patterns]
    I --> J([Interview Ready])
    style A fill:#22c55e,color:#fff
    style J fill:#3b82f6,color:#fff`

const track2 = `flowchart TD
    A([Start]) --> B[Java Core Refresher]
    B --> C[OOP and SOLID Principles]
    C --> D[Design Patterns]
    D --> E[Spring IoC and DI]
    E --> F[Bean Lifecycle and Scopes]
    F --> G[Spring Boot]
    G --> H[Spring Data JPA]
    H --> I[Spring Security]
    I --> J[Spring Testing]
    J --> K([Spring Developer])
    style A fill:#22c55e,color:#fff
    style K fill:#16a34a,color:#fff`

const track3 = `flowchart TD
    A([Start]) --> B[All Java Tracks Complete]
    B --> C[Concurrency Deep Dive]
    C --> D[JVM Tuning and Profiling]
    D --> E[Database Advanced]
    E --> F[Microservices]
    F --> G[Architecture Patterns]
    G --> H[Observability]
    H --> I([Senior Engineer])
    style A fill:#22c55e,color:#fff
    style I fill:#7c3aed,color:#fff`
</script>

# Learning Paths

Choose a structured path based on your goal. Each track builds on the previous topic.

---

## Track 1 — Java Interview Preparation

Optimized for clearing Java backend interviews in 4–6 weeks.

<MermaidDiagram :code="track1" />

### Suggested Weekly Schedule

| Week | Topics | Time |
|------|--------|------|
| 1 | OOP & SOLID + Java Core | 8–10 hrs |
| 2 | Collections + HashMap Internals | 8–10 hrs |
| 3 | JVM Memory + Concurrency | 8–10 hrs |
| 4 | Modern Java + Design Patterns | 10–12 hrs |
| 5–6 | Spring Framework + Databases | 12–15 hrs |

---

## Track 2 — Spring Developer

For developers building production Spring Boot applications.

<MermaidDiagram :code="track2" />

---

## Track 3 — Senior Engineer / Architect

For engineers moving into senior/lead roles or system design interviews.

<MermaidDiagram :code="track3" />

---

## Topic Dependencies

```
OOP & SOLID
  └── Java Core (equals, hashCode, Strings)
        └── Collections (interfaces → implementations)
              └── HashMap Internals
              └── equals & hashCode contract
        └── Generics
              └── Collections (type safety)
  └── Design Patterns
        └── Spring Framework (uses Factory, Proxy, Template Method, Observer)
              └── Spring Boot
              └── Spring Data / JPA
              └── Spring Security
              └── Spring Testing
JVM & Memory
  └── Concurrency (thread stacks, heap sharing)
Modern Java (8–21)
  └── Streams & Lambdas
  └── Records & Sealed Classes
  └── Virtual Threads (Java 21)
Databases
  └── JPA / Hibernate (uses Spring Data)
Architecture
  └── Microservices (uses Spring Boot, Databases)
  └── DDD · CQRS · Event Sourcing
```
