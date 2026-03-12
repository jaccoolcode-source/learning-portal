---
title: Testcontainers
description: Testcontainers complete reference — setup, lifecycle, DynamicPropertySource, reusable containers, Spring Boot 3.1 ServiceConnection, PostgreSQL, Redis, Kafka, LocalStack, and performance patterns
category: testing
pageClass: layout-testing
difficulty: intermediate
tags: [testcontainers, testing, docker, postgres, kafka, redis, integration-tests, spring-boot]
related:
  - /testing/
  - /testing/spring-testing
  - /docker/production
  - /messaging/spring-kafka
estimatedMinutes: 25
---

# Testcontainers

<DifficultyBadge level="intermediate" />

Testcontainers starts real Docker containers during tests — actual PostgreSQL, Kafka, Redis, etc. — then tears them down after. This eliminates "works on my machine but fails in CI" by guaranteeing identical infrastructure in all environments.

---

## Setup

```xml
<!-- pom.xml — BOM manages all Testcontainers module versions -->
<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.testcontainers</groupId>
            <artifactId>testcontainers-bom</artifactId>
            <version>1.20.1</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <!-- Core + JUnit 5 extension -->
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>junit-jupiter</artifactId>
        <scope>test</scope>
    </dependency>

    <!-- Spring Boot 3.1+ integration -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-testcontainers</artifactId>
        <scope>test</scope>
    </dependency>

    <!-- Database modules -->
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>postgresql</artifactId>
        <scope>test</scope>
    </dependency>

    <!-- Kafka module -->
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>kafka</artifactId>
        <scope>test</scope>
    </dependency>
</dependencies>
```

Docker must be running on the machine / CI agent.

---

## Basic Usage with JUnit 5

```java
@Testcontainers          // enables Testcontainers JUnit 5 extension
@SpringBootTest
class OrderRepositoryTest {

    @Container           // lifecycle managed by Testcontainers extension
    static PostgreSQLContainer<?> postgres =
        new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("testdb")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void configureProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",      postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired OrderRepository orderRepository;

    @Test
    void shouldSaveAndRetrieveOrder() {
        Order saved = orderRepository.save(new Order("Alice", OrderStatus.PENDING));
        assertThat(orderRepository.findById(saved.getId())).isPresent();
    }
}
```

### static vs instance field

```java
// static → ONE container for all tests in the class (fast, shared)
@Container
static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

// instance → new container per test method (slow, isolated — rarely needed)
@Container
PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");
```

Always prefer `static` unless tests mutate the container in incompatible ways.

---

## Spring Boot 3.1+ — @ServiceConnection

`@ServiceConnection` eliminates `@DynamicPropertySource` boilerplate — Spring auto-configures the data source from the container.

```java
@SpringBootTest
@Testcontainers
class OrderServiceIT {

    @Container
    @ServiceConnection                    // auto-configures spring.datasource.*
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    @ServiceConnection                    // auto-configures spring.data.redis.*
    static GenericContainer<?> redis =
        new GenericContainer<>("redis:7-alpine").withExposedPorts(6379);

    @Autowired OrderService orderService;

    @Test
    void placeOrder_shouldPersistAndCache() {
        Order order = orderService.placeOrder(new OrderRequest("Alice", List.of("widget")));
        assertThat(order.getId()).isNotNull();
    }
}
```

Supported `@ServiceConnection` containers: PostgreSQL, MySQL, MariaDB, MongoDB, Redis, Cassandra, Couchbase, Elasticsearch, Kafka, RabbitMQ, Zipkin.

---

## Reusable Containers

Reusable containers survive between test runs — Testcontainers keeps them running and reattaches. Dramatically speeds up local development.

```java
static PostgreSQLContainer<?> postgres =
    new PostgreSQLContainer<>("postgres:16-alpine")
        .withReuse(true);    // container is kept alive after test run
```

Enable in `~/.testcontainers.properties`:

```properties
testcontainers.reuse.enable=true
```

::: warning Reuse in CI
Disable reuse in CI — containers must start fresh for isolated reproducible builds. Set the env var or property conditionally.
:::

---

## Singleton Pattern — Shared Container Across Test Classes

When multiple test classes share the same container, restarting it for each class is wasteful. A shared static field prevents that.

```java
// AbstractIntegrationTest.java
@SpringBootTest
@ActiveProfiles("integration")
public abstract class AbstractIntegrationTest {

    static final PostgreSQLContainer<?> POSTGRES;
    static final GenericContainer<?> REDIS;

    static {
        POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withReuse(true);
        REDIS = new GenericContainer<>("redis:7-alpine")
            .withExposedPorts(6379)
            .withReuse(true);

        // Start all containers in parallel
        Startables.deepStart(POSTGRES, REDIS).join();
    }

    @DynamicPropertySource
    static void configure(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url",      POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.data.redis.host",     REDIS::getHost);
        registry.add("spring.data.redis.port",     () -> REDIS.getMappedPort(6379));
    }
}

// Test classes
class OrderServiceIT extends AbstractIntegrationTest { }
class InventoryServiceIT extends AbstractIntegrationTest { }
// Both share the same running POSTGRES and REDIS containers
```

---

## PostgreSQL

```java
PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
    .withDatabaseName("mydb")
    .withUsername("myuser")
    .withPassword("secret")
    .withInitScript("sql/schema.sql")    // run SQL on startup
    .withCopyFileToContainer(
        MountableFile.forClasspathResource("test-data.sql"),
        "/docker-entrypoint-initdb.d/test-data.sql"
    );

// Mapped ports (random to avoid conflicts)
String jdbcUrl = postgres.getJdbcUrl();    // jdbc:postgresql://localhost:XXXXX/mydb
Integer port   = postgres.getMappedPort(5432);
```

---

## Redis

```java
@Container
@ServiceConnection
static GenericContainer<?> redis =
    new GenericContainer<>("redis:7-alpine")
        .withExposedPorts(6379)
        .withCommand("redis-server", "--requirepass", "secret");

// Without @ServiceConnection
@DynamicPropertySource
static void redisProps(DynamicPropertyRegistry registry) {
    registry.add("spring.data.redis.host", redis::getHost);
    registry.add("spring.data.redis.port", () -> redis.getMappedPort(6379));
    registry.add("spring.data.redis.password", () -> "secret");
}
```

---

## Kafka

```java
@Container
@ServiceConnection
static KafkaContainer kafka =
    new KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.6.1"))
        .withKraft();    // KRaft mode (no ZooKeeper)

// Without @ServiceConnection
@DynamicPropertySource
static void kafkaProps(DynamicPropertyRegistry registry) {
    registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers);
}
```

```java
// Full Kafka integration test
@SpringBootTest
@Testcontainers
class OrderEventPublisherTest {

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("confluentinc/cp-kafka:7.6.1")).withKraft();

    @Autowired KafkaTemplate<String, OrderEvent> kafkaTemplate;
    @Autowired EmbeddedKafkaConsumer testConsumer;    // a @Component test consumer

    @Test
    void placeOrder_shouldPublishOrderCreatedEvent() throws Exception {
        orderService.placeOrder(new OrderRequest("Alice", List.of("widget")));

        // Use Awaitility for async assertions
        await().atMost(10, SECONDS).untilAsserted(() ->
            assertThat(testConsumer.getReceivedEvents())
                .extracting(OrderEvent::getType)
                .contains(OrderEventType.ORDER_CREATED)
        );
    }
}
```

---

## LocalStack (AWS Services)

```java
@Container
static LocalStackContainer localstack =
    new LocalStackContainer(DockerImageName.parse("localstack/localstack:3.3"))
        .withServices(Service.S3, Service.SQS, Service.SNS);

@DynamicPropertySource
static void awsProps(DynamicPropertyRegistry registry) {
    registry.add("aws.region", () -> localstack.getRegion());
    registry.add("aws.s3.endpoint", () -> localstack.getEndpointOverride(Service.S3).toString());
    registry.add("aws.sqs.endpoint", () -> localstack.getEndpointOverride(Service.SQS).toString());
}
```

---

## Docker Compose Module

Use your existing `docker-compose.yml` directly in tests.

```java
@Container
static DockerComposeContainer<?> compose =
    new DockerComposeContainer<>(new File("src/test/resources/docker-compose-test.yml"))
        .withExposedService("postgres", 5432,
            Wait.forListeningPort().withStartupTimeout(Duration.ofSeconds(60)))
        .withExposedService("redis", 6379);

String postgresHost = compose.getServiceHost("postgres", 5432);
Integer postgresPort = compose.getServicePort("postgres", 5432);
```

---

## Wait Strategies

Control when Testcontainers considers a container ready.

```java
new PostgreSQLContainer<>("postgres:16")
    .waitingFor(Wait.forListeningPort())    // TCP port accepts connections

new GenericContainer<>("myapp:latest")
    .waitingFor(Wait.forHttp("/actuator/health")
        .forPort(8080)
        .forStatusCode(200)
        .withStartupTimeout(Duration.ofSeconds(90)))

new GenericContainer<>("myapp:latest")
    .waitingFor(Wait.forLogMessage(".*Started Application.*", 1))
    // ready when log line appears

// Combine strategies
.waitingFor(new WaitAllStrategy()
    .withStrategy(Wait.forListeningPort())
    .withStrategy(Wait.forHttp("/health").forStatusCode(200))
    .withStartupTimeout(Duration.ofSeconds(60)))
```

---

## Awaitility — Async Assertions

For event-driven or asynchronous tests, use Awaitility instead of `Thread.sleep`.

```java
<!-- pom.xml -->
<dependency>
    <groupId>org.awaitility</groupId>
    <artifactId>awaitility</artifactId>
    <scope>test</scope>
</dependency>
```

```java
import static org.awaitility.Awaitility.*;

@Test
void publishOrder_shouldTriggerInventoryUpdate() {
    orderService.placeOrder(request);

    // Poll until assertion passes or timeout
    await()
        .atMost(10, SECONDS)
        .pollInterval(200, MILLISECONDS)
        .untilAsserted(() -> {
            var inventory = inventoryRepository.findByProduct("widget");
            assertThat(inventory.getReservedQuantity()).isEqualTo(1);
        });
}
```

---

## Performance Tips

| Problem | Solution |
|---------|----------|
| Container restarts for each test class | Use `static` container fields — shared within class |
| Container restarts between test runs | `withReuse(true)` + `testcontainers.reuse.enable=true` |
| Multiple services restart independently | Singleton base class (`AbstractIntegrationTest`) |
| Parallel test execution | Each parallel fork gets its own container (Testcontainers handles port conflicts) |
| Slow startup in CI | Pull images in CI setup step before test run; use alpine variants |
| Context re-created per test class | Keep `@DynamicPropertySource` identical across classes that share a base class |

### Alpine Images — Faster Startup

```java
// Use -alpine variants — much smaller, faster to pull and start
new PostgreSQLContainer<>("postgres:16-alpine")    // 75 MB vs 380 MB
new GenericContainer<>("redis:7-alpine")           // 35 MB vs 120 MB
```

---

## Complete Example — Full Integration Test

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@Testcontainers
@ActiveProfiles("integration")
class OrderApiIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine");

    @Container
    @ServiceConnection
    static KafkaContainer kafka = new KafkaContainer(
        DockerImageName.parse("confluentinc/cp-kafka:7.6.1")).withKraft();

    @Autowired TestRestTemplate restTemplate;
    @Autowired TestKafkaConsumer kafkaConsumer;

    @Test
    void placeOrder_shouldPersistAndPublishEvent() throws Exception {
        // Given
        var request = new OrderRequest("alice@example.com", List.of("widget"), 2);

        // When
        var response = restTemplate.postForEntity("/api/orders", request, OrderDto.class);

        // Then — HTTP response
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().customerEmail()).isEqualTo("alice@example.com");

        // Then — Kafka event published
        await().atMost(10, SECONDS).untilAsserted(() ->
            assertThat(kafkaConsumer.getLatestEvent())
                .isNotNull()
                .extracting(OrderEvent::getType)
                .isEqualTo(OrderEventType.ORDER_CREATED)
        );

        // Then — persisted in DB
        var orderId = response.getBody().id();
        var dbOrder = restTemplate.getForEntity("/api/orders/" + orderId, OrderDto.class);
        assertThat(dbOrder.getBody().status()).isEqualTo("PENDING");
    }
}
```

---

## Interview Quick-Fire

**Q: Why use Testcontainers instead of H2 for integration tests?**
H2 is a different database engine — it behaves differently for dialect-specific SQL (PostgreSQL arrays, JSONB, `RETURNING`, window functions), transactions, and constraints. Testcontainers runs the real database — the same engine you use in production — eliminating entire categories of "tests pass but production breaks" bugs.

**Q: What is the difference between `@Container` on a `static` vs instance field?**
Static: one container started before the first test in the class, shared by all methods, stopped after the last. Instance: a new container per test method — much slower and rarely needed. Always use `static` unless tests mutate state in the container incompatibly.

**Q: What is `@DynamicPropertySource` and why is it needed?**
`@DynamicPropertySource` registers dynamic property values (like the random port Testcontainers assigns to a container) into the Spring `Environment` before the application context starts. This lets Spring's auto-configuration pick up the container's JDBC URL, host, port, etc. Without it, Spring would use the hardcoded configuration and fail to connect.

**Q: How would you share one Testcontainers instance across all integration test classes?**
Create an abstract base class with `static` container fields started in a `static {}` block (using `Startables.deepStart` for parallel startup). All integration test classes extend this base class. Since the Spring context caches on the same `@DynamicPropertySource` configuration, the containers and context are both shared across all subclasses.

<RelatedTopics :topics="['/testing/', '/testing/spring-testing', '/docker/production', '/messaging/spring-kafka']" />

[→ Back to Testing Overview](/testing/)
