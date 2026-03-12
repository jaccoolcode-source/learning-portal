---
title: Testing Strategy & Overview
description: Testing fundamentals — test pyramid, test double taxonomy, tooling landscape, naming conventions, and deciding what kind of test to write
category: testing
pageClass: layout-testing
difficulty: beginner
tags: [testing, junit5, mockito, testcontainers, wiremock, assertj, test-pyramid, tdd]
related:
  - /testing/junit5
  - /testing/mockito
  - /testing/spring-testing
  - /testing/testcontainers
estimatedMinutes: 15
---

# Testing Strategy & Overview

<DifficultyBadge level="beginner" />

Good tests make change safe. They document intended behaviour, catch regressions, and let you refactor with confidence. Bad tests slow you down — brittle, slow, testing implementation rather than behaviour.

---

## The Test Pyramid

```
         ▲
        /E\
       /2E2\          End-to-End — few, slow, expensive
      /─────\
     / Integ \        Integration — moderate, real dependencies
    /─────────\
   /   Unit    \      Unit — many, fast, isolated
  /─────────────\
```

| Level | Count | Speed | Dependencies | Purpose |
|-------|-------|-------|--------------|---------|
| **Unit** | Hundreds | < 1 ms | None (mocked) | Business logic, algorithms, edge cases |
| **Integration** | Tens | 100 ms – 5 s | Real DB, cache, broker | Wiring, SQL queries, Spring context |
| **End-to-End** | Few | 5 – 60 s | Full stack | Critical user journeys |

::: tip The Ice Cream Anti-Pattern
Inverting the pyramid — many E2E, few unit tests — gives slow, flaky feedback. Catching bugs at the unit level costs ~100× less than catching them in production.
:::

---

## Test Double Taxonomy

Before reaching for a mock, understand the right double for the job.

| Type | What It Does | When to Use |
|------|-------------|-------------|
| **Dummy** | Passed but never called | Satisfying a constructor parameter you don't care about |
| **Stub** | Returns hardcoded data | Controlling indirect inputs (e.g., repository returns a fixed order) |
| **Fake** | Working implementation, unsuitable for production | In-memory repository, H2 database |
| **Spy** | Real object that also records calls | Verifying side effects on real implementations |
| **Mock** | Pre-programmed with expectations | Verifying interaction with collaborators (use sparingly) |

::: warning Don't over-mock
Mock at architectural boundaries (external services, repositories). Don't mock value objects, domain logic, or things you own — test those directly. Excessive mocking produces tests that pass even when behaviour is wrong.
:::

---

## Tooling Landscape

| Tool | Purpose |
|------|---------|
| **JUnit 5** | Test runner, lifecycle, parameterized tests, extensions |
| **Mockito** | Mocking, stubbing, verification |
| **AssertJ** | Fluent, readable assertions |
| **Testcontainers** | Real Docker containers for integration tests |
| **WireMock** | Stub/mock external HTTP services |
| **Spring Cloud Contract** | Consumer-driven contract testing |
| **ArchUnit** | Enforce architectural rules in tests |
| **PIT (Pitest)** | Mutation testing — measure test quality |
| **@EmbeddedKafka** | In-process Kafka broker for Spring tests |

### Maven Dependencies

```xml
<dependencies>
    <!-- JUnit 5 + AssertJ + Mockito via Spring Boot starter -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-test</artifactId>
        <scope>test</scope>
        <!-- includes: junit-jupiter, mockito-core, mockito-junit-jupiter,
                       assertj-core, hamcrest, json-path, jsonassert -->
    </dependency>

    <!-- Testcontainers -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-testcontainers</artifactId>
        <scope>test</scope>
    </dependency>
    <dependency>
        <groupId>org.testcontainers</groupId>
        <artifactId>junit-jupiter</artifactId>
        <scope>test</scope>
    </dependency>

    <!-- WireMock -->
    <dependency>
        <groupId>org.wiremock.integrations</groupId>
        <artifactId>wiremock-spring-boot</artifactId>
        <version>3.2.0</version>
        <scope>test</scope>
    </dependency>

    <!-- ArchUnit -->
    <dependency>
        <groupId>com.tngtech.archunit</groupId>
        <artifactId>archunit-junit5</artifactId>
        <version>1.3.0</version>
        <scope>test</scope>
    </dependency>
</dependencies>
```

---

## Naming Conventions

Readable test names are documentation.

```java
// Pattern: should_<expectedBehaviour>_when_<condition>
@Test
void should_throw_when_stock_is_insufficient() { }

// Pattern: <method>_<scenario>_<expected>
@Test
void placeOrder_withInsufficientStock_throwsOutOfStockException() { }

// Pattern: given_when_then (BDD style — works well with @DisplayName)
@DisplayName("Given insufficient stock, when placing order, then throw OutOfStockException")
@Test
void givenInsufficientStock_whenPlaceOrder_thenThrowOutOfStockException() { }
```

Use `@DisplayName` for full human-readable descriptions in reports:

```java
@DisplayName("OrderService")
class OrderServiceTest {

    @Nested
    @DisplayName("placeOrder()")
    class PlaceOrder {

        @Test
        @DisplayName("saves the order and returns it with an assigned ID")
        void savesOrderWithAssignedId() { }

        @Test
        @DisplayName("throws OutOfStockException when requested quantity exceeds stock")
        void throwsWhenInsufficientStock() { }
    }
}
```

---

## Given / When / Then Structure

Every test has three parts. Make them explicit with comments or blank lines.

```java
@Test
void placeOrder_shouldSaveAndSendConfirmation() {
    // Given
    var request = new OrderRequest("alice@example.com", List.of("widget"), 2);
    var savedOrder = new Order(42L, "alice@example.com", OrderStatus.PENDING);
    when(orderRepository.save(any())).thenReturn(savedOrder);

    // When
    Order result = orderService.placeOrder(request);

    // Then
    assertThat(result.getId()).isEqualTo(42L);
    assertThat(result.getStatus()).isEqualTo(OrderStatus.PENDING);
    verify(emailService).sendConfirmation("alice@example.com", 42L);
}
```

---

## What Kind of Test to Write?

```
Is it pure logic with no I/O?
  → Unit test with plain Mockito

Does it involve Spring beans but not the DB?
  → @WebMvcTest (controllers) or unit test with @ExtendWith(MockitoExtension)

Does it involve JPA / SQL queries?
  → @DataJpaTest (H2) or Testcontainers + @SpringBootTest

Does it involve external HTTP services?
  → WireMock stub + @SpringBootTest or @WebMvcTest

Does it involve Kafka / messaging?
  → @EmbeddedKafka or Testcontainers Kafka module

Is it a critical user journey through the full stack?
  → @SpringBootTest(RANDOM_PORT) with Testcontainers

Does it verify architectural rules?
  → ArchUnit
```

---

## AssertJ Quick Reference

Spring Boot Test includes AssertJ. Prefer it over JUnit assertions — richer messages, fluent chaining.

```java
// Primitives
assertThat(result).isEqualTo(42);
assertThat(price).isGreaterThan(BigDecimal.ZERO);
assertThat(name).isNotNull().isNotBlank().startsWith("A");

// Collections
assertThat(orders).hasSize(3)
                  .extracting(Order::getStatus)
                  .containsExactly(PENDING, SHIPPED, DELIVERED);

// Exceptions
assertThatThrownBy(() -> service.placeOrder(invalidRequest))
    .isInstanceOf(ValidationException.class)
    .hasMessageContaining("quantity must be positive");

// Optional
assertThat(optional).isPresent().contains(expectedValue);

// Soft assertions (collect all failures)
SoftAssertions.assertSoftly(softly -> {
    softly.assertThat(order.getId()).isNotNull();
    softly.assertThat(order.getStatus()).isEqualTo(PENDING);
    softly.assertThat(order.getItems()).hasSize(2);
});
```

---

## Test Performance Tips

| Problem | Solution |
|---------|----------|
| Slow Spring context startup | Share context — avoid `@DirtiesContext` where possible |
| Each test starts a container | Use `static` container fields + `@DirtiesContext` alternative: singleton pattern |
| H2 vs real DB dialect differences | Use Testcontainers PostgreSQL instead of H2 |
| Integration tests slow the build | Separate Maven profile: `-P integration` |
| Flakey tests from timing | Use `Awaitility` for async assertions instead of `Thread.sleep` |

---

## Interview Quick-Fire

**Q: What is the difference between a mock and a stub?**
A stub returns predetermined data to control indirect inputs — it doesn't verify anything. A mock has pre-programmed expectations and verifies that specific interactions happened. Prefer stubs when you only need to control data; use mocks when you must verify a side effect (e.g., an email was sent).

**Q: Why should unit tests avoid starting a Spring context?**
Spring context startup takes seconds. Unit tests should run in milliseconds. Starting a context couples tests to the framework rather than testing business logic in isolation. Use plain Mockito for unit tests; reserve Spring slices for integration scenarios.

**Q: What is the test pyramid and why does it matter?**
More unit tests (fast, cheap), fewer integration tests, very few E2E tests. Inverting the pyramid (lots of E2E, few unit tests) results in slow feedback loops, flaky pipelines, and expensive debugging. Fast unit tests catch most bugs at the cheapest point in the SDLC.

<RelatedTopics :topics="['/testing/junit5', '/testing/mockito', '/testing/spring-testing', '/testing/testcontainers', '/testing/wiremock-contracts']" />
