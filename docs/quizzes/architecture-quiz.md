---
title: Architecture Quiz
---

<script setup>
const questions = [
  {
    question: "What is the primary advantage of a microservices architecture over a monolith?",
    options: [
      "Microservices always have lower latency than monoliths",
      "Each service can be independently deployed, scaled, and developed by separate teams",
      "Microservices eliminate the need for a database",
      "Microservices are simpler to develop than monoliths"
    ],
    answer: 1,
    explanation: "The key benefit is independent deployability and scalability. Teams own individual services and deploy without coordinating a full system release. The trade-off is higher operational complexity (service discovery, distributed tracing, network failures). Monoliths are often simpler for small teams."
  },
  {
    question: "In Domain-Driven Design (DDD), what is an Aggregate?",
    options: [
      "A database view that aggregates data from multiple tables",
      "A cluster of domain objects treated as a single unit for data changes, with one Aggregate Root controlling access",
      "A service that aggregates calls to multiple microservices",
      "A collection of Value Objects grouped for reporting"
    ],
    answer: 1,
    explanation: "An Aggregate is a cluster of Entities and Value Objects with clear boundaries. The Aggregate Root is the only entry point for external access and enforces invariants. All changes to objects within an Aggregate must go through the Root, ensuring consistency boundaries."
  },
  {
    question: "What does CQRS stand for, and what is its core idea?",
    options: [
      "Command Queue Request System — requests are queued before processing",
      "Command Query Responsibility Segregation — separate models for reads (queries) and writes (commands)",
      "Concurrent Query Resolution Strategy — queries run in parallel",
      "Component Query Response Schema — a REST API versioning pattern"
    ],
    answer: 1,
    explanation: "CQRS separates the write side (Commands that change state) from the read side (Queries that return data). This allows independent optimization: the write model focuses on domain logic and consistency, while the read model can be a denormalized view optimized for query performance."
  },
  {
    question: "What is Event Sourcing?",
    options: [
      "Using message brokers like Kafka as the primary event transport",
      "Storing the current state of an entity as a snapshot updated on each change",
      "Storing all state changes as an immutable sequence of events; current state is derived by replaying them",
      "A pattern for sourcing events from external APIs into an internal event bus"
    ],
    answer: 2,
    explanation: "In Event Sourcing, instead of storing current state, you store every event that caused a state change (e.g., OrderPlaced, ItemAdded, OrderShipped). Current state is reconstructed by replaying events. Benefits: full audit trail, temporal queries, easy event-driven integration. Trade-off: query complexity."
  },
  {
    question: "What problem does the Saga pattern solve in microservices?",
    options: [
      "It provides ACID transactions that span multiple microservices using two-phase commit",
      "It manages long-running distributed transactions using a sequence of local transactions with compensating actions on failure",
      "It synchronizes database schemas across microservices",
      "It routes requests to the correct microservice based on business rules"
    ],
    answer: 1,
    explanation: "Saga coordinates distributed transactions without 2PC. Each step is a local transaction; if a step fails, compensating transactions roll back previous steps. Two implementations: Choreography (services react to events) and Orchestration (central saga orchestrator coordinates steps)."
  },
  {
    question: "The CAP theorem states that a distributed system can guarantee at most two of three properties. Which are they?",
    options: [
      "Consistency, Availability, Partition tolerance",
      "Concurrency, Atomicity, Performance",
      "Consistency, Atomicity, Persistence",
      "Correctness, Availability, Partitioning"
    ],
    answer: 0,
    explanation: "CAP: Consistency (every read returns the most recent write), Availability (every request gets a response), Partition tolerance (the system continues despite network partitions). Since network partitions are unavoidable in distributed systems, you must choose between CP (consistency) or AP (availability)."
  },
  {
    question: "What is the Richardson Maturity Model Level 3 (Hypermedia)?",
    options: [
      "An API that uses only GET requests for all operations",
      "An API where responses include hypermedia links (HATEOAS) that guide clients on available next actions",
      "An API versioned through URL path segments like /v3/",
      "An API that uses HTTP verbs correctly (GET, POST, PUT, DELETE)"
    ],
    answer: 1,
    explanation: "RMM Level 3 is HATEOAS (Hypermedia As The Engine Of Application State). Responses include links to related resources and available actions, so clients don't need to hardcode URLs. Level 0 = HTTP as transport; Level 1 = resources; Level 2 = HTTP verbs; Level 3 = hypermedia."
  },
  {
    question: "What is the Strangler Fig pattern in microservices migration?",
    options: [
      "Killing an old monolith by immediately replacing all its functionality at once",
      "Incrementally replacing parts of a legacy system by routing new features to new services while the old system handles the rest",
      "A deployment strategy that runs two versions of a service simultaneously",
      "A pattern for strangling deadlocks in distributed transactions"
    ],
    answer: 1,
    explanation: "Named after the strangler fig tree that grows around a host tree. A facade routes requests to either the legacy system or new microservices. Over time, more functionality is migrated until the legacy system can be retired. This reduces risk compared to a big-bang rewrite."
  },
  {
    question: "What is eventual consistency, and when is it acceptable?",
    options: [
      "A consistency model where data is always immediately consistent across all nodes",
      "A consistency model where replicas may temporarily diverge but will converge to the same value given enough time with no new updates",
      "A transactional isolation level stronger than serializable",
      "A consistency model only applicable to in-memory caches"
    ],
    answer: 1,
    explanation: "Eventual consistency (AP in CAP) accepts temporary divergence between replicas in exchange for high availability and partition tolerance. Acceptable for use cases like social media likes, shopping cart totals, or DNS updates — where brief staleness is tolerable. Not acceptable for bank balances or inventory counts."
  },
  {
    question: "What is an Anti-Corruption Layer (ACL) in DDD?",
    options: [
      "A security layer preventing SQL injection",
      "A translation layer that isolates your domain model from external systems or legacy models, preventing foreign concepts from corrupting your domain",
      "A validation layer that rejects corrupted messages from message brokers",
      "A circuit breaker that prevents cascade failures between bounded contexts"
    ],
    answer: 1,
    explanation: "When integrating with external systems or legacy code with a different domain model, an ACL translates between the external model and your internal domain model. Without it, external concepts leak into your domain, corrupting its integrity. The ACL keeps your Bounded Context pure."
  },
  {
    question: "What is the difference between Orchestration and Choreography in microservices coordination?",
    options: [
      "Orchestration uses REST, Choreography uses message brokers",
      "Orchestration: a central coordinator tells services what to do; Choreography: services react to events and decide their own actions",
      "Orchestration is synchronous, Choreography is asynchronous — with no other differences",
      "Choreography requires a service mesh; Orchestration does not"
    ],
    answer: 1,
    explanation: "Orchestration: a central saga orchestrator explicitly calls services in sequence (tight coupling to orchestrator). Choreography: each service publishes events; other services subscribe and react independently (loose coupling but harder to trace flow). Neither is universally better — choose based on complexity and team ownership."
  },
  {
    question: "What does the Circuit Breaker pattern do in a microservices architecture?",
    options: [
      "It encrypts traffic between microservices to prevent data breaches",
      "It monitors calls to a downstream service and, after a threshold of failures, 'opens' the circuit to return fast failures instead of waiting for timeouts",
      "It prevents thundering herd problems by rate-limiting incoming requests",
      "It automatically restarts failed microservices using health check endpoints"
    ],
    answer: 1,
    explanation: "Circuit Breaker (popularized by Netflix Hystrix, now Resilience4j) has three states: Closed (normal), Open (failing fast after threshold exceeded), Half-Open (testing recovery). When open, it returns immediate errors without calling the downstream service, preventing cascade failures and allowing the downstream to recover."
  }
]
</script>

# Architecture Quiz

Test your knowledge of microservices, DDD, CQRS, Event Sourcing, distributed systems theory, and enterprise patterns.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Architecture study pages](/architecture/).
