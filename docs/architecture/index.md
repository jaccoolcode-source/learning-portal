---
title: Architecture — Overview
description: Software architecture patterns — Microservices, DDD, CQRS, Event Sourcing, REST, and event-driven design
category: architecture
pageClass: layout-architecture
---

# Architecture

<DifficultyBadge level="advanced" />

Software architecture decisions have the biggest impact on long-term maintainability. This section covers the architectural patterns asked in senior engineer interviews and used in modern Java backends.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [Microservices](./microservices) | Service decomposition, API design, service mesh, circuit breakers |
| [DDD](./ddd) | Bounded Context, Aggregate, Entity vs Value Object, Domain Events |
| [CQRS & Event Sourcing](./cqrs-event-sourcing) | Command/Query separation, event store, projections |
| [REST & Web](./rest-web) | REST maturity levels, HTTP semantics, API versioning, OpenAPI |

---

## Monolith vs Microservices

| Aspect | Monolith | Microservices |
|--------|---------|--------------|
| Deployment | Single unit | Independent services |
| Development | Simple (no network calls) | Complex (distributed system) |
| Scaling | Scale everything | Scale individual services |
| Team | Small teams fine | Large teams, clear ownership |
| Start with | Usually yes | After proven need |

**Rule of thumb:** Start with a modular monolith. Extract services when you have clear bounded contexts and organisational pressure to do so.

<RelatedTopics :topics="['/spring/spring-boot', '/databases/']" />
