---
title: Distributed Tracing
---

# Distributed Tracing

In a microservices architecture, a single user request may touch 5–10 services. When something is slow or fails, how do you know which service is to blame? Distributed tracing answers this question.

## Core Concepts

### Trace, Span, and Parent Span

- **Trace**: the complete lifecycle of a request across all services. Identified by a globally unique `traceId`.
- **Span**: a named, timed operation within the trace. Each span has a `spanId` and optionally a `parentSpanId`.
- **Root span**: the first span in a trace (no parent).

```
Trace: abc123 (user places order)
│
├── [0ms]  Span: OrderController.placeOrder       [0-150ms]   (root)
│   ├── [5ms]  Span: InventoryService.reserve     [5-40ms]
│   ├── [41ms] Span: PaymentService.charge        [41-130ms]
│   │   └── [50ms] Span: HTTP POST /payment-gw   [50-125ms]
│   └── [131ms] Span: NotificationService.send   [131-148ms]
```

This view immediately shows that the payment gateway call took 75ms — the bottleneck.

### Trace Context

To link spans across services, the trace context (traceId + spanId) is propagated via HTTP headers.

**W3C TraceContext** (the modern standard):
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
              ^  ^───────────────────────────────  ^──────────────  ^
              version         traceId                  spanId       flags
```

Other propagation formats (legacy):
- **B3** (Zipkin): `X-B3-TraceId`, `X-B3-SpanId`, `X-B3-Sampled`
- **Jaeger**: `uber-trace-id`

OTel supports all formats and can translate between them.

## Jaeger vs Zipkin

| Feature | Jaeger | Zipkin |
|---------|--------|--------|
| **Origin** | Uber (2016), CNCF project | Twitter (2012) |
| **Storage** | Cassandra, Elasticsearch, in-memory | MySQL, Elasticsearch, Cassandra |
| **UI** | Rich, dependency graph, comparisons | Simpler, focused |
| **OTel support** | Native OTLP receiver | Via OTel Collector |
| **Sampling** | Head-based, tail-based (planned) | Head-based |
| **Recommendation** | Preferred for new projects | Widely used, mature |

### Running Jaeger Locally (Docker)

```yaml
# docker-compose.yml
services:
  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"   # UI
      - "4317:4317"     # OTLP gRPC receiver
      - "4318:4318"     # OTLP HTTP receiver
    environment:
      COLLECTOR_OTLP_ENABLED: "true"
```

Open UI at: `http://localhost:16686`

## Sampling Strategies

Collecting 100% of traces in production generates enormous storage and processing costs. Sampling controls what percentage of traces are actually recorded.

### Always-On (100% Sampling)

```yaml
management:
  tracing:
    sampling:
      probability: 1.0
```

Use only in development or low-traffic systems.

### Probabilistic (Head-Based) Sampling

Decision is made at the start of the trace (at the root span):

```yaml
management:
  tracing:
    sampling:
      probability: 0.1  # 10% of traces sampled
```

Simple and cheap, but may miss rare slow/error traces.

### Rate-Limited Sampling

Sample a fixed number of traces per second regardless of traffic volume. Available in Jaeger client libraries.

### Tail-Based Sampling

Decision is made at the **end** of the trace, after all spans are collected. This allows keeping 100% of error traces and slow traces:

```yaml
# OTel Collector tail-based sampling config
processors:
  tail_sampling:
    decision_wait: 10s
    policies:
      - name: errors-policy
        type: status_code
        status_code: { status_codes: [ERROR] }
      - name: slow-traces-policy
        type: latency
        latency: { threshold_ms: 1000 }
      - name: probabilistic-policy
        type: probabilistic
        probabilistic: { sampling_percentage: 5 }
```

Tail-based sampling requires the OTel Collector and is more complex but gives the best signal-to-noise ratio.

## Spring Boot Integration (Micrometer Tracing)

Spring Boot 3.x uses **Micrometer Tracing** as the tracing facade (replacing Spring Cloud Sleuth):

```xml
<!-- pom.xml -->
<dependency>
  <groupId>io.micrometer</groupId>
  <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
  <groupId>io.opentelemetry</groupId>
  <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
```

```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0
spring:
  application:
    name: order-service
```

Micrometer Tracing automatically instruments:
- `RestTemplate` and `WebClient` calls
- Spring MVC request handling
- `@Async` method calls
- Kafka consumer/producer

### Trace ID in Logs

With Micrometer Tracing, the trace ID is automatically added to MDC (Mapped Diagnostic Context):

```
2024-01-15 10:23:45 INFO  [order-service,4bf92f3577b34da6,a3ce929d0e0e4736] c.e.OrderService - Processing order 12345
                                           traceId              spanId
```

Configure your log pattern to include MDC:
```xml
<!-- logback-spring.xml -->
<pattern>%d{yyyy-MM-dd HH:mm:ss} %-5level [%X{traceId:-},%X{spanId:-}] %logger{36} - %msg%n</pattern>
```

Now you can take a traceId from Jaeger and search for it in your logs — or vice versa.

## Instrumenting Async Code

Trace context must be manually propagated through async boundaries:

```java
@Service
public class OrderService {

    private final Tracer tracer;

    // Micrometer Tracing propagates context automatically for @Async
    // For manual async, use ObservationRegistry or wrap with tracer.currentTraceContext()

    public CompletableFuture<Order> processAsync(OrderRequest request) {
        // Context propagated automatically via Micrometer Tracing instrumentation
        return CompletableFuture.supplyAsync(() -> processOrder(request));
    }
}
```

::: tip Interview tip
Key points to mention: traceId links spans across services, W3C traceparent is the modern standard, tail-based sampling for capturing errors without 100% overhead, correlating traceId between Jaeger and your log aggregator.
:::

---

Next: [Logging (ELK)](/observability/logging) | Back to [Overview](/observability/)
