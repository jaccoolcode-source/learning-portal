---
title: Observability
description: The three pillars of observability — metrics, logs, and distributed traces — with Prometheus, Micrometer, OpenTelemetry, and alerting
category: system-design
pageClass: layout-system-design
difficulty: advanced
tags: [observability, metrics, logging, tracing, prometheus, opentelemetry, alerting]
related:
  - /system-design/reliability
  - /spring/spring-boot
estimatedMinutes: 25
---

# Observability

<DifficultyBadge level="advanced" />

Observability is the ability to understand a system's internal state from its external outputs. Without observability, you're operating blind — you can't debug production issues, validate SLOs, or understand system behaviour under load.

---

## The Three Pillars

```
Metrics   → What is happening? (quantitative, aggregated)
Logs      → Why is it happening? (events, context, debugging)
Traces    → Where is time spent? (request flow across services)
```

| Pillar | Question Answered | Examples |
|--------|-----------------|---------|
| **Metrics** | Is the system healthy? What are the rates? | Requests/sec, error rate, p99 latency, CPU % |
| **Logs** | What happened exactly? | Error stack trace, request/response details |
| **Traces** | Which service caused the slowness? | End-to-end request path with spans per service |

All three are needed — each answers different questions.

---

## Metrics

### Metric Types

| Type | Description | Example |
|------|-------------|---------|
| **Counter** | Monotonically increasing value | Total HTTP requests, errors |
| **Gauge** | Point-in-time value (up or down) | Active connections, memory usage, queue depth |
| **Histogram** | Distribution of values with buckets | Request duration (p50, p90, p99) |
| **Summary** | Like histogram, pre-computed quantiles | Client-side latency percentiles |

### Spring Boot Actuator + Micrometer

Spring Boot auto-configures dozens of metrics via Actuator and Micrometer:

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-registry-prometheus</artifactId>
</dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  metrics:
    tags:
      application: order-service    # adds label to all metrics
      environment: production
```

Built-in metrics exposed at `/actuator/prometheus`:
```
# HTTP server metrics
http_server_requests_seconds_count{method="GET",status="200",uri="/api/orders"}
http_server_requests_seconds_sum{method="GET",status="200",uri="/api/orders"}
http_server_requests_seconds_max{method="GET",status="200",uri="/api/orders"}

# JVM metrics
jvm_memory_used_bytes{area="heap"}
jvm_gc_pause_seconds_count
jvm_threads_live_threads

# HikariCP (connection pool)
hikaricp_connections_active
hikaricp_connections_pending
hikaricp_connections_timeout_total
```

### Custom Metrics

```java
@Service
public class OrderService {
    private final Counter ordersCreated;
    private final Counter ordersFailed;
    private final Timer orderProcessingTime;
    private final Gauge pendingOrdersGauge;

    public OrderService(MeterRegistry registry, OrderRepository orderRepo) {
        this.ordersCreated = Counter.builder("orders.created")
            .description("Number of orders successfully created")
            .tag("region", "eu-west")
            .register(registry);

        this.ordersFailed = Counter.builder("orders.failed")
            .description("Number of order creation failures")
            .register(registry);

        this.orderProcessingTime = Timer.builder("orders.processing.duration")
            .description("Time to process an order")
            .publishPercentiles(0.5, 0.9, 0.99)
            .register(registry);

        // Gauge — polls the lambda on each scrape
        Gauge.builder("orders.pending", orderRepo, r -> r.countByStatus("PENDING"))
            .description("Number of orders in PENDING state")
            .register(registry);
    }

    public Order createOrder(OrderRequest request) {
        return orderProcessingTime.record(() -> {
            try {
                Order order = processOrder(request);
                ordersCreated.increment();
                return order;
            } catch (Exception e) {
                ordersFailed.increment(Tags.of("reason", e.getClass().getSimpleName()));
                throw e;
            }
        });
    }
}
```

### Prometheus + Grafana

```yaml
# prometheus.yml — scrape Spring Boot apps
scrape_configs:
  - job_name: 'order-service'
    scrape_interval: 15s
    static_configs:
      - targets: ['order-service:8080']
    metrics_path: /actuator/prometheus
```

```
# Useful PromQL queries in Grafana

# Request rate (per-second, 5-min window)
rate(http_server_requests_seconds_count[5m])

# Error rate
rate(http_server_requests_seconds_count{status=~"5.."}[5m])
  / rate(http_server_requests_seconds_count[5m])

# p99 latency
histogram_quantile(0.99,
  rate(http_server_requests_seconds_bucket[5m]))

# Active DB connections
hikaricp_connections_active{pool="HikariPool-1"}
```

---

## Logging

### Structured Logging

Log as JSON — machines can parse it; log aggregators can query on any field.

```java
// application.yml — configure logback for JSON output
logging:
  structured:
    format:
      console: ecs  # Spring Boot 3.4+ Elastic Common Schema

# Or use logstash-logback-encoder
```

```java
// Always log with context — not just a message
// BAD
log.error("Payment failed");

// GOOD — structured fields, searchable
log.error("Payment failed",
    kv("orderId", order.getId()),
    kv("userId", order.getUserId()),
    kv("amount", order.getTotal()),
    kv("errorCode", e.getCode())
);
```

### Correlation IDs (Trace IDs)

Every request gets a unique ID that flows through all downstream service calls.

```java
@Component
public class CorrelationIdFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain)
            throws ServletException, IOException {

        String correlationId = request.getHeader("X-Correlation-ID");
        if (correlationId == null) {
            correlationId = UUID.randomUUID().toString();
        }

        // Put in MDC — automatically included in all log statements
        MDC.put("correlationId", correlationId);
        response.setHeader("X-Correlation-ID", correlationId);

        try {
            chain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}
```

```json
// Every log line now includes correlationId — grep all logs for one request:
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "ERROR",
  "logger": "OrderService",
  "correlationId": "abc-123-def",
  "message": "Payment failed",
  "orderId": 42,
  "errorCode": "INSUFFICIENT_FUNDS"
}
```

### Log Levels

```java
log.trace("Very detailed debug — only in development");
log.debug("Development debugging — disable in production");
log.info("Significant business events: order created, user registered");
log.warn("Unexpected but handled: retry attempt 2/3, rate limit approaching");
log.error("Failed operation: payment failed, DB connection lost");
```

**Production settings:**
```yaml
logging:
  level:
    root: WARN
    com.myapp: INFO
    com.myapp.payment: DEBUG  # verbose for specific package
```

### What NOT to Log

```java
// NEVER log sensitive data
log.info("User login: {} password: {}", username, password);     // WRONG
log.debug("JWT token: {}", jwtToken);                           // WRONG
log.info("Card: {} cvv: {}", cardNumber, cvv);                  // WRONG
log.info("SSN: {}", socialSecurityNumber);                      // WRONG

// Use masking in logback pattern or filter out at code level
log.info("User login: user={}", username); // just the username
```

### Log Aggregation Stack

```
Spring Boot (JSON logs)
       ↓
Filebeat / Fluentd (collector — ships logs)
       ↓
Elasticsearch / Loki (storage + indexing)
       ↓
Kibana / Grafana (search, dashboards, alerts)

Search example: correlationId:"abc-123" AND level:ERROR
```

---

## Distributed Tracing

A trace follows a single request across multiple services. Each unit of work is a **span**.

```
Trace: place-order (total: 320ms)
├── Span: validate-user   (20ms)  → UserService
├── Span: check-inventory (80ms)  → InventoryService
│   └── Span: DB query    (70ms)  → PostgreSQL
├── Span: charge-payment  (150ms) → PaymentService
│   └── Span: stripe-api  (130ms) → Stripe (external)
└── Span: send-email      (70ms)  → NotificationService (async)
```

**Trace ID** propagates via HTTP headers (`traceparent` in W3C standard):
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
                  [trace-id (128-bit)]             [span-id (64-bit)]
```

### OpenTelemetry (OTel) — Standard

OpenTelemetry is the vendor-neutral standard for observability instrumentation. Spring Boot 3 has first-class support.

```xml
<dependency>
    <groupId>io.micrometer</groupId>
    <artifactId>micrometer-tracing-bridge-otel</artifactId>
</dependency>
<dependency>
    <groupId>io.opentelemetry.instrumentation</groupId>
    <artifactId>opentelemetry-spring-boot-starter</artifactId>
</dependency>
```

```yaml
management:
  tracing:
    sampling:
      probability: 1.0   # 1.0 = 100% (use 0.1 in production to sample 10%)
  otlp:
    tracing:
      endpoint: http://jaeger:4318/v1/traces  # or Zipkin, Grafana Tempo
```

Spring Boot auto-instruments HTTP requests, database calls, Kafka producers/consumers. The trace ID is injected into log MDC so logs and traces are correlated:

```json
{
  "level": "INFO",
  "message": "Processing payment",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7"
}
```

### Custom Spans

```java
@Autowired Tracer tracer;

public Order processOrder(OrderRequest request) {
    Span span = tracer.nextSpan().name("process-order")
        .tag("order.type", request.getType())
        .start();

    try (Tracer.SpanInScope scope = tracer.withSpan(span)) {
        Order order = orderRepo.save(buildOrder(request));
        span.tag("order.id", String.valueOf(order.getId()));
        return order;
    } catch (Exception e) {
        span.error(e);
        throw e;
    } finally {
        span.end();
    }
}
```

---

## Alerting

### What to Alert On

Alert on **symptoms** (user-facing impact), not **causes** (internal states).

```
GOOD alerts (symptom-based):
  - Error rate > 1% for 5 minutes → users seeing errors
  - p99 latency > 500ms → users experiencing slowness
  - Error budget burn rate > 2× → SLO at risk

BAD alerts (cause-based, noisy):
  - CPU > 80% → might be fine if throughput is high
  - Heap > 70% → JVM manages memory, GC handles this
  - One instance restarted → often self-heals, alert on pattern
```

### Prometheus Alerting Rules

```yaml
# alert.rules.yml
groups:
  - name: order-service
    rules:
      - alert: HighErrorRate
        expr: |
          rate(http_server_requests_seconds_count{status=~"5..",job="order-service"}[5m])
          / rate(http_server_requests_seconds_count{job="order-service"}[5m]) > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 1%"
          description: "Error rate {{ $value | humanizePercentage }} for 5 minutes"

      - alert: HighLatency
        expr: |
          histogram_quantile(0.99,
            rate(http_server_requests_seconds_bucket{job="order-service"}[5m])
          ) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "p99 latency above 500ms"
```

### Alert Fatigue

Too many alerts = ignored alerts. Design rules:

```
Principles:
1. Every alert must be actionable — if you don't know what to do, don't alert
2. Alert on SLO burn rate, not raw metrics
3. Use multi-window burn rate (5m fast burn + 1h slow burn)
4. Group related alerts — one alert per incident, not one per symptom
5. Review and prune alerts quarterly
```

---

## Health Checks

```java
// Spring Boot — custom health indicators
@Component
public class PaymentServiceHealthIndicator implements HealthIndicator {
    private final PaymentClient paymentClient;

    @Override
    public Health health() {
        try {
            paymentClient.ping(); // quick connectivity check
            return Health.up()
                .withDetail("payment-gateway", "reachable")
                .build();
        } catch (Exception e) {
            return Health.down()
                .withDetail("payment-gateway", "unreachable")
                .withException(e)
                .build();
        }
    }
}
```

```yaml
# Kubernetes liveness + readiness probes
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  initialDelaySeconds: 10
  periodSeconds: 5

# Liveness: is the app alive? (restart if not)
# Readiness: is the app ready for traffic? (remove from LB if not)
```

---

## Interview Quick-Fire

**Q: What's the difference between metrics, logs, and traces?**
Metrics are aggregated numerical measurements over time (error rate, latency percentiles) — good for dashboards and alerting. Logs are individual event records with context — good for debugging specific incidents. Traces follow a single request across services, showing which service took how long — good for finding latency bottlenecks in distributed systems. All three are complementary.

**Q: What should you alert on — CPU usage or error rate?**
Alert on symptoms (user-facing impact), not causes. Error rate > 1% and p99 latency > 500ms directly indicate users are affected. High CPU might be intentional during a peak. Cause-based alerts are noisy, lead to alert fatigue, and oncall engineers stop trusting them.

**Q: How does distributed tracing work across microservices?**
Each request is assigned a trace ID at the entry point (API gateway or first service). This ID propagates via HTTP headers (`traceparent`) to all downstream calls. Each service creates spans (units of work) tagged with the trace ID. A tracing backend (Jaeger, Zipkin, Grafana Tempo) collects all spans and reconstructs the full call tree, showing which service called what and how long each step took.

<RelatedTopics :topics="['/system-design/reliability', '/system-design/scalability', '/spring/spring-boot']" />

[→ Back to System Design Overview](/system-design/)
