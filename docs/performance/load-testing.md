---
title: Load Testing & Capacity Planning
description: Gatling DSL, k6, test types (load/stress/soak/spike), finding breaking points, interpreting results, and capacity planning
category: performance
pageClass: layout-performance
difficulty: advanced
tags: [load-testing, gatling, k6, capacity-planning, performance-testing, stress-testing]
related:
  - /performance/profiling
  - /system-design/reliability
  - /system-design/scalability
estimatedMinutes: 30
---

# Load Testing & Capacity Planning

<DifficultyBadge level="advanced" />

Load testing proves that your system meets its SLOs under realistic traffic. It finds breaking points before users do and provides the data needed to plan infrastructure capacity.

---

## Test Types

| Type | Goal | How |
|------|------|-----|
| **Load test** | Verify SLOs under expected traffic | Ramp to expected peak, hold, ramp down |
| **Stress test** | Find the breaking point | Ramp beyond expected peak until failure |
| **Soak test** | Find memory leaks and slow degradation | Run at 60–80% capacity for hours/days |
| **Spike test** | Handle sudden traffic bursts | Instantly jump to 10× normal load |
| **Smoke test** | Sanity check (not performance) | Minimal load — does it work at all? |

---

## Gatling (Java/Scala DSL)

Gatling is the standard load testing tool for Java teams. Simulations are code (not XML), enabling version control and CI integration.

### Maven Setup

```xml
<plugin>
    <groupId>io.gatling</groupId>
    <artifactId>gatling-maven-plugin</artifactId>
    <version>4.9.0</version>
    <configuration>
        <simulationClass>simulations.OrderServiceSimulation</simulationClass>
    </configuration>
</plugin>

<dependency>
    <groupId>io.gatling.highcharts</groupId>
    <artifactId>gatling-charts-highcharts</artifactId>
    <version>3.10.5</version>
    <scope>test</scope>
</dependency>
```

### Basic Simulation

```java
// src/test/java/simulations/OrderServiceSimulation.java
import io.gatling.javaapi.core.*;
import io.gatling.javaapi.http.*;
import static io.gatling.javaapi.core.CoreDsl.*;
import static io.gatling.javaapi.http.HttpDsl.*;

public class OrderServiceSimulation extends Simulation {

    // ── HTTP Configuration ────────────────────────────────────────────────
    HttpProtocolBuilder httpProtocol = http
        .baseUrl("https://api.myapp.com")
        .acceptHeader("application/json")
        .contentTypeHeader("application/json")
        .userAgentHeader("Gatling LoadTest");

    // ── Scenarios ─────────────────────────────────────────────────────────
    ScenarioBuilder browseProducts = scenario("Browse Products")
        .exec(
            http("Get Products")
                .get("/api/products?page=0&size=20")
                .check(status().is(200))
                .check(jmesPath("content[0].id").saveAs("productId"))
        )
        .pause(1, 3)  // think time: 1–3 seconds between requests
        .exec(
            http("Get Product Detail")
                .get("/api/products/#{productId}")
                .check(status().is(200))
        );

    ScenarioBuilder placeOrder = scenario("Place Order")
        .exec(
            http("Create Order")
                .post("/api/orders")
                .body(StringBody("""
                    {"productId": 42, "quantity": 1, "userId": 100}
                    """))
                .check(status().is(201))
                .check(jsonPath("$.id").saveAs("orderId"))
        )
        .pause(2)
        .exec(
            http("Check Order Status")
                .get("/api/orders/#{orderId}")
                .check(status().is(200))
                .check(jsonPath("$.status").is("PENDING"))
        );

    // ── Load Profile ──────────────────────────────────────────────────────
    {
        setUp(
            browseProducts.injectOpen(
                nothingFor(5),                          // wait 5s before starting
                atOnceUsers(10),                        // immediate spike of 10 users
                rampUsers(50).during(30),               // ramp from 10→60 over 30s
                constantUsersPerSec(5).during(60),      // sustain 5 new users/s for 60s
                rampUsersPerSec(5).to(50).during(60)    // accelerate 5→50 users/s
            ),
            placeOrder.injectOpen(
                rampUsers(20).during(60)
            )
        )
        .protocols(httpProtocol)
        .assertions(
            global().responseTime().percentile(99).lt(500),  // p99 < 500ms
            global().successfulRequests().percent().gt(99.0), // 99% success rate
            global().requestsPerSec().gt(100.0)              // > 100 RPS
        );
    }
}
```

### Run

```bash
# Run simulation
mvn gatling:test

# Specify simulation
mvn gatling:test -Dgatling.simulationClass=simulations.StressTestSimulation

# HTML report generated at: target/gatling/simulation-timestamp/index.html
```

### Feeder — Parameterised Requests

```java
// CSV feeder — use different users from a file
FeederBuilder<String> userFeeder = csv("users.csv").circular();
// users.csv: userId,email,authToken

ScenarioBuilder authenticatedScenario = scenario("Authenticated Browse")
    .feed(userFeeder)   // inject data from feeder into session
    .exec(
        http("Authenticated Request")
            .get("/api/profile")
            .header("Authorization", "Bearer #{authToken}")
            .check(status().is(200))
    );

// Random feeder
FeederBuilder<Integer> productIdFeeder = listFeeder(
    List.of(Map.of("productId", 1),
            Map.of("productId", 2),
            Map.of("productId", 3))
).random();
```

### Closed vs Open Workload

```java
// OPEN workload: users arrive at a fixed rate (realistic for web APIs)
// New users don't wait for others to finish
browseProducts.injectOpen(
    constantUsersPerSec(50).during(60)
)

// CLOSED workload: fixed pool of concurrent users (realistic for batch, internal APIs)
// Each user completes request before another starts
browseProducts.injectClosed(
    constantConcurrentUsers(50).during(60)
)
```

---

## k6 (JavaScript DSL)

k6 is a modern load testing tool with a simpler scripting model, excellent for teams not using Java/Scala:

```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');

// Load profile
export const options = {
    stages: [
        { duration: '30s', target: 50 },    // ramp up to 50 users
        { duration: '1m', target: 50 },     // hold at 50 users
        { duration: '30s', target: 100 },   // ramp to 100
        { duration: '2m', target: 100 },    // hold at 100
        { duration: '30s', target: 0 },     // ramp down
    ],
    thresholds: {
        http_req_duration: ['p(99)<500'],   // p99 < 500ms
        errors: ['rate<0.01'],              // error rate < 1%
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const res = http.get('https://api.myapp.com/api/products');

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 200ms': (r) => r.timings.duration < 200,
    });

    errorRate.add(res.status !== 200);
    sleep(1);  // think time
}
```

```bash
k6 run load-test.js
k6 run --out json=results.json load-test.js
```

### Gatling vs k6

| | Gatling | k6 |
|--|---------|-----|
| Language | Java / Scala | JavaScript |
| Reports | Built-in HTML | CLI + Grafana integration |
| Protocol support | HTTP, WebSocket, gRPC, JMS | HTTP, WebSocket, gRPC |
| Java ecosystem | Native | Separate tool |
| CI integration | Maven plugin | CLI binary |
| Learning curve | Higher | Lower |

---

## Finding the Breaking Point

A stress test ramps load until the system breaks. Key inflection points:

```
Throughput (RPS)
     │              ██ ← breaking point (RPS drops, errors spike)
     │           ███
     │         ███
     │       ███
     │    ████
     │ ████
     └────────────────────────────── Concurrent Users

Latency
     │                         ████ ← latency cliff
     │                      ███
     │                   ███
     │ ─────────────────█
     └────────────────────────────── Concurrent Users
```

**The Knee of the Curve:** The point where latency starts rising sharply is the sustainable operating point. Run production at 60–70% of this point to have headroom for traffic spikes.

### What to Watch During a Stress Test

```
Application:
  - Response time percentiles (p50, p90, p99) — are they rising?
  - Error rate — >1% is a problem; >5% is critical
  - Active thread count — are threads exhausted?

Database:
  - Connection pool active count → approaching maximum-pool-size?
  - Query time — are slow queries appearing?
  - Replication lag — is replica falling behind?

JVM:
  - GC pause frequency and duration — is GC time increasing?
  - Heap usage — is it growing without releasing?
  - CPU — is it CPU-bound or I/O-bound?

Infrastructure:
  - CPU usage across pods — even distribution?
  - Memory — approaching container limit?
  - Network — bandwidth saturation?
```

---

## Interpreting Gatling Results

Gatling's HTML report contains:

```
Global Statistics:
  Total requests: 150,000
  Successful: 149,700 (99.8%)
  Failed: 300 (0.2%)

Response Time Distribution:
  < 800ms:  95%
  < 1200ms: 99%
  < 2000ms: 99.9%
  Slowest:  8,432ms ← investigate outliers

Percentiles:
  p50: 45ms   ← typical user experience
  p75: 120ms
  p95: 380ms
  p99: 720ms  ← compare against SLO (must be < 500ms for this SLO = FAIL)
  p99.9: 4200ms ← look at traces for these outlier requests
```

**Common failure patterns:**

```
Pattern: p99 fine, but p99.9 is 10× p99
→ Occasional thread pool saturation or GC pause affecting worst-case requests

Pattern: Latency rises steadily throughout the test
→ Soak test finding: memory leak, cache filling, connection pool leak

Pattern: Sharp cliff at specific RPS
→ Thread pool exhausted — increase pool size or switch to async

Pattern: Error rate spikes at specific time
→ GC pause causing timeouts — tune GC or reduce allocation rate

Pattern: Errors from specific endpoints only
→ One slow downstream call — check circuit breaker, timeout
```

---

## Capacity Planning

Use load test results to plan how many instances you need.

```
Load test result: one instance handles 500 RPS at p99 < 200ms

Production requirement:
  - Expected peak: 3,000 RPS
  - Safety margin: 2× (for unexpected spikes)
  - Required: 3,000 × 2 / 500 = 12 instances

With auto-scaling:
  - Min instances: 6 (handle 3,000 RPS)
  - Max instances: 20 (handle 10,000 RPS burst)
  - Scale-out trigger: CPU > 60% or p99 > 200ms
```

### Amdahl's Law for Horizontal Scaling

```
If 5% of request processing is serial (one DB call, one lock),
  then maximum speedup from N machines:
  speedup = 1 / (0.05 + 0.95/N)

At N=10:  speedup = 1 / (0.05 + 0.095) = 6.9×
At N=100: speedup = 1 / (0.05 + 0.0095) = 16.8×
At N=∞:   speedup = 1 / 0.05 = 20×  ← theoretical max even with infinite machines

→ Eliminate serial bottlenecks (shared locks, single DB writes) before scaling horizontally
```

---

## CI Integration

Run a smoke load test on every deployment, full load test on release candidates:

```yaml
# GitHub Actions
- name: Smoke load test
  run: |
    mvn gatling:test \
      -Dgatling.simulationClass=simulations.SmokeTest \
      -Dbase.url=https://staging.myapp.com
  env:
    GATLING_ASSERTIONS_FAIL_ON_ERROR: true

# Full load test (manual trigger or release branch)
- name: Full load test
  if: github.ref == 'refs/heads/release'
  run: |
    mvn gatling:test \
      -Dgatling.simulationClass=simulations.ProductionLoadTest
```

---

## Interview Quick-Fire

**Q: What's the difference between a load test and a stress test?**
A load test runs at expected production traffic levels to verify SLOs are met under normal conditions. A stress test deliberately exceeds expected capacity to find the breaking point — where does the system start returning errors or where does latency become unacceptable? Stress testing gives you the safety margin information: "we break at 5,000 RPS, we expect 2,000 in production — we have 2.5× headroom."

**Q: What metrics do you watch during a load test?**
Primarily p99 response time and error rate (user-facing metrics). Then thread pool active count, DB connection pool usage, and GC pause duration (resource metrics). If p99 rises — check which layer is slow using distributed traces. If error rate rises — check circuit breakers and downstream timeouts. If CPU maxes out — profile to find the hot code path.

**Q: How do you determine how many instances to run in production?**
Load test one instance to find its capacity (e.g., 500 RPS at SLO). Divide expected peak by that number, then multiply by 2× safety margin. Set auto-scaling min to cover expected peak and max to cover the spike budget. Always validate with a load test against the full multi-instance setup — there are often shared bottlenecks (DB connection pool, shared cache) that single-instance tests don't reveal.

<RelatedTopics :topics="['/performance/profiling', '/system-design/reliability', '/system-design/scalability', '/system-design/observability']" />

[→ Back to Performance Overview](/performance/)
