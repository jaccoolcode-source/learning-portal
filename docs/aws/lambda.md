---
title: AWS Lambda
description: AWS Lambda — serverless compute, execution model, cold starts, triggers, concurrency, and best practices
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, lambda, serverless, cold-start, concurrency, triggers, function-as-a-service]
estimatedMinutes: 30
---

# AWS Lambda

<DifficultyBadge level="intermediate" />

Lambda is AWS's serverless compute service — you upload code, AWS runs it on demand. No servers to manage, no idle capacity costs.

---

## Execution Model

```
Event Source             Lambda Service              Your Code
(API GW, SQS, S3)
       │
       ▼
  Invocation ──── Cold Start (if no warm instance) ────▶ Init + Handler
                │                                         (duration billed)
                └─ Warm Start (reuse existing container) ▶ Handler only
```

**Lifecycle per execution:**
1. **Init phase** — download code, start runtime, run static initializers
2. **Invoke phase** — run your handler function
3. **Shutdown phase** — runtime is frozen (not terminated) and may be reused

---

## Cold Starts

A cold start occurs when Lambda must provision a new execution environment.

| Factor | Impact |
|--------|--------|
| **Runtime** | Java/C# cold start ~500ms–2s; Node.js/Python ~50–200ms |
| **Package size** | Larger .jar = longer init time |
| **VPC** | Lambda inside VPC adds ~1s for ENI attachment (pre-warming now reduces this) |
| **Memory** | More memory = faster CPU = faster init |
| **SnapStart (Java)** | Snapshots JVM after init, reduces cold starts to ~100ms |

```java
// SnapStart — enable in Lambda configuration, use CRaC hooks for cleanup
@Override
public void beforeCheckpoint(Context<? extends Resource> context) {
    // close DB connections, flush caches before snapshot
}

@Override
public void afterRestore(Context<? extends Resource> context) {
    // re-open connections after restore from snapshot
}
```

---

## Handler Structure

```java
// Java handler (Maven dependency: com.amazonaws:aws-lambda-java-core)
public class OrderHandler implements RequestHandler<APIGatewayProxyRequestEvent, APIGatewayProxyResponseEvent> {

    // Static initializers run ONCE per cold start (reuse across invocations)
    private static final DynamoDbClient dynamo = DynamoDbClient.create();
    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public APIGatewayProxyResponseEvent handleRequest(
            APIGatewayProxyRequestEvent event, Context context) {

        context.getLogger().log("Request: " + event.getBody());

        try {
            Order order = mapper.readValue(event.getBody(), Order.class);
            // ... process order ...
            return new APIGatewayProxyResponseEvent()
                .withStatusCode(200)
                .withBody("{\"orderId\":\"" + order.getId() + "\"}");
        } catch (Exception e) {
            return new APIGatewayProxyResponseEvent()
                .withStatusCode(500)
                .withBody("{\"error\":\"" + e.getMessage() + "\"}");
        }
    }
}
```

```javascript
// Node.js handler
export const handler = async (event, context) => {
    const body = JSON.parse(event.body);
    return {
        statusCode: 200,
        body: JSON.stringify({ orderId: body.id }),
    };
};
```

---

## Triggers

| Trigger | Invocation Type | Notes |
|---------|----------------|-------|
| **API Gateway / ALB** | Synchronous | HTTP request → response |
| **SQS** | Asynchronous (polled) | Lambda polls, auto-deletes on success |
| **SNS** | Asynchronous | Push invocation |
| **S3 events** | Asynchronous | Object created/deleted |
| **EventBridge** | Asynchronous | Scheduled or rule-based |
| **DynamoDB Streams** | Polled | Process table change events |
| **Kinesis** | Polled | Stream processing |

---

## Concurrency

```
Reserved Concurrency:   limits max concurrent executions for a function
                        (also guarantees capacity, no throttling from other functions)

Provisioned Concurrency: pre-warms N execution environments
                          eliminates cold starts, costs more

Account limit: 1000 concurrent executions per region (soft limit, can be raised)
```

```bash
# Set reserved concurrency
aws lambda put-function-concurrency \
  --function-name my-function \
  --reserved-concurrent-executions 100

# Set provisioned concurrency
aws lambda put-provisioned-concurrency-config \
  --function-name my-function \
  --qualifier prod \
  --provisioned-concurrent-executions 10
```

---

## Environment Variables & Secrets

```bash
# Set env vars (visible in console — use Secrets Manager for sensitive data)
aws lambda update-function-configuration \
  --function-name my-function \
  --environment "Variables={DB_HOST=mydb.cluster.rds.amazonaws.com,ENV=prod}"
```

```java
// Access in code
String dbHost = System.getenv("DB_HOST");

// Better: fetch from Secrets Manager on cold start (cache the result)
private static final String SECRET = SecretsManagerClient.create()
    .getSecretValue(r -> r.secretId("prod/myapp/db"))
    .secretString();
```

---

## Layers

Lambda Layers package shared code (libraries, runtimes) separately from your function code.

```
Function package:  your-function.zip  (just your code)
Layer:             common-libs.zip    (shared dependencies, max 250MB unzipped)

Benefits: smaller deployments, shared updates, language runtime extensions
```

---

## Lambda with SQS (Event Source Mapping)

```
SQS Queue
    │ Lambda polls in batches
    ▼
Lambda Function
    ├── Success → SQS deletes messages automatically
    └── Failure → messages return to queue (visibility timeout)
                 After maxReceiveCount → Dead Letter Queue (DLQ)
```

```json
// Event source mapping configuration
{
  "EventSourceArn": "arn:aws:sqs:eu-west-1:123456789012:orders-queue",
  "BatchSize": 10,
  "MaximumBatchingWindowInSeconds": 5,
  "FunctionResponseTypes": ["ReportBatchItemFailures"]
}
```

```java
// Partial batch failure response
public SQSBatchResponse handleRequest(SQSEvent event, Context context) {
    List<SQSBatchResponse.BatchItemFailure> failures = new ArrayList<>();

    for (SQSEvent.SQSMessage msg : event.getRecords()) {
        try {
            processMessage(msg);
        } catch (Exception e) {
            // Only retry this specific message, not the whole batch
            failures.add(SQSBatchResponse.BatchItemFailure.builder()
                .withItemIdentifier(msg.getMessageId()).build());
        }
    }
    return new SQSBatchResponse(failures);
}
```

---

## Best Practices

- Keep handlers thin — business logic in separate classes (easier testing)
- Initialize SDK clients statically (reused across warm invocations)
- Set timeouts and memory thoughtfully — 3s default timeout is often too short for DB calls
- Use Lambda Powertools (Java/Python/TS) for structured logging, tracing, idempotency
- Use `REPORT` log lines (auto-generated) to monitor duration, billed duration, memory used
- For Java: use SnapStart + GraalVM native image or Quarkus/Micronaut for fast cold starts

---

## Interview Quick-Fire

**Q: When does a cold start occur?**
When Lambda has no warm execution environment available: first invocation, after idle period (~15 min), scaling out beyond current warm instances, or after a deployment.

**Q: What's the difference between reserved and provisioned concurrency?**
Reserved concurrency caps max executions (prevents throttling others + guarantees capacity). Provisioned concurrency pre-warms instances to eliminate cold starts — it costs money even when idle.

**Q: How do you handle partial SQS batch failures?**
Enable `ReportBatchItemFailures` and return a `SQSBatchResponse` listing only the failed message IDs. Lambda deletes the successful ones and returns the failures to the queue for retry.

<RelatedTopics :topics="['/aws/api-gateway', '/aws/sqs', '/aws/iam']" />

[→ Back to AWS Overview](/aws/)
