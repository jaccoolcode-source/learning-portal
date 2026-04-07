---
title: Prometheus & Grafana
---

# Prometheus & Grafana

Prometheus is the de facto standard for metrics collection in cloud-native applications. Grafana is the visualization layer. Together, they provide real-time dashboards and alerting for production systems.

## Architecture Overview

```
Spring Boot App
  │ (Micrometer)
  ▼
/actuator/prometheus  ◄── Prometheus scrapes every 15s
  │
  ▼
Prometheus (time-series DB)
  │
  ▼
Grafana ─── dashboards, alerts
```

Prometheus uses a **pull model** — it scrapes metrics from endpoints at a configured interval. This is different from push-based systems (StatsD, Datadog).

## Micrometer

Micrometer is the **metrics facade for Java** — like SLF4J but for metrics. It provides a vendor-neutral API; the underlying implementation can be Prometheus, Datadog, CloudWatch, etc.

```xml
<!-- pom.xml -->
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
# application.yml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,prometheus
  metrics:
    export:
      prometheus:
        enabled: true
    tags:
      application: ${spring.application.name}
      environment: ${spring.profiles.active:dev}
```

Access metrics at: `http://localhost:8080/actuator/prometheus`

## Built-in Spring Boot Metrics

Spring Boot auto-configures many metrics out of the box:

| Metric | Description |
|--------|-------------|
| `http.server.requests` | HTTP request count, duration, status |
| `jvm.memory.used` | JVM heap and non-heap usage |
| `jvm.gc.pause` | GC pause duration |
| `hikaricp.connections.active` | DB connection pool usage |
| `process.cpu.usage` | CPU utilization |
| `executor.active` | Thread pool active threads |

## Custom Business Metrics

```java
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.Gauge;

@Service
public class OrderMetricsService {

    private final Counter ordersPlaced;
    private final Counter ordersFailed;
    private final Timer paymentDuration;
    private final AtomicInteger activeCheckouts = new AtomicInteger(0);

    public OrderMetricsService(MeterRegistry registry) {
        this.ordersPlaced = Counter.builder("orders.placed")
            .description("Total number of orders placed")
            .tag("status", "success")
            .register(registry);

        this.ordersFailed = Counter.builder("orders.placed")
            .description("Total number of orders placed")
            .tag("status", "failure")
            .register(registry);

        this.paymentDuration = Timer.builder("payment.processing.duration")
            .description("Time to process payment")
            .publishPercentiles(0.5, 0.95, 0.99)
            .register(registry);

        // Gauge: reflects current value (no increment/decrement API)
        Gauge.builder("checkouts.active", activeCheckouts, AtomicInteger::get)
            .description("Currently active checkout sessions")
            .register(registry);
    }

    public Order placeOrder(OrderRequest request) {
        activeCheckouts.incrementAndGet();
        try {
            return paymentDuration.recordCallable(() -> {
                Order order = processOrder(request);
                ordersPlaced.increment();
                return order;
            });
        } catch (Exception e) {
            ordersFailed.increment();
            throw e;
        } finally {
            activeCheckouts.decrementAndGet();
        }
    }
}
```

## Metric Types

| Type | Use for | Java class |
|------|---------|------------|
| **Counter** | Monotonically increasing count (requests, errors) | `Counter` |
| **Gauge** | Current value (queue depth, active users) | `Gauge` |
| **Timer** | Duration + count (request latency, method timing) | `Timer` |
| **DistributionSummary** | Distribution of values (payload sizes) | `DistributionSummary` |

## PromQL — Query Language

Prometheus Query Language (PromQL) is used to query metrics.

### Basic Queries

```promql
# Current value of a metric
jvm_memory_used_bytes

# Filter by label
http_server_requests_seconds_count{method="POST", status="500"}

# All metrics for a service
{application="order-service"}
```

### Rate and Increase

```promql
# Requests per second over last 5 minutes
rate(http_server_requests_seconds_count[5m])

# Total requests in last 1 hour
increase(http_server_requests_seconds_count[1h])
```

### Aggregation

```promql
# Total requests per endpoint across all instances
sum by (uri) (rate(http_server_requests_seconds_count[5m]))

# 99th percentile latency
histogram_quantile(0.99,
  rate(http_server_requests_seconds_bucket[5m])
)

# Error rate (5xx / total)
sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
/
sum(rate(http_server_requests_seconds_count[5m]))
```

### Top-k

```promql
# Top 5 slowest endpoints (p95 latency)
topk(5,
  histogram_quantile(0.95,
    rate(http_server_requests_seconds_bucket[5m])
  )
)
```

## Grafana Dashboards

### Key Dashboard Panels for a Java Service

1. **Request Rate** — `rate(http_server_requests_seconds_count[5m])`
2. **Error Rate** — filter `status=~"5.."` divided by total
3. **Latency p50/p95/p99** — `histogram_quantile(0.99, ...)`
4. **JVM Heap Used** — `jvm_memory_used_bytes{area="heap"}`
5. **GC Pauses** — `rate(jvm_gc_pause_seconds_sum[5m])`
6. **DB Connection Pool** — `hikaricp_connections_active`
7. **Thread Pool** — `executor_active_threads`

### Import Community Dashboards

Grafana.com hosts pre-built dashboards. Import by ID:
- **JVM Micrometer**: Dashboard ID 4701
- **Spring Boot Statistics**: Dashboard ID 6756

## Alerting Rules

```yaml
# prometheus-rules.yml
groups:
  - name: order-service-alerts
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
          /
          sum(rate(http_server_requests_seconds_count[5m]))
          > 0.05
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Error rate above 5%"
          description: "Error rate is {{ $value | humanizePercentage }}"

      - alert: HighP99Latency
        expr: |
          histogram_quantile(0.99,
            rate(http_server_requests_seconds_bucket[5m])
          ) > 2.0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "P99 latency above 2 seconds"
```

::: tip Interview tip
When asked about monitoring, mention: Counter/Gauge/Timer, Micrometer as abstraction, `histogram_quantile` for latency percentiles, and alerting on Golden Signals (error rate + latency + traffic + saturation).
:::

---

Next: [Distributed Tracing](/observability/distributed-tracing) | [Logging (ELK)](/observability/logging)
