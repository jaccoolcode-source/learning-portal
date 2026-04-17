---
title: AWS CloudWatch
description: Amazon CloudWatch — metrics, logs, alarms, dashboards, Logs Insights, and observability best practices
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, cloudwatch, metrics, logs, alarms, dashboards, observability, monitoring]
estimatedMinutes: 25
---

# AWS CloudWatch

<DifficultyBadge level="intermediate" />

CloudWatch is AWS's native observability service — it collects metrics, logs, and traces, and allows you to set alarms and build dashboards across your entire AWS environment.

---

## Core Components

| Component | Description |
|-----------|-------------|
| **Metrics** | Time-series numerical data (CPU%, request count, latency) |
| **Logs** | Log groups → log streams → log events |
| **Alarms** | Threshold-based notifications (SNS, Auto Scaling, Lambda) |
| **Dashboards** | Custom visualisations of metrics |
| **Logs Insights** | SQL-like query engine for log data |
| **Contributor Insights** | Identify top contributors in high-cardinality data |
| **Synthetics** | Canary scripts that test endpoints on a schedule |

---

## Metrics

```bash
# Publish custom metric
aws cloudwatch put-metric-data \
  --namespace "MyApp/Orders" \
  --metric-name "ProcessingTime" \
  --value 234 \
  --unit Milliseconds \
  --dimensions Service=OrderService,Environment=prod
```

```java
// AWS SDK v2
CloudWatchClient cw = CloudWatchClient.create();

cw.putMetricData(PutMetricDataRequest.builder()
    .namespace("MyApp/Orders")
    .metricData(MetricDatum.builder()
        .metricName("ProcessingTime")
        .value(234.0)
        .unit(StandardUnit.MILLISECONDS)
        .dimensions(
            Dimension.builder().name("Service").value("OrderService").build(),
            Dimension.builder().name("Environment").value("prod").build()
        )
        .timestamp(Instant.now())
        .build())
    .build());
```

### Key Built-in Metrics

| Service | Metric | Alarm On |
|---------|--------|----------|
| Lambda | `Errors`, `Throttles`, `Duration` | Errors > 0, Throttles > 10 |
| SQS | `ApproximateAgeOfOldestMessage` | Age > 5min |
| ECS | `CPUUtilization`, `MemoryUtilization` | CPU > 80% |
| RDS | `DatabaseConnections`, `FreeStorageSpace` | Connections > 90% of max |
| API Gateway | `5XXError`, `Latency` | 5XX > 1%, P99 latency > 2s |

---

## Alarms

```bash
# Create alarm: alert if Lambda errors > 5 in 5 minutes
aws cloudwatch put-metric-alarm \
  --alarm-name "OrderLambda-Errors" \
  --alarm-description "Too many errors in order Lambda" \
  --metric-name Errors \
  --namespace AWS/Lambda \
  --dimensions Name=FunctionName,Value=order-processor \
  --statistic Sum \
  --period 300 \
  --threshold 5 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:eu-west-1:123:ops-alerts \
  --treat-missing-data notBreaching
```

### Composite Alarms

```bash
# Alert only when BOTH error rate AND latency are high (reduces noise)
aws cloudwatch put-composite-alarm \
  --alarm-name "OrderService-Degraded" \
  --alarm-rule "ALARM(OrderLambda-Errors) AND ALARM(OrderLambda-HighLatency)" \
  --alarm-actions arn:aws:sns:eu-west-1:123:ops-alerts
```

---

## Logs

```java
// Spring Boot auto-sends logs to CloudWatch via CloudWatch Logs agent or awslogs driver
// For custom structured logging:
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

private static final Logger log = LoggerFactory.getLogger(OrderService.class);

// Structured log (JSON format — queryable in Logs Insights)
log.info("{\"event\":\"OrderCreated\",\"orderId\":\"{}\",\"customerId\":\"{}\",\"amount\":{}}",
    order.getId(), order.getCustomerId(), order.getAmount());
```

```json
// awslogs driver in ECS task definition (sends container stdout to CloudWatch)
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-group": "/ecs/order-service",
    "awslogs-region": "eu-west-1",
    "awslogs-stream-prefix": "ecs"
  }
}
```

---

## CloudWatch Logs Insights

```sql
-- Error rate by function over last hour
fields @timestamp, @message
| filter @message like /ERROR/
| stats count(*) as errorCount by bin(5m)
| sort @timestamp desc

-- P99 Lambda duration from REPORT lines
fields @duration
| filter @type = "REPORT"
| stats pct(@duration, 99) as p99, avg(@duration) as avg by bin(1m)

-- Top 10 most frequent error messages
fields @message
| filter level = "ERROR"
| stats count(*) as cnt by errorMessage
| sort cnt desc
| limit 10
```

---

## Metric Filters

Extract metrics from log data without changing application code.

```bash
# Create metric filter: count ERROR log lines as a metric
aws logs put-metric-filter \
  --log-group-name "/ecs/order-service" \
  --filter-name "ErrorCount" \
  --filter-pattern "[timestamp, requestId, level=ERROR, ...]" \
  --metric-transformations \
    metricName=ErrorCount,metricNamespace=MyApp/Orders,metricValue=1,defaultValue=0
```

---

## Dashboards

```json
// Dashboard widget: Lambda error rate + invocations side-by-side
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "title": "Order Lambda — Errors vs Invocations",
        "metrics": [
          ["AWS/Lambda", "Errors", "FunctionName", "order-processor", {"stat": "Sum", "color": "#d62728"}],
          ["AWS/Lambda", "Invocations", "FunctionName", "order-processor", {"stat": "Sum", "yAxis": "right"}]
        ],
        "period": 60,
        "view": "timeSeries"
      }
    }
  ]
}
```

---

## Interview Quick-Fire

**Q: What's the difference between a metric and a log in CloudWatch?**
Metrics are pre-aggregated numerical time-series (e.g., CPU% sampled every 60s). Logs are raw text or structured events stored per occurrence. Metrics are cheaper to query and alarm on; logs give you full context for debugging.

**Q: How do you extract metrics from application logs without changing code?**
Use CloudWatch **Metric Filters** — define a pattern (regex or space-delimited filter pattern) on a log group, and CloudWatch increments a custom metric every time a matching line is written.

**Q: What is `treat-missing-data` in an alarm?**
Determines how an alarm handles periods with no data: `notBreaching` (treat as OK — good default), `breaching` (treat as alarm — for critical services that must always report), `missing` (alarm goes to INSUFFICIENT_DATA state), or `ignore` (keep previous state).

<RelatedTopics :topics="['/aws/', '/observability/', '/aws/lambda']" />

[→ Back to AWS Overview](/aws/)
