---
title: Messaging
description: Messaging systems overview — Kafka, Kafka Streams, Spring Kafka, RabbitMQ — concepts, patterns, and when to use each
category: messaging
pageClass: layout-messaging
difficulty: intermediate
tags: [kafka, rabbitmq, messaging, event-driven, pub-sub, streaming]
related:
  - /architecture/microservices
  - /gcp/pubsub
  - /concurrency/concurrent-utils
estimatedMinutes: 10
---

# Messaging

<DifficultyBadge level="intermediate" />

Message brokers decouple producers from consumers, enabling asynchronous communication, load levelling, and event-driven architectures. This section covers Kafka (core + Streams), Spring Kafka, and RabbitMQ — from fundamentals to production patterns.

---

## What's Covered

| Page | Key Concepts |
|------|-------------|
| [Kafka Core](/messaging/kafka-core) | Topics, partitions, consumer groups, offsets, replication, producers, delivery guarantees, log compaction |
| [Kafka Streams](/messaging/kafka-streams) | KStream, KTable, stateless/stateful ops, joins, windowing, state stores |
| [Spring Kafka](/messaging/spring-kafka) | `@KafkaListener`, `KafkaTemplate`, error handling, retries, DLT, transactions, testing |
| [RabbitMQ](/messaging/rabbitmq) | Exchanges, queues, bindings, acknowledgements, DLX, Spring AMQP |

---

## Kafka vs RabbitMQ — When to Use Which

| | **Kafka** | **RabbitMQ** |
|-|-----------|-------------|
| **Model** | Distributed log (pull) | Message broker (push) |
| **Retention** | Messages kept on disk (default 7 days) | Messages removed after ack |
| **Throughput** | Millions of msg/sec | Hundreds of thousands/sec |
| **Ordering** | Per partition | Per queue (single consumer) |
| **Replay** | Yes — seek to any offset | No (once acked, gone) |
| **Consumer model** | Consumer groups, each group reads independently | Competing consumers on a queue |
| **Routing** | By topic + partition key | Flexible (exchange types: direct/topic/fanout) |
| **Streaming** | Kafka Streams, Flink, Spark | Not designed for stream processing |
| **Typical use** | Event sourcing, audit log, stream processing, high-throughput pipelines | Task queues, RPC, complex routing, low-latency delivery |

## Kafka vs GCP Pub/Sub

| | **Kafka** | **GCP Pub/Sub** |
|-|-----------|-----------------|
| **Operations** | Self-managed (or Confluent/MSK/Managed Kafka) | Fully managed, serverless |
| **Replay** | By offset (flexible window) | Snapshot-based (limited) |
| **Consumer groups** | Native concept | Per-subscription model |
| **Exactly-once** | Yes (idempotent producer + transactions) | Yes (opt-in per subscription) |
| **Ordering** | Per partition | Per ordering key |
| **Ecosystem** | Kafka Streams, Kafka Connect, ksqlDB | Dataflow, BigQuery subscription |

---

## Core Messaging Concepts

### Delivery Guarantees

| Guarantee | Description | Producer Config | Consumer Behaviour |
|-----------|-------------|-----------------|-------------------|
| **At-most-once** | Message may be lost, never duplicated | `acks=0` | Auto-commit before processing |
| **At-least-once** | Message delivered ≥1 times, may duplicate | `acks=all` | Commit after processing |
| **Exactly-once** | Delivered exactly once | `acks=all` + idempotent producer | Transactional consumer |

### Idempotent Consumers

Regardless of broker guarantee, **consumers must be idempotent** — processing the same message twice should produce the same result.

```java
// Pattern: check-then-act with a processed-message store
public void processOrder(OrderEvent event) {
    if (processedEvents.contains(event.getEventId())) {
        log.warn("Duplicate event, skipping: {}", event.getEventId());
        return;
    }
    orderService.process(event);
    processedEvents.add(event.getEventId()); // DB, Redis, etc.
}
```

### Event-Driven Patterns

| Pattern | Description | Technology |
|---------|-------------|-----------|
| **Event notification** | Service publishes that something happened; consumers decide what to do | Kafka, Pub/Sub, RabbitMQ |
| **Event-carried state transfer** | Event contains enough data that consumers don't need to call back | Kafka |
| **Event sourcing** | All state changes stored as immutable events; state rebuilt by replay | Kafka (log as source of truth) |
| **CQRS** | Write model publishes events; read model rebuilds projections | Kafka → read store |
| **Saga** | Distributed transaction via sequence of events + compensating actions | Kafka, RabbitMQ |
| **Outbox pattern** | Write to DB + outbox table atomically; relay publishes to broker | Debezium + Kafka |

<RelatedTopics :topics="['/messaging/kafka-core', '/messaging/spring-kafka', '/messaging/rabbitmq', '/architecture/microservices']" />
