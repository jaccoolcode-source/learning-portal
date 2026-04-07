---
title: Observability Overview
---

# Observability

Observability is the ability to understand what is happening inside a system from its external outputs. In modern distributed systems, observability is not optional — it is what separates teams that detect problems in seconds from those that debug for hours.

## The Three Pillars

| Pillar | What it answers | Examples |
|--------|----------------|---------|
| **Metrics** | How is my system behaving? (numbers over time) | Request rate, error rate, CPU usage, latency percentiles |
| **Logs** | What exactly happened? (discrete events) | Request logs, exception stack traces, audit trails |
| **Traces** | How did a request flow through the system? | Distributed trace showing spans across services |

Together, the three pillars give you **correlatable** signals. A metric spike → find related traces → find related log lines.

## Why Observability Matters for Interviews

System design and backend interviews frequently ask:
- How would you monitor this system?
- How would you debug a latency spike?
- How would you trace a slow request across 5 microservices?

Knowing the tools and patterns (OpenTelemetry, Prometheus, Grafana, Jaeger, ELK) demonstrates senior-level production experience.

## Observability vs Monitoring

| | Monitoring | Observability |
|---|---|---|
| **Focus** | Known failures (dashboards, alerts) | Unknown unknowns (exploration, debugging) |
| **Approach** | React to thresholds | Investigate why |
| **Tooling** | Dashboards, alerts | Metrics + traces + logs (correlated) |

Monitoring asks "is the system up?". Observability asks "why is the system behaving this way?".

## Tool Landscape

```
Metrics          Logs              Traces
────────         ──────            ───────
Prometheus       Logstash          Jaeger
Grafana          Elasticsearch     Zipkin
Micrometer       Kibana (ELK)      Tempo (Grafana)
StatsD           Fluentd           AWS X-Ray
Datadog          Loki (Grafana)

       Unified: OpenTelemetry (CNCF)
       Platform: Datadog, Dynatrace, New Relic
```

## Standard: OpenTelemetry

[OpenTelemetry](/observability/opentelemetry) (OTel) is the CNCF standard for vendor-neutral instrumentation. One SDK, exportable to any backend (Jaeger, Prometheus, Datadog, etc.).

## Section Map

- [OpenTelemetry](/observability/opentelemetry) — OTel SDK, auto-instrumentation, Spring Boot integration
- [Prometheus & Grafana](/observability/prometheus-grafana) — Micrometer, PromQL, custom metrics, alerting
- [Distributed Tracing](/observability/distributed-tracing) — Trace/span model, Jaeger vs Zipkin, sampling
- [Logging (ELK)](/observability/logging) — Structured logging, MDC, Logback JSON, ELK stack

## Golden Signals (Google SRE)

The four metrics Google SRE recommends monitoring for any service:

| Signal | Description | Example metric |
|--------|-------------|----------------|
| **Latency** | Time to serve a request | p99 response time |
| **Traffic** | Demand on the system | Requests per second |
| **Errors** | Rate of failing requests | HTTP 5xx rate |
| **Saturation** | How "full" is the service | CPU %, queue depth |

::: tip Interview tip
When asked "how would you monitor X?", start with the four Golden Signals — latency, traffic, errors, saturation — then add domain-specific metrics.
:::
