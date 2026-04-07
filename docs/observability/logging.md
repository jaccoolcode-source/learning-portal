---
title: Logging (ELK Stack)
---

# Logging (ELK Stack)

Logs are the most detailed observability signal. A well-structured logging setup lets you search, filter, and correlate log events across hundreds of service instances in real time.

## Structured Logging vs Plain Text

### Plain Text Logging (problematic)

```
2024-01-15 10:23:45 INFO  Order 12345 for user john@example.com placed, total: $99.99
```

Problems:
- Hard to parse programmatically
- No consistent field names for filtering
- Can't easily aggregate by `user.id` or `order.total`
- Sensitive data may leak into logs unintentionally

### Structured Logging (JSON)

```json
{
  "timestamp": "2024-01-15T10:23:45.123Z",
  "level": "INFO",
  "logger": "c.example.OrderService",
  "message": "Order placed",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "spanId": "00f067aa0ba902b7",
  "service": "order-service",
  "environment": "production",
  "orderId": 12345,
  "userId": "user-789",
  "orderTotal": 99.99
}
```

Each field is queryable in Kibana: `orderId:12345`, `level:ERROR`, `traceId:4bf92f3...`

## Logback JSON Configuration

```xml
<!-- pom.xml -->
<dependency>
  <groupId>net.logstash.logback</groupId>
  <artifactId>logstash-logback-encoder</artifactId>
  <version>7.4</version>
</dependency>
```

```xml
<!-- logback-spring.xml -->
<?xml version="1.0" encoding="UTF-8"?>
<configuration>

  <springProperty name="APP_NAME" source="spring.application.name"/>
  <springProperty name="ENVIRONMENT" source="spring.profiles.active" defaultValue="dev"/>

  <appender name="JSON_CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
      <customFields>{"service":"${APP_NAME}","environment":"${ENVIRONMENT}"}</customFields>
      <includeMdcKeyName>traceId</includeMdcKeyName>
      <includeMdcKeyName>spanId</includeMdcKeyName>
      <includeMdcKeyName>userId</includeMdcKeyName>
    </encoder>
  </appender>

  <!-- Plain text for local development -->
  <appender name="CONSOLE" class="ch.qos.logback.core.ConsoleAppender">
    <encoder>
      <pattern>%d{HH:mm:ss.SSS} %-5level [%X{traceId:-},%X{spanId:-}] %logger{36} - %msg%n</pattern>
    </encoder>
  </appender>

  <springProfile name="prod">
    <root level="INFO">
      <appender-ref ref="JSON_CONSOLE"/>
    </root>
  </springProfile>

  <springProfile name="!prod">
    <root level="DEBUG">
      <appender-ref ref="CONSOLE"/>
    </root>
  </springProfile>

</configuration>
```

## MDC — Mapped Diagnostic Context

MDC is a thread-local key-value store that automatically includes context in every log message on that thread.

```java
import org.slf4j.MDC;

@Component
public class RequestLoggingFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;

        // Populate MDC for all log messages on this thread
        MDC.put("requestId", UUID.randomUUID().toString());
        MDC.put("clientIp", httpRequest.getRemoteAddr());
        MDC.put("userId", extractUserId(httpRequest));

        try {
            chain.doFilter(request, response);
        } finally {
            MDC.clear();  // Always clear to avoid thread pool pollution
        }
    }
}
```

With this filter, every log line automatically includes `requestId`, `clientIp`, and `userId` — without passing them explicitly to every method.

### MDC with Trace IDs

Spring Boot + Micrometer Tracing automatically populates `traceId` and `spanId` in MDC. Link your logs to Jaeger traces:

```java
log.info("Processing payment");
// Logs: {"message":"Processing payment","traceId":"4bf92f3577b34da6","spanId":"a3ce929d"}
```

In Jaeger: find the trace → copy traceId → search in Kibana: `traceId: 4bf92f3577b34da6`

## Logging Best Practices

```java
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    public Order placeOrder(OrderRequest request) {
        // ✅ Use structured arguments, not string concatenation
        log.info("Placing order", kv("orderId", request.getId()),
                                  kv("userId", request.getUserId()),
                                  kv("total", request.getTotal()));

        // ✅ Log exceptions with full stack trace
        try {
            return processOrder(request);
        } catch (PaymentException e) {
            log.error("Payment failed for order {}", request.getId(), e);
            throw e;
        }

        // ❌ Avoid — hard to parse, string concatenation is slow if log level disabled
        // log.info("Placing order " + request.getId() + " for user " + request.getUserId());

        // ❌ Never log sensitive data
        // log.info("Processing payment for card: " + cardNumber);  // PCI violation!
    }
}
```

### Log Levels Guide

| Level | When to use |
|-------|------------|
| `ERROR` | Unrecoverable errors, exceptions that affect the user |
| `WARN` | Recoverable problems, unexpected-but-handled conditions |
| `INFO` | Business events (order placed, user registered, job started) |
| `DEBUG` | Developer diagnostics, method entry/exit in complex flows |
| `TRACE` | Fine-grained, rarely needed (loop iterations, raw data) |

## ELK Stack

**Elasticsearch + Logstash + Kibana** is the classic log aggregation stack.

```
Spring Boot App
  │ (JSON logs to stdout)
  ▼
Filebeat (log shipper, lightweight)
  │
  ▼
Logstash (transform, filter, enrich)
  │
  ▼
Elasticsearch (store, index, search)
  │
  ▼
Kibana (search, dashboards, alerts)
```

### Filebeat Configuration

```yaml
# filebeat.yml
filebeat.inputs:
  - type: container
    paths:
      - /var/lib/docker/containers/*/*.log
    processors:
      - add_docker_metadata: ~

output.logstash:
  hosts: ["logstash:5044"]
```

### Logstash Pipeline

```ruby
# logstash.conf
input {
  beats { port => 5044 }
}

filter {
  json {
    source => "message"
  }
  date {
    match => ["timestamp", "ISO8601"]
    target => "@timestamp"
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "logs-%{service}-%{+YYYY.MM.dd}"
  }
}
```

### Kibana Queries

```
# Find all errors in order-service
service: "order-service" AND level: "ERROR"

# Find logs for a specific trace
traceId: "4bf92f3577b34da6a3ce929d0e0e4736"

# Find slow requests
level: "INFO" AND message: "Request completed" AND duration > 1000

# Find a user's activity
userId: "user-789" AND @timestamp: [now-1h TO now]
```

## Modern Alternative: Loki

Grafana **Loki** is a lightweight log aggregation system designed for cloud-native environments:

- **No full-text indexing** (unlike Elasticsearch) — only indexes labels, not log content. Much cheaper storage.
- **LogQL** query language (similar to PromQL)
- Integrates natively with Grafana — same tool for metrics and logs
- Promtail agent (like Filebeat but for Loki)

```promql
# LogQL — find errors in order-service
{service="order-service", level="ERROR"}

# With content filter
{service="order-service"} |= "PaymentException"

# Parse JSON and filter
{service="order-service"} | json | orderId > 0 | level = "ERROR"
```

::: tip Interview tip
Key points: structured JSON logs (not plain text), MDC for request/trace context, never log sensitive data, log at the right level. For the ELK vs Loki question: Elasticsearch is powerful but expensive; Loki is cheaper and integrates with Grafana stack.
:::

---

Back to [Overview](/observability/) | [Distributed Tracing](/observability/distributed-tracing)
