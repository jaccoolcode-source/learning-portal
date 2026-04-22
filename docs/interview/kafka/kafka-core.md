# Kafka

**Q50 to Q52** · [← Kafka Overview](./index)

---

## Q50: Kafka Fundamentals

> Most candidates know "Kafka is a message queue." Seniors know it's a distributed log, can explain partitions and consumer groups, and understand why ordering guarantees are limited.

Kafka is a **distributed, append-only log**. Producers write records; consumers read them at their own pace. Records are not deleted on consumption — they are retained for a configurable period (default 7 days).

**Core concepts:**

| Concept | Description |
|---------|-------------|
| **Topic** | Named channel for a stream of records |
| **Partition** | A topic is split into N partitions — each is an ordered, immutable log |
| **Offset** | Sequential ID of a record within a partition |
| **Producer** | Writes records to a topic (chooses partition via key hash or round-robin) |
| **Consumer** | Reads records by tracking its committed offset |
| **Consumer Group** | Multiple consumers sharing the work — each partition is assigned to exactly one consumer in the group |
| **Broker** | A Kafka server node |
| **Replication** | Each partition has one leader + N replicas on other brokers |

```
Topic: orders  (3 partitions)

Partition 0: [msg0] [msg3] [msg6] ...
Partition 1: [msg1] [msg4] [msg7] ...
Partition 2: [msg2] [msg5] [msg8] ...

Consumer Group A (3 consumers):
  Consumer A1 → Partition 0
  Consumer A2 → Partition 1
  Consumer A3 → Partition 2

Consumer Group B (1 consumer):
  Consumer B1 → Partition 0, 1, 2  (reads all partitions)
```

::: details Full model answer

**Why Kafka is a log, not a queue:**
Traditional message queues (RabbitMQ, SQS) delete messages after consumption. Kafka retains all records — consumers track their own position (offset). This means:
- Multiple consumer groups can read the same data independently
- A consumer can re-read historical data (replay events to rebuild state)
- Consumers can pause and resume without losing messages

**Partitions — the unit of parallelism:**
A topic with N partitions can be consumed by at most N consumers in a group simultaneously. Each partition is fully ordered. Adding more partitions increases throughput but does NOT increase global ordering.

**Ordering guarantee:**
```
Ordering is guaranteed WITHIN a partition, NOT across partitions.
```

To guarantee that all events for a given order are processed in order, use the **order ID as the message key**. Kafka hashes the key to determine the partition — all messages with the same key land in the same partition.

```java
// Key-based routing — all events for orderId go to the same partition
kafkaTemplate.send("orders", orderId.toString(), orderEvent);
```

**Replication and fault tolerance:**
Each partition has one **leader** (handles all reads/writes) and N **replicas** (followers). If a leader broker fails, Kafka elects a new leader from the in-sync replicas (ISR). `replication.factor=3` is standard for production.

**Producer acknowledgment modes (`acks`):**
| `acks` | Durability | Latency |
|--------|-----------|---------|
| `0` | Fire-and-forget — no confirmation | Lowest |
| `1` | Leader acknowledged | Medium |
| `all` (or `-1`) | All ISR replicas acknowledged | Highest |

For production use `acks=all` with `min.insync.replicas=2`.

**Consumer offset management:**
Consumers commit their offset to Kafka's internal `__consumer_offsets` topic. After a crash/restart, they resume from the last committed offset.

```java
// Auto-commit (default — risky)
spring.kafka.consumer.enable-auto-commit=true
spring.kafka.consumer.auto-commit-interval=5000ms

// Manual commit (recommended for production)
spring.kafka.consumer.enable-auto-commit=false
```

With auto-commit, the offset is committed on a timer — if the consumer crashes between commit intervals, it re-processes those messages.

**Lag monitoring:**
Consumer lag = latest offset - consumer's committed offset. High lag = consumer is falling behind producers. Monitor via:
```bash
kafka-consumer-groups.sh --bootstrap-server localhost:9092 \
  --group my-group --describe
```
Or expose via Micrometer → Prometheus → alert if lag exceeds threshold.

**Spring Kafka basics:**
```java
@KafkaListener(topics = "orders", groupId = "order-processor",
               containerFactory = "kafkaListenerContainerFactory")
public void consume(OrderEvent event, Acknowledgment ack) {
    try {
        orderService.process(event);
        ack.acknowledge();          // manual commit after successful processing
    } catch (RetryableException e) {
        // don't ack — will be re-delivered
        throw e;
    } catch (NonRetryableException e) {
        ack.acknowledge();          // ack to skip — send to dead letter topic
        deadLetterProducer.send("orders.DLT", event);
    }
}
```

**Compacted topics:**
Special log-cleanup policy that retains only the **latest record per key**. Used for "last known state" scenarios — e.g., a topic of user profile updates where you only need the current profile, not the full history.

:::

> [!TIP] Golden Tip
> Emphasise that **ordering is per-partition, not per-topic** — and that the implication is you must route related messages to the same partition via a consistent key. The follow-on insight: adding partitions to an existing topic re-hashes the keys, which can break the ordering guarantee for in-flight messages. That's why partition count should be planned upfront (start high — 12–24 for production topics — you can't easily reduce it). This shows operational awareness beyond just "Kafka is fast."

**Follow-up questions:**
- How does Kafka guarantee ordering and what are the limitations?
- What is a consumer group and how does it enable parallel consumption?
- What is consumer lag and how do you monitor it?
- What is a compacted topic and when would you use one?

---

## Q51: Delivery Guarantees

> This is one of the most important Kafka interview topics. Know all three semantics, what can go wrong with each, and how exactly-once is achieved.

| Semantic | Description | Risk |
|----------|-------------|------|
| **At-most-once** | Message delivered 0 or 1 times | Loss: crash before processing → message never processed |
| **At-least-once** | Message delivered 1 or more times | Duplicates: crash after processing, before ack → message processed again |
| **Exactly-once** | Message delivered exactly once | Possible but expensive — requires transactions |

::: details Full model answer

**At-most-once:**
Commit the offset BEFORE processing. If the consumer crashes during processing, the offset is already committed — the message is never re-delivered.

```java
// At-most-once — dangerous for most use cases
consumer.commitSync();   // commit first
processMessage(record);  // if this crashes, message is lost
```

Use case: metrics/analytics where occasional data loss is acceptable.

**At-least-once:**
Process THEN commit. If the consumer crashes after processing but before committing, the message is re-delivered and processed again.

```java
// At-least-once — the default with manual commits
processMessage(record);   // process first
consumer.commitSync();    // then commit — if crash here, reprocessing happens
```

This is the default in most applications. The solution: **make all consumers idempotent** — processing the same message twice produces the same result.

Idempotency strategies:
- Database: use the Kafka offset or a message ID as a deduplication key
- Check-before-insert: `INSERT ... ON CONFLICT DO NOTHING`
- Idempotent state machine: processing an already-applied event is a no-op

**Exactly-once (EOS — Exactly-Once Semantics):**

Kafka supports EOS via two mechanisms:

**1. Idempotent Producer** (`enable.idempotence=true`):
Each producer is assigned a **Producer ID (PID)**. Each message gets a sequence number. The broker detects and deduplicates retried messages (same PID + sequence = duplicate). Prevents duplicates from producer retries.

```properties
spring.kafka.producer.properties.enable.idempotence=true
spring.kafka.producer.acks=all
spring.kafka.producer.retries=Integer.MAX_VALUE
```

**2. Transactional Producer + Consumer:**
Wraps produce + consume in a Kafka transaction. Either both the consumption AND the downstream produce are committed, or neither is.

```java
@Bean
public KafkaTransactionManager<String, String> kafkaTransactionManager(
        ProducerFactory<String, String> pf) {
    return new KafkaTransactionManager<>(pf);
}

// Producer config
spring.kafka.producer.transaction-id-prefix=tx-order-processor-

// Consumer: only read committed messages
spring.kafka.consumer.isolation.level=read_committed
```

EOS workflow:
```
1. Consumer reads message (offset not committed yet)
2. Producer opens Kafka transaction
3. Producer writes result to output topic
4. Kafka atomically commits: input offset + output message
5. Either all committed or all rolled back
```

**EOS limitations:**
- ~30–50% throughput reduction vs at-least-once
- Works only for Kafka→Kafka pipelines (produce + consume both in Kafka)
- Does NOT cover external side effects (DB writes, REST calls, email sends) — those need idempotency separately
- Increased broker load

**Dead Letter Topic (DLT):**
For non-retriable errors (poison pill messages that will never succeed), don't retry indefinitely — route to a dead letter topic.

```java
@Bean
public DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {
    DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template,
        (rec, ex) -> new TopicPartition(rec.topic() + ".DLT", rec.partition()));

    return new DefaultErrorHandler(recoverer,
        new FixedBackOff(1000L, 3));   // retry 3 times with 1s delay, then DLT
}
```

Monitor the DLT — unprocessed DLT messages mean data loss in the business flow. Alert and investigate.

**Practical recommendation:**
For most Spring Boot microservices:
- Use **at-least-once** with idempotent consumers
- Enable the **idempotent producer** (`enable.idempotence=true`) — it's free
- Use **transactional EOS** only for Kafka-to-Kafka streaming pipelines where exactly-once is a hard requirement (financial event streams, ledger replication)

:::

> [!TIP] Golden Tip
> The most important nuance: **exactly-once in Kafka only covers the Kafka pipeline itself, not external side effects**. If your consumer writes to a database or calls an external API, you still need idempotency there — Kafka transactions don't extend to your PostgreSQL write. Framing it as "Kafka EOS + idempotent external operations = end-to-end exactly-once" shows you understand the full picture. Most candidates think `enable.idempotence=true` solves everything — it doesn't; it only deduplicates producer retries.

**Follow-up questions:**
- What is the difference between at-least-once and exactly-once in Kafka?
- Does enabling `exactly-once` in Kafka guarantee exactly-once delivery to your database?
- What is a Dead Letter Topic and when should you use one?
- How do you implement idempotent Kafka consumers in Spring Boot?

---

## Q52: Kafka vs SQS vs SNS

> All three are messaging systems, but with different models. Know when to choose each.

| | Apache Kafka | AWS SQS | AWS SNS |
|--|-------------|---------|---------|
| **Model** | Distributed log (persistent) | Queue (point-to-point) | Pub/Sub (fan-out) |
| **Retention** | Days/weeks (configurable) | Up to 14 days (deleted on consume) | No storage — fire and forget |
| **Consumers** | Multiple independent consumer groups | One consumer group (competing consumers) | Multiple subscribers (push) |
| **Ordering** | Per-partition | FIFO queues (optional) | No ordering guarantee |
| **Throughput** | Millions msg/s | ~300K msg/s (FIFO: 3K/s) | ~300K msg/s |
| **Replay** | Yes — replay from any offset | No | No |
| **Managed** | Self-hosted or Confluent/MSK | Fully managed AWS | Fully managed AWS |

::: details Full model answer

**Apache Kafka — when to choose:**
- High-throughput event streaming (clickstreams, IoT, financial transactions)
- Event sourcing — you need to replay the full event history
- Multiple independent consumer groups reading the same data (audit log + analytics + notifications all from one topic)
- Stream processing (Kafka Streams, Apache Flink)
- Long retention required
- Cross-datacenter replication (MirrorMaker 2)

Costs: Operational complexity (or managed cost of Confluent/MSK), requires Zookeeper/KRaft cluster, more complex consumer offset management.

**Amazon SQS — when to choose:**
- Work queue / task distribution — distribute jobs to a pool of workers
- Decoupling microservices in AWS ecosystem — simple, serverless, zero ops
- Variable throughput — SQS auto-scales, no partition planning
- Lambda triggers — SQS + Lambda is a very common serverless pattern
- No need for replay or multiple independent consumers

SQS types:
- **Standard queue**: at-least-once, best-effort ordering, unlimited throughput
- **FIFO queue**: exactly-once, strict ordering, 3,000 msg/s (300 msg/s without batching)

```java
// Spring Cloud AWS SQS listener
@SqsListener("order-processing-queue")
public void processOrder(OrderEvent event) {
    orderService.process(event);
    // message auto-deleted after successful processing
}
```

**Amazon SNS — when to choose:**
- Fan-out: one event → multiple subscribers (SQS queues, Lambda functions, HTTP endpoints, email, SMS)
- Notifications and alerts
- SNS → SQS fan-out pattern for durable delivery:

```
SNS Topic: OrderPlaced
  ├── SQS: inventory-queue     → Inventory Service
  ├── SQS: notification-queue  → Notification Service
  └── Lambda: analytics        → Analytics
```

Each SQS queue gets its own copy — each service processes independently, at its own pace, with SQS durability.

**SNS + SQS fan-out pattern** is a standard AWS architecture for event-driven microservices: SNS handles the pub/sub fan-out; SQS provides durable, buffered consumption for each subscriber.

**Comparison table for interview:**

| Scenario | Best choice |
|----------|------------|
| High-throughput log ingestion | Kafka |
| Background job queue (resize images, send emails) | SQS |
| One event → notify 5 different services | SNS → SQS fan-out |
| Event replay / audit trail | Kafka |
| Serverless AWS architecture | SQS + Lambda |
| Stream processing (aggregations, joins) | Kafka Streams / Flink |
| Simple AWS cross-service decoupling | SQS |

**Amazon MSK (Managed Streaming for Kafka):**
Fully managed Kafka on AWS. You get Kafka semantics (replay, consumer groups, partitions) without managing brokers. Closer to Confluent Cloud but native to AWS IAM. Good choice when you need Kafka capabilities but don't want operational burden.

**Visibility timeout (SQS-specific):**
When a consumer receives an SQS message, it's hidden for the visibility timeout (default 30s). If the consumer doesn't delete it within that time, it becomes visible again and another consumer can pick it up. This implements at-least-once delivery. Set the timeout to at least 6× your average processing time.

:::

> [!TIP] Golden Tip
> The go-to answer for "how do you notify multiple services when an order is placed on AWS" is the **SNS → SQS fan-out pattern** — one SNS publish fans out to multiple SQS queues, each consumed independently. It's durable (SQS), scalable (each queue scales independently), and decoupled (SNS doesn't care who's subscribed). Knowing this pattern — and distinguishing it from Kafka's consumer groups approach to the same problem — shows real AWS architectural experience.

**Follow-up questions:**
- What is the difference between Kafka and SQS from a consumer model perspective?
- When would you choose Kafka over SQS in an AWS environment?
- What is the SNS + SQS fan-out pattern and what problem does it solve?
- What is the SQS visibility timeout and what happens if processing exceeds it?
