---
title: Spring Testing
description: Spring Boot testing deep-dive — @SpringBootTest, @WebMvcTest, @DataJpaTest, @WebFluxTest, @RestClientTest, @JsonTest, security testing, context caching, and performance tips
category: testing
pageClass: layout-testing
difficulty: intermediate
tags: [spring, testing, webmvctest, datajpatest, springboottest, mockmvc, security, context-caching]
related:
  - /testing/
  - /testing/junit5
  - /testing/mockito
  - /testing/testcontainers
estimatedMinutes: 30
---

# Spring Testing

<DifficultyBadge level="intermediate" />

Spring Boot ships a rich test toolkit — from lightweight slices that start only part of the context to full integration tests. Picking the right annotation keeps tests fast and focused.

---

## Test Slice Overview

| Annotation | What Loads | Use For |
|-----------|-----------|---------|
| `@WebMvcTest` | MVC layer only (controllers, filters, `@ControllerAdvice`) | Controller logic, request/response mapping |
| `@DataJpaTest` | JPA layer only (entities, repositories, Flyway/Liquibase) | Repository queries, entity mappings |
| `@DataJdbcTest` | Spring Data JDBC layer | JDBC repositories |
| `@WebFluxTest` | WebFlux layer (reactive controllers) | Reactive controller logic |
| `@RestClientTest` | `RestTemplate`/`RestClient` with MockRestServiceServer | HTTP client configuration |
| `@JsonTest` | Jackson context only | JSON serialisation/deserialisation |
| `@SpringBootTest` | Full context | Integration tests, full wiring |

---

## @SpringBootTest — Full Context

```java
// Default: no servlet environment, use for service-layer integration
@SpringBootTest
@Transactional        // rolls back after each test
class OrderServiceIntegrationTest {

    @Autowired OrderService orderService;
    @Autowired OrderRepository orderRepository;

    @Test
    void placeAndRetrieveOrder() {
        Order placed = orderService.placeOrder(new OrderRequest("Alice", List.of("widget")));
        assertThat(placed.getId()).isNotNull();

        Optional<Order> found = orderRepository.findById(placed.getId());
        assertThat(found).isPresent().get()
            .extracting(Order::getCustomerName).isEqualTo("Alice");
    }
}

// With embedded HTTP server — full HTTP stack
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class OrderApiIntegrationTest {

    @Autowired TestRestTemplate restTemplate;

    @Test
    void getOrder_shouldReturn200() {
        var response = restTemplate.getForEntity("/api/orders/1", OrderDto.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}

// With WebTestClient (works with both MVC and WebFlux)
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class OrderApiTest {

    @Autowired WebTestClient webTestClient;

    @Test
    void getOrder_shouldReturnOrder() {
        webTestClient.get().uri("/api/orders/1")
            .exchange()
            .expectStatus().isOk()
            .expectBody(OrderDto.class)
            .value(dto -> assertThat(dto.customerName()).isEqualTo("Alice"));
    }
}
```

### Override Properties

```java
@SpringBootTest(properties = {
    "spring.datasource.url=jdbc:h2:mem:test",
    "feature.new-checkout=true"
})

// Or load a specific application properties file
@SpringBootTest
@TestPropertySource(locations = "classpath:application-test.properties")
// src/test/resources/application-test.properties overrides src/main/resources
```

---

## @WebMvcTest — Web Layer Only

Loads controllers, filters, `@ControllerAdvice`, `WebMvcConfigurer`, security config — **not** services or repositories.

```java
@WebMvcTest(OrderController.class)    // limit to specific controller
class OrderControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean OrderService orderService;   // must mock all service dependencies

    @Test
    void getOrder_shouldReturn200WithBody() throws Exception {
        var dto = new OrderDto(1L, "Alice", "PENDING", List.of("widget"));
        when(orderService.findById(1L)).thenReturn(dto);

        mockMvc.perform(get("/api/orders/1")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.customerName").value("Alice"))
            .andExpect(jsonPath("$.status").value("PENDING"))
            .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    void createOrder_shouldReturn201() throws Exception {
        var request = """
            {"customerName": "Bob", "items": ["widget"]}
            """;
        when(orderService.placeOrder(any())).thenReturn(new OrderDto(2L, "Bob", "PENDING", List.of("widget")));

        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", containsString("/api/orders/2")));
    }

    @Test
    void getOrder_whenNotFound_shouldReturn404() throws Exception {
        when(orderService.findById(99L)).thenThrow(new OrderNotFoundException("99"));

        mockMvc.perform(get("/api/orders/99"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.message").value(containsString("99")));
    }
}
```

### MockMvc Matchers Reference

```java
// Status
.andExpect(status().isOk())
.andExpect(status().isCreated())
.andExpect(status().isBadRequest())
.andExpect(status().isUnauthorized())
.andExpect(status().is(200))

// Headers
.andExpect(header().string("Content-Type", "application/json"))
.andExpect(header().exists("Location"))

// JSON body (JsonPath)
.andExpect(jsonPath("$.id").value(1))
.andExpect(jsonPath("$.items").isArray())
.andExpect(jsonPath("$.items", hasSize(2)))
.andExpect(jsonPath("$.items[0]").value("widget"))

// Full body comparison
.andExpect(content().json("""
    {"id": 1, "customerName": "Alice"}
    """))

// Response body as string
.andReturn().getResponse().getContentAsString()
```

---

## @DataJpaTest — Data Layer Only

Loads JPA entities, repositories, schema. Uses H2 in-memory by default; auto-wraps each test in a transaction that rolls back.

```java
@DataJpaTest
class OrderRepositoryTest {

    @Autowired OrderRepository orderRepository;
    @Autowired TestEntityManager entityManager;

    @Test
    void findByStatus_shouldReturnOnlyMatchingOrders() {
        entityManager.persistAndFlush(new Order("Alice", OrderStatus.PENDING));
        entityManager.persistAndFlush(new Order("Bob", OrderStatus.SHIPPED));
        entityManager.clear();   // evict from first-level cache — forces a real SELECT

        List<Order> pending = orderRepository.findByStatus(OrderStatus.PENDING);

        assertThat(pending).hasSize(1)
            .first()
            .extracting(Order::getCustomerName)
            .isEqualTo("Alice");
    }

    @Test
    void findTop5ByOrderByCreatedAtDesc_shouldReturnMostRecent() {
        IntStream.range(0, 10).forEach(i ->
            entityManager.persistAndFlush(new Order("Customer-" + i, OrderStatus.PENDING))
        );

        List<Order> recent = orderRepository.findTop5ByOrderByCreatedAtDesc();
        assertThat(recent).hasSize(5);
    }
}
```

### Use Real Database Instead of H2

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class OrderRepositoryPostgresTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", postgres::getJdbcUrl);
        r.add("spring.datasource.username", postgres::getUsername);
        r.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired OrderRepository orderRepository;

    @Test
    void nativeQuery_shouldWorkWithRealPostgres() { }
}
```

::: tip H2 vs Real Database
H2 dialect differences can mask bugs (e.g., PostgreSQL-specific functions, JSONB columns, `RETURNING` clauses). Use Testcontainers + real PostgreSQL for queries that use vendor-specific SQL.
:::

---

## @WebFluxTest — Reactive Layer

```java
@WebFluxTest(OrderController.class)
class ReactiveOrderControllerTest {

    @Autowired WebTestClient webTestClient;
    @MockBean ReactiveOrderService orderService;

    @Test
    void getOrder_shouldReturnMono() {
        when(orderService.findById(1L))
            .thenReturn(Mono.just(new OrderDto(1L, "Alice", "PENDING")));

        webTestClient.get().uri("/api/orders/1")
            .exchange()
            .expectStatus().isOk()
            .expectBody(OrderDto.class)
            .value(dto -> assertThat(dto.customerName()).isEqualTo("Alice"));
    }

    @Test
    void listOrders_shouldReturnFlux() {
        when(orderService.findAll()).thenReturn(Flux.just(order1, order2, order3));

        webTestClient.get().uri("/api/orders")
            .exchange()
            .expectStatus().isOk()
            .expectBodyList(OrderDto.class)
            .hasSize(3);
    }
}
```

---

## @RestClientTest — HTTP Client Testing

Test `RestTemplate` / `RestClient` / `RestOperations` configuration with a mock server.

```java
@RestClientTest(ExternalPaymentClient.class)
class PaymentClientTest {

    @Autowired ExternalPaymentClient paymentClient;
    @Autowired MockRestServiceServer server;

    @Test
    void chargeCard_shouldCallPaymentApi() {
        server.expect(requestTo("https://payments.example.com/charge"))
              .andExpect(method(HttpMethod.POST))
              .andExpect(content().json("""{"amount": 99.99}"""))
              .andRespond(withSuccess("""{"transactionId": "txn-123"}""",
                          MediaType.APPLICATION_JSON));

        PaymentResult result = paymentClient.charge(new ChargeRequest(99.99));
        assertThat(result.transactionId()).isEqualTo("txn-123");
        server.verify();
    }
}
```

---

## @JsonTest — Serialisation Only

```java
@JsonTest
class OrderDtoJsonTest {

    @Autowired JacksonTester<OrderDto> json;

    @Test
    void serialise_shouldProduceCorrectJson() throws Exception {
        var dto = new OrderDto(1L, "Alice", "PENDING", List.of("widget"));

        assertThat(json.write(dto)).hasJsonPathValue("$.id", 1)
                                   .hasJsonPathValue("$.customerName", "Alice")
                                   .doesNotHaveJsonPath("$.internalField");
    }

    @Test
    void deserialise_shouldParseFromJson() throws Exception {
        String content = """
            {"id": 1, "customerName": "Alice", "status": "PENDING"}
            """;

        assertThat(json.parse(content))
            .usingRecursiveComparison()
            .isEqualTo(new OrderDto(1L, "Alice", "PENDING", null));
    }
}
```

---

## @MockBean vs @SpyBean

| | `@MockBean` | `@SpyBean` |
|-|-------------|------------|
| Based on | Mockito `mock()` | Mockito `spy()` |
| Method calls | Return defaults unless stubbed | Delegate to real implementation |
| Added to context | Yes — replaces existing bean | Yes — wraps existing bean |
| Use for | Replacing external dependencies | Verifying calls on a real bean |

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {
    @MockBean OrderService orderService;   // full mock — control all returns
}

@SpringBootTest
class OrderServiceTest {
    @SpyBean OrderService orderService;   // real bean — only stub specific methods
    @MockBean EmailService emailService;  // still mock external dep
}
```

---

## Security Testing

### @WithMockUser

```java
@WebMvcTest(OrderController.class)
@Import(SecurityConfig.class)    // import security config if not auto-loaded
class SecureOrderControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean OrderService orderService;

    @Test
    @WithMockUser(username = "alice", roles = {"USER"})
    void getOrder_withAuthenticatedUser_shouldReturn200() throws Exception {
        when(orderService.findById(1L)).thenReturn(orderDto);
        mockMvc.perform(get("/api/orders/1")).andExpect(status().isOk());
    }

    @Test
    @WithMockUser(username = "admin", roles = {"ADMIN"})
    void deleteOrder_withAdmin_shouldReturn204() throws Exception {
        mockMvc.perform(delete("/api/orders/1")).andExpect(status().isNoContent());
    }

    @Test
    void getOrder_withoutAuth_shouldReturn401() throws Exception {
        mockMvc.perform(get("/api/orders/1")).andExpect(status().isUnauthorized());
    }
}
```

### @WithUserDetails

Use when your security relies on a custom `UserDetailsService`.

```java
@WithUserDetails(value = "alice@example.com", userDetailsServiceBeanName = "customUserDetailsService")
@Test
void getMyOrders_shouldReturnOnlyAlicesOrders() throws Exception {
    mockMvc.perform(get("/api/orders/me")).andExpect(status().isOk());
}
```

### Custom Security Annotation

```java
// Define reusable annotation
@Retention(RetentionPolicy.RUNTIME)
@WithMockUser(username = "alice@example.com", roles = "USER")
public @interface WithMockCustomer { }

// Use in tests
@Test
@WithMockCustomer
void customerCanViewOwnOrders() throws Exception { }
```

### JWT / OAuth2 Bearer Token Testing

```java
@WebMvcTest(OrderController.class)
class JwtSecuredControllerTest {

    @Autowired MockMvc mockMvc;
    @MockBean OrderService orderService;

    @Test
    void withJwtToken_shouldReturn200() throws Exception {
        mockMvc.perform(get("/api/orders/1")
                .with(jwt()                        // spring-security-test
                    .jwt(jwt -> jwt
                        .subject("alice@example.com")
                        .claim("roles", List.of("ROLE_USER")))))
            .andExpect(status().isOk());
    }

    @Test
    void withoutToken_shouldReturn401() throws Exception {
        mockMvc.perform(get("/api/orders/1"))
            .andExpect(status().isUnauthorized());
    }
}
```

---

## Context Caching

Spring caches the application context between tests — starting it is expensive (seconds). Tests sharing the same context configuration reuse it.

```
Test A → loads context → cached
Test B → same config → reuses cached context (fast)
Test C → different config (@MockBean a different bean) → new context
```

**What breaks context sharing (triggers new context):**
- `@MockBean` / `@SpyBean` with different beans
- Different `properties` in `@SpringBootTest`
- `@DirtiesContext` — explicitly invalidates the context
- Different `@ActiveProfiles`

### @DirtiesContext — Use Sparingly

```java
// Marks the context as dirty — next test creates a new one
// Avoid where possible — causes context reload (slow)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class StatefulTest { }

// Acceptable use cases:
// - Static/singleton state modification
// - Tests that mutate Spring beans
// - Tests that change system properties affecting the context
```

### Sharing Testcontainers for Context Caching

```java
// AbstractIntegrationTest.java — shared by all integration tests
@SpringBootTest
@Testcontainers
public abstract class AbstractIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16")
        .withReuse(true);    // container survives between test class runs

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}

// All integration tests extend this
class OrderServiceIT extends AbstractIntegrationTest { }
class InventoryServiceIT extends AbstractIntegrationTest { }
// → same context config → single context reused across all IT classes
```

---

## src/test/resources Configuration

```
src/
└── test/
    └── resources/
        ├── application.properties   ← overrides main config for all tests
        ├── application-test.yml     ← loaded when @ActiveProfiles("test")
        └── data.sql                 ← executed by @DataJpaTest for seed data
```

```properties
# src/test/resources/application.properties
spring.jpa.show-sql=true
spring.datasource.url=jdbc:h2:mem:testdb
logging.level.org.springframework=WARN
feature.new-checkout=true
```

---

## Test Slices Reference

```java
// Which annotations auto-configure what:

@WebMvcTest       → DispatcherServlet, controllers, filters, @ControllerAdvice,
                    HandlerMapping, security (if spring-security on classpath)
                    → NOT: services, repositories, Kafka, scheduled tasks

@DataJpaTest      → EntityManagerFactory, DataSource (H2 default), repositories,
                    Flyway/Liquibase, @Transactional (rollback per test)
                    → NOT: controllers, services, Kafka

@WebFluxTest      → WebFlux infrastructure, reactive controllers
                    → NOT: security (add @Import(SecurityConfig.class) if needed)

@SpringBootTest   → everything — most expensive, broadest
```

---

## Interview Quick-Fire

**Q: What is the difference between `@WebMvcTest` and `@SpringBootTest`?**
`@WebMvcTest` loads only the web layer — controllers, filters, `@ControllerAdvice` — making it fast and focused. Services and repositories must be mocked with `@MockBean`. `@SpringBootTest` loads the full application context including all beans — use for integration tests where you want real wiring. `@WebMvcTest` is preferred for controller logic; `@SpringBootTest` for cross-layer integration.

**Q: Why does `@DataJpaTest` use H2 by default and when should you override this?**
H2 is an in-memory database that starts fast with no infrastructure — ideal for simple query tests. Override with `@AutoConfigureTestDatabase(replace = NONE)` + Testcontainers when queries use PostgreSQL-specific SQL (JSONB, arrays, `RETURNING`, window functions, native queries with vendor syntax). H2 compatibility mode helps but isn't perfect.

**Q: What is Spring Test context caching and how do you keep tests fast?**
Spring caches the `ApplicationContext` between test classes that share the same configuration. Starting a context costs seconds; reuse makes subsequent tests fast. Context sharing breaks when `@MockBean` differs, `@ActiveProfiles` differs, or `@DirtiesContext` is used. Design integration tests to share a base class with identical configuration, and avoid unnecessary `@MockBean` variation across test classes.

**Q: How do you test a Spring Security-secured endpoint?**
Use `spring-security-test`. For basic roles: `@WithMockUser(roles = "ADMIN")` on the test method. For JWT/OAuth2: `.with(jwt().jwt(jwt -> jwt.subject("alice").claim(...)))` in MockMvc. For `UserDetailsService`-based auth: `@WithUserDetails`. For unauthenticated tests, make a request with no authentication and expect 401.

<RelatedTopics :topics="['/testing/', '/testing/mockito', '/testing/testcontainers', '/spring/spring-security']" />

[→ Back to Testing Overview](/testing/)
