---
title: WireMock & Contract Testing
description: WireMock for HTTP stubbing and verification, Spring Cloud Contract for consumer-driven contracts, ArchUnit for architecture rules, and mutation testing with PIT
category: testing
pageClass: layout-testing
difficulty: advanced
tags: [wiremock, contract-testing, spring-cloud-contract, pact, archunit, mutation-testing, pit]
related:
  - /testing/
  - /testing/spring-testing
  - /testing/testcontainers
  - /security/secure-coding
estimatedMinutes: 30
---

# WireMock & Contract Testing

<DifficultyBadge level="advanced" />

This page covers tools for testing system boundaries: **WireMock** for stubbing external HTTP services, **Spring Cloud Contract** for consumer-driven contracts, **ArchUnit** for enforcing architectural rules, and **PIT** for mutation testing.

---

## WireMock

WireMock is an HTTP server that runs in your tests, recording requests and returning configured responses. It replaces real external HTTP services in integration tests.

### Why WireMock over Mockito for HTTP Clients?

Mockito mocks the Java interface (`RestTemplate`, `WebClient`). WireMock mocks the actual HTTP call — you test that your client is configured correctly (URL, headers, body), handles retries, parses responses, and reacts correctly to error status codes.

---

### Setup

```xml
<dependency>
    <groupId>org.wiremock.integrations</groupId>
    <artifactId>wiremock-spring-boot</artifactId>
    <version>3.2.0</version>
    <scope>test</scope>
</dependency>
```

### WireMock JUnit 5 Extension

```java
@SpringBootTest
@EnableWireMock({
    @ConfigureWireMock(
        name = "payment-service",
        property = "payment.service.url"  // Spring sets this property to WireMock URL
    )
})
class PaymentClientTest {

    @InjectWireMock("payment-service")
    WireMockServer wireMock;

    @Autowired PaymentClient paymentClient;

    @Test
    void chargeCard_shouldCallPaymentApi_andReturnTransactionId() {
        wireMock.stubFor(post(urlEqualTo("/api/v1/charge"))
            .withHeader("Content-Type", equalTo("application/json"))
            .withRequestBody(matchingJsonPath("$.amount", equalTo("99.99")))
            .willReturn(aResponse()
                .withStatus(200)
                .withHeader("Content-Type", "application/json")
                .withBody("""
                    {"transactionId": "txn-abc123", "status": "APPROVED"}
                    """)));

        PaymentResult result = paymentClient.charge(new ChargeRequest(new BigDecimal("99.99")));

        assertThat(result.transactionId()).isEqualTo("txn-abc123");
        assertThat(result.status()).isEqualTo("APPROVED");
    }
}
```

### Standalone WireMock Extension

```java
@WireMockTest(httpPort = 8089)   // fixed port (use 0 for random)
class ExternalApiTest {

    @Test
    void shouldHandleNotFound(WireMockRuntimeInfo wmRuntimeInfo) {
        stubFor(get(urlEqualTo("/api/users/99"))
            .willReturn(aResponse().withStatus(404)));

        // your client configured to hit http://localhost:8089
        assertThatThrownBy(() -> userClient.findById(99L))
            .isInstanceOf(UserNotFoundException.class);
    }
}
```

---

### Stubbing

```java
// GET — simple
stubFor(get("/api/products/1")
    .willReturn(okJson("""{"id": 1, "name": "Widget", "price": 9.99}""")));

// POST — with request body matching
stubFor(post("/api/orders")
    .withHeader("Authorization", matching("Bearer .*"))
    .withRequestBody(matchingJsonPath("$.customerId"))
    .withRequestBody(matchingJsonPath("$.items[0].sku", equalTo("WIDGET-001")))
    .willReturn(aResponse()
        .withStatus(201)
        .withHeader("Content-Type", "application/json")
        .withHeader("Location", "/api/orders/42")
        .withBody("""{"id": 42, "status": "PENDING"}""")));

// Error responses
stubFor(get("/api/products/999")
    .willReturn(aResponse().withStatus(404).withBody("""{"error": "Not found"}""")));

stubFor(get("/api/slow-endpoint")
    .willReturn(aResponse()
        .withFixedDelay(5000)    // simulate 5-second latency → test timeout handling
        .withStatus(200)));

// Fault simulation
stubFor(get("/api/flaky")
    .willReturn(aResponse().withFault(Fault.CONNECTION_RESET_BY_PEER)));

// Stateful responses (call 1 returns one thing, call 2 another)
stubFor(get("/api/status")
    .inScenario("retry-test")
    .whenScenarioStateIs(STARTED)
    .willReturn(aResponse().withStatus(503))
    .willSetStateTo("second-call"));

stubFor(get("/api/status")
    .inScenario("retry-test")
    .whenScenarioStateIs("second-call")
    .willReturn(okJson("""{"status": "ok"}""")));
```

### Request Matching

```java
// URL patterns
urlEqualTo("/api/orders/1")
urlPathEqualTo("/api/orders/1")         // ignores query params
urlPathMatching("/api/orders/\\d+")
urlMatching("/api/orders/.*")

// Query parameters
withQueryParam("status", equalTo("PENDING"))
withQueryParam("page", matching("\\d+"))

// Headers
withHeader("Content-Type", containing("application/json"))
withHeader("Authorization", matching("Bearer .*"))
withoutHeader("X-Internal-Header")

// Body
withRequestBody(equalToJson("""{"name":"Alice"}"""))
withRequestBody(matchingJsonPath("$.name", equalTo("Alice")))
withRequestBody(matchingJsonPath("$.items[?(@.sku == 'ABC')]"))   // JsonPath filter
withRequestBody(containing("widget"))
```

### Verification

```java
// Verify a request was made
verify(postRequestedFor(urlEqualTo("/api/charge"))
    .withHeader("Content-Type", equalTo("application/json"))
    .withRequestBody(matchingJsonPath("$.amount")));

// Verify count
verify(exactly(2), getRequestedFor(urlPathMatching("/api/products/.*")));
verify(moreThan(0), postRequestedFor(urlEqualTo("/api/notify")));
verify(never(), deleteRequestedFor(anyUrl()));

// Get all recorded requests
List<LoggedRequest> requests = wireMock.findAll(postRequestedFor(urlEqualTo("/api/orders")));
assertThat(requests).hasSize(1);
```

### Response Templating

Dynamic responses based on request data.

```java
// Enable response templating
wireMock.stubFor(get(urlPathMatching("/api/orders/(?<id>\\d+)"))
    .willReturn(aResponse()
        .withTransformers("response-template")
        .withBody("""
            {"id": {{request.pathSegments.[2]}}, "status": "PENDING"}
            """)));
// GET /api/orders/42 → {"id": "42", "status": "PENDING"}
```

---

## Spring Cloud Contract

Consumer-Driven Contracts define the API agreement between a consumer (client) and provider (server). The consumer writes the contract, the provider auto-generates tests from it.

```
Consumer defines contract
    → Producer generates tests from contract → tests verify producer matches contract
    → Consumer generates stubs from contract → used in consumer tests
```

### Why Contract Testing?

- Catch API breaking changes before deployment
- Consumer and provider can develop independently
- No need for shared environments during development
- Faster than end-to-end tests

### Setup

```xml
<!-- Producer pom.xml -->
<plugin>
    <groupId>org.springframework.cloud</groupId>
    <artifactId>spring-cloud-contract-maven-plugin</artifactId>
    <version>4.1.3</version>
    <extensions>true</extensions>
    <configuration>
        <testFramework>JUNIT5</testFramework>
        <baseClassForTests>com.example.BaseContractTest</baseClassForTests>
    </configuration>
</plugin>
```

### Writing Contracts (Groovy DSL)

```groovy
// src/test/resources/contracts/order-service/get-order.groovy
Contract.make {
    description "should return order by ID"

    request {
        method GET()
        url "/api/orders/1"
        headers {
            contentType(applicationJson())
        }
    }

    response {
        status OK()
        headers {
            contentType(applicationJson())
        }
        body(
            id: 1,
            customerName: "Alice",
            status: "PENDING",
            items: ["widget"]
        )
    }
}
```

```groovy
// src/test/resources/contracts/order-service/create-order.groovy
Contract.make {
    description "should create an order"

    request {
        method POST()
        url "/api/orders"
        headers {
            contentType(applicationJson())
        }
        body(
            customerName: anyNonBlankString(),
            items: [anyNonBlankString()]
        )
    }

    response {
        status CREATED()
        headers {
            contentType(applicationJson())
            header('Location', value(
                consumer(regex('/api/orders/\\d+')),
                producer('/api/orders/42')
            ))
        }
        body(
            id: anyPositiveInt(),
            status: "PENDING"
        )
    }
}
```

### Producer — Base Test Class

```java
// The generated test extends this class
@SpringBootTest(webEnvironment = WebEnvironment.MOCK)
@AutoConfigureMockMvc
public abstract class BaseContractTest {

    @Autowired MockMvc mockMvc;
    @MockBean OrderService orderService;

    @BeforeEach
    void setUp() {
        // Set up stubs so the generated contract tests pass
        when(orderService.findById(1L)).thenReturn(
            new OrderDto(1L, "Alice", "PENDING", List.of("widget")));

        when(orderService.placeOrder(any())).thenReturn(
            new OrderDto(42L, null, "PENDING", null));

        RestAssuredMockMvc.mockMvc(mockMvc);
    }
}
```

### Generated Test (auto-created by plugin)

```java
// Generated — do NOT edit
class GetOrderTest extends BaseContractTest {

    @Test
    public void validate_get_order() throws Exception {
        // generated test using RestAssured against MockMvc
        given()
            .header("Content-Type", "application/json")
        .when()
            .get("/api/orders/1")
        .then()
            .statusCode(200)
            .body("id", equalTo(1))
            .body("customerName", equalTo("Alice"))
            .body("status", equalTo("PENDING"));
    }
}
```

### Consumer — Using Stubs

```java
// Consumer test uses stubs published by producer (via Maven repo)
@SpringBootTest
@AutoConfigureStubRunner(
    ids = "com.example:order-service:+:stubs:8080",
    stubsMode = StubRunnerProperties.StubsMode.LOCAL   // or REMOTE for Artifactory
)
class OrderConsumerTest {

    @Autowired OrderServiceClient orderServiceClient;

    @Test
    void getOrder_shouldParseResponseFromStub() {
        // WireMock stub from the contract is automatically running on port 8080
        OrderDto order = orderServiceClient.findById(1L);

        assertThat(order.id()).isEqualTo(1L);
        assertThat(order.customerName()).isEqualTo("Alice");
        assertThat(order.status()).isEqualTo("PENDING");
    }
}
```

---

## ArchUnit — Architecture Rules as Tests

ArchUnit lets you write architecture rules as JUnit tests — enforced on every build.

```xml
<dependency>
    <groupId>com.tngtech.archunit</groupId>
    <artifactId>archunit-junit5</artifactId>
    <version>1.3.0</version>
    <scope>test</scope>
</dependency>
```

### Layered Architecture Rules

```java
@AnalyzeClasses(packages = "com.example.orderservice")
class ArchitectureTest {

    // Controllers may not access repositories directly
    @ArchTest
    ArchRule controllers_shouldNotAccessRepositories =
        noClasses().that().resideInAPackage("..controller..")
                   .should().accessClassesThat()
                   .resideInAPackage("..repository..");

    // Services should not depend on controllers
    @ArchTest
    ArchRule services_shouldNotDependOnControllers =
        noClasses().that().resideInAPackage("..service..")
                   .should().dependOnClassesThat()
                   .resideInAPackage("..controller..");

    // Define layered architecture
    @ArchTest
    ArchRule layeredArchitecture =
        layeredArchitecture()
            .consideringAllDependencies()
            .layer("Controller").definedBy("..controller..")
            .layer("Service").definedBy("..service..")
            .layer("Repository").definedBy("..repository..")
            .whereLayer("Controller").mayNotBeAccessedByAnyLayer()
            .whereLayer("Service").mayOnlyBeAccessedByLayers("Controller")
            .whereLayer("Repository").mayOnlyBeAccessedByLayers("Service");
}
```

### Naming Conventions

```java
@ArchTest
ArchRule controllers_shouldBeSuffixed =
    classes().that().resideInAPackage("..controller..")
             .should().haveSimpleNameEndingWith("Controller");

@ArchTest
ArchRule services_shouldBeSuffixed =
    classes().that().resideInAPackage("..service..")
             .should().haveSimpleNameEndingWith("Service");

@ArchTest
ArchRule repositories_shouldBeInterfaces =
    classes().that().resideInAPackage("..repository..")
             .should().beInterfaces();
```

### Dependency Rules

```java
@ArchTest
ArchRule domain_shouldHaveNoDependenciesOnSpring =
    noClasses().that().resideInAPackage("..domain..")
               .should().dependOnClassesThat()
               .resideInAPackage("org.springframework..");

@ArchTest
ArchRule noCircularDependencies =
    slices().matching("com.example.(*)..").should().beFreeOfCycles();

@ArchTest
ArchRule entities_shouldNotBePublic =
    classes().that().areAnnotatedWith(Entity.class)
             .should().notBePublic()
             .because("entities should not be exposed outside the data layer");
```

### Annotation Rules

```java
@ArchTest
ArchRule transactionalMethods_shouldBeOnServiceLayer =
    methods().that().areAnnotatedWith(Transactional.class)
             .should().beDeclaredInClassesThat()
             .resideInAPackage("..service..");

@ArchTest
ArchRule restControllers_shouldHaveRequestMapping =
    classes().that().areAnnotatedWith(RestController.class)
             .should().beAnnotatedWith(RequestMapping.class);
```

---

## PIT — Mutation Testing

Mutation testing measures test quality. PIT introduces small bugs (mutations) into production code and checks whether your tests catch them. A test suite with 80% line coverage but 30% mutation score has weak tests.

```xml
<!-- pom.xml -->
<plugin>
    <groupId>org.pitest</groupId>
    <artifactId>pitest-maven</artifactId>
    <version>1.16.1</version>
    <dependencies>
        <dependency>
            <groupId>org.pitest</groupId>
            <artifactId>pitest-junit5-plugin</artifactId>
            <version>1.2.1</version>
        </dependency>
    </dependencies>
    <configuration>
        <targetClasses>
            <param>com.example.orderservice.service.*</param>
        </targetClasses>
        <targetTests>
            <param>com.example.orderservice.*Test</param>
        </targetTests>
        <mutationThreshold>80</mutationThreshold>   <!-- fail build if < 80% killed -->
    </configuration>
</plugin>
```

```bash
mvn test-compile org.pitest:pitest-maven:mutationCoverage
# Report at: target/pit-reports/index.html
```

### Common Mutation Operators

| Mutation | Example | If Tests Don't Catch It... |
|----------|---------|---------------------------|
| **Conditional Boundary** | `>` → `>=` | Boundary condition untested |
| **Negate Conditionals** | `if (x > 0)` → `if (!(x > 0))` | Logic path not tested |
| **Remove Conditionals** | `if (active)` → `if (true)` | Condition never exercised |
| **Math** | `a + b` → `a - b` | Arithmetic not verified |
| **Increments** | `i++` → `i--` | Loop logic not verified |
| **Return Values** | `return result` → `return null` | Return value not asserted |
| **Void Method Calls** | Remove `email.send()` | Side effect not verified |

A **killed** mutation = your test caught the bug. A **survived** mutation = test gap.

---

## Interview Quick-Fire

**Q: What is the difference between WireMock and Mockito for testing HTTP clients?**
Mockito mocks Java interfaces — it doesn't test whether the HTTP client constructs requests correctly (URL, headers, body serialisation, error handling). WireMock runs a real HTTP server and verifies actual HTTP traffic. WireMock catches bugs in URL construction, JSON mapping, and retry logic; Mockito doesn't.

**Q: What is consumer-driven contract testing and why is it better than integration tests against a shared environment?**
Consumer-driven contracts define the API agreement from the consumer's perspective. The consumer writes contracts, the producer verifies against them in isolation (no running consumer needed), and the consumer tests against auto-generated stubs (no running producer needed). Both sides can develop and test independently. Shared environments are fragile, slow, and require all services to be running simultaneously.

**Q: What is mutation testing and how does it differ from code coverage?**
Code coverage measures which lines your tests execute. Mutation testing measures whether your tests detect bugs. PIT introduces small mutations (flipping `>` to `>=`, negating conditions, removing method calls) and checks whether tests fail. High coverage with low mutation score means tests run code but don't assert on its behaviour. Mutation score is a stronger quality signal.

**Q: What does ArchUnit test and why would you add it to a CI pipeline?**
ArchUnit enforces architectural rules as automated tests — layering (controllers don't access repos), naming conventions, dependency direction, circular dependency detection. Without it, architectural violations accumulate silently as teams grow. Running it in CI makes violations build-breaking, preventing structural decay without manual code review attention.

<RelatedTopics :topics="['/testing/', '/testing/spring-testing', '/testing/testcontainers', '/cicd/github-actions']" />

[→ Back to Testing Overview](/testing/)
