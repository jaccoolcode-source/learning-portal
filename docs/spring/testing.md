---
title: Spring Testing
description: Testing Spring applications — @SpringBootTest, @WebMvcTest, @DataJpaTest, @MockBean, and best practices
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, testing, springboottest, webmvctest, mockbean, junit5]
related:
  - /spring/ioc-di
  - /spring/spring-boot
estimatedMinutes: 20
---

# Spring Testing

<DifficultyBadge level="intermediate" />

Spring Boot provides a rich testing toolkit — from unit tests that don't start a context to full integration tests. Choosing the right test slice avoids slow test suites.

---

## Test Strategy Layers

```
Unit Tests              → no Spring context, pure Java, fast
  ↓
Slice Tests             → partial Spring context (web layer, data layer)
  ↓
Integration Tests       → full Spring context
  ↓
E2E Tests               → full stack with real DB (Testcontainers)
```

---

## Unit Tests — No Spring

```java
class OrderServiceTest {
    // Create service manually with mocked dependencies
    private final OrderRepository repo = Mockito.mock(OrderRepository.class);
    private final EmailService email = Mockito.mock(EmailService.class);
    private final OrderService service = new OrderService(repo, email);

    @Test
    void placeOrder_shouldSaveAndSendEmail() {
        // Given
        var request = new OrderRequest("Alice", List.of("item1"));
        var savedOrder = new Order(1L, "Alice", OrderStatus.PENDING);
        when(repo.save(any())).thenReturn(savedOrder);

        // When
        Order result = service.placeOrder(request);

        // Then
        assertThat(result.getId()).isEqualTo(1L);
        verify(repo).save(any(Order.class));
        verify(email).sendConfirmation(eq("Alice"), any());
    }
}
```

---

## @SpringBootTest — Full Context

```java
@SpringBootTest  // loads full application context
@Transactional   // rolls back each test
class OrderIntegrationTest {
    @Autowired OrderService orderService;
    @Autowired OrderRepository orderRepository;

    @Test
    void createAndRetrieveOrder() {
        Order order = orderService.placeOrder(new OrderRequest("Bob", List.of("item")));
        assertThat(order.getId()).isNotNull();

        Optional<Order> found = orderRepository.findById(order.getId());
        assertThat(found).isPresent();
        assertThat(found.get().getCustomerName()).isEqualTo("Bob");
    }
}
```

```java
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)  // starts embedded server
class OrderApiTest {
    @Autowired TestRestTemplate restTemplate;

    @Test
    void getOrder_shouldReturn200() {
        ResponseEntity<OrderDto> response = restTemplate.getForEntity("/api/orders/1", OrderDto.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }
}
```

---

## @WebMvcTest — Web Layer Only

Loads only MVC components: controllers, filters, `@ControllerAdvice`. No service/repo beans.

```java
@WebMvcTest(OrderController.class)  // only this controller
class OrderControllerTest {
    @Autowired MockMvc mockMvc;

    @MockBean OrderService orderService;  // replace service with mock

    @Test
    void getOrder_shouldReturnJson() throws Exception {
        var order = new OrderDto(1L, "Alice", "PENDING");
        when(orderService.findById(1L)).thenReturn(order);

        mockMvc.perform(get("/api/orders/1")
                .accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.customerName").value("Alice"))
            .andExpect(jsonPath("$.status").value("PENDING"));
    }

    @Test
    void createOrder_shouldReturn201() throws Exception {
        var request = """
            {"customerName": "Bob", "items": ["widget"]}
            """;

        mockMvc.perform(post("/api/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content(request))
            .andExpect(status().isCreated());
    }
}
```

---

## @DataJpaTest — Data Layer Only

Loads only JPA components. Uses in-memory H2 by default.

```java
@DataJpaTest
class OrderRepositoryTest {
    @Autowired OrderRepository orderRepository;
    @Autowired TestEntityManager entityManager;

    @Test
    void findByStatus_shouldReturnMatchingOrders() {
        // Given
        entityManager.persistAndFlush(new Order("Alice", OrderStatus.PENDING));
        entityManager.persistAndFlush(new Order("Bob", OrderStatus.SHIPPED));

        // When
        List<Order> pending = orderRepository.findByStatus(OrderStatus.PENDING);

        // Then
        assertThat(pending).hasSize(1);
        assertThat(pending.get(0).getCustomerName()).isEqualTo("Alice");
    }
}
```

---

## @MockBean vs @Mock

| | `@MockBean` (Spring) | `@Mock` (Mockito) |
|-|---------------------|------------------|
| Context | Spring context replaces bean | Plain Mockito mock (no context) |
| When to use | `@WebMvcTest`, `@SpringBootTest` | Pure unit tests |
| Behaviour | Resets between tests | Resets between tests |

---

## Testcontainers — Real Database

```java
@SpringBootTest
@Testcontainers
class OrderRepositoryIntegrationTest {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:15")
        .withDatabaseName("testdb");

    @DynamicPropertySource
    static void configureDataSource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }

    @Autowired OrderRepository repo;

    @Test
    void shouldSaveAndFetchOrder() {
        // Tests against real Postgres in Docker
        Order saved = repo.save(new Order("Alice", OrderStatus.PENDING));
        assertThat(repo.findById(saved.getId())).isPresent();
    }
}
```

---

## Test Slice Summary

| Annotation | Context | Use for |
|-----------|---------|---------|
| None | None | Pure unit tests |
| `@WebMvcTest` | Web layer only | Controller + MockMvc tests |
| `@DataJpaTest` | JPA layer only | Repository tests |
| `@SpringBootTest` | Full context | Integration tests |
| `@SpringBootTest(RANDOM_PORT)` | Full + HTTP server | API integration tests |

---

## Summary

- Unit tests need no Spring — test logic with plain Mockito.
- `@WebMvcTest` + `@MockBean` is ideal for controller tests.
- `@DataJpaTest` tests repositories against an in-memory DB.
- Testcontainers gives real-DB tests without a permanent database.
- Prefer unit → slice → integration test pyramid for fast feedback.

<RelatedTopics :topics="['/spring/ioc-di', '/spring/spring-boot', '/spring/spring-data']" />
