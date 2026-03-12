---
title: Spring Kafka
description: Spring Kafka — KafkaTemplate, @KafkaListener, error handling, retry with backoff, dead-letter topics, transactions, Avro/Schema Registry, and testing
category: messaging
pageClass: layout-messaging
difficulty: advanced
tags: [spring-kafka, kafka, kafkatemplate, kafkalistener, error-handling, transactions, testing]
related:
  - /messaging/kafka-core
  - /messaging/kafka-streams
  - /spring/spring-boot
estimatedMinutes: 35
---

# Spring Kafka

<DifficultyBadge level="advanced" />

Spring Kafka wraps the raw Kafka client with Spring idioms: auto-configuration, annotation-driven listeners, template-based publishing, and deep integration with Spring's error handling and transaction management.

---

## Dependencies

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka</artifactId>
    <!-- version managed by Spring Boot BOM -->
</dependency>
```

---

## Configuration

```yaml
# application.yml
spring:
  kafka:
    bootstrap-servers: kafka1:9092,kafka2:9092

    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
      acks: all
      properties:
        enable.idempotence: true
        max.in.flight.requests.per.connection: 5
        compression.type: snappy
        linger.ms: 5
        batch.size: 65536

    consumer:
      group-id: order-service
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.springframework.kafka.support.serializer.JsonDeserializer
      auto-offset-reset: earliest
      enable-auto-commit: false
      max-poll-records: 500
      properties:
        spring.json.trusted.packages: "com.myapp.events"
        max.poll.interval.ms: 300000

    listener:
      ack-mode: MANUAL_IMMEDIATE   # manual ack
      concurrency: 3               # 3 listener threads per container
      missing-topics-fatal: false  # don't fail startup if topic doesn't exist
```

---

## KafkaTemplate (Producer)

```java
@Service
public class OrderEventPublisher {

    private final KafkaTemplate<String, OrderEvent> kafkaTemplate;

    // Send to specific topic
    public void publishOrderCreated(OrderEvent event) {
        kafkaTemplate.send("orders", event.getUserId(), event);  // topic, key, value
    }

    // Send with callback
    public void publishWithCallback(OrderEvent event) {
        CompletableFuture<SendResult<String, OrderEvent>> future =
            kafkaTemplate.send("orders", event.getUserId(), event);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("Failed to publish order {}", event.getId(), ex);
            } else {
                RecordMetadata metadata = result.getRecordMetadata();
                log.debug("Published order {} to {}-{} @ offset {}",
                    event.getId(), metadata.topic(), metadata.partition(), metadata.offset());
            }
        });
    }

    // Send with headers (tracing, event type, schema version)
    public void publishWithHeaders(OrderEvent event) {
        ProducerRecord<String, OrderEvent> record =
            new ProducerRecord<>("orders", null, event.getUserId(), event);
        record.headers()
            .add("eventType", "ORDER_CREATED".getBytes())
            .add("version", "v2".getBytes())
            .add("traceId", MDC.get("traceId").getBytes());
        kafkaTemplate.send(record);
    }

    // Send and wait (synchronous — only for tests or critical paths)
    public void publishSync(OrderEvent event) throws Exception {
        kafkaTemplate.send("orders", event.getUserId(), event).get(10, TimeUnit.SECONDS);
    }
}
```

---

## @KafkaListener (Consumer)

### Basic Listener

```java
@Component
public class OrderEventListener {

    @KafkaListener(
        topics = "orders",
        groupId = "payment-service",            // overrides spring.kafka.consumer.group-id
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void handleOrder(
            @Payload OrderEvent event,
            @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset,
            Acknowledgment ack) {

        log.info("Received from {}-{} @ {}: {}", topic, partition, offset, event.getId());
        try {
            paymentService.process(event);
            ack.acknowledge();                  // commit offset after successful processing
        } catch (TransientException e) {
            // Don't ack — let error handler retry
            throw e;
        }
    }
}
```

### Batch Listener

```java
@KafkaListener(topics = "orders", batch = "true")
public void handleBatch(
        List<OrderEvent> events,
        List<ConsumerRecord<String, OrderEvent>> records,
        Acknowledgment ack) {

    log.info("Processing batch of {} events", events.size());

    for (OrderEvent event : events) {
        processEvent(event);
    }

    ack.acknowledge(); // ack entire batch
}
```

### Multi-Topic + Partition Assignment

```java
@KafkaListener(
    topicPartitions = {
        @TopicPartition(topic = "orders-eu", partitions = {"0", "1"}),
        @TopicPartition(topic = "orders-us", partitionOffsets = {
            @PartitionOffset(partition = "0", initialOffset = "0")  // start from beginning
        })
    },
    groupId = "analytics-service"
)
public void handleRegionalOrders(ConsumerRecord<String, OrderEvent> record) {
    // ...
}
```

---

## Listener Container Factory (Java Config)

```java
@Configuration
public class KafkaConsumerConfig {

    @Bean
    public ConsumerFactory<String, OrderEvent> consumerFactory() {
        Map<String, Object> props = new HashMap<>();
        props.put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka1:9092");
        props.put(ConsumerConfig.GROUP_ID_CONFIG, "payment-service");
        props.put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest");
        props.put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false);
        props.put(ConsumerConfig.MAX_POLL_RECORDS_CONFIG, 500);

        JsonDeserializer<OrderEvent> deserializer = new JsonDeserializer<>(OrderEvent.class);
        deserializer.addTrustedPackages("com.myapp.events");
        deserializer.setUseTypeMapperForKey(false);

        return new DefaultKafkaConsumerFactory<>(props,
            new StringDeserializer(), deserializer);
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<String, OrderEvent>
            kafkaListenerContainerFactory(
                ConsumerFactory<String, OrderEvent> consumerFactory,
                DefaultErrorHandler errorHandler) {

        ConcurrentKafkaListenerContainerFactory<String, OrderEvent> factory =
            new ConcurrentKafkaListenerContainerFactory<>();
        factory.setConsumerFactory(consumerFactory);
        factory.setConcurrency(3);                        // 3 threads = 3 partitions consumed in parallel
        factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}
```

---

## Error Handling

### DefaultErrorHandler (Spring Kafka 2.8+)

```java
@Bean
public DefaultErrorHandler errorHandler(KafkaTemplate<String, Object> template) {

    // Retry up to 3 times with exponential backoff
    ExponentialBackOffWithMaxRetries backOff = new ExponentialBackOffWithMaxRetries(3);
    backOff.setInitialInterval(1_000L);   // 1s
    backOff.setMultiplier(2.0);           // 1s, 2s, 4s
    backOff.setMaxInterval(10_000L);      // cap at 10s

    // Send to dead-letter topic after exhausting retries
    DeadLetterPublishingRecoverer recoverer = new DeadLetterPublishingRecoverer(template,
        (record, ex) -> {
            // Route to <original-topic>.DLT
            return new TopicPartition(record.topic() + ".DLT", record.partition());
        });

    DefaultErrorHandler handler = new DefaultErrorHandler(recoverer, backOff);

    // Don't retry these — send straight to DLT
    handler.addNotRetryableExceptions(
        DeserializationException.class,
        ValidationException.class
    );

    return handler;
}
```

### Dead Letter Topic Listener

```java
@KafkaListener(topics = "orders.DLT", groupId = "orders-dlt-handler")
public void handleDlt(
        @Payload OrderEvent event,
        @Header(KafkaHeaders.RECEIVED_TOPIC) String topic,
        @Header(KafkaHeaders.EXCEPTION_MESSAGE) String exceptionMessage,
        @Header(KafkaHeaders.EXCEPTION_STACKTRACE) String stackTrace) {

    log.error("DLT message from {}: {} — exception: {}", topic, event, exceptionMessage);
    alertingService.sendAlert(event, exceptionMessage);
    // Optionally: store for manual replay or human review
}
```

### Non-Retryable vs Retryable Exceptions

```java
// Mark exception as non-retryable (send to DLT immediately)
public class DataValidationException extends RuntimeException {
    // Spring Kafka checks if exception is in notRetryableExceptions list
}

// Mark exception as retryable (allow handler backoff)
public class ExternalServiceException extends RuntimeException {
    // Will be retried according to backoff policy
}
```

---

## Transactions

Kafka transactions allow atomic writes across multiple topics, and optionally consuming + producing atomically (exactly-once).

### Producer-Only Transactions

```java
// application.yml
spring:
  kafka:
    producer:
      transaction-id-prefix: order-service-  # enables transactions

@Service
public class OrderService {

    @Autowired KafkaTemplate<String, Object> kafkaTemplate;

    @Transactional("kafkaTransactionManager")  // Spring manages begin/commit/rollback
    public void processOrder(OrderRequest request) {
        Order order = orderRepository.save(new Order(request));           // DB write
        kafkaTemplate.send("orders",  order.getId(), new OrderCreated(order));  // Kafka write
        kafkaTemplate.send("audit",   order.getId(), new AuditEvent(order));    // Kafka write
        // If any write fails → both Kafka sends are rolled back
    }
}
```

### Consuming + Producing (Exactly-Once)

```java
@Bean
public ConcurrentKafkaListenerContainerFactory<String, OrderEvent> eosFactory(
        ConsumerFactory<String, OrderEvent> cf,
        KafkaTemplate<String, Object> template) {

    ConcurrentKafkaListenerContainerFactory<String, OrderEvent> factory =
        new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(cf);
    factory.getContainerProperties().setEosDeferredCommits(true);  // exactly-once
    factory.getContainerProperties().setKafkaAwareTransactionManager(
        (KafkaTransactionManager<?, ?>) template.getProducerFactory().getTransactionManager()
    );
    return factory;
}

@KafkaListener(topics = "orders", containerFactory = "eosFactory")
@Transactional
public void processExactlyOnce(OrderEvent event, Acknowledgment ack) {
    // Consume + produce atomically: offset committed only if produce succeeds
    PaymentEvent payment = paymentService.process(event);
    kafkaTemplate.send("payments", event.getUserId(), payment);
    // offset committed atomically with the kafka send
}
```

---

## JSON Serialization with Type Info

```java
// Producer — embed type info in header
@Bean
public ProducerFactory<String, Object> producerFactory() {
    Map<String, Object> props = new HashMap<>(/* base config */);

    JsonSerializer<Object> serializer = new JsonSerializer<>();
    serializer.setAddTypeInfo(true);  // adds __TypeId__ header

    return new DefaultKafkaProducerFactory<>(props,
        new StringSerializer(), serializer);
}

// Consumer — use type header for deserialization
@Bean
public ConsumerFactory<String, Object> consumerFactory() {
    JsonDeserializer<Object> deserializer = new JsonDeserializer<>();
    deserializer.addTrustedPackages("com.myapp.events");
    deserializer.setUseTypeHeaders(true);

    // Map type names to classes (handles refactoring)
    deserializer.setTypeMapper(new DefaultJackson2JavaTypeMapper() {{
        setTypePrecedence(TypePrecedence.TYPE_ID);
        addTrustedPackages("com.myapp.events");
    }});

    return new DefaultKafkaConsumerFactory<>(props, new StringDeserializer(), deserializer);
}
```

---

## Avro + Schema Registry

```xml
<dependency>
    <groupId>io.confluent</groupId>
    <artifactId>kafka-avro-serializer</artifactId>
    <version>7.6.0</version>
</dependency>
```

```yaml
spring:
  kafka:
    producer:
      value-serializer: io.confluent.kafka.serializers.KafkaAvroSerializer
    consumer:
      value-deserializer: io.confluent.kafka.serializers.KafkaAvroDeserializer
    properties:
      schema.registry.url: http://schema-registry:8081
      specific.avro.reader: true   # deserialize to generated Avro class
```

```java
// Generated from Avro schema, or use @AvroMeta
OrderEvent event = OrderEvent.newBuilder()
    .setOrderId("ord-123")
    .setUserId("usr-456")
    .setAmount(99.99)
    .build();

kafkaTemplate.send("orders", event.getUserId(), event);
```

---

## Testing

```xml
<dependency>
    <groupId>org.springframework.kafka</groupId>
    <artifactId>spring-kafka-test</artifactId>
    <scope>test</scope>
</dependency>
```

### Embedded Kafka

```java
@SpringBootTest
@EmbeddedKafka(
    partitions = 3,
    brokerProperties = {
        "listeners=PLAINTEXT://localhost:9092",
        "log.dir=/tmp/embedded-kafka"
    },
    topics = {"orders", "orders.DLT"}
)
class OrderEventListenerTest {

    @Autowired KafkaTemplate<String, OrderEvent> kafkaTemplate;
    @Autowired OrderRepository orderRepository;

    @Test
    void shouldProcessOrderEvent() throws Exception {
        OrderEvent event = new OrderEvent("ord-123", "usr-456", 99.99);
        kafkaTemplate.send("orders", event.getUserId(), event).get();

        // Wait for listener to process (poll-based — needs a moment)
        await().atMost(10, SECONDS).untilAsserted(() ->
            assertThat(orderRepository.findByOrderId("ord-123")).isPresent()
        );
    }
}
```

### KafkaTestUtils

```java
// Consume N records for assertion
ConsumerRecords<String, OrderEvent> records = KafkaTestUtils.getRecords(consumer);
assertThat(records).hasSize(1);
assertThat(records.iterator().next().value().getOrderId()).isEqualTo("ord-123");

// Check DLT received the message
ConsumerRecords<String, ?> dltRecords = KafkaTestUtils.getRecords(dltConsumer);
assertThat(dltRecords).hasSize(1);
```

### Mock listener for unit testing

```java
@ExtendWith(MockitoExtension.class)
class OrderEventListenerTest {

    @InjectMocks OrderEventListener listener;
    @Mock PaymentService paymentService;
    @Mock Acknowledgment ack;

    @Test
    void shouldAckOnSuccess() {
        OrderEvent event = new OrderEvent("ord-123", "usr-456", 99.99);
        listener.handleOrder(event, "orders", 0, 42L, ack);

        verify(paymentService).process(event);
        verify(ack).acknowledge();
    }

    @Test
    void shouldNotAckOnTransientError() {
        doThrow(new TransientException("db down")).when(paymentService).process(any());
        OrderEvent event = new OrderEvent("ord-123", "usr-456", 99.99);

        assertThatThrownBy(() -> listener.handleOrder(event, "orders", 0, 42L, ack))
            .isInstanceOf(TransientException.class);
        verify(ack, never()).acknowledge();
    }
}
```

---

## Listener Ack Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `RECORD` | Ack after each record | Simple cases |
| `BATCH` | Ack after each poll batch | Batch processing |
| `MANUAL_IMMEDIATE` | Ack when `Acknowledgment.acknowledge()` is called | Full control |
| `MANUAL` | Ack at next poll | Deferred commit |
| `COUNT` | Ack every N records | Periodic commit |
| `TIME` | Ack every N milliseconds | Periodic commit |

---

## Interview Quick-Fire

**Q: What's the difference between `MANUAL` and `MANUAL_IMMEDIATE` ack mode?**
`MANUAL_IMMEDIATE` commits the offset as soon as `ack.acknowledge()` is called. `MANUAL` queues the commit to happen at the next poll loop iteration. `MANUAL_IMMEDIATE` is safer (commit happens sooner); `MANUAL` batches commits for throughput.

**Q: How does `DefaultErrorHandler` decide between retry and DLT?**
It checks if the exception is in the `notRetryableExceptions` list — if yes, sends to DLT immediately. Otherwise, retries with the configured backoff. After exhausting retries, the `DeadLetterPublishingRecoverer` sends the original record to the DLT topic.

**Q: What does `enable.idempotence=true` do on the producer?**
Assigns a unique producer ID and sequence numbers per partition. Brokers deduplicate retried messages, preventing duplicates even when `retries > 0`. It also forces `acks=all` and limits in-flight requests.

**Q: How do you implement exactly-once in Spring Kafka?**
Set `transaction-id-prefix` on the producer (enables transactions), use `KafkaTransactionManager` in the listener container, and annotate the listener method with `@Transactional`. Offset commits are issued atomically with the producer transaction.

**Q: How do you test Kafka listeners without a real broker?**
Use `@EmbeddedKafka` from `spring-kafka-test`. It starts an in-process Kafka broker. Combine with `KafkaTestUtils.getRecords()` to assert what was produced, and `await()` (Awaitility) for async assertions.

<RelatedTopics :topics="['/messaging/kafka-core', '/messaging/kafka-streams', '/messaging/rabbitmq']" />

[→ Back to Messaging Overview](/messaging/)
