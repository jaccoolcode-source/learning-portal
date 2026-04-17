---
title: AWS SQS
description: Amazon SQS — Standard vs FIFO queues, visibility timeout, dead-letter queues, long polling, and Lambda integration
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, sqs, queue, fifo, visibility-timeout, dlq, messaging, lambda]
estimatedMinutes: 25
---

# AWS SQS

<DifficultyBadge level="intermediate" />

Amazon Simple Queue Service (SQS) is a fully managed message queue for decoupling producers and consumers. It handles buffering, durability, and retry automatically.

---

## Queue Types

| Feature | Standard Queue | FIFO Queue |
|---------|---------------|------------|
| **Throughput** | Unlimited (nearly) | 3,000 msg/s with batching, 300 without |
| **Ordering** | Best-effort (not guaranteed) | Strict first-in-first-out per message group |
| **Delivery** | At-least-once (rare duplicates) | Exactly-once (deduplication window) |
| **Use case** | High-throughput, order doesn't matter | Financial transactions, order processing |
| **Naming** | Any name | Must end with `.fifo` |

---

## Core Concepts

```
Producer ──send──▶  SQS Queue  ──receive──▶  Consumer
                        │
                        ├── Visibility Timeout (message hidden during processing)
                        ├── Retention Period (1min – 14days, default 4 days)
                        └── Dead-Letter Queue (after maxReceiveCount failures)
```

### Visibility Timeout

When a consumer receives a message, it becomes **invisible** to other consumers for the visibility timeout period. The consumer must either:
- **Delete** the message (success)
- Let the timeout expire → message becomes visible again for retry

```java
// Receive messages
ReceiveMessageResponse response = sqsClient.receiveMessage(
    ReceiveMessageRequest.builder()
        .queueUrl(queueUrl)
        .maxNumberOfMessages(10)          // max 10 per receive call
        .waitTimeSeconds(20)              // long polling — wait up to 20s
        .visibilityTimeout(30)            // 30s to process
        .build()
);

for (Message message : response.messages()) {
    try {
        processMessage(message);

        // Delete on success
        sqsClient.deleteMessage(DeleteMessageRequest.builder()
            .queueUrl(queueUrl)
            .receiptHandle(message.receiptHandle())
            .build());
    } catch (ProcessingException e) {
        // Don't delete — message returns to queue after visibility timeout
        log.error("Failed to process {}", message.messageId(), e);
    }
}
```

```java
// Extend visibility timeout if processing takes longer than expected
sqsClient.changeMessageVisibility(ChangeMessageVisibilityRequest.builder()
    .queueUrl(queueUrl)
    .receiptHandle(message.receiptHandle())
    .visibilityTimeout(60)   // extend by 60s
    .build());
```

---

## Dead-Letter Queue (DLQ)

A DLQ receives messages that couldn't be processed after `maxReceiveCount` attempts.

```bash
# Create DLQ
aws sqs create-queue --queue-name orders-dlq

# Configure redrive policy on the main queue
aws sqs set-queue-attributes \
  --queue-url https://sqs.eu-west-1.amazonaws.com/123456789/orders \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:eu-west-1:123456789:orders-dlq\",\"maxReceiveCount\":\"5\"}"
  }'
```

**DLQ best practices:**
- Always set up a DLQ in production
- Set CloudWatch alarms on `ApproximateNumberOfMessagesVisible` in DLQ
- Investigate and replay DLQ messages (SQS console or redrive API)

---

## Long Polling vs Short Polling

```
Short polling (waitTimeSeconds=0):
  Client polls → returns immediately (may be empty) → client polls again
  → wasted requests, higher cost

Long polling (waitTimeSeconds=1–20):
  Client polls → waits up to 20s for messages to arrive → returns batch
  → fewer API calls, lower cost, slightly higher latency
```

**Always use long polling** (set `waitTimeSeconds=20`) unless you need immediate returns.

---

## FIFO Queue — Ordering and Deduplication

```java
// Send to FIFO queue — MessageGroupId required
SendMessageResponse response = sqsClient.sendMessage(
    SendMessageRequest.builder()
        .queueUrl("https://sqs.eu-west-1.amazonaws.com/123456789/orders.fifo")
        .messageBody(orderJson)
        .messageGroupId("customer-" + customerId)    // ordering per group
        .messageDeduplicationId(UUID.randomUUID().toString())  // 5-min dedup window
        .build()
);
```

**MessageGroupId** determines ordering — messages in the same group are ordered and processed one at a time. Different groups are processed in parallel.

---

## Batch Operations

```java
// Send batch (up to 10 messages, max 256KB total)
List<SendMessageBatchRequestEntry> entries = orders.stream()
    .map(order -> SendMessageBatchRequestEntry.builder()
        .id(order.getId())
        .messageBody(toJson(order))
        .build())
    .collect(toList());

SendMessageBatchResponse batchResponse = sqsClient.sendMessageBatch(
    SendMessageBatchRequest.builder()
        .queueUrl(queueUrl)
        .entries(entries)
        .build()
);

// Check for failures
batchResponse.failed().forEach(failure ->
    log.error("Failed to send {}: {}", failure.id(), failure.message()));
```

---

## Lambda Integration

Lambda automatically polls SQS and invokes your function with a batch of messages.

```
SQS Queue ──(Lambda polls)──▶ Lambda Function
                                  ├── All succeed → Lambda deletes all messages
                                  ├── Function throws → retry all messages
                                  └── ReportBatchItemFailures → retry only failed
```

```json
// Event source mapping — configured on Lambda, not SQS
{
  "EventSourceArn": "arn:aws:sqs:eu-west-1:123:orders",
  "BatchSize": 10,
  "MaximumBatchingWindowInSeconds": 5,
  "FunctionResponseTypes": ["ReportBatchItemFailures"]
}
```

---

## Key Metrics (CloudWatch)

| Metric | Alert Condition |
|--------|----------------|
| `ApproximateNumberOfMessagesVisible` | High → consumers can't keep up |
| `ApproximateAgeOfOldestMessage` | High → processing lag / consumer failure |
| `NumberOfMessagesSent` | Drop → upstream producer issue |
| DLQ `ApproximateNumberOfMessagesVisible` | Any > 0 → processing errors |

---

## Interview Quick-Fire

**Q: What is visibility timeout and why does it matter?**
The period a received message is hidden from other consumers. It must be longer than your processing time. Too short → duplicate processing. Too long → slow retries after consumer failure.

**Q: Standard vs FIFO — which to use?**
Standard for high-throughput where order doesn't matter and occasional duplicates are acceptable. FIFO when ordering is critical (e.g., financial events, state machine transitions) and throughput ≤ 3,000/s suffices.

**Q: What happens to messages after maxReceiveCount?**
If a DLQ is configured, messages are moved there. Without a DLQ, they're deleted. A DLQ is essential for debugging and replaying failed messages.

<RelatedTopics :topics="['/aws/lambda', '/aws/sns', '/aws/eventbridge']" />

[→ Back to AWS Overview](/aws/)
