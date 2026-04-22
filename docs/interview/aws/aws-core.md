# AWS

**Q53 to Q56** · [← AWS Overview](./index)

---

## Q53: AWS Lambda & Serverless

> Lambda questions test whether you understand the operational model, not just "it runs code without a server." Know cold starts, concurrency limits, and when Lambda is the wrong choice.

AWS Lambda is a **Function-as-a-Service (FaaS)** compute model. You upload code; AWS provisions infrastructure, scales automatically, and bills per invocation + duration (millisecond granularity). No servers to manage.

**Lambda execution model:**
```
Event Source → Lambda Service → Execution Environment (container)
                              → Your function handler
                              → Response / side effects
```

| Property | Value |
|----------|-------|
| Max execution time | 15 minutes |
| Memory | 128 MB – 10 GB |
| Ephemeral disk (`/tmp`) | 512 MB – 10 GB |
| Concurrency | 1,000 concurrent executions per account/region (soft limit) |
| Deployment package | 50 MB zipped / 250 MB unzipped (or container image up to 10 GB) |

::: details Full model answer

**Cold start problem:**
When Lambda needs to spin up a new execution environment, it must:
1. Provision a container
2. Load the runtime (JVM for Java — this is the expensive part)
3. Initialize your application (Spring context, DB connections)
4. Execute the handler

For Java with Spring Boot, cold start can be **5–15 seconds**. Subsequent invocations on the same warm container are fast (~ms).

**Cold start mitigation strategies:**

**1. Provisioned Concurrency:**
Pre-warms a specified number of execution environments. They're always ready — no cold starts. Costs money even when idle.
```yaml
# SAM template
AutoPublishAlias: live
ProvisionedConcurrencyConfig:
  ProvisionedConcurrentExecutions: 5
```

**2. SnapStart (Java 21+):**
Lambda takes a snapshot of the initialized execution environment (after `@PostConstruct`, before handler). Restores from snapshot instead of reinitializing. Reduces Java cold start from ~10s to ~1s.
```yaml
SnapStart:
  ApplyOn: PublishedVersions
```

**3. Reduce initialization time:**
- Use `quarkus` or `micronaut` instead of Spring Boot — faster startup, GraalVM native image support
- Lazy-initialize heavy dependencies
- Avoid loading unused libraries

**4. Keep warm (legacy trick):**
Schedule EventBridge to invoke Lambda every 5 minutes. Keeps container warm. Not recommended — use Provisioned Concurrency instead.

**Lambda triggers (event sources):**
```
API Gateway / ALB   → HTTP APIs (synchronous)
SQS                 → Queue processing (asynchronous)
SNS                 → Notifications (asynchronous)
EventBridge         → Scheduled tasks, event bus routing
S3                  → Object created/deleted events
DynamoDB Streams    → React to table changes
Kinesis             → Stream processing
```

**Spring Boot on Lambda (AWS Lambda Web Adapter):**
```java
// Lightweight handler — no Spring Boot, for best performance
public class OrderHandler implements RequestHandler<SQSEvent, Void> {
    private final OrderService orderService = new OrderService();

    @Override
    public Void handleRequest(SQSEvent event, Context context) {
        event.getRecords().forEach(record -> {
            OrderEvent order = parseJson(record.getBody());
            orderService.process(order);
        });
        return null;
    }
}
```

**SQS + Lambda — concurrency and batching:**
```yaml
# Event source mapping
BatchSize: 10              # process up to 10 messages per invocation
MaximumBatchingWindowInSeconds: 5
FunctionResponseTypes:
  - ReportBatchItemFailures  # partial batch failure support
```

With `ReportBatchItemFailures`, a Lambda can report individual message failures instead of failing the entire batch — preventing successful messages from being reprocessed.

**Lambda limitations (when NOT to use Lambda):**
| Limitation | Impact |
|-----------|--------|
| 15-minute max | Long-running jobs need ECS/Fargate or Step Functions |
| Cold starts (Java) | Latency-sensitive, user-facing APIs → use ECS/EKS |
| 1,000 concurrent limit | Bursty high-concurrency workloads — request limit increase |
| No persistent local state | Stateful apps need external state (Redis, DynamoDB) |
| VPC cold starts | Lambda in VPC adds ENI attachment latency |

**AWS Lambda Powertools for Java:**
```java
@Logging(logEvent = true)
@Tracing
@Metrics(namespace = "OrderService")
public class OrderHandler implements RequestHandler<SQSEvent, Void> {
    // Structured logging, X-Ray tracing, CloudWatch metrics — zero config
}
```

:::

> [!TIP] Golden Tip
> Lead with **SnapStart** for Java Lambdas — it's the modern answer to the cold start problem and is often unknown to candidates. Then distinguish between **Provisioned Concurrency** (always-on, best for consistent latency SLAs) and **SnapStart** (fast restore, pay-per-use). The other key insight: Lambda's 1,000 concurrency limit is shared across ALL functions in an account/region — a traffic spike on one Lambda can starve others. Reserved concurrency (capping a function) and `ReservedConcurrentExecutions` per function are the production safeguards.

**Follow-up questions:**
- What is a Lambda cold start and how do you mitigate it for a Java function?
- What is SnapStart and how does it differ from Provisioned Concurrency?
- What happens if a Lambda function throws an exception when processing an SQS batch?
- When would you choose ECS/Fargate over Lambda?

---

## Q54: ECS vs EKS

> Container orchestration is table stakes for a senior backend developer. Know the models, trade-offs, and when each is appropriate.

| | Amazon ECS | Amazon EKS |
|--|-----------|-----------|
| **Orchestrator** | AWS proprietary | Kubernetes (open standard) |
| **Learning curve** | Lower | Higher (Kubernetes expertise required) |
| **Portability** | AWS-only | Portable — runs on any cloud or on-prem |
| **Ecosystem** | AWS-native (IAM, ALB, CloudWatch) | CNCF ecosystem (Helm, Argo, Istio, Prometheus) |
| **Control plane cost** | Free | $0.10/hr per cluster (~$72/month) |
| **Service mesh** | AWS App Mesh | Istio, Linkerd, AWS App Mesh |
| **Best for** | AWS-native, simpler apps | Large orgs, multi-cloud, Kubernetes expertise |

Both support **Fargate** (serverless compute — AWS manages EC2 instances) and **EC2 launch type** (you manage the instances).

::: details Full model answer

**ECS (Elastic Container Service):**
AWS-proprietary container orchestration. Simpler to operate than Kubernetes — fewer concepts, tighter AWS integration.

Core concepts:
- **Task Definition**: describes the container(s), CPU/memory, environment variables, IAM role, networking
- **Service**: runs N instances of a task definition, integrates with ALB for load balancing, handles rolling deploys
- **Cluster**: logical grouping of tasks/services

```json
// Task definition snippet
{
  "family": "order-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [{
    "name": "order-service",
    "image": "123456789.dkr.ecr.eu-west-1.amazonaws.com/order-service:1.2.0",
    "portMappings": [{ "containerPort": 8080 }],
    "environment": [{ "name": "SPRING_PROFILES_ACTIVE", "value": "prod" }],
    "secrets": [{ "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..." }],
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": { "awslogs-group": "/ecs/order-service" }
    }
  }]
}
```

**EKS (Elastic Kubernetes Service):**
Managed Kubernetes control plane on AWS. You get full Kubernetes — pods, deployments, services, ingress, HPA, RBAC — with AWS managing the control plane (etcd, API server).

```yaml
# Kubernetes Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    spec:
      containers:
      - name: order-service
        image: 123456789.dkr.ecr.eu-west-1.amazonaws.com/order-service:1.2.0
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: order-service-secrets
              key: db-password
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  scaleTargetRef:
    name: order-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
```

**Fargate vs EC2 launch type:**

| | Fargate | EC2 |
|--|--------|-----|
| **Infrastructure** | AWS manages instances | You manage EC2 instances |
| **Cost model** | Pay per task (vCPU + memory) | Pay for EC2 instance (even when idle) |
| **Bin packing** | None — each task gets dedicated compute | Multiple tasks per instance |
| **Customisation** | Limited | Full EC2 flexibility |
| **Best for** | Variable workloads, minimal ops | High-density, cost-optimised steady-state |

**Fargate Spot (for cost optimisation):**
Like EC2 Spot instances — up to 70% cheaper, but tasks can be interrupted with 2-minute warning. Ideal for batch jobs, non-critical workloads.

**Decision guide:**
- Building on AWS, team has limited Kubernetes expertise → **ECS**
- Multi-cloud strategy, large engineering team, Kubernetes already in use → **EKS**
- Variable traffic, minimal ops overhead → **Fargate**
- Cost-optimised, predictable load → **EC2 launch type**
- Very short workloads (&lt;15 min, event-driven) → **Lambda**

:::

> [!TIP] Golden Tip
> The real question interviewers want answered: **what would you choose for a new greenfield service?** A pragmatic answer: for an AWS-native org without existing Kubernetes investment, **ECS + Fargate** is the right default — lower operational complexity, tight AWS integration, and you can always migrate to EKS later if needed. Choosing EKS to "follow the industry standard" without considering the operational cost signals cargo-culting. Show you weigh operational complexity, not just technical capability.

**Follow-up questions:**
- What is the difference between ECS and EKS?
- What is Fargate and when would you use it over EC2?
- How does HPA (Horizontal Pod Autoscaler) work in Kubernetes?
- How do you manage secrets in a containerised application on AWS?

---

## Q55: DynamoDB

> DynamoDB is a fully managed NoSQL database optimised for single-digit millisecond performance at any scale — but only if your data model matches your access patterns.

DynamoDB is a **key-value + document store**. Every operation is O(1) (constant time) because the database is designed around the access pattern upfront — no ad-hoc joins, no flexible querying by arbitrary columns.

**Core concepts:**

| Concept | Description |
|---------|-------------|
| **Table** | Top-level container (no schema except keys) |
| **Partition Key (PK)** | Required — determines which partition stores the item |
| **Sort Key (SK)** | Optional — enables range queries within a partition |
| **Item** | A row — can have any attributes, no fixed schema |
| **GSI** | Global Secondary Index — alternate PK/SK for different access patterns |
| **LSI** | Local Secondary Index — same PK, different SK |

::: details Full model answer

**Partition key design — the most important decision:**
DynamoDB distributes data across partitions by hashing the partition key. Hot partitions (one key receiving all traffic) throttle your entire table. Design for uniform distribution.

```
❌ Bad: Partition key = "user_type" (only 3 values → 3 hot partitions)
❌ Bad: Partition key = current date (all today's writes go to one partition)
✅ Good: Partition key = userId (UUID — uniform distribution)
✅ Good: Partition key = orderId
```

**Single-table design:**
DynamoDB encourages storing multiple entity types in ONE table — unlike relational databases. Use composite sort keys to model relationships.

```
PK              SK                  Type      Attributes
USER#u1         USER#u1             User      name, email
USER#u1         ORDER#o1            Order     status, total
USER#u1         ORDER#o2            Order     status, total
ORDER#o1        ITEM#i1             OrderItem productId, qty
ORDER#o1        ITEM#i2             OrderItem productId, qty
```

Access patterns served by this model:
- Get user: `PK=USER#u1, SK=USER#u1`
- Get all orders for user: `PK=USER#u1, SK begins_with ORDER#`
- Get all items for order: `PK=ORDER#o1, SK begins_with ITEM#`

**Global Secondary Index (GSI):**
Allows querying by a different key. DynamoDB replicates data to the GSI automatically.

```
Table: PK=orderId
GSI:   PK=customerId, SK=createdAt

→ Query: "all orders for customer X, sorted by date" → use GSI
```

**Read/Write capacity modes:**
- **On-Demand**: Pay per request. Auto-scales. More expensive per operation but no capacity planning.
- **Provisioned**: Set RCU/WCU upfront. Cheaper for steady predictable traffic. Can use Auto Scaling.

**DynamoDB Streams:**
Capture a time-ordered log of all changes to a table (insert, update, delete). Each stream record contains old + new item images. Trigger Lambda functions for event-driven workflows.

```
DynamoDB Table → DynamoDB Stream → Lambda → downstream processing
```

Use cases: cache invalidation, cross-region replication, audit logging, event sourcing.

**Transactions:**
DynamoDB supports ACID transactions across multiple items (even across tables) with `TransactWriteItems`. Up to 100 items per transaction.

```java
dynamoDbClient.transactWriteItems(TransactWriteItemsRequest.builder()
    .transactItems(
        TransactWriteItem.builder()
            .update(Update.builder()
                .tableName("orders")
                .key(Map.of("orderId", AttributeValue.fromS(orderId)))
                .updateExpression("SET #s = :status")
                .build())
            .build(),
        TransactWriteItem.builder()
            .put(Put.builder()
                .tableName("inventory")
                .item(reservationItem)
                .conditionExpression("attribute_not_exists(reservationId)")
                .build())
            .build()
    ).build());
```

**Spring Data DynamoDB (Enhanced Client):**
```java
@DynamoDbBean
public class Order {
    @DynamoDbPartitionKey
    private String orderId;

    @DynamoDbSortKey
    private String sk;

    private String status;
    private BigDecimal total;
}

DynamoDbTable<Order> table = enhancedClient.table("orders", TableSchema.fromBean(Order.class));
Order order = table.getItem(Key.builder().partitionValue(orderId).build());
```

**When NOT to use DynamoDB:**
- Complex relational queries with multiple JOINs
- Ad-hoc analytics (use Athena + S3 or Redshift)
- OLTP with frequently changing access patterns
- Small datasets where a relational DB is simpler

:::

> [!TIP] Golden Tip
> The key insight that separates senior candidates: **you design your DynamoDB table around your access patterns, not your data model**. You must know ALL your access patterns before designing the table. Changing an access pattern later may require a new GSI or even a table redesign. This is the opposite of relational modeling — and it's the #1 reason DynamoDB projects fail. Also mention **single-table design** — it's the recommended pattern from AWS but surprises most candidates who've only seen one-table-per-entity approaches.

**Follow-up questions:**
- What is a hot partition and how do you avoid it?
- What is single-table design in DynamoDB?
- When would you use a GSI vs LSI?
- What are DynamoDB Streams used for?

---

## Q56: AWS Services Overview

> Senior developers are expected to know the AWS service landscape well enough to design solutions. This is a reference of key services by category.

::: details Full service reference

**Compute:**
| Service | Purpose |
|---------|---------|
| EC2 | Virtual machines — full control |
| Lambda | Serverless functions — event-driven, sub-15min |
| ECS | Container orchestration (AWS-native) |
| EKS | Managed Kubernetes |
| Fargate | Serverless containers (used with ECS/EKS) |
| Batch | Managed batch computing jobs |
| App Runner | Simplified container deployment — zero k8s knowledge |

**Storage:**
| Service | Purpose |
|---------|---------|
| S3 | Object storage — unlimited, highly durable |
| EBS | Block storage for EC2 (like a hard drive) |
| EFS | Managed NFS — shared file system across instances |
| S3 Glacier | Archival storage — very cheap, slow retrieval |

**Databases:**
| Service | Type | Best for |
|---------|------|---------|
| RDS | Relational (PostgreSQL, MySQL, Oracle) | OLTP workloads |
| Aurora | MySQL/PostgreSQL compatible, auto-scaling | High-performance OLTP |
| Aurora Serverless v2 | Auto-pauses when idle | Dev/staging, variable traffic |
| DynamoDB | NoSQL key-value + document | Single-digit ms latency at any scale |
| ElastiCache | Redis / Memcached managed | Caching, sessions, rate limiting |
| Redshift | Data warehouse (columnar) | OLAP analytics |
| Neptune | Graph database | Social networks, recommendation, fraud detection |
| DocumentDB | MongoDB-compatible | Document store (AWS-managed) |

**Networking:**
| Service | Purpose |
|---------|---------|
| VPC | Virtual Private Cloud — network isolation |
| ALB | Application Load Balancer — HTTP/HTTPS routing, path/header-based |
| NLB | Network Load Balancer — TCP/UDP, extreme performance |
| CloudFront | CDN — global edge caching |
| Route 53 | DNS + health checks + routing policies |
| API Gateway | Managed REST/WebSocket/HTTP API front-door |
| PrivateLink | Private connectivity between VPCs without internet |

**Messaging:**
| Service | Purpose |
|---------|---------|
| SQS | Managed queue — work distribution |
| SNS | Pub/sub fan-out |
| EventBridge | Event bus — routing events between AWS services and partners |
| Kinesis | Real-time streaming data |
| MSK | Managed Kafka |
| MQ | Managed RabbitMQ / ActiveMQ |

**Security:**
| Service | Purpose |
|---------|---------|
| IAM | Identity — users, roles, policies |
| Cognito | User pools (auth for apps) + identity pools (AWS resource access) |
| Secrets Manager | Encrypted secret storage with rotation |
| KMS | Key Management Service — encryption keys |
| WAF | Web Application Firewall — SQL injection, XSS protection |
| Shield | DDoS protection (Standard: free, Advanced: $3,000/month) |
| GuardDuty | Threat detection — analyzes VPC flow logs, CloudTrail |

**Developer tools / Observability:**
| Service | Purpose |
|---------|---------|
| CloudWatch | Metrics, logs, alarms, dashboards |
| X-Ray | Distributed tracing |
| CloudTrail | API call audit log (who did what, when) |
| CodePipeline | CI/CD pipeline |
| CodeBuild | Managed build service |
| ECR | Elastic Container Registry — Docker image registry |
| CDK | Cloud Development Kit — define AWS infrastructure in Java/TypeScript |
| SAM | Serverless Application Model — Lambda/API Gateway CloudFormation |

**Key architectural patterns for interviews:**

**Web application (standard):**
```
Route 53 → CloudFront → ALB → ECS/EKS (Spring Boot) → RDS Aurora
                                                      → ElastiCache (Redis)
                              ↑ WAF
```

**Event-driven microservices:**
```
API Gateway → Lambda / ECS → SQS / SNS → Lambda consumers
                           → EventBridge → multiple targets
```

**Data pipeline:**
```
S3 (raw) → Lambda / Glue → S3 (processed) → Athena / Redshift → QuickSight
```

:::

> [!TIP] Golden Tip
> For system design interviews, knowing which AWS service to reach for is as important as knowing how to design the system. The three most versatile combinations: **(1)** SQS + Lambda for event-driven background processing; **(2)** ElastiCache (Redis) for caching, rate limiting, and distributed locks; **(3)** S3 + CloudFront for static assets and CDN. Being able to justify your service choices (why ALB over NLB, why Aurora over RDS, why DynamoDB over RDS) is what separates architectural thinking from checkbox answers.

**Follow-up questions:**
- What is the difference between ALB and NLB?
- When would you use Aurora Serverless over standard Aurora?
- What is the difference between Secrets Manager and Parameter Store?
- How does CloudFront help with performance and cost?
