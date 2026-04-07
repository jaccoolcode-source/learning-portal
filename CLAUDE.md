# Learning Portal — Project Context

## Project Overview

## Tech Stack
- **Framework:** VitePress (static site generator built on Vite + Vue 3)
- **Language:** Markdown + Vue components
- **Scripts:** `npm run docs:dev` | `npm run docs:build` | `npm run docs:preview`
- **Source PDFs:** `external-resources/` folder

## Source PDF Inventory
| File | Topics Covered |
|------|---------------|
| `SOLID.pdf` | All 5 SOLID principles with Java code examples |
| `Design patterns.pdf` | All 23 GoF patterns (Creational, Structural, Behavioral) with Java examples |
| `Java core.pdf` | equals/hashCode contracts, HashMap internals, String immutability |
| `Java Collection summary.pdf` | Collections framework Java 21, SequencedCollection, Immutable collections |
| `Java Memory.pdf` | JVM heap structure, GC algorithms (Serial/Parallel/CMS/G1), OOM, leaks |w
| `Spring Framework.pdf` | IoC/DI, Bean lifecycle, scopes, cyclic deps, @Qualifier, testing support |
| `it_java_summary_conspect.pdf` | Master interview guide: Java 8-12, Threads, DB/JPA/Hibernate, Microservices, DDD, REST, Architecture |

## Portal Structure (docs/)
```
docs/
├── index.md                          # Home page
├── principles/
│   ├── index.md                      # Overview
│   ├── solid.md                      # All 5 SOLID principles
│   ├── oop.md                        # OOP principles
│   └── kiss-dry-yagni.md
├── java-core/
│   ├── index.md
│   ├── object-class.md               # equals, hashCode, wait/notify
│   ├── strings.md                    # Immutability, pool, intern()
│   ├── generics.md
│   └── io.md                         # Reader vs InputStream, NIO
├── modern-java/
│   ├── index.md
│   ├── java8.md                      # Lambdas, Streams, Optional, Functional interfaces
│   ├── java9-12.md
│   └── streams-deep-dive.md
├── collections/
│   ├── index.md
│   ├── interfaces.md                 # Collection, List, Set, Queue, Map
│   ├── implementations.md            # ArrayList, HashMap, TreeMap etc.
│   ├── hashmap-internals.md          # Buckets, red-black tree, load factor
│   └── equals-hashcode.md
├── concurrency/
│   ├── index.md
│   ├── threads.md                    # Thread, Runnable, Callable
│   ├── synchronization.md
│   └── concurrent-utils.md          # Executors, CompletableFuture, ForkJoinPool
├── java-memory/
│   ├── index.md
│   ├── jvm-structure.md              # Heap, Stack, Metaspace
│   ├── garbage-collection.md
│   └── memory-problems.md
├── design-patterns/
│   ├── index.md
│   ├── creational/
│   │   ├── singleton.md
│   │   ├── factory-method.md
│   │   ├── abstract-factory.md
│   │   ├── builder.md
│   │   └── prototype.md
│   ├── structural/
│   │   ├── adapter.md
│   │   ├── bridge.md
│   │   ├── composite.md
│   │   ├── decorator.md
│   │   ├── facade.md
│   │   ├── flyweight.md
│   │   └── proxy.md
│   └── behavioral/
│       ├── observer.md
│       ├── strategy.md
│       ├── chain-of-responsibility.md
│       ├── command.md
│       ├── iterator.md
│       ├── mediator.md
│       ├── memento.md
│       ├── state.md
│       ├── template-method.md
│       ├── visitor.md
│       └── interpreter.md
├── spring/
│   ├── index.md
│   ├── ioc-di.md                     # IoC, DI, ApplicationContext
│   ├── bean-lifecycle.md             # PostConstruct, PreDestroy, InitializingBean
│   ├── bean-scopes.md                # Singleton, Prototype, Request, Session, Application
│   ├── configuration.md              # XML vs Java-based config
│   ├── aop.md
│   ├── qualifiers.md                 # @Qualifier, @Primary, cyclic deps
│   ├── spring-boot.md
│   ├── spring-data.md                # JPA, Hibernate, session management
│   ├── spring-security.md
│   └── testing.md                    # SpringBootTest, WebMvcTest, MockBean
├── databases/
│   ├── index.md
│   ├── sql.md                        # JOINs, transactions, isolation, indexes
│   ├── jpa-hibernate.md
│   └── nosql.md
├── architecture/
│   ├── index.md
│   ├── microservices.md
│   ├── ddd.md
│   ├── cqrs-event-sourcing.md
│   └── rest-web.md
└── quizzes/
    ├── solid-quiz.md
    ├── collections-quiz.md
    ├── design-patterns-quiz.md
    ├── spring-quiz.md
    ├── java-memory-quiz.md
    └── mixed-review.md
```

## Key Conventions
- Each topic page follows: Theory → Code Examples → Quiz link at bottom
- Code blocks use ```java syntax highlighting
- Sidebar is managed in `docs/.vitepress/config.mjs`
- Quiz format: Vue component OR collapsible markdown (TBD)

## Build Phases
1. **Phase 1** — Folder structure + config.mjs navigation
2. **Phase 2** — Content pages (SOLID → Java Core → Collections → Memory → Patterns → Spring → DB → Architecture)
3. **Phase 3** — Quiz Vue components per topic
4. **Phase 4** — Home page polish, cross-links, progress indicators
