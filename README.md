# Java Learning Portal

A VitePress-based learning portal covering Java and backend engineering topics — built for interview prep and deep understanding.

## Topics Covered

| Section | Content |
|---------|---------|
| ☕ Java Core | `equals`/`hashCode`, String immutability, Generics, I/O & NIO |
| 🚀 Modern Java (8–21) | Lambdas, Streams, Optional, Records, Sealed Classes, Pattern Matching |
| 🗃️ Collections | List, Set, Map, Queue internals; HashMap buckets, red-black trees |
| 🧠 JVM & Memory | Heap, Stack, Metaspace, GC algorithms (G1, ZGC, Shenandoah), OOM |
| 🎯 OOP & SOLID | All 5 SOLID principles, OOP pillars, KISS, DRY, YAGNI |
| 🏗️ Design Patterns | All 23 GoF patterns (Creational, Structural, Behavioral) with Java examples |
| 🌱 Spring Framework | IoC/DI, Bean lifecycle, AOP, Spring Boot, Spring Data/JPA, Security, Testing |
| ⚡ Concurrency | Threads, synchronization, Executors, CompletableFuture, ForkJoinPool |
| 🗄️ Databases | SQL, transactions, indexes, JPA/Hibernate, NoSQL |
| 🏛️ Architecture | Microservices, DDD, CQRS, Event Sourcing, REST, event-driven design |

Each page follows the structure: **Theory → Code Examples → Quiz**.

## Getting Started

```bash
npm install
npm run docs:dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run docs:dev` | Start local dev server |
| `npm run docs:build` | Build for production |
| `npm run docs:preview` | Preview production build |

## Tech Stack

- [VitePress](https://vitepress.dev/) — static site generator (Vite + Vue 3)
- Markdown + Vue components