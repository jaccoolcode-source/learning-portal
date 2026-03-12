---
title: Mockito
description: Mockito deep-dive — @Mock, @Spy, @Captor, @InjectMocks, stubbing, argument matchers, verification, ArgumentCaptor, static mocking, BDD style, and common pitfalls
category: testing
pageClass: layout-testing
difficulty: intermediate
tags: [mockito, testing, mocking, stubbing, verification, argumentcaptor, spy, bddmockito]
related:
  - /testing/
  - /testing/junit5
  - /testing/spring-testing
estimatedMinutes: 25
---

# Mockito

<DifficultyBadge level="intermediate" />

Mockito is the most widely used Java mocking framework. It creates test doubles for collaborators, controls return values (stubbing), and verifies that expected interactions happened.

---

## Setup with JUnit 5

```java
// Option 1: @ExtendWith (recommended — annotation-driven)
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock OrderRepository orderRepository;
    @Mock EmailService emailService;
    @InjectMocks OrderService orderService;   // injects mocks into this
}

// Option 2: Programmatic (no extension needed)
class OrderServiceTest {
    OrderRepository orderRepository = Mockito.mock(OrderRepository.class);
    EmailService emailService = Mockito.mock(EmailService.class);
    OrderService orderService = new OrderService(orderRepository, emailService);
}
```

```xml
<!-- pom.xml — already included via spring-boot-starter-test -->
<dependency>
    <groupId>org.mockito</groupId>
    <artifactId>mockito-junit-jupiter</artifactId>
    <scope>test</scope>
</dependency>
```

---

## Annotations

### @Mock

Creates a mock — all methods return default values (`null`, `0`, `false`, empty collections) unless stubbed.

```java
@Mock
OrderRepository orderRepository;
// orderRepository.findById(1L) → null (not stubbed)
```

### @Spy

Wraps a real object — real methods are called unless stubbed. Useful for partial mocking.

```java
@Spy
List<String> items = new ArrayList<>();  // real ArrayList, spy wraps it

@Test
void spy_callsRealMethod() {
    items.add("widget");                // real add()
    assertThat(items).hasSize(1);       // real size()
    verify(items).add("widget");        // verify it was called
}

// Stub one method on a spy — use doReturn, NOT when/thenReturn
doReturn(42).when(items).size();
```

### @Captor

Creates an `ArgumentCaptor` for capturing method arguments.

```java
@Captor
ArgumentCaptor<Order> orderCaptor;
```

### @InjectMocks

Creates an instance of the class under test and injects `@Mock`/`@Spy` fields into it via constructor, setter, or field injection (in that priority order).

```java
@Mock OrderRepository repository;
@Mock EmailService emailService;
@InjectMocks OrderService service;  // new OrderService(repository, emailService)
```

::: warning @InjectMocks limitations
Uses field injection if no matching constructor is found. Prefer explicit constructor injection in your production code — then `@InjectMocks` reliably uses the constructor and you see immediate compilation errors if dependencies change.
:::

---

## Stubbing

Tell a mock what to return when called with specific arguments.

### when / thenReturn

```java
// Return a fixed value
when(orderRepository.findById(1L)).thenReturn(Optional.of(order));

// Return null (explicit)
when(orderRepository.findById(99L)).thenReturn(Optional.empty());

// Chain multiple returns (last one repeats)
when(idGenerator.next()).thenReturn(1L, 2L, 3L);
// first call → 1L, second → 2L, third and beyond → 3L

// Return different value on repeated calls
when(clock.now()).thenReturn(t1).thenReturn(t2).thenReturn(t3);
```

### when / thenThrow

```java
when(orderRepository.findById(99L))
    .thenThrow(new EntityNotFoundException("Order 99 not found"));

// Throw on second call
when(orderRepository.save(any()))
    .thenReturn(savedOrder)
    .thenThrow(new DataIntegrityViolationException("duplicate"));
```

### when / thenAnswer

Full control — access invocation arguments.

```java
// Return the first argument back
when(orderRepository.save(any(Order.class)))
    .thenAnswer(invocation -> invocation.getArgument(0));

// Compute based on input
when(discountService.calculate(any(), anyInt()))
    .thenAnswer(inv -> {
        Tier tier = inv.getArgument(0);
        int amount = inv.getArgument(1);
        return tier == GOLD ? amount * 0.8 : amount * 0.9;
    });
```

### Void Methods — doReturn / doThrow / doNothing / doAnswer

For `void` methods, you can't use `when/thenReturn`. Use the `do*` family instead.

```java
// Stub void method to throw
doThrow(new RuntimeException("email failed"))
    .when(emailService).sendConfirmation(anyString(), anyLong());

// Do nothing (default for void, but explicit)
doNothing().when(emailService).sendConfirmation(any(), any());

// Custom behaviour
doAnswer(inv -> {
    System.out.println("Sent to: " + inv.getArgument(0));
    return null;
}).when(emailService).sendConfirmation(any(), any());
```

::: tip Use doReturn for Spies
When stubbing a method on a `@Spy`, always use `doReturn(...).when(spy).method()` — **not** `when(spy.method()).thenReturn(...)`. The latter calls the real method during stubbing, which may cause side effects or exceptions.
:::

---

## Argument Matchers

When you use a matcher for one argument, all arguments must use matchers.

```java
// Common matchers
when(repo.findById(anyLong())).thenReturn(Optional.of(order));
when(repo.findByName(anyString())).thenReturn(List.of());
when(repo.findByStatus(any(OrderStatus.class))).thenReturn(List.of());
when(repo.findAll(any())).thenReturn(List.of());  // any Pageable

// Specific value with mixed matchers — use eq()
when(repo.findByCustomerAndStatus(eq("Alice"), any(OrderStatus.class)))
    .thenReturn(List.of(order));

// Custom predicate
when(repo.find(argThat(spec -> spec.getStatus() == PENDING)))
    .thenReturn(List.of(order));

// Null checks
when(service.process(isNull())).thenThrow(NullPointerException.class);
when(service.process(notNull())).thenReturn(result);

// String matchers
when(service.lookup(startsWith("ORD-"))).thenReturn(order);
when(service.lookup(contains("test"))).thenReturn(testOrder);
when(service.lookup(matches("ORD-\\d{6}"))).thenReturn(order);

// Collection matchers
verify(repo).saveAll(argThat(list -> list.size() == 3));
```

---

## Verification

After executing the code under test, verify interactions happened.

```java
// Verify called exactly once (default)
verify(emailService).sendConfirmation("alice@example.com", 42L);

// Verify called N times
verify(repo, times(3)).save(any());

// Verify never called
verify(emailService, never()).sendConfirmation(any(), any());

// Verify at least / at most
verify(repo, atLeast(1)).findById(anyLong());
verify(repo, atMost(2)).save(any());

// Verify with exact arguments
verify(repo).save(argThat(order ->
    order.getCustomerName().equals("Alice") &&
    order.getStatus() == OrderStatus.PENDING
));

// Verify no more interactions
verifyNoMoreInteractions(emailService, repo);

// Verify zero interactions
verifyNoInteractions(auditService);
```

### InOrder Verification

```java
InOrder inOrder = inOrder(repo, emailService);
inOrder.verify(repo).save(any());               // must happen before...
inOrder.verify(emailService).sendConfirmation(any(), any());
```

---

## ArgumentCaptor

Capture the actual argument passed to a mock, then assert on it.

```java
@Captor
ArgumentCaptor<Order> orderCaptor;

@Test
void placeOrder_shouldSaveOrderWithCorrectFields() {
    service.placeOrder(new OrderRequest("Alice", List.of("widget"), 2));

    verify(orderRepository).save(orderCaptor.capture());
    Order captured = orderCaptor.getValue();

    assertThat(captured.getCustomerName()).isEqualTo("Alice");
    assertThat(captured.getItems()).hasSize(1);
    assertThat(captured.getStatus()).isEqualTo(OrderStatus.PENDING);
}

// Multiple captures
verify(emailService, times(2)).sendEmail(captor.capture());
List<Email> allEmails = captor.getAllValues();
assertThat(allEmails).extracting(Email::getRecipient)
                     .containsExactly("alice@example.com", "admin@example.com");
```

---

## Spy — Partial Mocking

Wrap a real object and only stub specific methods.

```java
@Spy
OrderService orderService = new OrderService(repo, emailService);

@Test
void partialMock() {
    // real method called for everything except audit
    doReturn("mocked-audit-id").when(orderService).generateAuditId();

    Order result = orderService.placeOrder(request);
    assertThat(result).isNotNull();           // real placeOrder runs
}
```

::: warning Spies are code smell
If you need a spy, your class may have too many responsibilities. Consider splitting it or restructuring the design. Use spies sparingly — primarily for testing legacy code.
:::

---

## Static Mocking (mockito-inline)

Available since Mockito 3.4 / included in mockito-core 5+.

```java
@Test
void mockStaticMethod() {
    try (MockedStatic<UUID> uuidMock = Mockito.mockStatic(UUID.class)) {
        uuidMock.when(UUID::randomUUID)
                .thenReturn(UUID.fromString("00000000-0000-0000-0000-000000000001"));

        String id = orderService.generateId();    // internally calls UUID.randomUUID()
        assertThat(id).isEqualTo("00000000-0000-0000-0000-000000000001");
    }
    // MockedStatic is automatically reset after try-with-resources block
}
```

```java
// Mock constructor (new Foo())
try (MockedConstruction<HttpClient> clientMock =
        Mockito.mockConstruction(HttpClient.class, (mock, context) -> {
            when(mock.send(any(), any())).thenReturn(mockResponse);
        })) {
    // any new HttpClient() inside this block returns the mock
    service.callExternalApi();
}
```

::: tip Avoid static mocking where possible
Static mocking is a workaround for un-injectable dependencies. Prefer passing `Clock`, `UUID` generators, etc. as constructor dependencies so they can be mocked normally.
:::

---

## BDDMockito Style

BDD aliases that read more naturally in Given/When/Then structure.

```java
import static org.mockito.BDDMockito.*;

// Given (instead of when)
given(orderRepository.findById(1L)).willReturn(Optional.of(order));
given(emailService.send(any())).willThrow(new TimeoutException());

// Then (instead of verify)
then(emailService).should().sendConfirmation("alice@example.com", 42L);
then(emailService).should(never()).sendErrorAlert(any());
then(auditService).shouldHaveNoInteractions();
```

---

## Common Pitfalls

### Stubbing Not Applied

```java
// ❌ Wrong — stub is declared but for a different call signature
when(repo.findById(1L)).thenReturn(Optional.of(order));
service.process(2L);   // called with 2L → stub doesn't match → returns null

// ✓ Use matchers
when(repo.findById(anyLong())).thenReturn(Optional.of(order));
```

### Stubbing a Spy with when/thenReturn

```java
// ❌ Wrong — calls real method during stubbing
when(spy.realMethod()).thenReturn("mocked");   // realMethod() actually runs here!

// ✓ Correct — use doReturn
doReturn("mocked").when(spy).realMethod();
```

### UnnecessaryStubbingException

```java
// ❌ Strict mode (default with MockitoExtension) rejects stubs that are never called
@Test
void test() {
    when(repo.findById(1L)).thenReturn(Optional.of(order));  // stubbed but not called → FAIL
    // test doesn't call service.findById
}
```

Fix: only stub what you need. If the stub is intentional (setup in @BeforeEach), use `lenient()`:

```java
@BeforeEach
void setUp() {
    lenient().when(repo.findById(anyLong())).thenReturn(Optional.of(order));
}
```

### @InjectMocks with No Matching Constructor

```java
// If OrderService has no constructor accepting exactly the mocked types,
// Mockito falls back to field injection (fragile — fails silently if field names differ)
// → Always prefer constructor injection in production code
```

### Verifying Too Much

```java
// ❌ Over-specifying — makes tests brittle
verify(repo).findById(1L);
verify(repo).save(any());
verify(emailService).sendConfirmation(any(), any());
verify(auditService).log(any());
// Every refactor breaks tests even when behaviour is correct

// ✓ Only verify meaningful side effects
verify(emailService).sendConfirmation("alice@example.com", savedOrder.getId());
```

---

## Mockito Strict Mode

`MockitoExtension` uses `Strictness.STRICT_STUBS` by default:
- Detects unnecessary stubs → `UnnecessaryStubbingException`
- Detects unused `@Mock` fields
- Produces cleaner failure messages

```java
// Opt in to lenient mode globally (not recommended — use per-stub lenient())
@MockitoSettings(strictness = Strictness.LENIENT)
class MyTest { }
```

---

## Interview Quick-Fire

**Q: What is the difference between `@Mock` and `@Spy`?**
`@Mock` creates a complete fake — all methods return default values unless stubbed. `@Spy` wraps a real object — real methods are called unless overridden with `doReturn/doThrow`. Use mocks for external dependencies; use spies sparingly when partial mocking of a real implementation is unavoidable (legacy code).

**Q: Why should you use `doReturn` instead of `when/thenReturn` for spies?**
`when(spy.method()).thenReturn(...)` calls the real `method()` during the stubbing setup itself — potentially throwing exceptions or having side effects before the stub takes effect. `doReturn(...).when(spy).method()` bypasses the real call during setup.

**Q: What does `ArgumentCaptor` do and when would you use it?**
`ArgumentCaptor` captures the actual argument passed to a mock so you can assert on its fields. Use it when verifying complex objects passed to a collaborator — for example, verifying the `Order` saved to the repository has the correct status and customer name.

**Q: What causes `UnnecessaryStubbingException`?**
`MockitoExtension` (strict mode) throws this when a stub is set up but never actually called during the test. It indicates either dead test code or a logic error — you prepared a return value for a call that never happened. Fix by removing the stub or adjusting the test flow. For intentional shared stubs in `@BeforeEach`, use `lenient()`.

<RelatedTopics :topics="['/testing/', '/testing/junit5', '/testing/spring-testing']" />

[→ Back to Testing Overview](/testing/)
