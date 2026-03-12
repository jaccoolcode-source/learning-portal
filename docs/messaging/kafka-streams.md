---
title: Kafka Streams
description: Kafka Streams API — KStream, KTable, stateless and stateful operations, joins, windowing, state stores, interactive queries, and topologies
category: messaging
pageClass: layout-messaging
difficulty: advanced
tags: [kafka-streams, kstream, ktable, windowing, aggregations, joins, state-stores, topology]
related:
  - /messaging/kafka-core
  - /messaging/spring-kafka
estimatedMinutes: 35
---

# Kafka Streams

<DifficultyBadge level="advanced" />

Kafka Streams is a client library for building stream processing applications. It reads from Kafka, processes data, and writes results back to Kafka — no separate cluster needed (unlike Spark or Flink), it runs inside your application.

---

## Key Concepts

| Concept | Description |
|---------|-------------|
| **Topology** | Directed acyclic graph of stream processors (source → processor → sink) |
| **KStream** | Unbounded, append-only stream of records. Each record is an independent event. |
| **KTable** | Changelog stream — each record is an upsert. Represents the latest value per key. |
| **GlobalKTable** | KTable replicated to every instance (not partitioned). Used for broadcast lookups. |
| **State Store** | Local key-value store (RocksDB by default) for stateful operations. Backed by a changelog topic. |
| **Task** | Unit of work — one task per source partition. Distributed across instances. |
| **Stream Thread** | Thread that runs one or more tasks. |

### KStream vs KTable

```
KStream — event stream (every record matters)
  [user-1, click] [user-2, click] [user-1, click] [user-1, purchase]
  → Count clicks per user: 3 for user-1, 1 for user-2

KTable — changelog / state (latest value per key)
  [user-1, {name: "Alice"}] [user-1, {name: "Alice Smith"}]
  → user-1 is now {name: "Alice Smith"}  (previous overwritten)
```

---

## Project Setup

```xml
<dependency>
    <groupId>org.apache.kafka</groupId>
    <artifactId>kafka-streams</artifactId>
    <version>3.7.0</version>
</dependency>
```

```java
Properties props = new Properties();
props.put(StreamsConfig.APPLICATION_ID_CONFIG, "order-analytics");   // consumer group + changelog prefix
props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka1:9092");
props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
props.put(StreamsConfig.REPLICATION_FACTOR_CONFIG, 3);               // for internal topics
props.put(StreamsConfig.NUM_STREAM_THREADS_CONFIG, 4);               // parallelism within one instance
props.put(StreamsConfig.COMMIT_INTERVAL_MS_CONFIG, 1000);            // how often to commit state

StreamsBuilder builder = new StreamsBuilder();
// ... define topology ...
KafkaStreams streams = new KafkaStreams(builder.build(), props);
streams.start();

Runtime.getRuntime().addShutdownHook(new Thread(streams::close));
```

---

## Stateless Operations

```java
StreamsBuilder builder = new StreamsBuilder();

// Source
KStream<String, String> orders = builder.stream("orders");

// Filter
KStream<String, String> highValue = orders
    .filter((key, value) -> {
        OrderEvent event = parse(value);
        return event.getAmount() > 1000.0;
    });

// Map (change key or value)
KStream<String, OrderEvent> parsed = orders
    .mapValues(value -> objectMapper.readValue(value, OrderEvent.class));

KStream<String, OrderEvent> reKeyed = parsed
    .selectKey((key, event) -> event.getUserId()); // repartition by userId

// FlatMap (one record → many)
KStream<String, String> items = orders
    .flatMapValues(value -> {
        OrderEvent order = parse(value);
        return order.getItems().stream()
            .map(item -> item.getProductId())
            .collect(toList());
    });

// Branch (split stream)
Map<String, KStream<String, String>> branches = orders.split(Named.as("branch-"))
    .branch((key, value) -> parse(value).getStatus().equals("NEW"),    Named.as("new"))
    .branch((key, value) -> parse(value).getStatus().equals("SHIPPED"), Named.as("shipped"))
    .defaultBranch(Named.as("other"));

KStream<String, String> newOrders     = branches.get("branch-new");
KStream<String, String> shippedOrders = branches.get("branch-shipped");

// Peek (side effect, e.g. logging — does not modify stream)
orders.peek((key, value) -> log.info("Processing order: {}", key));

// Sink
highValue.to("high-value-orders");
parsed.to("orders-parsed",
    Produced.with(Serdes.String(), orderEventSerde));
```

---

## Stateful Operations — Aggregations

Stateful operations maintain state in a local **state store**, backed by a changelog Kafka topic.

### Count

```java
KStream<String, OrderEvent> orders = builder
    .stream("orders", Consumed.with(Serdes.String(), orderEventSerde))
    .selectKey((k, v) -> v.getUserId());  // group by userId

KTable<String, Long> orderCountPerUser = orders
    .groupByKey()
    .count(Materialized.as("order-count-store")); // named store for interactive queries

// Sink the KTable back to a topic
orderCountPerUser.toStream().to("user-order-counts",
    Produced.with(Serdes.String(), Serdes.Long()));
```

### Aggregate

```java
KTable<String, Double> revenuePerUser = orders
    .groupByKey()
    .aggregate(
        () -> 0.0,                                          // initializer
        (userId, event, total) -> total + event.getAmount(), // aggregator
        Materialized.<String, Double, KeyValueStore<Bytes, byte[]>>as("revenue-store")
            .withValueSerde(Serdes.Double())
    );
```

### Reduce

```java
// Reduce — same type as input
KTable<String, OrderEvent> latestOrderPerUser = orders
    .groupByKey()
    .reduce((existing, newOrder) ->
        newOrder.getTimestamp().isAfter(existing.getTimestamp()) ? newOrder : existing
    );
```

---

## Windowed Operations

Windows group records by time for aggregation over a time period.

### Tumbling Windows (fixed, non-overlapping)

```java
// Count orders per user per 1-minute window
KTable<Windowed<String>, Long> ordersPerMinute = orders
    .groupByKey()
    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofMinutes(1)))
    .count(Materialized.as("orders-per-minute"));

// Emit window results as a stream
ordersPerMinute.toStream()
    .map((windowedKey, count) -> {
        String userId = windowedKey.key();
        long windowStart = windowedKey.window().start();
        long windowEnd   = windowedKey.window().end();
        return KeyValue.pair(userId, String.format("%d orders %d-%d", count, windowStart, windowEnd));
    })
    .to("order-rate");
```

### Hopping Windows (fixed size, overlapping)

```java
// 5-minute windows, advancing every 1 minute (each event appears in 5 windows)
TimeWindows hoppingWindow = TimeWindows
    .ofSizeWithNoGrace(Duration.ofMinutes(5))
    .advanceBy(Duration.ofMinutes(1));

orders.groupByKey()
    .windowedBy(hoppingWindow)
    .count();
```

### Session Windows (activity-based, variable size)

```java
// Group activity bursts separated by gaps > 30 minutes
SessionWindows sessionWindows = SessionWindows.ofInactivityGapWithNoGrace(Duration.ofMinutes(30));

orders.groupByKey()
    .windowedBy(sessionWindows)
    .count();
```

### Window Types Comparison

| Type | Size | Overlap | Gap | Use Case |
|------|------|---------|-----|----------|
| **Tumbling** | Fixed | No | No | Fixed-period metrics (per minute) |
| **Hopping** | Fixed | Yes | No | Moving averages |
| **Session** | Variable | No | Inactivity gap | User session analytics |
| **Sliding** | Fixed | Yes | No | Events within N ms of each other |

### Grace Period (Late Arrivals)

```java
// Allow late records up to 30 seconds after window close
TimeWindows window = TimeWindows
    .ofSizeAndGrace(Duration.ofMinutes(1), Duration.ofSeconds(30));
```

---

## Joins

### KStream–KStream Join (windowed)

Both sides must arrive within the join window.

```java
KStream<String, OrderEvent> orders   = builder.stream("orders");
KStream<String, PaymentEvent> payments = builder.stream("payments");

KStream<String, String> enriched = orders.join(
    payments,
    (order, payment) -> String.format("order=%s payment=%s", order.getId(), payment.getId()),
    JoinWindows.ofTimeDifferenceWithNoGrace(Duration.ofMinutes(5)), // must arrive within 5 min
    StreamJoined.with(Serdes.String(), orderEventSerde, paymentEventSerde)
);
```

### KStream–KTable Join (non-windowed)

KTable represents current state; KStream looks up at event time.

```java
KStream<String, OrderEvent> orders = builder.stream("orders");
KTable<String, UserProfile> users   = builder.table("user-profiles");

KStream<String, EnrichedOrder> enriched = orders
    .selectKey((k, v) -> v.getUserId()) // repartition by userId to match KTable
    .join(users,
        (order, user) -> new EnrichedOrder(order, user.getName(), user.getEmail()),
        Joined.with(Serdes.String(), orderEventSerde, userProfileSerde)
    );
```

### KStream–GlobalKTable Join (no repartition needed)

GlobalKTable is replicated to all instances — use for small reference data.

```java
GlobalKTable<String, Product> products = builder.globalTable("products");

orders.join(products,
    (key, order) -> order.getProductId(),  // key extractor — maps order to product key
    (order, product) -> new EnrichedOrder(order, product.getName(), product.getPrice())
);
```

### Join Types

| Type | Missing left | Missing right | Use Case |
|------|-------------|--------------|----------|
| `join` (inner) | Skipped | Skipped | Both sides must exist |
| `leftJoin` | Skipped | null value | Emit even if right side missing |
| `outerJoin` | null key | null value | Emit for either side |

---

## State Stores

State stores are the local database of a Kafka Streams app. RocksDB by default, in-memory available.

```java
// Access state store directly (e.g., for REST query endpoint)
ReadOnlyKeyValueStore<String, Long> store = streams.store(
    StoreQueryParameters.fromNameAndType(
        "order-count-store",
        QueryableStoreTypes.keyValueStore()
    )
);

Long count = store.get("user-123");

// Range scan
KeyValueIterator<String, Long> all = store.range("user-100", "user-200");
while (all.hasNext()) {
    KeyValue<String, Long> kv = all.next();
    System.out.printf("%s → %d%n", kv.key, kv.value);
}
all.close();

// Windowed store
ReadOnlyWindowStore<String, Long> windowStore = streams.store(
    StoreQueryParameters.fromNameAndType(
        "orders-per-minute",
        QueryableStoreTypes.windowStore()
    )
);
WindowStoreIterator<Long> results = windowStore.fetch("user-123",
    Instant.now().minus(Duration.ofHours(1)), Instant.now());
```

### Custom State Store

```java
// Use in-memory store instead of RocksDB (for low-volume / testing)
Materialized.as(
    Stores.inMemoryKeyValueStore("my-store")
)
```

---

## Topology Introspection

```java
Topology topology = builder.build();
System.out.println(topology.describe());

// Output shows the processing graph:
// Sub-topology: 0
//   Source: KSTREAM-SOURCE-0000000000 (topics: [orders])
//     --> KSTREAM-FILTER-0000000001
//   Processor: KSTREAM-FILTER-0000000001
//     --> KSTREAM-SINK-0000000002
//   Sink: KSTREAM-SINK-0000000002 (topic: high-value-orders)
```

---

## Error Handling

```java
// Default: log and continue (skip the bad record)
props.put(StreamsConfig.DEFAULT_DESERIALIZATION_EXCEPTION_HANDLER_CLASS_CONFIG,
    LogAndContinueExceptionHandler.class);

// Or fail the task on deserialization error
props.put(StreamsConfig.DEFAULT_DESERIALIZATION_EXCEPTION_HANDLER_CLASS_CONFIG,
    LogAndFailExceptionHandler.class);

// Custom production exception handler (for write failures)
props.put(StreamsConfig.DEFAULT_PRODUCTION_EXCEPTION_HANDLER_CLASS_CONFIG,
    MyProductionExceptionHandler.class);

public class MyProductionExceptionHandler implements ProductionExceptionHandler {
    @Override
    public ProductionExceptionHandlerResponse handle(ProducerRecord<byte[], byte[]> record,
                                                      Exception exception) {
        log.error("Failed to produce record to {}", record.topic(), exception);
        if (exception instanceof RecordTooLargeException) {
            return ProductionExceptionHandlerResponse.CONTINUE; // skip oversized records
        }
        return ProductionExceptionHandlerResponse.FAIL;
    }
}
```

---

## Spring Boot Integration

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
</dependency>
```

```java
@Configuration
@EnableKafkaStreams
public class KafkaStreamsConfig {

    @Bean(name = KafkaStreamsDefaultConfiguration.DEFAULT_STREAMS_CONFIG_BEAN_NAME)
    public KafkaStreamsConfiguration streamsConfig() {
        Map<String, Object> props = new HashMap<>();
        props.put(StreamsConfig.APPLICATION_ID_CONFIG, "order-analytics");
        props.put(StreamsConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka1:9092");
        props.put(StreamsConfig.DEFAULT_KEY_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        props.put(StreamsConfig.DEFAULT_VALUE_SERDE_CLASS_CONFIG, Serdes.String().getClass());
        return new KafkaStreamsConfiguration(props);
    }
}

@Component
public class OrderAnalyticsTopology {

    @Autowired
    void buildTopology(StreamsBuilder builder) {
        builder.stream("orders", Consumed.with(Serdes.String(), Serdes.String()))
            .filter((k, v) -> v != null)
            .groupByKey()
            .count(Materialized.as("order-count-store"))
            .toStream()
            .to("order-counts");
    }
}
```

---

## Interview Quick-Fire

**Q: What's the difference between KStream and KTable?**
KStream is an event stream — every record is an independent event. KTable is a changelog — each record upserts the latest value for a key, representing current state. Think KStream = append-only log, KTable = materialised view of latest values.

**Q: How does Kafka Streams handle state across multiple instances?**
State is partitioned the same way as the input topic. Each instance handles a subset of partitions and maintains local state for those partitions only. For interactive queries, instances can forward requests to the correct instance using the metadata API.

**Q: What is a state store changelog topic?**
A Kafka topic automatically created by Kafka Streams to back each state store. On restart or failover, the new instance replays the changelog to rebuild state. This makes state fault-tolerant.

**Q: When would you use GlobalKTable vs KTable?**
KTable is partitioned — each instance only holds its assigned partitions, so joining requires the stream to be co-partitioned. GlobalKTable is replicated to every instance — useful for small reference data (product catalogue, configuration) where you want to avoid repartitioning.

**Q: What's the difference between tumbling and hopping windows?**
Tumbling windows are non-overlapping — each event belongs to exactly one window. Hopping windows overlap — each event may appear in multiple windows. Hopping is used for sliding/rolling metrics like "orders in the last 5 minutes, checked every minute".

<RelatedTopics :topics="['/messaging/kafka-core', '/messaging/spring-kafka']" />

[→ Back to Messaging Overview](/messaging/)
