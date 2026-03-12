---
title: RabbitMQ
description: RabbitMQ fundamentals — exchanges, queues, bindings, routing, acknowledgements, dead-letter exchange, publisher confirms, prefetch, and Spring AMQP
category: messaging
pageClass: layout-messaging
difficulty: intermediate
tags: [rabbitmq, amqp, exchanges, queues, routing, spring-amqp, dead-letter, publisher-confirms]
related:
  - /messaging/kafka-core
  - /messaging/spring-kafka
  - /architecture/microservices
estimatedMinutes: 30
---

# RabbitMQ

<DifficultyBadge level="intermediate" />

RabbitMQ is a mature, feature-rich message broker implementing the AMQP 0-9-1 protocol. Unlike Kafka's persistent log model, RabbitMQ is a traditional broker: messages are pushed to consumers and deleted after acknowledgement.

---

## AMQP Model

```
Producer
  │
  ▼ publishes to
Exchange ──[binding + routing key]──▶ Queue ──▶ Consumer
```

| Component | Description |
|-----------|-------------|
| **Exchange** | Receives messages from producers and routes them to queues based on rules |
| **Queue** | Stores messages until consumed. Consumers subscribe to queues, not exchanges. |
| **Binding** | Rule connecting an exchange to a queue, optionally with a routing key |
| **Routing Key** | String attached to a message — exchange uses it (or not) to decide routing |
| **Virtual Host (vhost)** | Namespace — separate exchanges, queues, and permissions per vhost |

---

## Exchange Types

### Direct Exchange

Routes messages to queues whose binding key **exactly matches** the routing key.

```
Exchange: payments (type: direct)
  Binding: routing_key="card"    → queue: card-payments
  Binding: routing_key="paypal"  → queue: paypal-payments
  Binding: routing_key="crypto"  → queue: crypto-payments

Producer sends: routing_key="card" → goes to card-payments queue only
```

### Topic Exchange

Routes based on **wildcard pattern** matching against routing key segments (`.` separated).

```
Exchange: orders (type: topic)
  Binding: "orders.eu.*"      → queue: eu-orders
  Binding: "orders.*.premium" → queue: premium-orders
  Binding: "orders.#"         → queue: all-orders

# * matches exactly one word
# # matches zero or more words

Message routing_key="orders.eu.premium" →
  matches "orders.eu.*"      ✓ → eu-orders
  matches "orders.*.premium" ✓ → premium-orders
  matches "orders.#"         ✓ → all-orders
  (delivered to all three!)
```

### Fanout Exchange

**Ignores routing key** — broadcasts to all bound queues.

```
Exchange: notifications (type: fanout)
  Bound to: email-queue, sms-queue, push-queue

Any message to this exchange → delivered to all 3 queues
```

### Headers Exchange

Routes based on **message header attributes**, not routing key.

```java
Map<String, Object> headers = new HashMap<>();
headers.put("x-match", "all");      // "all" = AND, "any" = OR
headers.put("region", "eu");
headers.put("priority", "high");
// Queue receives message only if both region=eu AND priority=high
```

### Exchange Comparison

| Type | Routing Logic | Use Case |
|------|--------------|----------|
| **Direct** | Exact key match | Task queues, routing by type |
| **Topic** | Wildcard pattern | Event categorisation, multi-tenancy |
| **Fanout** | Broadcast to all | Notifications, cache invalidation |
| **Headers** | Header attribute matching | Complex routing without string keys |
| **Default** | Routes to queue named by routing key | Simple send-to-queue pattern |

---

## Queue Properties

```java
// Declare queue with properties
Map<String, Object> args = new HashMap<>();
args.put("x-message-ttl", 60000);          // messages expire after 60s
args.put("x-max-length", 10000);           // max 10k messages, oldest dropped when full
args.put("x-max-length-bytes", 10_000_000); // max 10 MB
args.put("x-overflow", "reject-publish");   // reject new messages when full (vs drop-head)
args.put("x-dead-letter-exchange", "dlx");  // DLX for expired/rejected/nacked messages
args.put("x-dead-letter-routing-key", "orders.dlq"); // optional DLX routing key
args.put("x-queue-type", "quorum");         // quorum queue (replicated, durable)

channel.queueDeclare(
    "orders",     // name
    true,         // durable — survives broker restart
    false,        // exclusive — only this connection
    false,        // auto-delete — delete when no consumers
    args
);
```

### Queue Types

| Type | Description | Use Case |
|------|-------------|----------|
| **Classic** | Original queue type — single-node or mirrored | Legacy, simple cases |
| **Quorum** | Raft-based replication, durable, preferred for HA | Production HA deployments |
| **Stream** | Persistent, replayable log (like Kafka topics) | Replay, audit, large history |

::: tip Use Quorum Queues in Production
Classic mirrored queues are deprecated. Quorum queues are the recommended HA queue type — they use Raft consensus, tolerate minority node failures, and have better data safety guarantees.
:::

---

## Message Acknowledgements

### Auto Ack (avoid in production)

```java
// Auto-ack: message removed from queue as soon as delivered (before processing)
channel.basicConsume("orders", true, deliverCallback, cancelCallback);
// Risk: if consumer crashes after delivery but before processing → message lost
```

### Manual Ack (recommended)

```java
channel.basicConsume("orders", false, (consumerTag, delivery) -> {
    try {
        processMessage(delivery.getBody());
        channel.basicAck(delivery.getEnvelope().getDeliveryTag(), false);
        //                                                         ^ multiple=false
    } catch (TransientException e) {
        // Nack + requeue — message goes back to the front of the queue
        channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, true);
        //                                                          ^ multiple ^ requeue
    } catch (PoisonPillException e) {
        // Nack without requeue — message goes to DLX (if configured) or is dropped
        channel.basicNack(delivery.getEnvelope().getDeliveryTag(), false, false);
    }
}, cancelCallback);
```

| Method | Behaviour |
|--------|-----------|
| `basicAck(tag, false)` | Ack single message |
| `basicAck(tag, true)` | Ack all unacked messages up to this tag |
| `basicNack(tag, false, true)` | Nack + requeue (redelivered) |
| `basicNack(tag, false, false)` | Nack without requeue → goes to DLX or dropped |
| `basicReject(tag, true/false)` | Same as nack but single message only |

---

## Dead Letter Exchange (DLX)

Messages are dead-lettered when:
- Nacked without requeue
- TTL expires
- Queue max-length exceeded (with `reject-publish` or `drop-head` + DLX)

```
orders queue ──(nack/expire/overflow)──▶ DLX exchange ──▶ orders.dlq queue
```

```java
// Setup via Spring AMQP
@Bean
public Queue ordersQueue() {
    return QueueBuilder.durable("orders")
        .withArgument("x-dead-letter-exchange", "dlx")
        .withArgument("x-dead-letter-routing-key", "orders.dlq")
        .withArgument("x-message-ttl", 300_000)  // 5 min TTL
        .build();
}

@Bean
public DirectExchange dlx() {
    return new DirectExchange("dlx", true, false);
}

@Bean
public Queue deadLetterQueue() {
    return QueueBuilder.durable("orders.dlq").build();
}

@Bean
public Binding dlxBinding() {
    return BindingBuilder.bind(deadLetterQueue()).to(dlx()).with("orders.dlq");
}
```

---

## Prefetch (QoS — Quality of Service)

Controls how many unacked messages a consumer can hold at once. Without prefetch, RabbitMQ dispatches all messages to a consumer at once (overwhelming it).

```java
// Raw AMQP
channel.basicQos(10);  // max 10 unacked messages per consumer

// Spring AMQP
spring:
  rabbitmq:
    listener:
      simple:
        prefetch: 10   # default is 250
```

```
No prefetch: Consumer A gets 1000 messages, Consumer B gets 0
              (unfair dispatch)

prefetch=10:  Consumer A gets 10 → processes → acks → gets 10 more
              Consumer B gets 10 → processes → acks → gets 10 more
              (fair dispatch)
```

::: tip Tuning Prefetch
Low prefetch (1–10): fair dispatch, useful when tasks have variable processing time.
High prefetch (100+): better throughput when tasks are fast and uniform.
:::

---

## Publisher Confirms

By default, `basicPublish` is fire-and-forget. Publisher confirms make publishing reliable.

```java
// Enable confirms on channel
channel.confirmSelect();

// Publish
channel.basicPublish(exchange, routingKey, props, body);

// Wait for confirm (synchronous — simple but slow)
if (!channel.waitForConfirms(5000)) {
    throw new RuntimeException("Message not confirmed by broker");
}

// Async confirms (higher throughput)
channel.addConfirmListener(
    (deliveryTag, multiple) -> log.debug("Confirmed: {}", deliveryTag),  // ack
    (deliveryTag, multiple) -> log.error("Nacked: {}", deliveryTag)      // nack
);
```

---

## Spring AMQP

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-amqp</artifactId>
</dependency>
```

```yaml
spring:
  rabbitmq:
    host: rabbitmq
    port: 5672
    username: guest
    password: guest
    virtual-host: /
    listener:
      simple:
        acknowledge-mode: manual
        prefetch: 10
        concurrency: 3       # 3 consumer threads
        max-concurrency: 10  # scale up to 10 under load
    publisher-confirms: correlated  # enable publisher confirms
    publisher-returns: true         # enable mandatory flag (return unroutable messages)
```

### Declare Infrastructure (Beans)

```java
@Configuration
public class RabbitConfig {

    @Bean
    public TopicExchange ordersExchange() {
        return ExchangeBuilder.topicExchange("orders")
            .durable(true)
            .build();
    }

    @Bean
    public Queue ordersEuQueue() {
        return QueueBuilder.durable("orders.eu")
            .withArgument("x-dead-letter-exchange", "dlx")
            .withArgument("x-message-ttl", 300_000)
            .build();
    }

    @Bean
    public Binding euBinding(Queue ordersEuQueue, TopicExchange ordersExchange) {
        return BindingBuilder.bind(ordersEuQueue)
            .to(ordersExchange)
            .with("orders.eu.#");
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();  // serialize/deserialize as JSON
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory cf,
                                          MessageConverter converter) {
        RabbitTemplate template = new RabbitTemplate(cf);
        template.setMessageConverter(converter);
        template.setConfirmCallback((correlationData, ack, cause) -> {
            if (!ack) log.error("Message not confirmed: {}", cause);
        });
        template.setReturnsCallback(returned ->
            log.error("Message returned: {} — {}", returned.getMessage(), returned.getReplyText())
        );
        return template;
    }
}
```

### RabbitTemplate (Producer)

```java
@Service
public class OrderPublisher {

    @Autowired RabbitTemplate rabbitTemplate;

    public void publishOrder(OrderEvent event) {
        // exchange, routing key, payload (auto-converted via MessageConverter)
        rabbitTemplate.convertAndSend("orders", "orders.eu.premium", event);
    }

    public void publishWithHeaders(OrderEvent event) {
        rabbitTemplate.convertAndSend("orders", "orders.eu", event, message -> {
            message.getMessageProperties().setHeader("eventType", "ORDER_CREATED");
            message.getMessageProperties().setHeader("version", "v2");
            message.getMessageProperties().setExpiration("60000"); // per-message TTL (ms)
            return message;
        });
    }

    // Request/Reply (RPC over RabbitMQ)
    public PriceResponse getPrice(PriceRequest request) {
        return (PriceResponse) rabbitTemplate.convertSendAndReceive(
            "pricing", "pricing.request", request);
    }
}
```

### @RabbitListener (Consumer)

```java
@Component
public class OrderEventListener {

    @RabbitListener(queues = "orders.eu")
    public void handleOrder(
            @Payload OrderEvent event,
            @Header(AmqpHeaders.DELIVERY_TAG) long deliveryTag,
            Channel channel) throws IOException {

        try {
            orderService.process(event);
            channel.basicAck(deliveryTag, false);
        } catch (TransientException e) {
            channel.basicNack(deliveryTag, false, true);  // requeue
        } catch (Exception e) {
            channel.basicNack(deliveryTag, false, false); // → DLX
        }
    }

    // Declare queue + exchange inline (creates if not exists)
    @RabbitListener(bindings = @QueueBinding(
        value = @Queue(value = "orders.us", durable = "true",
            arguments = @Argument(name = "x-dead-letter-exchange", value = "dlx")),
        exchange = @Exchange(value = "orders", type = ExchangeTypes.TOPIC),
        key = "orders.us.#"
    ))
    public void handleUsOrders(OrderEvent event, Acknowledgment ack) {
        orderService.process(event);
        ack.acknowledge();
    }

    // Batch listener
    @RabbitListener(queues = "orders.batch", containerFactory = "batchFactory")
    public void handleBatch(List<OrderEvent> events, Acknowledgment ack) {
        events.forEach(orderService::process);
        ack.acknowledge();
    }
}
```

### Retry with Spring Retry

```java
@Bean
public SimpleRabbitListenerContainerFactory retryContainerFactory(
        ConnectionFactory cf, MessageConverter converter) {

    SimpleRabbitListenerContainerFactory factory = new SimpleRabbitListenerContainerFactory();
    factory.setConnectionFactory(cf);
    factory.setMessageConverter(converter);
    factory.setAcknowledgeMode(AcknowledgeMode.AUTO);  // Spring manages ack/nack with retry

    // Spring Retry interceptor
    factory.setAdviceChain(RetryInterceptorBuilder.stateless()
        .maxAttempts(3)
        .backOffOptions(1000, 2.0, 10000)  // initial, multiplier, max (ms)
        .recoverer(new RejectAndDontRequeueRecoverer()) // send to DLX after exhausting
        .build());

    return factory;
}
```

---

## Patterns

### Work Queue (Competing Consumers)

```
Exchange (default/direct)
  └── orders queue ──▶ Consumer A ┐
                   ──▶ Consumer B ├ (each message goes to one consumer)
                   ──▶ Consumer C ┘
```

Multiple consumers on the same queue — messages are distributed (round-robin or by prefetch/ack speed). Used for task distribution / load balancing.

### Publish/Subscribe (Fanout)

```
Exchange (fanout)
  ├── email-queue   ──▶ Email Service
  ├── sms-queue     ──▶ SMS Service
  └── audit-queue   ──▶ Audit Service
```

### Request/Reply (RPC)

```
Client → request-queue → Server
Client ← reply-queue   ← Server

# Client includes replyTo + correlationId in message properties
```

---

## RabbitMQ vs Kafka Summary

| | RabbitMQ | Kafka |
|-|----------|-------|
| Message deletion | After ack | After retention period |
| Replay | No (by default) | Yes — seek to any offset |
| Ordering | Per queue, single consumer | Per partition |
| Routing | Flexible (exchange types) | By topic + key |
| Throughput | ~100k msg/s | ~1M msg/s |
| Stream processing | Not native | Kafka Streams |
| Complexity | Lower | Higher |
| Best for | Task queues, RPC, complex routing | High-throughput streams, event sourcing |

---

## Interview Quick-Fire

**Q: What is an exchange and why does it exist?**
Exchanges decouple producers from queues. A producer publishes to an exchange with a routing key; the exchange routes to queues based on bindings. Producers don't need to know which queues exist.

**Q: What's the difference between nack+requeue and nack without requeue?**
Nack+requeue returns the message to the queue — useful for transient errors (DB temporarily down). Nack without requeue routes to the dead-letter exchange (if configured) or drops the message — use for poison pills or permanent failures.

**Q: Why set a prefetch limit?**
Without prefetch, RabbitMQ pushes all available messages to the first consumer that connects, starving others. Prefetch limits how many unacked messages a consumer holds, enabling fair dispatch across multiple consumers.

**Q: When would you choose a Topic exchange over a Direct exchange?**
Direct when routing keys are fixed and exact. Topic when you need wildcard matching — e.g., routing by region + product line (`orders.eu.premium`), where multiple queues can subscribe to overlapping patterns.

**Q: What is a quorum queue and why prefer it over classic mirrored?**
Quorum queues use Raft consensus for replication — stronger safety guarantees, no split-brain, and they correctly handle minority node failures. Classic mirrored queues are deprecated and had issues with network partition handling.

**Q: How do publisher confirms differ from transactions?**
Publisher confirms are asynchronous — broker sends a `basic.ack` or `basic.nack` after durably writing the message. Transactions (`tx.select` / `tx.commit`) are synchronous and much slower (~250x overhead). Confirms are the recommended approach for reliable publishing.

<RelatedTopics :topics="['/messaging/kafka-core', '/messaging/spring-kafka', '/messaging/index']" />

[→ Back to Messaging Overview](/messaging/)
