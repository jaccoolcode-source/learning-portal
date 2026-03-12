---
title: Kafka Core
description: Apache Kafka fundamentals — topics, partitions, offsets, consumer groups, replication, producers, consumers, delivery guarantees, and log compaction
category: messaging
pageClass: layout-messaging
difficulty: advanced
tags: [kafka, topics, partitions, consumer-groups, replication, producers, consumers, offsets]
related:
  - /messaging/kafka-streams
  - /messaging/spring-kafka
  - /architecture/microservices
estimatedMinutes: 40
---

# Kafka Core

<DifficultyBadge level="advanced" />

Kafka is a distributed, partitioned, replicated commit log. It's not a traditional message queue — it's a durable, ordered, replayable event stream that can serve as both a message bus and a storage system.

---

## Architecture

```
Producers                  Kafka Cluster                   Consumers
                    ┌─────────────────────────┐
                    │  Broker 1 (leader P0)   │
App A ──────────▶  │  Broker 2 (leader P1)   │ ──────────▶  Consumer Group A
App B ──────────▶  │  Broker 3 (leader P2)   │ ──────────▶  Consumer Group B
                    │  (ZooKeeper / KRaft)    │
                    └─────────────────────────┘
```

| Component | Description |
|-----------|-------------|
| **Broker** | A single Kafka server. A cluster has multiple brokers. |
| **Topic** | Named, ordered, immutable log of events. |
| **Partition** | A topic is split into N partitions — the unit of parallelism and ordering. |
| **Offset** | Monotonically increasing position of a message within a partition. |
| **Producer** | Writes messages to topics. |
| **Consumer** | Reads messages from topics (pull-based). |
| **Consumer Group** | Named group of consumers that share partition assignment. |
| **ZooKeeper / KRaft** | Cluster metadata and leader election (KRaft replaces ZooKeeper in Kafka 3.x+). |

---

## Topics and Partitions

```
Topic: "orders" (3 partitions, replication factor 2)

Partition 0:  [msg0] [msg3] [msg6] [msg9] ...
Partition 1:  [msg1] [msg4] [msg7] ...
Partition 2:  [msg2] [msg5] [msg8] ...

Each message in a partition has a unique, sequential offset.
```

**Key rules:**
- Messages within a partition are **strictly ordered**
- Messages across partitions have **no ordering guarantee**
- A partition can only be consumed by **one consumer per group** at a time
- More partitions = more parallelism, but more overhead (file handles, replication traffic)

### Choosing Partition Count

```
Rule of thumb: max(expected throughput / single-partition throughput,
                   desired consumer parallelism)

E.g.: 100 MB/s target, 10 MB/s per partition → 10 partitions minimum
      Want 8 consumers → at least 8 partitions

Increasing partitions after creation is possible but affects key ordering.
Decreasing is not supported — requires topic recreation.
```

---

## Replication

```
Topic "orders", partition 0, replication factor 3:

Broker 1: [LEADER]   partition 0  ← producers write here
Broker 2: [FOLLOWER] partition 0  ← replicates from leader
Broker 3: [FOLLOWER] partition 0  ← replicates from leader

ISR (In-Sync Replicas): set of replicas that are caught up to the leader.
```

| Config | Meaning |
|--------|---------|
| `replication.factor` | Number of replicas (including leader). Minimum 3 for production. |
| `min.insync.replicas` | Minimum ISR count required for a write to succeed when `acks=all`. Set to 2 for RF=3. |
| `unclean.leader.election.enable` | Allow out-of-sync replica to become leader (data loss risk). Default false in production. |

::: tip RF=3, min.insync.replicas=2
The most common production setup. Tolerates one broker failure while preventing data loss. With `acks=all`, a write requires confirmation from at least 2 replicas.
:::

---

## Producers

### Key Concepts

**Partitioner** determines which partition a message goes to:
- No key → round-robin (sticky partitioner in newer clients)
- With key → `murmur2(key) % numPartitions` → same key always goes to same partition

```java
// Dependency: org.apache.kafka:kafka-clients
Properties props = new Properties();
props.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka1:9092,kafka2:9092");
props.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
props.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);

// Reliability settings
props.put(ProducerConfig.ACKS_CONFIG, "all");             // wait for all ISR acks
props.put(ProducerConfig.RETRIES_CONFIG, Integer.MAX_VALUE);
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true); // exactly-once semantics
props.put(ProducerConfig.MAX_IN_FLIGHT_REQUESTS_PER_CONNECTION, 5); // safe with idempotence

// Performance / batching
props.put(ProducerConfig.BATCH_SIZE_CONFIG, 16384);        // 16 KB batch size
props.put(ProducerConfig.LINGER_MS_CONFIG, 5);             // wait up to 5ms to fill batch
props.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "snappy"); // compress batches

KafkaProducer<String, String> producer = new KafkaProducer<>(props);
```

### Sending Messages

```java
// Fire-and-forget (acks=0 or ignore callback)
producer.send(new ProducerRecord<>("orders", "user-123", orderJson));

// Async with callback
producer.send(
    new ProducerRecord<>("orders", "user-123", orderJson),
    (metadata, exception) -> {
        if (exception != null) {
            log.error("Failed to send message", exception);
        } else {
            log.debug("Sent to {}-{} @ offset {}",
                metadata.topic(), metadata.partition(), metadata.offset());
        }
    }
);

// Synchronous (blocking — only for tests or critical paths)
RecordMetadata metadata = producer.send(record).get();

// With headers (metadata / tracing)
ProducerRecord<String, String> record = new ProducerRecord<>("orders", "user-123", orderJson);
record.headers().add("traceId", traceId.getBytes());
record.headers().add("eventType", "ORDER_CREATED".getBytes());
producer.send(record, callback);
```

### Producer Acks

| `acks` | Durability | Latency | Risk |
|--------|-----------|---------|------|
| `0` | None — fire and forget | Lowest | Message loss on broker failure |
| `1` | Leader only | Low | Message loss if leader fails before replication |
| `all` / `-1` | All ISR must ack | Higher | No loss (subject to min.insync.replicas) |

---

## Consumers

### Consumer Groups

```
Topic "orders" — 3 partitions

Consumer Group "payment-service":
  Consumer 1 → P0
  Consumer 2 → P1
  Consumer 3 → P2

Consumer Group "notification-service":
  Consumer 1 → P0, P1, P2   (only 1 consumer — gets all 3)
```

- Each partition is assigned to exactly **one consumer per group**
- Multiple groups each receive **all messages** independently
- More consumers than partitions → idle consumers
- Consumers = partitions → maximum parallelism

### Rebalancing

When consumers join/leave the group, Kafka reassigns partitions — a **rebalance**. During rebalance, all consumption in the group pauses.

**Partition assignment strategies:**
| Strategy | Description |
|----------|-------------|
| `RangeAssignor` (default) | Ranges of partitions per consumer, per topic |
| `RoundRobinAssignor` | Round-robin across all topics + partitions |
| `StickyAssignor` | Minimises partition movement on rebalance |
| `CooperativeStickyAssignor` | Incremental rebalance — no full stop (preferred for low-latency) |

### Offset Management

```java
Properties props = new Properties();
props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka1:9092");
props.put(ConsumerConfig.GROUP_ID_CONFIG, "payment-service");
props.put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);
props.put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer.class);

// Offset reset — what to do when no committed offset exists
props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest"); // or "latest"

// Commit strategy
props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false); // manual commit = safer

KafkaConsumer<String, String> consumer = new KafkaConsumer<>(props);
consumer.subscribe(List.of("orders"));
```

### Poll Loop

```java
try {
    while (running) {
        ConsumerRecords<String, String> records = consumer.poll(Duration.ofMillis(500));

        for (ConsumerRecord<String, String> record : records) {
            log.info("topic={} partition={} offset={} key={} value={}",
                record.topic(), record.partition(), record.offset(),
                record.key(), record.value());

            processRecord(record);
        }

        // Commit after processing the entire batch (at-least-once)
        consumer.commitSync();

        // Or async commit for higher throughput (at-least-once, no blocking)
        consumer.commitAsync((offsets, exception) -> {
            if (exception != null) log.error("Commit failed", exception);
        });
    }
} finally {
    consumer.commitSync(); // final commit before shutdown
    consumer.close();
}
```

### Manual Per-Partition Offset Commit

```java
Map<TopicPartition, OffsetAndMetadata> offsets = new HashMap<>();
for (ConsumerRecord<String, String> record : records) {
    processRecord(record);
    offsets.put(
        new TopicPartition(record.topic(), record.partition()),
        new OffsetAndMetadata(record.offset() + 1) // commit NEXT offset to read
    );
}
consumer.commitSync(offsets);
```

### `auto.offset.reset`

| Value | Behaviour |
|-------|-----------|
| `earliest` | Start from the beginning of the log (useful for new consumer groups) |
| `latest` | Start from now — only new messages after consumer started |
| `none` | Throw exception if no committed offset found |

---

## Delivery Guarantees

### At-Most-Once
```java
// Commit BEFORE processing — message may be lost if processing fails
consumer.commitSync();
processRecord(record);
```

### At-Least-Once (most common)
```java
// Process THEN commit — message may be reprocessed if commit fails
processRecord(record);
consumer.commitSync();
// → Consumer must be idempotent
```

### Exactly-Once (Kafka Transactions)
```java
// Producer side
props.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
props.put(ProducerConfig.TRANSACTIONAL_ID_CONFIG, "order-processor-1"); // unique per instance

producer.initTransactions();
try {
    producer.beginTransaction();
    producer.send(new ProducerRecord<>("payments", key, value));
    producer.send(new ProducerRecord<>("audit", key, auditValue));

    // Commit consumer offsets atomically with the producer transaction
    producer.sendOffsetsToTransaction(
        Map.of(new TopicPartition("orders", 0), new OffsetAndMetadata(offset + 1)),
        consumer.groupMetadata()
    );

    producer.commitTransaction();
} catch (Exception e) {
    producer.abortTransaction();
    throw e;
}
```

::: tip When to Use Exactly-Once
Exactly-once has performance overhead. Use it for financial transactions, inventory updates, and other scenarios where duplicates have real consequences. For most event notifications, at-least-once + idempotent consumers is simpler and sufficient.
:::

---

## Important Configurations

### Producer

| Config | Recommended Value | Why |
|--------|------------------|-----|
| `acks` | `all` | Maximum durability |
| `enable.idempotence` | `true` | Prevents duplicate sends on retry |
| `retries` | `Integer.MAX_VALUE` | Let `delivery.timeout.ms` control give-up |
| `delivery.timeout.ms` | `120000` (2 min) | Total time to give up on a send |
| `max.in.flight.requests.per.connection` | `5` (with idempotence) | Ordering guaranteed by idempotent producer |
| `compression.type` | `snappy` or `lz4` | Reduces network + disk I/O |
| `batch.size` | `65536` (64 KB) | Larger batches = better throughput |
| `linger.ms` | `5`–`20` | Wait to fill batch; 0 = send immediately |

### Consumer

| Config | Recommended Value | Why |
|--------|------------------|-----|
| `enable.auto.commit` | `false` | Manual control over at-least-once |
| `auto.offset.reset` | `earliest` | New groups start from beginning |
| `max.poll.records` | `500` | Messages per poll; tune to processing speed |
| `max.poll.interval.ms` | `300000` (5 min) | Max time between polls before kicked from group |
| `session.timeout.ms` | `45000` | Heartbeat timeout — mark consumer dead |
| `heartbeat.interval.ms` | `3000` | Should be ≤ 1/3 of session.timeout |
| `fetch.min.bytes` | `1024` | Wait for at least 1 KB before returning |
| `fetch.max.wait.ms` | `500` | Max wait if fetch.min.bytes not met |

### Topic

| Config | Value | Why |
|--------|-------|-----|
| `retention.ms` | `604800000` (7 days) | Default retention |
| `retention.bytes` | `-1` (unlimited) | Cap size per partition if needed |
| `min.insync.replicas` | `2` | Require 2 ISR with acks=all |
| `cleanup.policy` | `delete` or `compact` | delete = time/size based; compact = keep latest per key |

---

## Log Compaction

Compaction keeps the **latest value per key** — older messages with the same key are removed. The log is never fully deleted (unlike time/size retention).

```
Before compaction:
  offset 0: key=user-1, value={"name":"Alice"}
  offset 1: key=user-2, value={"name":"Bob"}
  offset 2: key=user-1, value={"name":"Alice Smith"}  ← update
  offset 3: key=user-1, value=null                    ← tombstone (delete)

After compaction:
  offset 1: key=user-2, value={"name":"Bob"}          ← kept (no newer)
  offset 3: key=user-1, value=null                    ← tombstone (kept briefly, then removed)
```

```bash
# Enable log compaction
kafka-topics.sh --create --topic user-profiles \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.1 \
  --config segment.ms=3600000
```

**Use cases:** Change Data Capture (CDC), materialised views, KTable state stores.

---

## Kafka Connect

Kafka Connect is a framework for streaming data between Kafka and external systems without writing consumer/producer code.

```
Database ──[Source Connector]──▶ Kafka ──[Sink Connector]──▶ Elasticsearch
                                                          ──▶ S3 / BigQuery
                                                          ──▶ Another DB
```

Common connectors: Debezium (CDC from MySQL/Postgres), JDBC Source/Sink, S3 Sink, BigQuery Sink, Elasticsearch Sink.

---

## Interview Quick-Fire

**Q: Why are partitions the unit of parallelism?**
A partition can only be consumed by one consumer per group. To increase throughput, add more partitions + more consumers. You can't have more active consumers than partitions.

**Q: What happens if a consumer doesn't poll within `max.poll.interval.ms`?**
Kafka considers it dead and triggers a rebalance, reassigning its partitions. The in-flight messages are redelivered to another consumer.

**Q: How does the idempotent producer prevent duplicates?**
Each producer gets a unique PID. Each message gets a sequence number per partition. Brokers detect and reject duplicate sequence numbers, even across retries.

**Q: What's the difference between `auto.offset.reset=earliest` vs `latest`?**
`earliest` — when no committed offset exists, start from offset 0 (replay all). `latest` — start from the latest offset at subscription time (skip history). Committed offsets always take precedence over this setting.

**Q: When would you use log compaction?**
When you need the latest state per key: user profiles, product catalogue, CDC snapshots. Compaction gives you an eventually-consistent view of the latest value per key with no time expiry.

**Q: What is the ISR and why does it matter?**
In-Sync Replicas — replicas that are fully caught up to the leader. `acks=all` waits for all ISR to acknowledge. `min.insync.replicas` ensures a minimum number of replicas confirm writes, preventing data loss if the leader fails immediately after a write.

<RelatedTopics :topics="['/messaging/spring-kafka', '/messaging/kafka-streams', '/messaging/index']" />

[→ Back to Messaging Overview](/messaging/)
