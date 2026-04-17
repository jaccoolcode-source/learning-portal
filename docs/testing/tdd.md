---
title: Test-Driven Development (TDD)
description: TDD in Java — Red-Green-Refactor cycle, the three rules, worked examples, outside-in vs inside-out, and common pitfalls
category: testing
pageClass: layout-testing
difficulty: intermediate
tags: [tdd, test-driven-development, red-green-refactor, junit5, java, design, testing]
related:
  - /testing/junit5
  - /testing/mockito
  - /testing/spring-testing
estimatedMinutes: 35
---

# Test-Driven Development (TDD)

<DifficultyBadge level="intermediate" />

TDD is a development technique where you write a **failing test before writing any production code**. The test drives the design — you only write enough code to make it pass, then improve the design without changing behaviour.

---

## Red-Green-Refactor

The TDD cycle has three phases:

```
  ┌─────────────────────────────────────────┐
  │                                         │
  ▼                                         │
RED     Write a failing test                │
  │     (it must fail for the right reason) │
  ▼                                         │
GREEN   Write the minimum code to pass it   │
  │     (ugly is fine — just make it green) │
  ▼                                         │
REFACTOR Clean up the code                  │
        (no new behaviour — tests stay green)
        ─────────────────────────────────────┘
```

**Red:** The test compiles but fails. A test that fails for the wrong reason (compile error in production code, wrong assertion) is not a valid red.

**Green:** Write the **simplest possible code** to make the test pass. Hardcoding the return value is acceptable at this stage.

**Refactor:** Remove duplication, rename, extract — with confidence that tests will catch regressions.

---

## The Three Rules of TDD (Uncle Bob)

1. You may not write production code unless it is to make a failing test pass.
2. You may not write more of a unit test than is sufficient to fail.
3. You may not write more production code than is sufficient to pass the failing test.

These rules keep cycles short (minutes, not hours) and force incremental design.

---

## Worked Example — `OrderPricer` from Scratch

### Step 1 — RED: write the first failing test

```java
// OrderPricerTest.java
class OrderPricerTest {

    @Test
    void standardOrderHasNoDiscount() {
        OrderPricer pricer = new OrderPricer();
        double price = pricer.calculate(100.0, CustomerTier.STANDARD);
        assertThat(price).isEqualTo(100.0);
    }
}
```

This doesn't compile yet — `OrderPricer` and `CustomerTier` don't exist. That's fine; the compile error **is** the red state.

### Step 2 — GREEN: minimum code to pass

```java
// CustomerTier.java
public enum CustomerTier { STANDARD, GOLD, PLATINUM }

// OrderPricer.java
public class OrderPricer {
    public double calculate(double amount, CustomerTier tier) {
        return amount;   // hardcoded — enough to pass the first test
    }
}
```

Test passes. ✅

### Step 3 — RED: add the next failing test

```java
@Test
void goldCustomerGets10PercentDiscount() {
    OrderPricer pricer = new OrderPricer();
    double price = pricer.calculate(100.0, CustomerTier.GOLD);
    assertThat(price).isEqualTo(90.0);
}
```

Fails — `calculate` always returns `amount`. ✅ (red for the right reason)

### Step 4 — GREEN

```java
public double calculate(double amount, CustomerTier tier) {
    if (tier == CustomerTier.GOLD) return amount * 0.90;
    return amount;
}
```

### Step 5 — RED: another case

```java
@Test
void platinumCustomerGets20PercentDiscount() {
    OrderPricer pricer = new OrderPricer();
    double price = pricer.calculate(100.0, CustomerTier.PLATINUM);
    assertThat(price).isEqualTo(80.0);
}
```

### Step 6 — GREEN + REFACTOR

```java
// Green first:
public double calculate(double amount, CustomerTier tier) {
    return switch (tier) {
        case GOLD     -> amount * 0.90;
        case PLATINUM -> amount * 0.80;
        default       -> amount;
    };
}
```

Now refactor — extract the discount rate:

```java
public double calculate(double amount, CustomerTier tier) {
    return amount * (1 - discountFor(tier));
}

private double discountFor(CustomerTier tier) {
    return switch (tier) {
        case GOLD     -> 0.10;
        case PLATINUM -> 0.20;
        default       -> 0.00;
    };
}
```

All three tests still pass. Design emerged from the tests — no upfront design needed.

---

## Arrange / Act / Assert

Every test should have a clear three-section structure:

```java
@Test
void goldCustomerGets10PercentDiscount() {
    // Arrange — set up the system under test and its dependencies
    OrderPricer pricer = new OrderPricer();
    double orderAmount = 100.0;

    // Act — call the single behaviour being tested
    double result = pricer.calculate(orderAmount, CustomerTier.GOLD);

    // Assert — verify the outcome
    assertThat(result).isEqualTo(90.0);
}
```

**One assertion per test** is a useful heuristic — tests should have one reason to fail. Multiple assertions are fine if they all verify the same behaviour.

---

## What to Test — and What Not to Mock

A common Java TDD mistake is over-mocking: replacing everything with mocks, then testing nothing real.

```java
// ❌ Over-mocked — tests almost nothing
@Test
void createOrder() {
    OrderRepository repo = mock(OrderRepository.class);
    PaymentService payment = mock(PaymentService.class);
    NotificationService notifier = mock(NotificationService.class);
    OrderService service = new OrderService(repo, payment, notifier);

    when(repo.save(any())).thenReturn(new Order("id-1"));
    when(payment.charge(any(), anyDouble())).thenReturn(true);

    Order result = service.createOrder(new CreateOrderRequest("cust-1", 50.0));

    verify(repo).save(any());
    verify(payment).charge(any(), eq(50.0));
    // All mocked — if the real payment logic changes, this test still passes
}
```

```java
// ✅ Mock only external systems (DB, HTTP, email)
// Test the domain logic with real collaborators
@Test
void orderTotalIncludesAllItems() {
    // Real collaborators — no mocks needed for pure logic
    Order order = new Order("cust-1");
    order.addItem(new OrderItem("prod-A", 30.0, 2));
    order.addItem(new OrderItem("prod-B", 15.0, 1));

    assertThat(order.total()).isEqualTo(75.0);
}
```

**Mock when:**
- The dependency is slow (database, HTTP call)
- The dependency has side effects (sends email, charges card)
- You want to test error paths that are hard to trigger with real deps

**Don't mock:**
- Pure domain logic and value objects
- In-memory collaborators
- Simple utility classes

---

## Outside-In vs Inside-Out TDD

### Inside-Out (Classic / Chicago School)

Start from the smallest unit, build up.

```
Domain objects → Services → Controllers
```

- Write `Order` tests first, then `OrderService`, then `OrderController`
- Design emerges bottom-up
- Risk: may build the wrong abstractions before seeing the full picture

### Outside-In (London School / Mockist)

Start from the acceptance test, drive inward.

```
Failing acceptance test (HTTP level)
    → Controller test (mock service)
        → Service test (mock repository)
            → Repository test (real DB / Testcontainers)
```

```java
// Outside-In: start with the HTTP test
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @MockBean OrderService orderService;

    @Test
    void createOrderReturns201WithLocation() throws Exception {
        when(orderService.create(any())).thenReturn(new Order("ord-1", "cust-1", 50.0));

        mockMvc.perform(post("/orders")
                .contentType(APPLICATION_JSON)
                .content("{\"customerId\":\"cust-1\",\"amount\":50.0}"))
            .andExpect(status().isCreated())
            .andExpect(header().string("Location", "/orders/ord-1"));
    }
}
```

Then implement just enough `OrderController` to pass, which forces you to define `OrderService` interface, and so on.

**Tradeoff:** Outside-in requires mocking collaborators heavily at each layer; inside-out produces better-tested domain logic with fewer mocks.

---

## TDD with Spring Boot

Prefer **thin slices** — test the layer in isolation rather than spinning up the full context for every test.

```java
// Unit test — no Spring context at all (fastest)
class OrderPricerTest { ... }

// Slice test — only the web layer (@WebMvcTest)
@WebMvcTest(OrderController.class)
class OrderControllerTest { ... }

// Slice test — only JPA layer (@DataJpaTest)
@DataJpaTest
class OrderRepositoryTest { ... }

// Integration test — full context, real DB (Testcontainers)
@SpringBootTest
@Testcontainers
class CreateOrderIntegrationTest { ... }
```

**TDD flow with Spring:**
1. Write a `@SpringBootTest` acceptance test that defines the feature's HTTP contract → RED
2. Write a `@WebMvcTest` for the controller → RED → GREEN
3. Write a unit test for the service → RED → GREEN
4. Write a `@DataJpaTest` for the repository → RED → GREEN
5. Acceptance test turns GREEN

---

## Parameterised Tests for TDD

When a rule has multiple cases, parameterised tests let you drive all of them at once:

```java
@ParameterizedTest
@CsvSource({
    "STANDARD, 100.0, 100.0",
    "GOLD,     100.0,  90.0",
    "PLATINUM, 100.0,  80.0",
    "GOLD,      50.0,  45.0",
})
void calculatesPriceByTier(CustomerTier tier, double amount, double expected) {
    OrderPricer pricer = new OrderPricer();
    assertThat(pricer.calculate(amount, tier)).isEqualTo(expected);
}
```

---

## Common TDD Pitfalls

| Pitfall | Fix |
|---------|-----|
| Writing tests after the code | Discipline — the test must fail before you write production code |
| Testing implementation details | Test behaviour (what), not internals (how) — refactoring should never break tests |
| Over-mocking everything | Mock at system boundaries only; use real objects for domain logic |
| Tests that never fail | Verify each new test fails before going green |
| Skipping the refactor step | The cycle is Red → Green → **Refactor** — skipping causes design debt |
| One giant test per feature | Keep tests small and focused — many small tests, not one big one |

---

## Interview Quick-Fire

**Q: What is the point of writing a failing test first?**
It proves the test can detect the absence of the feature (it would fail if you deleted the implementation). A test you wrote after the code may pass even with bugs, because you unconsciously wrote it to match the existing code rather than the requirement.

**Q: What does "refactor" mean in Red-Green-Refactor?**
Improving code structure — naming, duplication, abstractions — without changing observable behaviour. The tests stay green throughout. Refactoring is only safe when you have tests; TDD makes refactoring a continuous, low-risk activity.

**Q: How is TDD different from writing tests?**
TDD uses tests to **drive design**. The test is written first to clarify what the code should do before thinking about how. Writing tests after the code verifies existing code but doesn't influence its design.

**Q: Can you do TDD with integration tests?**
Yes — the outside-in approach starts with a failing integration/acceptance test. The difference is cycle time: unit test cycles are seconds, integration test cycles are minutes. A pragmatic approach uses a mix: unit TDD for domain logic, integration tests for boundary verification.

<RelatedTopics :topics="['/testing/', '/testing/junit5', '/testing/mockito', '/testing/spring-testing']" />

[→ Back to Testing Overview](/testing/)