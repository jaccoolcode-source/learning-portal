---
title: AWS EventBridge
description: Amazon EventBridge — event buses, rules, pattern matching, scheduled events, pipes, and event-driven architecture patterns
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, eventbridge, event-bus, rules, event-driven, scheduling, pipes]
estimatedMinutes: 25
---

# AWS EventBridge

<DifficultyBadge level="intermediate" />

EventBridge is a serverless event bus that routes events from AWS services, SaaS applications, and your own applications to targets using content-based rules.

---

## Architecture

```
Event Sources                     EventBridge                    Targets
AWS Services (EC2, S3, RDS)
SaaS Apps (Salesforce, Zendesk)  ──▶ Event Bus ──▶ Rules ──▶  Lambda
Your Apps (PutEvents API)                                    ──▶ SQS
AWS Partner Sources                                          ──▶ SNS
                                                             ──▶ Step Functions
                                                             ──▶ API Gateway
                                                             ──▶ Another Bus
```

---

## Event Buses

| Bus Type | Description |
|----------|-------------|
| **Default bus** | AWS service events (EC2 state changes, RDS events, CloudTrail…) |
| **Custom bus** | Your application events (PutEvents API) |
| **Partner bus** | SaaS integration (Stripe, Datadog, PagerDuty, Zendesk) |

---

## Publishing Events

```java
// Publish custom events to EventBridge
EventBridgeClient ebClient = EventBridgeClient.create();

PutEventsResponse response = ebClient.putEvents(
    PutEventsRequest.builder()
        .entries(
            PutEventsRequestEntry.builder()
                .eventBusName("my-app-events")
                .source("com.mycompany.orders")
                .detailType("OrderCreated")
                .detail("{\"orderId\":\"ord-789\",\"customerId\":\"cust-456\",\"amount\":99.99}")
                .build()
        )
        .build()
);

response.entries().forEach(entry -> {
    if (entry.errorCode() != null) {
        log.error("Failed: {} - {}", entry.errorCode(), entry.errorMessage());
    }
});
```

---

## Event Structure

```json
{
  "version": "0",
  "id": "abc-123-def-456",
  "source": "com.mycompany.orders",
  "detail-type": "OrderCreated",
  "time": "2024-01-15T10:30:00Z",
  "region": "eu-west-1",
  "account": "123456789012",
  "resources": [],
  "detail": {
    "orderId": "ord-789",
    "customerId": "cust-456",
    "amount": 99.99,
    "status": "PENDING"
  }
}
```

---

## Rules and Pattern Matching

Rules evaluate every event on the bus and route matching events to targets.

```json
// Match all OrderCreated events over €100 from EU customers
{
  "source": ["com.mycompany.orders"],
  "detail-type": ["OrderCreated"],
  "detail": {
    "amount": [{ "numeric": [">", 100] }],
    "region": ["EU", "UK"]
  }
}
```

### Pattern Operators

| Operator | Example | Matches |
|----------|---------|---------|
| Exact match | `["CREATED"]` | `"CREATED"` |
| Anything-but | `[{"anything-but": "CANCELLED"}]` | Any value except CANCELLED |
| Numeric range | `[{"numeric": [">=", 100, "<", 1000]}]` | 100–999 |
| Prefix | `[{"prefix": "ORDER"}]` | `"ORDER_CREATED"`, `"ORDER_UPDATED"` |
| Suffix | `[{"suffix": ".pdf"}]` | `"invoice.pdf"` |
| Exists | `[{"exists": true}]` | Field is present |
| IP CIDR | `[{"cidr": "10.0.0.0/8"}]` | IP in range |

---

## Scheduled Events (Cron)

```bash
# Run Lambda every day at 08:00 UTC
aws events put-rule \
  --name "DailyReportGenerator" \
  --schedule-expression "cron(0 8 * * ? *)" \
  --state ENABLED

# Rate expression — every 5 minutes
aws events put-rule \
  --name "HealthCheck" \
  --schedule-expression "rate(5 minutes)"
```

::: tip EventBridge Scheduler vs Rules
EventBridge **Scheduler** (newer service) supports one-time schedules, time zones, flexible windows, and is more reliable for high-volume scheduling. Use Scheduler for job scheduling; use EventBridge Rules for event-driven routing.
:::

---

## Event Replay and Archive

```bash
# Archive all events to replay later (e.g., for debugging or reprocessing)
aws events create-archive \
  --archive-name order-events-archive \
  --event-source-arn arn:aws:events:eu-west-1:123:event-bus/my-app-events \
  --retention-days 90

# Replay archived events to a target bus
aws events start-replay \
  --replay-name replay-2024-01-15 \
  --event-source-arn arn:aws:events:eu-west-1:123:archive/order-events-archive \
  --event-start-time 2024-01-15T00:00:00 \
  --event-end-time 2024-01-16T00:00:00 \
  --destination '{"Arn":"arn:aws:events:eu-west-1:123:event-bus/my-app-events"}'
```

---

## EventBridge Pipes

Pipes connect a source (SQS, Kinesis, DynamoDB Streams) to a target with optional filtering, enrichment (Lambda), and transformation — without writing polling infrastructure.

```
SQS Queue ──▶ [Filter] ──▶ [Enrich via Lambda] ──▶ [Transform] ──▶ Step Functions
```

---

## EventBridge vs SNS vs SQS

| | EventBridge | SNS | SQS |
|--|-------------|-----|-----|
| **Routing** | Content-based rules | Topic-based + filter | No routing |
| **Sources** | AWS services, SaaS, custom | Custom, AWS | Custom |
| **Targets** | 20+ AWS service targets | Lambda, SQS, HTTP, email | Consumer pulls |
| **Ordering** | No | FIFO option | FIFO option |
| **Replay** | Yes (archive) | No | No (DLQ only) |

---

## Interview Quick-Fire

**Q: What's the difference between EventBridge and SNS?**
EventBridge routes events using complex content-based pattern matching and supports 20+ native targets including Step Functions and other buses. SNS is simpler pub/sub with basic attribute filtering — best for fan-out to known subscribers. EventBridge is the preferred choice for event-driven architectures across services.

**Q: What is event archive and replay?**
EventBridge can archive all events to S3 indefinitely. You can replay archived events back through the bus — useful for debugging, reprocessing after a bug fix, or onboarding a new consumer that needs historical events.

**Q: How does EventBridge Pipes differ from a rule + Lambda?**
Pipes provide a managed pipeline with built-in source polling (SQS, Kinesis), optional filtering, optional Lambda enrichment, and transformation — in a single configured resource. A rule + Lambda requires you to write polling/triggering logic manually.

<RelatedTopics :topics="['/aws/sqs', '/aws/sns', '/aws/stepfunctions']" />

[→ Back to AWS Overview](/aws/)
