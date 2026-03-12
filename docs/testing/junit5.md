---
title: JUnit 5
description: JUnit 5 complete reference — architecture, lifecycle annotations, assertions, parameterized tests, nested tests, dynamic tests, extensions, tags, and conditional execution
category: testing
pageClass: layout-testing
difficulty: beginner
tags: [junit5, testing, parameterized, nested, extensions, assertions, lifecycle]
related:
  - /testing/
  - /testing/mockito
  - /testing/spring-testing
estimatedMinutes: 25
---

# JUnit 5

<DifficultyBadge level="beginner" />

JUnit 5 is the current standard test framework for Java. It's split into three sub-projects: **Platform** (foundation), **Jupiter** (the new programming model), and **Vintage** (backward compatibility with JUnit 4). You interact almost exclusively with Jupiter.

---

## Architecture

```
JUnit Platform      — test launcher, IDE/build tool integration
    └── JUnit Jupiter    — new @Test API + Extension model
    └── JUnit Vintage    — run JUnit 3/4 tests on JUnit 5 platform
```

---

## Core Lifecycle Annotations

```java
@TestInstance(TestInstance.Lifecycle.PER_METHOD)  // default: new instance per test method
class OrderServiceTest {

    @BeforeAll              // static (unless PER_CLASS lifecycle)
    static void globalSetup() {
        // runs once before all tests in this class
    }

    @BeforeEach
    void setUp() {
        // runs before each test method
    }

    @Test
    void someTest() { }

    @Test
    @DisplayName("human-readable test name shown in reports")
    @Disabled("reason for skipping")
    void skippedTest() { }

    @AfterEach
    void tearDown() {
        // runs after each test method
    }

    @AfterAll
    static void globalTeardown() {
        // runs once after all tests in this class
    }
}
```

### `@TestInstance(Lifecycle.PER_CLASS)`

```java
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class SharedStateTest {
    // Only one instance created — @BeforeAll/@AfterAll can be non-static
    // Useful when setup is expensive and tests don't mutate shared state

    @BeforeAll
    void startExpensiveResource() { }   // non-static — allowed with PER_CLASS

    @AfterAll
    void stopExpensiveResource() { }
}
```

---

## Assertions

JUnit 5 ships `org.junit.jupiter.api.Assertions`. Prefer **AssertJ** in practice — richer messages and fluent chaining.

```java
import static org.junit.jupiter.api.Assertions.*;

// Basic
assertEquals(42, result);
assertNotEquals(0, result);
assertNull(value);
assertNotNull(value);
assertTrue(list.isEmpty());
assertFalse(flag);

// Exception
assertThrows(OutOfStockException.class, () -> service.order(item, 999));

// Exception with message check
var ex = assertThrows(ValidationException.class, () -> service.validate(null));
assertEquals("name must not be null", ex.getMessage());

// Timeout
assertTimeout(Duration.ofSeconds(2), () -> service.processLargeFile(file));
// assertTimeoutPreemptively interrupts if exceeded (assertTimeout lets it finish)

// All assertions (all run, all failures collected)
assertAll("order fields",
    () -> assertEquals(1L, order.getId()),
    () -> assertEquals("PENDING", order.getStatus()),
    () -> assertNotNull(order.getCreatedAt())
);
```

### AssertJ (included via spring-boot-starter-test)

```java
import static org.assertj.core.api.Assertions.*;

assertThat(result).isEqualTo(42);
assertThat(name).isNotNull().startsWith("Alice").endsWith("Smith");
assertThat(orders).hasSize(3).extracting(Order::getStatus)
                  .containsExactlyInAnyOrder(PENDING, SHIPPED, DELIVERED);
assertThatThrownBy(() -> service.divide(1, 0))
    .isInstanceOf(ArithmeticException.class)
    .hasMessage("/ by zero");
```

---

## Assumptions

Skip a test when a condition isn't met — not a failure, just skipped.

```java
@Test
void onlyOnLinux() {
    assumeTrue(System.getProperty("os.name").toLowerCase().contains("linux"),
               "Skipping — not running on Linux");
    // test body only runs if assumption holds
}

@Test
void onlyInCI() {
    assumingThat(
        "true".equals(System.getenv("CI")),
        () -> {
            // only runs in CI environments
        }
    );
    // this line always runs
}
```

---

## @Nested Tests

Organise related tests into inner classes for readability and shared setup.

```java
@DisplayName("OrderService")
class OrderServiceTest {

    private final OrderRepository repo = mock(OrderRepository.class);
    private final OrderService service = new OrderService(repo);

    @Nested
    @DisplayName("placeOrder()")
    class PlaceOrder {

        @BeforeEach
        void setUp() {
            when(repo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        }

        @Test
        @DisplayName("returns saved order with PENDING status")
        void returnsPendingOrder() {
            Order result = service.placeOrder(new OrderRequest("Alice", List.of("widget")));
            assertThat(result.getStatus()).isEqualTo(OrderStatus.PENDING);
        }

        @Test
        @DisplayName("throws when items list is empty")
        void throwsOnEmptyItems() {
            assertThatThrownBy(() -> service.placeOrder(new OrderRequest("Alice", List.of())))
                .isInstanceOf(ValidationException.class);
        }
    }

    @Nested
    @DisplayName("cancelOrder()")
    class CancelOrder {

        @Test
        @DisplayName("changes status to CANCELLED for PENDING orders")
        void cancelsPendingOrder() { }

        @Test
        @DisplayName("throws when order is already SHIPPED")
        void throwsWhenShipped() { }
    }
}
```

---

## @ParameterizedTest

Run the same test with different inputs — eliminates duplicated test methods.

### @ValueSource

```java
@ParameterizedTest
@ValueSource(strings = {"", "  ", "\t", "\n"})
void isBlank_shouldReturnTrue_forBlankStrings(String input) {
    assertThat(StringUtils.isBlank(input)).isTrue();
}

@ParameterizedTest
@ValueSource(ints = {1, 2, 3, 5, 8, 13, 21})
void fibonacci_shouldBePositive(int n) {
    assertThat(fib(n)).isPositive();
}
```

### @NullAndEmptySource / @NullSource / @EmptySource

```java
@ParameterizedTest
@NullAndEmptySource
@ValueSource(strings = {"  ", "\t"})
void validate_shouldRejectBlankOrNull(String input) {
    assertThatThrownBy(() -> service.validate(input))
        .isInstanceOf(ValidationException.class);
}
```

### @EnumSource

```java
@ParameterizedTest
@EnumSource(OrderStatus.class)
void order_shouldHaveNonNullStatus(OrderStatus status) {
    assertThat(status.name()).isNotNull();
}

@ParameterizedTest
@EnumSource(value = OrderStatus.class, names = {"PENDING", "PROCESSING"})
void activeStatuses_shouldAllowCancellation(OrderStatus status) {
    assertThat(service.canCancel(status)).isTrue();
}
```

### @CsvSource

```java
@ParameterizedTest(name = "{index}: {0} + {1} = {2}")
@CsvSource({
    "1, 1, 2",
    "5, 3, 8",
    "-1, 1, 0",
    "100, -50, 50"
})
void add_shouldReturnSum(int a, int b, int expected) {
    assertThat(calculator.add(a, b)).isEqualTo(expected);
}
```

### @CsvFileSource

```java
@ParameterizedTest
@CsvFileSource(resources = "/test-data/orders.csv", numLinesToSkip = 1)
void processOrder_shouldCalculateCorrectTotal(
        String customerId, int quantity, BigDecimal unitPrice, BigDecimal expectedTotal) {
    assertThat(service.calculateTotal(quantity, unitPrice)).isEqualByComparingTo(expectedTotal);
}
```

### @MethodSource

```java
@ParameterizedTest
@MethodSource("invalidOrderRequests")
void placeOrder_shouldRejectInvalidRequests(OrderRequest request, String expectedMessage) {
    assertThatThrownBy(() -> service.placeOrder(request))
        .isInstanceOf(ValidationException.class)
        .hasMessageContaining(expectedMessage);
}

static Stream<Arguments> invalidOrderRequests() {
    return Stream.of(
        Arguments.of(new OrderRequest(null, List.of("item")), "customer name required"),
        Arguments.of(new OrderRequest("Alice", List.of()), "items must not be empty"),
        Arguments.of(new OrderRequest("", List.of("item")), "customer name required")
    );
}
```

---

## @RepeatedTest

```java
@RepeatedTest(value = 5, name = "Run {currentRepetition} of {totalRepetitions}")
void randomOrderId_shouldAlwaysBePositive(RepetitionInfo info) {
    long id = idGenerator.nextId();
    assertThat(id).isPositive();
}
```

---

## @TestMethodOrder

Control test execution order (prefer not to rely on order — tests should be independent).

```java
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class OrderedTest {

    @Test @Order(1)
    void firstStep() { }

    @Test @Order(2)
    void secondStep() { }
}

// Other orderers:
// MethodOrderer.Random         — random order (default in future)
// MethodOrderer.DisplayName    — alphabetical by display name
// MethodOrderer.MethodName     — alphabetical by method name
```

---

## @TestFactory — Dynamic Tests

Generate tests at runtime from data.

```java
@TestFactory
Collection<DynamicTest> dynamicDiscountTests() {
    return List.of(
        dynamicTest("10% discount for SILVER tier",
            () -> assertThat(discount.calculate(SILVER, 100.0)).isEqualTo(90.0)),
        dynamicTest("20% discount for GOLD tier",
            () -> assertThat(discount.calculate(GOLD, 100.0)).isEqualTo(80.0)),
        dynamicTest("30% discount for PLATINUM tier",
            () -> assertThat(discount.calculate(PLATINUM, 100.0)).isEqualTo(70.0))
    );
}

@TestFactory
Stream<DynamicTest> dynamicTestsFromStream() {
    return IntStream.range(1, 6)
        .mapToObj(i -> dynamicTest(
            "fib(" + i + ") is positive",
            () -> assertThat(fib(i)).isPositive()
        ));
}
```

---

## Extensions

JUnit 5's extension model replaces JUnit 4's `@Rule` and `@RunWith`.

```java
// Apply to a class or method
@ExtendWith(MockitoExtension.class)     // Mockito
@ExtendWith(SpringExtension.class)      // Spring (used internally by @SpringBootTest)
@ExtendWith(TimingExtension.class)      // custom
class MyTest { }
```

### Writing a Custom Extension

```java
public class TimingExtension implements BeforeEachCallback, AfterEachCallback {

    private long start;

    @Override
    public void beforeEach(ExtensionContext context) {
        start = System.currentTimeMillis();
    }

    @Override
    public void afterEach(ExtensionContext context) {
        long elapsed = System.currentTimeMillis() - start;
        System.out.printf("[%s] took %d ms%n",
            context.getDisplayName(), elapsed);
    }
}
```

### Extension Points

| Interface | Triggered |
|-----------|-----------|
| `BeforeAllCallback` | Before all tests in class |
| `BeforeEachCallback` | Before each test method |
| `AfterEachCallback` | After each test method |
| `AfterAllCallback` | After all tests in class |
| `ParameterResolver` | Inject parameters into test/setup methods |
| `TestExecutionExceptionHandler` | Handle exceptions thrown by tests |
| `TestInstancePostProcessor` | Post-process test instance after creation |
| `ConditionEvaluationResult` / `ExecutionCondition` | Skip tests conditionally |

---

## @Tag — Grouping and Filtering

```java
@Tag("fast")
@Tag("unit")
class FastUnitTest { }

@Tag("slow")
@Tag("integration")
class IntegrationTest { }
```

```xml
<!-- pom.xml — Maven Surefire: run only fast tests by default -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-surefire-plugin</artifactId>
    <configuration>
        <groups>fast</groups>              <!-- include -->
        <excludedGroups>slow</excludedGroups>  <!-- exclude -->
    </configuration>
</plugin>
```

```xml
<!-- Maven Failsafe: run integration tests in verify phase -->
<plugin>
    <groupId>org.apache.maven.plugins</groupId>
    <artifactId>maven-failsafe-plugin</artifactId>
    <configuration>
        <groups>integration</groups>
    </configuration>
</plugin>
```

---

## Conditional Execution

```java
@Test
@EnabledOnOs(OS.LINUX)
void onlyOnLinux() { }

@Test
@DisabledOnOs({OS.WINDOWS, OS.MAC})
void notOnWindowsOrMac() { }

@Test
@EnabledOnJre(JRE.JAVA_21)
void java21Only() { }

@Test
@EnabledIfEnvironmentVariable(named = "CI", matches = "true")
void onlyInCI() { }

@Test
@EnabledIfSystemProperty(named = "db.type", matches = "postgres")
void onlyWithPostgres() { }

// Custom condition using @EnabledIf (JUnit 5.7+)
@Test
@EnabledIf("isDockerAvailable")
void requiresDocker() { }

boolean isDockerAvailable() {
    // check if docker daemon is running
    return true;
}
```

---

## Test Execution in Maven

```bash
# Run all tests
mvn test

# Run specific test class
mvn test -Dtest=OrderServiceTest

# Run specific method
mvn test -Dtest=OrderServiceTest#placeOrder_withInsufficientStock

# Run with tag filter
mvn test -Dgroups=fast

# Skip tests
mvn package -DskipTests

# Run integration tests (failsafe plugin)
mvn verify
```

---

## Interview Quick-Fire

**Q: What is the difference between `@BeforeAll` and `@BeforeEach`?**
`@BeforeAll` runs once before all test methods in the class (must be `static` unless `@TestInstance(PER_CLASS)`) — use for expensive one-time setup. `@BeforeEach` runs before every individual test method — use for per-test state reset (creating new service instances, configuring mocks).

**Q: When would you use `@ParameterizedTest` over writing separate test methods?**
When the same assertion logic applies to multiple inputs. Parameterized tests eliminate duplication, make it easy to add more cases, and produce clearer failure messages that show which input failed. Use `@MethodSource` for complex objects, `@CsvSource` for tabular data, `@ValueSource` for primitive lists.

**Q: What does `assertAll` do differently from separate assertions?**
`assertAll` executes all assertions even if one fails, collecting all failures into a single report. Separate assertions abort on the first failure. Use `assertAll` when you want to verify multiple fields of an object at once — otherwise you only see the first problem.

**Q: What is the JUnit 5 Extension model and what does it replace?**
The Extension model replaces JUnit 4's `@Rule` and `@RunWith`. Extensions implement callback interfaces (BeforeEachCallback, ParameterResolver, etc.) and are applied with `@ExtendWith`. A single extension can implement multiple callbacks, unlike JUnit 4 where Rules were limited. Mockito, Spring, Testcontainers all ship as JUnit 5 extensions.

<RelatedTopics :topics="['/testing/', '/testing/mockito', '/testing/spring-testing']" />

[→ Back to Testing Overview](/testing/)
