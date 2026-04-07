---
title: OpenTelemetry
---

# OpenTelemetry

OpenTelemetry (OTel) is the CNCF (Cloud Native Computing Foundation) standard for distributed observability. It provides a vendor-neutral, language-agnostic SDK for instrumenting applications to produce metrics, logs, and traces — all exportable to any compatible backend.

## Why OpenTelemetry?

Before OTel, every observability vendor (Datadog, Jaeger, New Relic) had its own SDK. Switching vendors meant re-instrumenting your entire application.

OTel solves this: **instrument once, export anywhere**.

```
Your App (OTel SDK)
       │
       ├── OTLP Exporter ──► Jaeger
       ├── OTLP Exporter ──► Tempo (Grafana)
       └── OTLP Exporter ──► Datadog / New Relic
```

## Core Concepts

### Traces, Spans, and Context

A **Trace** represents the full journey of a request through a distributed system.

A **Span** is a named, timed operation within that trace. Spans form a parent-child tree.

```
Trace: processOrder (traceId: abc123)
  └── Span: validateCart        [0ms - 5ms]
  └── Span: chargeCreditCard    [5ms - 120ms]
      └── Span: callPaymentAPI  [10ms - 115ms]
  └── Span: sendConfirmationEmail [120ms - 130ms]
```

**Context Propagation**: the trace ID and span ID are passed between services via HTTP headers (`traceparent` — W3C standard) or message headers. This links spans from different services into one trace.

### Attributes

Key-value metadata attached to a span:

```java
span.setAttribute("user.id", userId);
span.setAttribute("order.total", total);
span.setAttribute("http.method", "POST");
```

### Semantic Conventions

OTel defines standard attribute names: `http.method`, `db.system`, `messaging.system` — consistent across SDKs and backends.

## Java Auto-Instrumentation

The easiest way to add OTel to a Spring Boot app: **the Java agent**.

```bash
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=order-service \
     -Dotel.exporter.otlp.endpoint=http://jaeger:4317 \
     -jar app.jar
```

The agent automatically instruments:
- Spring MVC / WebFlux HTTP requests
- JDBC database calls
- Kafka / RabbitMQ messages
- Redis, MongoDB, Elasticsearch clients
- gRPC, HTTP clients (OkHttp, RestTemplate, WebClient)

**No code changes required** for standard instrumentation.

## Manual Instrumentation

For custom business spans:

```xml
<!-- pom.xml -->
<dependency>
  <groupId>io.opentelemetry</groupId>
  <artifactId>opentelemetry-api</artifactId>
</dependency>
<dependency>
  <groupId>io.opentelemetry.instrumentation</groupId>
  <artifactId>opentelemetry-spring-boot-starter</artifactId>
</dependency>
```

### Using `@WithSpan`

```java
import io.opentelemetry.instrumentation.annotations.WithSpan;
import io.opentelemetry.instrumentation.annotations.SpanAttribute;

@Service
public class OrderService {

    @WithSpan("processOrder")  // creates a span automatically
    public Order processOrder(
            @SpanAttribute("order.id") Long orderId) {
        // your logic here
        return order;
    }
}
```

### Using `Tracer` directly

```java
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.StatusCode;

@Service
public class PaymentService {

    private final Tracer tracer;

    public PaymentService(OpenTelemetry openTelemetry) {
        this.tracer = openTelemetry.getTracer("payment-service");
    }

    public void chargeCard(String cardToken, BigDecimal amount) {
        Span span = tracer.spanBuilder("chargeCard")
            .setAttribute("payment.amount", amount.doubleValue())
            .startSpan();

        try (var scope = span.makeCurrent()) {
            // business logic
            externalPaymentGateway.charge(cardToken, amount);
        } catch (Exception e) {
            span.recordException(e);
            span.setStatus(StatusCode.ERROR, e.getMessage());
            throw e;
        } finally {
            span.end();
        }
    }
}
```

## Spring Boot Configuration

```yaml
# application.yml
management:
  tracing:
    sampling:
      probability: 1.0  # 100% sampling (use lower in prod: 0.1)

otel:
  service:
    name: order-service
  exporter:
    otlp:
      endpoint: http://jaeger-collector:4317
      protocol: grpc
  traces:
    exporter: otlp
  metrics:
    exporter: otlp
  logs:
    exporter: otlp
```

```xml
<!-- pom.xml — Spring Boot 3.x with Micrometer Tracing -->
<dependency>
  <groupId>io.micrometer</groupId>
  <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
  <groupId>io.opentelemetry</groupId>
  <artifactId>opentelemetry-exporter-otlp</artifactId>
</dependency>
```

## Baggage

Baggage is key-value data propagated across the entire trace — useful for passing user IDs or tenant IDs through all spans:

```java
// Set baggage at entry point
Baggage.current()
    .toBuilder()
    .put("tenant.id", tenantId)
    .build()
    .makeCurrent();

// Read baggage anywhere downstream
String tenantId = Baggage.current().getEntryValue("tenant.id");
```

::: warning
Baggage is propagated to all downstream services — be careful not to put sensitive data in it.
:::

## OTel Collector

In production, services send telemetry to the **OTel Collector** (a standalone proxy), not directly to backends:

```
Services ──OTLP──► OTel Collector ──► Jaeger (traces)
                                  ──► Prometheus (metrics)
                                  ──► Loki (logs)
```

Benefits: buffer spikes, transform/filter data, fan out to multiple backends, decouple services from vendor SDKs.

## Summary

| Feature | Detail |
|---------|--------|
| Standard | CNCF OpenTelemetry |
| Auto-instrumentation | Java agent (zero-code) |
| Manual instrumentation | `@WithSpan`, `Tracer` API |
| Context propagation | W3C `traceparent` header |
| Export protocol | OTLP (gRPC or HTTP) |
| Spring Boot integration | `micrometer-tracing-bridge-otel` |

---

Next: [Prometheus & Grafana](/observability/prometheus-grafana) | [Distributed Tracing](/observability/distributed-tracing)
