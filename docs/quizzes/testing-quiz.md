---
title: Testing Quiz
---

<script setup>
const questions = [
  {
    question: "What is the difference between `@BeforeEach` and `@BeforeAll` in JUnit 5?",
    options: [
      "@BeforeEach runs once before the test class; @BeforeAll runs before each test method",
      "@BeforeEach runs before each individual test method; @BeforeAll runs once before all tests in the class and must be static (unless lifecycle is PER_CLASS)",
      "They are equivalent — both reset state before each test",
      "@BeforeAll is only available in integration tests; @BeforeEach is for unit tests"
    ],
    answer: 1,
    explanation: "@BeforeEach: runs before each @Test method — use for fresh setup per test. @BeforeAll: runs once before all tests in the class — use for expensive setup (e.g., starting a test database). @BeforeAll methods must be static by default; with @TestInstance(PER_CLASS) they can be instance methods."
  },
  {
    question: "In Mockito, what does `verify(mock, times(2)).doSomething()` check?",
    options: [
      "That doSomething() will be called exactly 2 times in the future",
      "That doSomething() was called exactly 2 times on the mock during the test",
      "That doSomething() returns a value 2 times before throwing an exception",
      "That the mock object has exactly 2 methods"
    ],
    answer: 1,
    explanation: "verify() asserts interactions with mocks after the code under test has run. verify(mock, times(2)).doSomething() fails if doSomething() was not called exactly 2 times. Variants: times(n), atLeast(n), atMost(n), never(), atLeastOnce(). Use verifyNoMoreInteractions() to assert no unexpected calls."
  },
  {
    question: "What does `when(mock.method()).thenReturn(value)` do in Mockito?",
    options: [
      "Stubs the mock method to return the specified value when called; the actual method implementation is not invoked",
      "Calls the real method and verifies the return value equals the specified value",
      "Configures the mock to call the real implementation and then return the specified value as well",
      "It is equivalent to spy() — the real method is called and the return overridden"
    ],
    answer: 0,
    explanation: "when().thenReturn() is stubbing: it configures the mock to return a specific value when the method is called. The real implementation is completely bypassed. Variants: thenThrow() for exceptions, thenAnswer() for dynamic responses, doReturn() for void methods or spies where the real call must be avoided."
  },
  {
    question: "What is the key difference between `@SpringBootTest` and `@WebMvcTest`?",
    options: [
      "@SpringBootTest loads only the web layer; @WebMvcTest loads the full application context",
      "@SpringBootTest loads the full application context (all beans); @WebMvcTest loads only the web layer (controllers, filters) — faster but requires mocking service beans",
      "They are equivalent — both load the full context but with different configurations",
      "@WebMvcTest starts an actual HTTP server; @SpringBootTest uses a mock MVC"
    ],
    answer: 1,
    explanation: "@SpringBootTest: full context, all beans, can start a real server (WebEnvironment.RANDOM_PORT) or MockMvc. Slow but comprehensive. @WebMvcTest: sliced test — only MVC components (controllers, ControllerAdvice, filters). Services and repos not loaded — must be @MockBean. Fast and focused on controller logic."
  },
  {
    question: "What is Testcontainers, and when should you use it?",
    options: [
      "A framework for running unit tests inside Docker containers",
      "A Java library that spins up real Docker containers (databases, brokers, etc.) during tests, enabling integration tests against actual infrastructure",
      "A mock framework that simulates Docker container behavior without running real containers",
      "A test runner that containerizes the JUnit test process for isolation"
    ],
    answer: 1,
    explanation: "Testcontainers starts real Docker containers (PostgreSQL, Kafka, Redis, etc.) that are available during the test and torn down afterwards. Use it for integration tests that need real infrastructure behavior — especially when in-memory alternatives (H2) differ in important ways from production (PostgreSQL functions, Kafka exactly-once semantics)."
  },
  {
    question: "What is WireMock used for in testing?",
    options: [
      "Mocking internal beans in a Spring application context",
      "Stubbing and verifying HTTP interactions with external services — acting as a fake HTTP server",
      "Recording database queries for playback in tests",
      "Generating test data from Java POJO definitions"
    ],
    answer: 1,
    explanation: "WireMock creates a real HTTP server that stubs external API responses. Instead of making real calls to a payment gateway or third-party API, WireMock returns preconfigured responses. Use it to test your HTTP client code, error handling (timeouts, 5xx), and to verify the correct request was made."
  },
  {
    question: "What is the test pyramid and what does it recommend?",
    options: [
      "A hierarchy where integration tests are at the bottom (most), unit tests in the middle, E2E tests at top (most)",
      "A hierarchy where unit tests are the base (many, fast, cheap), integration tests are in the middle (fewer), and E2E/UI tests are at the top (few, slow, expensive)",
      "A pyramid where only E2E tests matter since they test the full system",
      "A model recommending equal numbers of unit, integration, and E2E tests"
    ],
    answer: 1,
    explanation: "Test pyramid (Mike Cohn): broad base of unit tests (fast, isolated, many), middle layer of integration tests (moderate), narrow top of E2E tests (slow, brittle, few). More unit tests = faster feedback cycle. Heavy reliance on E2E tests = slow CI, flaky tests. The inverse (ice cream cone anti-pattern) is a common problem."
  },
  {
    question: "What is the difference between a Mock and a Spy in Mockito?",
    options: [
      "A Mock is a full fake with all methods stubbed to return null/defaults; a Spy wraps a real object and only intercepts stubbed methods — unstubbed calls invoke the real implementation",
      "A Mock calls the real methods; a Spy uses only stubbed methods",
      "They are identical — both prevent real methods from running",
      "A Mock is for interfaces; a Spy is for concrete classes"
    ],
    answer: 0,
    explanation: "Mock: completely fake object. All methods return defaults (null, 0, false) unless stubbed. Spy: wraps a real object — unstubbed calls go to the real implementation, stubbed calls return the configured value. Use spies when you want to test a real object but override a few methods. Prefer mocks for pure unit tests."
  },
  {
    question: "What JUnit 5 annotation is used to run the same test with multiple sets of input data?",
    options: [
      "@RepeatedTest",
      "@ParameterizedTest with @MethodSource, @CsvSource, or @ValueSource",
      "@DynamicTest",
      "@TestFactory with @RunWith(Parameterized.class)"
    ],
    answer: 1,
    explanation: "@ParameterizedTest runs the test method once per set of arguments. Sources: @ValueSource (single values), @CsvSource (rows of values), @MethodSource (calls a static method returning Stream), @EnumSource (all enum values). @RepeatedTest runs the same test N times without varying input. @DynamicTest generates tests at runtime."
  },
  {
    question: "What is mutation testing, and what tool is commonly used for it in Java?",
    options: [
      "Randomly modifying test code to find flaky tests; tool: JUnit Pioneer",
      "Automatically introducing small bugs (mutations) in source code and verifying tests catch them; measures test quality beyond coverage; tool: PIT (pitest)",
      "Testing code that mutates database state; tool: Flyway Test Extensions",
      "A technique for testing code on different JVM versions; tool: Gradle Toolchains"
    ],
    answer: 1,
    explanation: "Mutation testing introduces small code changes (mutations: negate condition, change operator, remove return statement). If your tests catch the mutation (test fails), the mutation is 'killed'. If tests still pass, the mutation 'survives' — revealing weak tests. PIT (pitest.org) is the standard Java mutation testing tool. High mutation score means stronger tests than line coverage alone."
  },
  {
    question: "What is `@MockBean` in a Spring Boot test, and how does it differ from Mockito's `@Mock`?",
    options: [
      "They are identical — @MockBean is just a Spring alias for @Mock",
      "@MockBean creates a Mockito mock and registers it as a Spring bean in the application context, replacing any existing bean of that type; @Mock creates a mock but does NOT add it to Spring context",
      "@Mock creates a Spring-managed mock; @MockBean creates a standalone mock outside Spring",
      "@MockBean is for mocking REST clients; @Mock is for mocking service beans"
    ],
    answer: 1,
    explanation: "@MockBean (spring-boot-test): creates a Mockito mock AND adds it to the ApplicationContext, replacing the real bean. Essential in slice tests like @WebMvcTest where you need to mock the service layer. @Mock (Mockito): standalone mock, not registered in Spring context. Use @Mock for pure unit tests without Spring context."
  },
  {
    question: "What does the AAA pattern stand for in unit testing?",
    options: [
      "Assert, Arrange, Act — the order in which test steps must appear",
      "Arrange (set up test data), Act (call the method under test), Assert (verify the outcome)",
      "Authenticate, Authorize, Audit — for security tests",
      "Automated, Atomic, Accurate — properties of a good test"
    ],
    answer: 1,
    explanation: "AAA (Arrange-Act-Assert): Arrange = set up preconditions, create objects, stub mocks; Act = call the single method/behavior under test; Assert = verify the outcome. This structure keeps tests readable and focused on one behavior. Each test should test exactly one thing (one 'Act'). Synonymous with Given-When-Then (BDD)."
  }
]
</script>

# Testing Quiz

Test your knowledge of JUnit 5, Mockito, Spring Boot testing slices, Testcontainers, and testing best practices.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Testing study pages](/testing/).
