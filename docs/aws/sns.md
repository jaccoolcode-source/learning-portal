---
title: AWS SNS
description: Amazon SNS — topics, subscriptions, fan-out pattern, message filtering, and SNS + SQS integration
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, sns, topics, subscriptions, fan-out, pub-sub, messaging]
estimatedMinutes: 20
---

# AWS SNS

<DifficultyBadge level="intermediate" />

Amazon Simple Notification Service (SNS) is a fully managed pub/sub messaging service. Producers publish to a **topic**; SNS fans out to all subscribers simultaneously.

---

## Architecture

```
Publisher
    │
    ▼
SNS Topic
    ├── Subscriber: SQS Queue (order-processing)
    ├── Subscriber: SQS Queue (notification-service)
    ├── Subscriber: Lambda (audit-logger)
    ├── Subscriber: HTTP endpoint (webhook)
    └── Subscriber: Email / SMS
```

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Topic** | Channel to which messages are published. Standard or FIFO. |
| **Subscription** | Endpoint that receives messages from a topic. |
| **Subscriber** | SQS, Lambda, HTTP/S, email, SMS, mobile push. |
| **Fan-out** | One SNS publish → multiple subscribers each receive a copy. |
| **Message filtering** | Each subscription can receive only matching messages. |

---

## Publishing Messages

```java
// AWS SDK v2
SnsClient snsClient = SnsClient.create();

PublishResponse response = snsClient.publish(
    PublishRequest.builder()
        .topicArn("arn:aws:sns:eu-west-1:123456789:order-events")
        .subject("OrderCreated")
        .message(orderEventJson)
        .messageAttributes(Map.of(
            "eventType", MessageAttributeValue.builder()
                .dataType("String")
                .stringValue("ORDER_CREATED")
                .build(),
            "region", MessageAttributeValue.builder()
                .dataType("String")
                .stringValue("EU")
                .build()
        ))
        .build()
);

System.out.println("MessageId: " + response.messageId());
```

---

## SNS + SQS Fan-out Pattern

The most common pattern: SNS fans out to multiple SQS queues, each consumed by a different service. This decouples the publisher from all consumers.

```
Order Service (publisher)
    │
    ▼
SNS Topic: order-events
    ├──▶ SQS: payment-queue       ──▶ Payment Service
    ├──▶ SQS: notification-queue  ──▶ Notification Service
    └──▶ SQS: analytics-queue     ──▶ Analytics Pipeline
```

**Why SQS between SNS and consumers?**
- SQS buffers messages if consumers are slow (SNS direct delivery can fail)
- SQS enables retry, DLQ, and batch processing
- Consumers can be offline temporarily without losing messages

```bash
# Allow SNS to publish to SQS (resource policy on SQS queue)
aws sqs set-queue-attributes \
  --queue-url https://sqs.eu-west-1.amazonaws.com/123456789/payment-queue \
  --attributes '{
    "Policy": "{\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"sns.amazonaws.com\"},\"Action\":\"sqs:SendMessage\",\"Resource\":\"arn:aws:sqs:eu-west-1:123456789:payment-queue\",\"Condition\":{\"ArnEquals\":{\"aws:SourceArn\":\"arn:aws:sns:eu-west-1:123456789:order-events\"}}}]}"
  }'
```

---

## Message Filtering

Without filtering, every subscriber receives every message. Filtering lets each subscription receive only relevant messages.

```json
// Subscription filter policy — only receive ORDER_CREATED events for EU region
{
  "eventType": ["ORDER_CREATED", "ORDER_UPDATED"],
  "region": ["EU", "UK"]
}
```

```bash
# Set filter policy on a subscription
aws sns set-subscription-attributes \
  --subscription-arn arn:aws:sns:eu-west-1:123:order-events:abc123 \
  --attribute-name FilterPolicy \
  --attribute-value '{"eventType":["ORDER_CREATED"],"region":["EU"]}'
```

---

## SNS FIFO Topics

Like SQS FIFO, SNS FIFO topics guarantee ordering within a MessageGroupId and exactly-once delivery.

```
SNS FIFO Topic → SQS FIFO Subscription only
                 (FIFO topics can only fan out to FIFO SQS queues)
```

---

## Message Structure (SQS subscriber receives)

```json
{
  "Type": "Notification",
  "MessageId": "abc-123",
  "TopicArn": "arn:aws:sns:eu-west-1:123456789:order-events",
  "Subject": "OrderCreated",
  "Message": "{\"orderId\":\"ord-789\",\"customerId\":\"cust-456\"}",
  "Timestamp": "2024-01-15T10:30:00.000Z",
  "MessageAttributes": {
    "eventType": {
      "Type": "String",
      "Value": "ORDER_CREATED"
    }
  }
}
```

When consuming from SQS, the `Message` field is the JSON string SNS published. The SQS consumer must unwrap it.

---

## SNS vs SQS vs EventBridge

| Feature | SNS | SQS | EventBridge |
|---------|-----|-----|-------------|
| **Pattern** | Pub/Sub (push) | Queue (pull) | Event bus (rules-based routing) |
| **Subscribers** | Multiple simultaneous | One consumer group | Multiple rules/targets |
| **Message retention** | None (point-in-time delivery) | Up to 14 days | None |
| **Filtering** | Simple attribute match | None | Complex pattern matching |
| **Best for** | Fan-out to known services | Work queues, buffering | Decoupled event routing across services |

---

## Interview Quick-Fire

**Q: What is the SNS + SQS fan-out pattern?**
Publish once to an SNS topic; SNS delivers to multiple SQS queues simultaneously. Each queue is consumed by a different service. This decouples the publisher from consumers and adds durability/retry via SQS.

**Q: Why not deliver directly from SNS to services?**
SNS delivery to HTTP endpoints fails permanently if the endpoint is down. SQS buffers messages, retries, and supports DLQs — making the pipeline resilient to transient consumer failures.

**Q: What is message filtering in SNS?**
A subscription filter policy allows a subscriber to receive only messages whose attributes match specified conditions. This avoids processing irrelevant messages and reduces cost.

<RelatedTopics :topics="['/aws/sqs', '/aws/eventbridge', '/aws/lambda']" />

[→ Back to AWS Overview](/aws/)
