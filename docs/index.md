---
layout: home

hero:
  name: "Java Learning Portal"
  text: "Master Java from Core to Cloud"
  tagline: "Comprehensive guides, interactive quizzes, and clear code examples — everything you need for Java interviews and beyond."
  actions:
    - theme: brand
      text: Start Learning
      link: /java-core/
    - theme: alt
      text: View Learning Paths
      link: /learning-paths

features:
  - icon: ☕
    title: Java Core
    details: "equals/hashCode contracts, String immutability, Generics, I/O and NIO fundamentals."
    link: /java-core/
    linkText: Explore Java Core

  - icon: 🚀
    title: Modern Java (8–21)
    details: "Lambdas, Streams, Optional, Records, Sealed Classes, Pattern Matching, and more."
    link: /modern-java/
    linkText: Explore Modern Java

  - icon: 🗃️
    title: Collections Framework
    details: "List, Set, Map, Queue internals. HashMap buckets, red-black trees, load factor."
    link: /collections/
    linkText: Explore Collections

  - icon: 🧠
    title: JVM & Memory
    details: "Heap, Stack, Metaspace, GC algorithms (G1, ZGC, Shenandoah), memory leaks and OOM."
    link: /java-memory/
    linkText: Explore JVM & Memory

  - icon: 🎯
    title: OOP & SOLID
    details: "All 5 SOLID principles, OOP pillars, and clean code heuristics: KISS, DRY, YAGNI."
    link: /principles/
    linkText: Explore Principles

  - icon: 🏗️
    title: Design Patterns
    details: "All 23 GoF patterns (Creational, Structural, Behavioral) with Java examples and UML intent."
    link: /design-patterns/
    linkText: Explore Patterns

  - icon: 🌱
    title: Spring Framework
    details: "IoC/DI, Bean lifecycle, AOP, Spring Boot, Spring Data/JPA, Security, and Testing."
    link: /spring/
    linkText: Explore Spring

  - icon: ⚡
    title: Concurrency
    details: "Threads, synchronization, Executors, CompletableFuture, ForkJoinPool, and reactive programming."
    link: /concurrency/
    linkText: Explore Concurrency

  - icon: 🗄️
    title: Databases
    details: "SQL, transactions, indexes, JPA/Hibernate session management, and NoSQL fundamentals."
    link: /databases/
    linkText: Explore Databases

  - icon: 🏛️
    title: Architecture
    details: "Microservices, DDD, CQRS, Event Sourcing, REST best practices, and event-driven design."
    link: /architecture/
    linkText: Explore Architecture
---

## Ready to test your knowledge?

<div class="category-grid" style="margin-top: 1.5rem;">
  <CategoryCard
    title="SOLID Quiz"
    description="Test your understanding of all 5 SOLID design principles"
    icon="🎯"
    link="/quizzes/solid-quiz"
    accent="#6366f1"
  />
  <CategoryCard
    title="Collections Quiz"
    description="Prove you know HashMap internals, equals/hashCode, and the Collections API"
    icon="🗃️"
    link="/quizzes/collections-quiz"
    accent="#14b8a6"
  />
  <CategoryCard
    title="Design Patterns Quiz"
    description="Identify patterns, their intent, and when to apply them"
    icon="🏗️"
    link="/quizzes/design-patterns-quiz"
    accent="#8b5cf6"
  />
  <CategoryCard
    title="Spring Quiz"
    description="Bean lifecycle, DI, scopes, AOP, and Spring Boot autoconfiguration"
    icon="🌱"
    link="/quizzes/spring-quiz"
    accent="#22c55e"
  />
  <CategoryCard
    title="JVM Memory Quiz"
    description="GC algorithms, heap regions, OOM scenarios, and memory leaks"
    icon="🧠"
    link="/quizzes/java-memory-quiz"
    accent="#f97316"
  />
  <CategoryCard
    title="Mixed Review"
    description="Challenge yourself with questions spanning all topics"
    icon="🎲"
    link="/quizzes/mixed-review"
    accent="#3b82f6"
  />
</div>
