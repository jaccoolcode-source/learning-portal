---
title: Webhooks
description: Webhook design, delivery guarantees, retry with exponential backoff, HMAC signature verification, idempotency, and event schema design
category: architecture
pageClass: layout-architecture
difficulty: intermediate
tags: [webhooks, events, hmac, signature-verification, retry, idempotency, event-driven]
related:
  - /architecture/rest-web
  - /messaging/kafka-core
  - /system-design/reliability
estimatedMinutes: 20
---

# Webhooks

<DifficultyBadge level="intermediate" />

Webhooks are HTTP callbacks — your server pushes events to a consumer's URL when something happens, rather than requiring the consumer to poll. They are the standard event delivery mechanism for SaaS integrations (GitHub, Stripe, Twilio, etc.).

---

## Webhooks vs Polling vs Messaging

| | Polling | Webhooks | Message Queue (Kafka/RabbitMQ) |
|--|---------|----------|-------------------------------|
| **Direction** | Consumer pulls | Provider pushes | Consumer pulls from broker |
| **Latency** | High (interval-based) | Low (event-driven) | Low (event-driven) |
| **Coupling** | Tight (consumer knows provider API) | Moderate (consumer exposes URL) | Loose (broker decouples both) |
| **Reliability** | Consumer controls retries | Provider must implement retries | Broker handles durability |
| **Scale** | Wasteful (many empty polls) | Efficient | Highly scalable |
| **Best for** | Simple, rare checks | Third-party integrations | Internal microservices |

---

## Event Schema Design

Design webhook payloads to be stable, versioned, and easy to consume:

```json
{
  "id": "evt_01HX2K4M7N8P9Q0R1S2T3U4V5",
  "type": "order.completed",
  "version": "2024-01",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "idempotencyKey": "evt_01HX2K4M7N8P9Q0R1S2T3U4V5",
  "data": {
    "orderId": "ord_789",
    "userId": "usr_123",
    "total": 99.99,
    "items": [
      { "productId": "prod_42", "quantity": 2, "price": 49.99 }
    ]
  },
  "metadata": {
    "attemptNumber": 1,
    "deliveredAt": "2024-01-15T10:30:01.234Z"
  }
}
```

**Best practices:**
- Include a unique event `id` — consumers use it for idempotency
- Use dot-notation event types (`entity.action`): `order.completed`, `payment.failed`, `user.deleted`
- Include a `version` field — allows schema evolution without breaking consumers
- Embed full data in the payload (fat events) OR include only an ID (thin events + fetch)
- `timestamp` in ISO 8601 UTC

### Fat Events vs Thin Events

```
Fat event: payload contains all data
  → Consumer has everything it needs immediately
  → Event is self-contained, easier to replay
  → Risk: payload grows large; sensitive data in transit

Thin event: payload contains only a reference
  { "type": "order.completed", "data": { "orderId": "789" } }
  → Consumer must call back to fetch full data
  → Data is always fresh (no stale snapshot)
  → Risk: race condition if fetched before DB consistent
```

---

## Sending Webhooks (Provider Side)

### Webhook Delivery Service

```java
@Service
public class WebhookDeliveryService {

    private final WebhookSubscriptionRepository subscriptionRepo;
    private final WebhookDeliveryRepository deliveryRepo;
    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    // Called when an event occurs in the system
    @Async
    public void dispatch(String eventType, Object payload) {
        List<WebhookSubscription> subscribers =
            subscriptionRepo.findByEventType(eventType);

        for (WebhookSubscription sub : subscribers) {
            WebhookEvent event = WebhookEvent.builder()
                .id("evt_" + UUID.randomUUID())
                .type(eventType)
                .version("2024-01")
                .timestamp(Instant.now())
                .data(payload)
                .build();

            deliverWithRetry(sub, event);
        }
    }

    private void deliverWithRetry(WebhookSubscription sub, WebhookEvent event) {
        String body = objectMapper.writeValueAsString(event);
        String signature = computeSignature(body, sub.getSecret());

        try {
            restClient.post()
                .uri(sub.getEndpointUrl())
                .header("Content-Type", "application/json")
                .header("X-Webhook-Signature", "sha256=" + signature)
                .header("X-Webhook-Id", event.getId())
                .header("X-Webhook-Timestamp", event.getTimestamp().toString())
                .body(body)
                .retrieve()
                .toBodilessEntity();

            deliveryRepo.recordSuccess(sub.getId(), event.getId());

        } catch (Exception e) {
            deliveryRepo.recordFailure(sub.getId(), event.getId(), e.getMessage());
            scheduleRetry(sub, event, 1);  // start retry sequence
        }
    }
}
```

### Retry with Exponential Backoff

```java
@Service
public class WebhookRetryService {

    // Retry schedule: 5s, 30s, 2m, 10m, 30m, 1h, 3h (7 attempts = ~5 hours total)
    private static final long[] RETRY_DELAYS_SECONDS = {5, 30, 120, 600, 1800, 3600, 10800};

    @Scheduled(fixedDelay = 10_000)  // check every 10s
    public void processRetryQueue() {
        List<PendingRetry> due = retryRepo.findDueRetries(Instant.now());

        for (PendingRetry retry : due) {
            try {
                deliver(retry.getSubscription(), retry.getEvent());
                retryRepo.markDelivered(retry.getId());

            } catch (Exception e) {
                int nextAttempt = retry.getAttemptNumber() + 1;

                if (nextAttempt > RETRY_DELAYS_SECONDS.length) {
                    // Give up — mark as permanently failed, notify provider
                    retryRepo.markPermanentlyFailed(retry.getId());
                    alertService.notifyWebhookFailed(retry);
                } else {
                    long delaySeconds = RETRY_DELAYS_SECONDS[nextAttempt - 1];
                    // Add jitter: ± 10% to avoid thundering herd
                    long jitter = (long)(delaySeconds * 0.1 * (Math.random() * 2 - 1));
                    Instant nextAttemptAt = Instant.now().plusSeconds(delaySeconds + jitter);
                    retryRepo.scheduleRetry(retry.getId(), nextAttemptAt, nextAttempt);
                }
            }
        }
    }
}
```

```
Retry schedule with exponential backoff + jitter:
  Attempt 1:  immediate
  Attempt 2:  5 seconds
  Attempt 3:  30 seconds
  Attempt 4:  2 minutes
  Attempt 5:  10 minutes
  Attempt 6:  30 minutes
  Attempt 7:  1 hour
  Attempt 8:  3 hours (final)
  → Give up, mark as failed, notify webhook owner
```

---

## HMAC Signature Verification

Webhooks are delivered to a public URL — anyone could send a fake request. HMAC (Hash-based Message Authentication Code) proves the payload came from the legitimate provider.

### How It Works

```
Provider                                Consumer
──────                                  ────────
1. Generate shared secret per subscription
   secret = "whsec_abc123..."

2. For each delivery:
   signature = HMAC-SHA256(secret, timestamp + "." + body)
   Send: X-Webhook-Signature: sha256=<hex>
         X-Webhook-Timestamp: 1705316400

3.                                      Receive headers + body
                                        Recompute HMAC with same secret
                                        Compare: computed == received?
                                          ✓ Legitimate delivery
                                          ✗ Forged or tampered
```

### Provider: Computing the Signature

```java
@Component
public class WebhookSignatureService {

    public String computeSignature(String body, String secret) {
        try {
            String timestamp = String.valueOf(Instant.now().getEpochSecond());
            String payload = timestamp + "." + body;

            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);

            byte[] hash = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);

        } catch (Exception e) {
            throw new RuntimeException("Failed to compute HMAC signature", e);
        }
    }
}
```

### Consumer: Verifying the Signature

```java
@RestController
public class WebhookReceiver {

    private static final long TOLERANCE_SECONDS = 300;  // 5 minutes — replay attack window

    @Value("${webhook.secret}")
    private String webhookSecret;

    @PostMapping("/webhooks/orders")
    public ResponseEntity<Void> receiveOrderEvent(
            @RequestHeader("X-Webhook-Signature") String signature,
            @RequestHeader("X-Webhook-Timestamp") String timestamp,
            @RequestHeader("X-Webhook-Id") String eventId,
            @RequestBody String rawBody) {

        // 1. Reject stale requests (replay attack prevention)
        long eventTime = Long.parseLong(timestamp);
        long now = Instant.now().getEpochSecond();
        if (Math.abs(now - eventTime) > TOLERANCE_SECONDS) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // 2. Verify signature
        String expected = computeExpectedSignature(timestamp, rawBody);
        if (!MessageDigest.isEqual(
                expected.getBytes(StandardCharsets.UTF_8),
                signature.replace("sha256=", "").getBytes(StandardCharsets.UTF_8))) {
            log.warn("Invalid webhook signature for event {}", eventId);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        // 3. Idempotency check — deduplicate retried events
        if (processedEventRepo.existsByEventId(eventId)) {
            return ResponseEntity.ok().build();  // already handled, acknowledge
        }

        // 4. Process the event asynchronously
        WebhookEvent event = objectMapper.readValue(rawBody, WebhookEvent.class);
        eventProcessor.processAsync(event);

        // 5. Record as processed BEFORE returning 200
        processedEventRepo.save(new ProcessedEvent(eventId, Instant.now()));

        return ResponseEntity.ok().build();
    }

    private String computeExpectedSignature(String timestamp, String body) {
        String payload = timestamp + "." + body;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }
}
```

> **Important:** Use `MessageDigest.isEqual()` (constant-time comparison), NOT `equals()`. String `.equals()` short-circuits on first mismatch — timing attacks can extract the expected signature character by character.

---

## Idempotency on the Consumer Side

Providers retry on failure. The consumer may receive the same event multiple times.

```java
// Option 1: Processed events table
CREATE TABLE processed_webhook_events (
    event_id     VARCHAR(100) PRIMARY KEY,
    received_at  TIMESTAMP NOT NULL,
    INDEX (received_at)  -- for cleanup job
);

// Option 2: Unique constraint on business operation
// e.g., if webhook triggers an order fulfillment:
CREATE UNIQUE INDEX idx_fulfillment_event
    ON fulfillments(webhook_event_id);
-- Duplicate insert throws constraint violation → idempotent

// Cleanup old records (keep 30 days for deduplication window)
@Scheduled(cron = "0 0 3 * * *")  // 3am daily
public void cleanupProcessedEvents() {
    processedEventRepo.deleteOlderThan(Instant.now().minus(30, ChronoUnit.DAYS));
}
```

---

## Subscription Management

```java
@Entity
public class WebhookSubscription {
    @Id UUID id;
    String endpointUrl;           // consumer's receiving URL
    String secret;                // HMAC secret (stored encrypted)
    @ElementCollection
    Set<String> eventTypes;       // ["order.completed", "payment.failed"]
    boolean active;
    int consecutiveFailures;      // disable after N failures
    Instant createdAt;
    Instant lastDeliveryAt;
}

// Disable subscriptions that consistently fail
@Service
public class SubscriptionHealthService {
    private static final int MAX_CONSECUTIVE_FAILURES = 10;

    public void recordFailure(UUID subscriptionId) {
        WebhookSubscription sub = subscriptionRepo.findById(subscriptionId).orElseThrow();
        sub.setConsecutiveFailures(sub.getConsecutiveFailures() + 1);

        if (sub.getConsecutiveFailures() >= MAX_CONSECUTIVE_FAILURES) {
            sub.setActive(false);
            notifyOwner(sub, "Webhook disabled after " + MAX_CONSECUTIVE_FAILURES + " consecutive failures");
        }

        subscriptionRepo.save(sub);
    }
}
```

---

## Response Requirements for Consumers

```
The provider expects:
  ✓  2xx response within timeout (typically 10–30 seconds)
  → Treat everything else as failure → retry

Rules for webhook endpoints:
  1. Respond 200 OK quickly — do not do heavy processing synchronously
  2. Return 200 even for already-processed events (idempotency)
  3. Return 200 even if your processing fails (use your own retry queue)
  4. Do NOT return 4xx for business logic errors — provider will retry unnecessarily
```

```java
// Pattern: accept and queue, respond immediately
@PostMapping("/webhooks/orders")
public ResponseEntity<Void> receiveOrderEvent(@RequestBody String rawBody,
        @RequestHeader("X-Webhook-Id") String eventId) {
    // signature verification first (see above)

    // Queue for async processing — respond immediately
    internalQueue.publish(new WebhookTask(eventId, rawBody));

    return ResponseEntity.ok().build();  // respond fast
}
```

---

## Interview Quick-Fire

**Q: How do you ensure webhook delivery is reliable?**
Retry with exponential backoff (e.g., 5s → 30s → 2m → 10m → 30m → 1h → 3h), storing pending retries in a durable queue or DB table. Add jitter to spread retries across multiple failing consumers. After N failures (e.g., 10), disable the subscription and alert the consumer. Consumers must respond 2xx within a timeout; anything else triggers a retry.

**Q: How does HMAC signature verification work for webhooks?**
The provider generates a per-subscription secret. For each delivery, it computes `HMAC-SHA256(secret, timestamp + "." + body)` and includes the result in a header (e.g., `X-Webhook-Signature`). The consumer recomputes the HMAC with the same secret and compares. Include the timestamp in the signed payload and reject events older than ~5 minutes to prevent replay attacks. Use constant-time comparison to prevent timing attacks.

**Q: How do you handle duplicate webhook deliveries?**
Providers retry on failure, so consumers must be idempotent. Record each processed event ID in a `processed_webhook_events` table with a unique constraint. On receipt, check if already processed; if so, return 200 immediately without re-processing. Clean up old records periodically (retain ~30 days to cover the retry window).

<RelatedTopics :topics="['/architecture/rest-web', '/messaging/kafka-core', '/system-design/reliability']" />

[→ Back to Architecture Overview](/architecture/)
