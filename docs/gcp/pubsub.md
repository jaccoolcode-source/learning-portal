---
title: Pub/Sub
description: Google Cloud Pub/Sub — topics, subscriptions, push vs pull, message ordering, dead-letter topics, at-least-once vs exactly-once, and Java client with Spring Cloud GCP
category: gcp
pageClass: layout-gcp
difficulty: intermediate
tags: [pubsub, gcp, messaging, event-driven, java, spring-cloud-gcp]
related:
  - /gcp/iam
  - /architecture/microservices
  - /concurrency/concurrent-utils
estimatedMinutes: 30
---

# Pub/Sub

<DifficultyBadge level="intermediate" />

Google Cloud Pub/Sub is a fully managed, serverless messaging service. It decouples producers from consumers, handles massive scale, and guarantees at-least-once delivery — all without managing brokers.

---

## Core Concepts

```
Publisher              Topic              Subscription         Subscriber
   App  ──publishes──▶ orders-topic ──▶  orders-sub-A  ──▶  Order Service A
                               │
                               └──────▶  orders-sub-B  ──▶  Audit Service B
```

| Concept | Description |
|---------|-------------|
| **Topic** | Named channel. Publishers write messages to a topic. |
| **Subscription** | Named view of a topic. Each subscription gets **all** messages independently. |
| **Message** | Data (bytes) + attributes (key-value metadata) + message ID + publish time |
| **Ack** | Subscriber confirms processing. Unacked messages are redelivered after `ackDeadline`. |
| **Ack Deadline** | Time subscriber has to process and ack a message (10s–600s, default 10s). Extend with `modifyAckDeadline`. |

::: tip Fan-out
One topic → multiple subscriptions = fan-out. Each subscription receives every message independently. This is how you implement the event-driven pattern of "process the same event in multiple ways."
:::

---

## Push vs Pull

### Pull (default)

Subscriber calls the API to receive messages. Subscriber controls the rate.

```
Subscriber → GET messages from Pub/Sub → process → ACK
```

- **Subscriber** manages the polling loop
- Better for **batch processing**, variable load
- Supports **streaming pull** (long-lived connection, messages streamed as they arrive)

### Push

Pub/Sub delivers messages to a subscriber-provided HTTPS endpoint.

```
Pub/Sub → POST https://my-service.com/pubsub-handler → Subscriber responds 200 (ack)
```

- No polling needed — Pub/Sub drives delivery
- Good for **serverless** (Cloud Run, Cloud Functions) — service wakes on push
- Endpoint must be publicly accessible and return `2xx` to ack
- Returns `non-2xx` or times out → Pub/Sub retries with exponential backoff

### Comparison

| | Pull | Push |
|-|------|------|
| Who initiates | Subscriber | Pub/Sub |
| Auth | Service account / ADC | OIDC token on push request |
| Throughput control | Subscriber controls | Pub/Sub controls |
| Best for | Batch, high-throughput | Cloud Run, Cloud Functions, webhooks |
| Endpoint needed | No | Yes (HTTPS) |

---

## Message Ordering

By default, Pub/Sub **does not guarantee order**. Messages from the same publisher may arrive out of order across different subscribers.

### Ordering Keys

Enable ordering at topic level, then publish with an **ordering key**:

```java
// All messages with the same ordering key are delivered in order
// to a given subscriber
PubsubMessage message = PubsubMessage.newBuilder()
    .setData(ByteString.copyFromUtf8(payload))
    .setOrderingKey("user-123")   // same key → guaranteed order for this user
    .build();
```

**Constraints:**
- Must enable `messageRetentionDuration` on the topic
- Subscription must have `enableMessageOrdering = true`
- If a message with ordering key fails and is nacked, Pub/Sub **pauses delivery** for that key until the failed message is acked or dead-lettered

---

## Dead-Letter Topics (DLQ)

If a subscriber repeatedly fails to process a message, it gets forwarded to a **dead-letter topic** after `maxDeliveryAttempts`.

```
Topic ──▶ Subscription
               │
               │ (after maxDeliveryAttempts failures)
               ▼
        Dead-Letter Topic ──▶ DLQ Subscription (inspect/alert/retry)
```

```java
// Configure dead-letter policy when creating a subscription (Java Admin client)
DeadLetterPolicy deadLetterPolicy = DeadLetterPolicy.newBuilder()
    .setDeadLetterTopic(ProjectTopicName.of(project, "orders-dead-letter").toString())
    .setMaxDeliveryAttempts(5)   // after 5 failed deliveries → DLQ
    .build();

Subscription subscription = Subscription.newBuilder()
    .setName(ProjectSubscriptionName.of(project, "orders-sub").toString())
    .setTopic(ProjectTopicName.of(project, "orders").toString())
    .setDeadLetterPolicy(deadLetterPolicy)
    .setAckDeadlineSeconds(60)
    .build();
```

---

## Delivery Guarantees

| Guarantee | Default | How |
|-----------|---------|-----|
| **At-least-once** | Yes | Messages redelivered until acked |
| **Exactly-once** | Optional | Enable `enableExactlyOnceDelivery` on subscription |
| **Ordering** | Optional | Enable `enableMessageOrdering` + use ordering keys |

Exactly-once delivery uses a server-side deduplication window. Your subscriber still needs idempotent processing as a safety net.

---

## Java Client — Publisher

```xml
<dependency>
  <groupId>com.google.cloud</groupId>
  <artifactId>google-cloud-pubsub</artifactId>
</dependency>
```

```java
import com.google.cloud.pubsub.v1.Publisher;
import com.google.pubsub.v1.*;

@Service
public class OrderPublisher implements DisposableBean {

    private final Publisher publisher;

    public OrderPublisher(@Value("${gcp.project-id}") String projectId,
                          @Value("${pubsub.topic.orders}") String topicId) throws IOException {
        TopicName topicName = TopicName.of(projectId, topicId);
        this.publisher = Publisher.newBuilder(topicName)
            .setBatchingSettings(BatchingSettings.newBuilder()
                .setElementCountThreshold(100L)          // batch up to 100 messages
                .setDelayThreshold(Duration.ofMillis(10)) // or flush every 10ms
                .setRequestByteThreshold(1_000_000L)     // or when batch hits 1MB
                .build())
            .build();
    }

    public void publishOrder(OrderEvent event) throws Exception {
        String json = objectMapper.writeValueAsString(event);
        PubsubMessage message = PubsubMessage.newBuilder()
            .setData(ByteString.copyFromUtf8(json))
            .putAttributes("eventType", "ORDER_CREATED")
            .putAttributes("version", "v1")
            .setOrderingKey(event.getUserId())   // optional — preserves per-user order
            .build();

        ApiFuture<String> future = publisher.publish(message);

        // Non-blocking callback
        ApiFutures.addCallback(future, new ApiFutureCallback<>() {
            @Override public void onSuccess(String messageId) {
                log.debug("Published message: {}", messageId);
            }
            @Override public void onFailure(Throwable t) {
                log.error("Failed to publish order event", t);
            }
        }, MoreExecutors.directExecutor());
    }

    @Override
    public void destroy() throws Exception {
        publisher.shutdown();
        publisher.awaitTermination(30, TimeUnit.SECONDS);
    }
}
```

---

## Java Client — Subscriber (Pull / Streaming Pull)

```java
import com.google.cloud.pubsub.v1.AckReplyConsumer;
import com.google.cloud.pubsub.v1.MessageReceiver;
import com.google.cloud.pubsub.v1.Subscriber;

@Component
public class OrderSubscriber implements SmartLifecycle {

    private Subscriber subscriber;
    private volatile boolean running = false;

    @PostConstruct
    public void init(@Value("${gcp.project-id}") String projectId,
                     @Value("${pubsub.subscription.orders}") String subscriptionId) {
        ProjectSubscriptionName subscriptionName =
            ProjectSubscriptionName.of(projectId, subscriptionId);

        MessageReceiver receiver = (PubsubMessage message, AckReplyConsumer consumer) -> {
            try {
                String payload = message.getData().toStringUtf8();
                String eventType = message.getAttributesOrDefault("eventType", "UNKNOWN");
                log.info("Received [{}]: {}", eventType, payload);

                processOrder(payload);

                consumer.ack();   // ack on success
            } catch (TransientException e) {
                consumer.nack();  // nack → Pub/Sub redelivers
            } catch (PoisonPillException e) {
                consumer.ack();   // ack poison pills — let DLQ handle via maxDeliveryAttempts
            }
        };

        this.subscriber = Subscriber.newBuilder(subscriptionName, receiver)
            .setFlowControlSettings(FlowControlSettings.newBuilder()
                .setMaxOutstandingElementCount(1000L)      // max messages in-flight
                .setMaxOutstandingRequestBytes(100_000_000L) // 100 MB
                .build())
            .setParallelPullCount(2)  // number of streaming pull streams
            .build();
    }

    @Override public void start() {
        subscriber.startAsync().awaitRunning();
        running = true;
    }

    @Override public void stop() {
        subscriber.stopAsync().awaitTerminated(30, TimeUnit.SECONDS);
        running = false;
    }

    @Override public boolean isRunning() { return running; }
}
```

---

## Spring Cloud GCP — Pub/Sub

Spring Cloud GCP wraps the raw client with Spring abstractions.

```xml
<dependency>
  <groupId>com.google.cloud</groupId>
  <artifactId>spring-cloud-gcp-starter-pubsub</artifactId>
</dependency>
```

```yaml
# application.yml
spring:
  cloud:
    gcp:
      project-id: my-project-id
      pubsub:
        subscriber:
          parallel-pull-count: 2
          flow-control:
            max-outstanding-element-count: 500
```

```java
// Publish
@Autowired PubSubTemplate pubSubTemplate;

pubSubTemplate.publish("orders-topic", payload, Map.of("eventType", "ORDER_CREATED"));

// Subscribe (annotation-driven)
@PubSubSubscriber("orders-sub")
public void handleOrder(ConvertedBasicAcknowledgeablePubsubMessage<OrderEvent> message) {
    OrderEvent event = message.getPayload();
    processOrder(event);
    message.ack();
}
```

---

## Message Schema

Pub/Sub supports schema validation on topics (Avro or Protocol Buffers). Invalid messages are rejected at publish time.

```java
// Create schema
Schema schema = Schema.newBuilder()
    .setType(Schema.Type.AVRO)
    .setDefinition(avroSchemaJson)
    .build();

// Attach to topic
Topic topic = Topic.newBuilder()
    .setName(topicName.toString())
    .setSchemaSettings(SchemaSettings.newBuilder()
        .setSchema(schemaName)
        .setEncoding(Encoding.JSON)
        .build())
    .build();
```

---

## BigQuery Subscription

Pub/Sub can write messages directly to BigQuery — no consumer code needed:

```
Publisher → Pub/Sub Topic → BigQuery Subscription → BigQuery Table
```

```java
// Create subscription that writes to BigQuery
BigQueryConfig bqConfig = BigQueryConfig.newBuilder()
    .setTable("my-project:dataset.table")
    .setWriteMetadata(true)  // include message_id, publish_time, attributes
    .build();

Subscription subscription = Subscription.newBuilder()
    .setName(subscriptionName)
    .setTopic(topicName)
    .setBigqueryConfig(bqConfig)
    .build();
```

Use case: event streaming pipeline without Dataflow.

---

## Common Patterns

### Retry with Exponential Backoff (nack)
Nack a message to redeliver. Pub/Sub applies exponential backoff. After `maxDeliveryAttempts`, message goes to DLQ.

### Fan-out
One topic, multiple subscriptions. Each subscription independently receives all messages. Used for: audit logging, search indexing, notifications — all triggered by the same event.

### Work Queue (Competing Consumers)
One topic, one subscription, multiple subscriber instances. Pub/Sub delivers each message to exactly one instance. Used for: horizontal scaling of workers.

### Event Sourcing
Publish every state change as an immutable event to Pub/Sub. Subscribers reconstruct state by replaying. Works well with BigQuery subscription for analytics.

---

## Interview Quick-Fire

**Q: What's the difference between a topic and a subscription?**
A topic is where publishers send messages. A subscription is a named consumer view of a topic — multiple subscriptions each independently receive every message.

**Q: How does Pub/Sub ensure at-least-once delivery?**
Messages are not deleted until acked. If ackDeadline expires without an ack, the message is redelivered. This means your consumers must be idempotent.

**Q: When would you use push vs pull?**
Push for serverless (Cloud Run/Functions) — the endpoint wakes on delivery. Pull for high-throughput batch consumers where you want to control the processing rate.

**Q: How do you handle poison pill messages?**
Configure a dead-letter topic with `maxDeliveryAttempts`. After N failures the message is forwarded to the DLQ where you can inspect, alert, or replay it.

**Q: How is Pub/Sub different from Kafka?**
Pub/Sub is fully managed — no brokers, partitions, or consumer groups to manage. Kafka gives you log compaction, consumer group semantics, and replay by offset. Pub/Sub supports message replay via snapshot, but Kafka's model is more flexible for complex streaming pipelines. Kafka on GCP can be run via Confluent Cloud or Managed Kafka.

<RelatedTopics :topics="['/gcp/iam', '/gcp/bigquery', '/architecture/microservices']" />

[→ Back to GCP Overview](/gcp/)
