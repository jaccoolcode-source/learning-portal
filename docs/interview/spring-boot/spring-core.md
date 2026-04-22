# Spring Boot & Spring Core

**Q26 to Q32** · [← Section Overview](./index)

---

## Q26: Inversion of Control (IoC) and Dependency Injection (DI)

> IoC is the principle; DI is the mechanism. Spring's ApplicationContext is the IoC container.

In traditional code, `OrderService` creates its own dependencies:
```java
public class OrderService {
    private OrderRepository repo = new OrderRepository();  // tight coupling
}
```

With IoC, Spring creates and wires everything — your code just declares what it needs:
```java
@Service
public class OrderService {
    private final OrderRepository repo;
    private final PaymentService paymentService;

    public OrderService(OrderRepository repo, PaymentService paymentService) {
        this.repo = repo;
        this.paymentService = paymentService;
    }
}
```

**Three injection types — and which to prefer:**

| Type | How | Recommended? |
|------|-----|-------------|
| Constructor injection | Via constructor | ✅ Yes — always |
| Setter injection | Via `@Autowired` setter | For optional deps only |
| Field injection | `@Autowired` on field | ❌ No — avoid |

::: details Full model answer

**Why constructor injection is best:**
- Dependencies are `final` — immutable after construction
- All dependencies are explicit — visible from the constructor signature
- Easy to unit test — just pass mock objects in the constructor, no Spring context needed
- Since Spring 4.3, `@Autowired` is optional when there's only one constructor

```java
@Service
public class OrderService {
    private final OrderRepository orderRepository;
    private final PaymentService paymentService;

    // @Autowired optional with single constructor (Spring 4.3+)
    public OrderService(OrderRepository orderRepository, PaymentService paymentService) {
        this.orderRepository = orderRepository;
        this.paymentService = paymentService;
    }
}
```

**Setter injection — only for optional dependencies:**
```java
@Service
public class NotificationService {
    private EmailSender emailSender;

    @Autowired(required = false)  // optional — has a default behaviour without it
    public void setEmailSender(EmailSender emailSender) {
        this.emailSender = emailSender;
    }
}
```

**Field injection — why to avoid:**
```java
@Service
public class OrderService {
    @Autowired  // DON'T do this in new code
    private OrderRepository orderRepository;
    // Cannot be final, dependencies hidden, requires reflection to unit test
}
```

**How Spring resolves beans:**
Spring scans the classpath for `@Component`, `@Service`, `@Repository`, `@Controller`, or `@Configuration` + `@Bean` methods. When a bean needs a dependency, Spring looks for a matching bean by type. Multiple beans of the same type → use `@Qualifier` or `@Primary`.

**Circular dependencies:**
A → B → A. With constructor injection, Spring throws `BeanCurrentlyInCreationException` at startup — which is good, it forces you to fix the design smell. Solutions (in order of preference):
1. Refactor — extract a third component that both A and B depend on
2. `@Lazy` on one constructor parameter — Spring injects a proxy, resolving the cycle lazily
3. Switch one side to setter injection

:::

> [!TIP] Golden Tip
> Always say you prefer **constructor injection** and explain the three reasons: immutability (`final` fields), explicit dependencies, easy unit testing without a Spring context. If asked about circular dependencies, say it's a design smell — the preferred fix is refactoring, not `@Lazy`.

**Follow-up questions:**
- Why is field injection discouraged?
- How do you handle circular dependencies in Spring?
- What is the difference between `@Component`, `@Service`, and `@Repository`?
- What is `@Qualifier` and when do you need it?

---

## Q27: Bean scopes in Spring

> Singleton is the default — one instance shared by all. The scoped proxy pitfall is the critical interview topic.

| Scope | Instances | Lifecycle |
|-------|-----------|-----------|
| `singleton` (default) | 1 per ApplicationContext | App lifetime |
| `prototype` | New per request | Until GC'd (no `@PreDestroy`) |
| `request` | 1 per HTTP request | Request lifetime |
| `session` | 1 per HTTP session | Session lifetime |
| `application` | 1 per ServletContext | App lifetime |

::: details Full model answer

**Singleton (default):**
One instance for the entire `ApplicationContext`. All classes that inject this bean receive the **same** instance. Beans must be **thread-safe** — multiple threads handle requests concurrently against the same singleton instance. Never store request-specific state in instance fields of a singleton bean.

```java
@Service  // singleton by default
public class OrderService {
    // WRONG: private Order currentOrder;  ← shared by ALL requests!
    // RIGHT: keep state in method parameters or use request-scoped beans
}
```

> Note: this is NOT the GoF Singleton pattern. GoF = one instance per JVM. Spring singleton = one instance per `ApplicationContext`. Multiple contexts in the same JVM → multiple instances.

**Prototype:**
New instance every time the bean is requested from the container. Spring creates it and hands it over but does **NOT** call `@PreDestroy` — you're responsible for cleanup.
```java
@Component
@Scope("prototype")
public class ShoppingCart {
    private List<Item> items = new ArrayList<>();  // safe — each caller gets its own instance
}
```

**Web scopes** — only in web-aware contexts:
- `request` — one per HTTP request; good for request-specific processing
- `session` — one per user session; good for shopping carts, user preferences
- `application` — one per `ServletContext`

**The scoped proxy pitfall (CRITICAL):**

A `singleton` bean is created once at startup. If it injects a `request`-scoped bean, Spring injects the **first** instance and holds it forever — all subsequent requests share that stale instance. This is a serious bug.

```java
// WRONG — singleton holds a fixed reference to first request's UserContext
@Service
public class OrderService {
    private final UserContext userContext;  // injected once at startup, never refreshed!
}
```

**Solution 1 — Scoped proxy:**
```java
@Component
@Scope(value = "request", proxyMode = ScopedProxyMode.TARGET_CLASS)
public class UserContext { }
// Spring injects a proxy. Each method call on the proxy delegates to the
// correct instance for the current request/session.
```

**Solution 2 — `ObjectProvider`** (preferred, avoids CGLIB dependency):
```java
@Service
public class OrderService {
    private final ObjectProvider<UserContext> userContextProvider;

    public void process() {
        UserContext ctx = userContextProvider.getObject();  // fresh per request
    }
}
```

The same problem applies to **prototype beans inside singletons** — the prototype is created once and reused. Use `ObjectProvider<T>` or `@Lookup` to get fresh instances.

:::

> [!TIP] Golden Tip
> Mention the **scoped proxy problem proactively** — don't wait to be asked. A singleton holding a reference to a request-scoped bean is a real production bug that many developers encounter. Knowing `ScopedProxyMode.TARGET_CLASS` and `ObjectProvider<T>` as solutions shows deep Spring knowledge.

**Follow-up questions:**
- What is the difference between Spring singleton scope and the GoF Singleton pattern?
- What happens to `@PreDestroy` callbacks in prototype-scoped beans?
- How do you inject a request-scoped bean into a singleton?
- What is `ObjectProvider` and when would you use it?

---

## Q28: Spring Boot Auto-Configuration

> Adding a Maven dependency configures the entire feature — because of `@Conditional` annotations, not magic.

```java
@SpringBootApplication  // includes @EnableAutoConfiguration
public class MyApp {
    public static void main(String[] args) { SpringApplication.run(MyApp.class, args); }
}
```

Add `spring-boot-starter-data-jpa` → Hibernate, `DataSource`, `EntityManagerFactory`, `TransactionManager` all auto-configured. Add your own `DataSource` bean → auto-configured one is skipped. **Your beans always win.**

::: details Full model answer

**How it works — step by step:**
1. `@SpringBootApplication` includes `@EnableAutoConfiguration`
2. At startup, Spring Boot reads `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (Spring Boot 3.x; previously `spring.factories`) — lists ~150 auto-configuration classes
3. Each auto-configuration class is a `@Configuration` class with `@Conditional` annotations controlling when it activates
4. `@ConditionalOnMissingBean` ensures user-defined beans take precedence

```java
@AutoConfiguration
@ConditionalOnClass(DataSource.class)          // only if DataSource class is on classpath
@ConditionalOnMissingBean(DataSource.class)    // only if user didn't define their own
public class DataSourceAutoConfiguration {
    @Bean
    public DataSource dataSource(DataSourceProperties props) {
        return DataSourceBuilder.create()
            .url(props.getUrl())
            .username(props.getUsername())
            .build();
    }
}
```

**Common `@Conditional` annotations:**
```java
@ConditionalOnClass(DataSource.class)          // class is on classpath
@ConditionalOnMissingBean(DataSource.class)    // no bean of this type defined
@ConditionalOnProperty(name = "feature.x", havingValue = "true")  // property matches
@ConditionalOnMissingClass("com.oracle.Driver") // class NOT on classpath
@ConditionalOnWebApplication                   // is a web application
@ConditionalOnExpression("${app.enabled:true}") // SpEL expression
```

**Debugging auto-configuration:**
```properties
# application.properties
debug=true
# Prints CONDITIONS EVALUATION REPORT at startup — shows every auto-config class
# and why it was matched or skipped
```
Or use `/actuator/conditions` endpoint if Spring Boot Actuator is enabled.

**Customising auto-configuration:**
- Define your own bean of the same type → auto-configured one is skipped
- Use `@ConfigurationProperties` to customise via `application.yml` properties
- Exclude specific auto-configurations: `@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)`

**Creating your own Spring Boot starter:**
1. Create a `@Configuration` class with `@Conditional` annotations
2. Register it in `META-INF/spring/AutoConfiguration.imports`
3. Package as `spring-boot-starter-myfeature`
4. Provide default properties with `@ConfigurationProperties`

:::

> [!TIP] Golden Tip
> The answer to *"How does Spring Boot auto-configuration work?"* is not *"magic"* — it's `@ConditionalOnClass` + `@ConditionalOnMissingBean`. Knowing about the `AutoConfiguration.imports` file (Spring Boot 3.x) vs `spring.factories` (older) and how to debug it with `debug=true` shows you understand the mechanism, not just the result.

**Follow-up questions:**
- How would you create your own Spring Boot starter?
- What does `@ConditionalOnMissingBean` do?
- How do you debug why a bean is not being auto-configured?
- What changed between `spring.factories` and `AutoConfiguration.imports`?

---

## Q29: Spring AOP (Aspect-Oriented Programming)

> AOP separates cross-cutting concerns (logging, transactions, security) from business logic. Works through proxies — self-invocation is the #1 pitfall.

```java
@Aspect
@Component
public class LoggingAspect {

    @Around("execution(* com.myapp.service.*.*(..))")
    public Object logMethodCall(ProceedingJoinPoint joinPoint) throws Throwable {
        String method = joinPoint.getSignature().getName();
        log.info("Calling: {}", method);
        long start = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();  // invoke the real method
            log.info("{} completed in {}ms", method, System.currentTimeMillis() - start);
            return result;
        } catch (Exception e) {
            log.error("{} failed: {}", method, e.getMessage());
            throw e;
        }
    }
}
```

::: details Full model answer

**Key AOP concepts:**
- **Aspect** — the class containing cross-cutting logic (`@Aspect`)
- **Advice** — the action taken at a join point (the method with `@Around`, `@Before`, etc.)
- **Pointcut** — expression selecting which methods to intercept (`execution(* com.myapp.service.*.*(..))`)
- **Join point** — the specific method execution being intercepted

**Advice types:**
| Annotation | When it runs |
|-----------|-------------|
| `@Before` | Before the method executes |
| `@After` | After the method, regardless of outcome |
| `@AfterReturning` | After successful return |
| `@AfterThrowing` | After an exception is thrown |
| `@Around` | Wraps the method — most powerful, can prevent execution |

**How Spring AOP works — proxy-based:**
Spring doesn't give you the real bean. It wraps it in a **proxy**. When you call a method on the bean, you're calling the proxy — which applies the advice and delegates to the real object.

Two proxy types:
- **JDK dynamic proxy** — for beans that implement an interface
- **CGLIB proxy** — for concrete classes (subclasses the bean). Spring Boot uses CGLIB by default.

**The self-invocation problem — #1 AOP pitfall:**
```java
@Service
public class OrderService {

    @Transactional
    public void processOrder(Order order) {
        saveOrder(order);  // calls this.saveOrder() — bypasses the proxy!
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveOrder(Order order) {
        // @Transactional is IGNORED here — called via this, not via proxy
        repository.save(order);
    }
}
```

Because AOP works through proxies, calling a method on `this` bypasses the proxy entirely. The advice (transaction, cache, async, retry) is **never applied**.

This affects **all** proxy-based annotations: `@Transactional`, `@Cacheable`, `@Async`, `@Retryable`.

**Solutions:**
1. **Extract to a separate bean** (best — clean architecture, no coupling to AOP):
```java
@Service
public class OrderSaver {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void saveOrder(Order order) { repository.save(order); }
}
```
2. **Inject self** via `ObjectProvider` and call via the proxy reference:
```java
@Service
public class OrderService {
    @Autowired
    private ObjectProvider<OrderService> self;

    public void processOrder(Order order) {
        self.getObject().saveOrder(order);  // goes through proxy
    }
}
```
3. `AopContext.currentProxy()` — works but couples code to the AOP framework (avoid).

:::

> [!TIP] Golden Tip
> Always mention **self-invocation** proactively when discussing `@Transactional`, `@Cacheable`, or `@Async`. Interviewers expect senior developers to know this pitfall. The best answer: *"I restructure the code into separate beans to avoid the issue entirely — it also leads to better separation of concerns."*

**Follow-up questions:**
- What is the difference between JDK dynamic proxy and CGLIB proxy?
- Why doesn't `@Transactional` work when called from within the same class?
- What is a pointcut expression and how do you write one?
- What annotations are affected by the self-invocation problem?

---

## Q30: `@Transactional` in depth

> Spring's declarative transaction management. Three things every senior must know: checked exceptions don't rollback, `REQUIRES_NEW` uses a second connection, and self-invocation bypasses the proxy.

```java
@Transactional  // default: REQUIRED propagation, database default isolation
public void placeOrder(OrderRequest req) {
    Order order = repo.save(new Order(req));
    paymentService.charge(order);  // if this throws RuntimeException → rollback everything
}
```

**What the proxy does:**
1. Get DB connection from pool
2. Set `autoCommit = false` (begin transaction)
3. Execute your method
4. Success → `COMMIT` / `RuntimeException` or `Error` → `ROLLBACK`
5. **Checked exception → `COMMIT`** (surprises many people!)
6. Return connection to pool

::: details Full model answer

**Propagation — what happens when `@Transactional` calls another `@Transactional`:**

The three you must know:

**`REQUIRED` (default):** Join the existing transaction. If none exists, create one. Method A calls method B — both run in the **same** transaction. If B fails, A's work rolls back too.

**`REQUIRES_NEW`:** Always create a new, independent transaction. Suspend the existing one. If B fails, only B's work rolls back — A's transaction is unaffected.
```java
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void saveAuditLog(AuditEntry entry) {
    // committed independently — persists even if the outer transaction rolls back
    auditRepo.save(entry);
}
```
⚠️ **Warning:** `REQUIRES_NEW` holds **two** DB connections simultaneously (outer suspended, inner active). Under high load this exhausts your connection pool. Use sparingly.

**`SUPPORTS`:** Join existing transaction if one exists; run non-transactional if none. Good for read methods that can participate in a transaction but don't require one.

**Isolation levels:**
```java
@Transactional(isolation = Isolation.READ_COMMITTED)
```
Higher isolation = more consistency, more locking, worse performance. In practice, the database default (usually `READ_COMMITTED` for PostgreSQL, `REPEATABLE_READ` for MySQL) is sufficient. Prefer optimistic locking (`@Version`) over raising isolation.

**Rollback control:**
```java
@Transactional                                      // rollback on RuntimeException + Error (default)
@Transactional(rollbackFor = Exception.class)       // rollback on ALL exceptions incl. checked
@Transactional(noRollbackFor = BusinessException.class)  // don't rollback on this specific type
```

**`readOnly` optimisation:**
```java
@Transactional(readOnly = true)
public List<Order> getOrders(Long userId) { ... }
```
Tells Hibernate to disable **dirty checking** (no snapshot comparison at flush time) → significant performance improvement for read-heavy operations. Some databases also optimise read-only transactions.

**Common mistakes:**
1. **Self-invocation** — calling `@Transactional` method from same class bypasses proxy (see AOP question)
2. **Private methods** — `@Transactional` on a private method does nothing; proxy can't intercept it. Must be `public`.
3. **Checked exceptions don't rollback** by default — add `rollbackFor = Exception.class` if needed
4. **Catching exceptions inside** — if you catch and swallow an exception, Spring never sees it and commits the transaction even though something went wrong

:::

> [!TIP] Golden Tip
> Two answers that show production experience: **(1)** Checked exceptions don't trigger rollback by default — many developers discover this bug in production. **(2)** `REQUIRES_NEW` holds two DB connections simultaneously — under high load it exhausts the connection pool. Knowing both shows you've thought about `@Transactional` beyond just "it handles transactions."

**Follow-up questions:**
- What is the difference between `REQUIRED` and `REQUIRES_NEW` propagation?
- Why don't checked exceptions trigger rollback by default?
- What does `readOnly = true` do and why does it improve performance?
- Can you put `@Transactional` on a private method? Why or why not?

---

## Q31: Spring Profiles & Configuration

> Profiles switch configuration per environment. `@ConfigurationProperties` + `@Validated` is the modern best practice over scattered `@Value` annotations.

```yaml
# application.yml — always loaded (base config)
server:
  port: 8080
spring:
  datasource:
    url: ${DB_URL}  # overridden by env var in prod

---
# application-dev.yml — only when dev profile active
spring:
  datasource:
    url: jdbc:h2:mem:testdb

---
# application-prod.yml — only when prod profile active
spring:
  datasource:
    url: jdbc:postgresql://prod-db:5432/orders
```

::: details Full model answer

**Activating profiles:**
```bash
# application.properties
spring.profiles.active=prod

# Environment variable (containers/cloud — preferred)
SPRING_PROFILES_ACTIVE=prod

# Command-line
java -jar app.jar --spring.profiles.active=prod
```

**Profile-conditional beans:**
```java
@Configuration
@Profile("prod")
public class ProdSecurityConfig { ... }  // only loaded in production

@Bean
@Profile("!prod")  // active when NOT prod
public DataSource devDataSource() {
    return new EmbeddedDatabaseBuilder().setType(H2).build();
}

@Profile({"dev", "test"})  // multiple profiles
```

**Configuration priority (highest to lowest):**
1. Command-line arguments (`--server.port=9090`)
2. Environment variables (`SERVER_PORT=9090`)
3. `application-{profile}.yml`
4. `application.yml`
5. `@PropertySource` annotations

In containers/cloud, environment variables override config files without touching the JAR — this is the standard 12-factor app approach.

**`@ConfigurationProperties` — modern best practice:**

Instead of `@Value("${app.mail.host}")` scattered everywhere:
```java
// Java 16+ record — immutable, concise
@ConfigurationProperties(prefix = "app.mail")
@Validated
public record MailConfig(
    @NotBlank String host,
    @Min(1)   int port,
              boolean ssl
) {}

// application.yml
app:
  mail:
    host: smtp.gmail.com
    port: 587
    ssl: true
```

Benefits:
- **Type safety** — compiler catches typos in property names
- **IDE auto-completion** — works with `spring-boot-configuration-processor`
- **Validation at startup** with `@Validated` + Jakarta constraints — app fails fast if required config is missing
- **Immutability** with records
- **Testability** — inject the record directly in tests

```java
// Enable in @SpringBootApplication class or any @Configuration
@EnableConfigurationProperties(MailConfig.class)
```

:::

> [!TIP] Golden Tip
> Mention **`@Validated` with Jakarta constraints** on `@ConfigurationProperties` — the application fails to start if configuration is invalid. This "fail-fast" behaviour is much better than discovering a missing config key at runtime in production. Also: in AWS/Kubernetes, environment variables are the standard way to override config — show you know the 12-factor app pattern.

**Follow-up questions:**
- What is the configuration property priority order in Spring Boot?
- What is the difference between `@Value` and `@ConfigurationProperties`?
- How do you activate a profile in a Docker container?
- What does `@Validated` do on a `@ConfigurationProperties` class?

---

## Q32: Spring Security basics

> A chain of servlet filters that intercepts every request. `WebSecurityConfigurerAdapter` is deprecated — use `SecurityFilterChain` beans.

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())                         // stateless API — no CSRF needed
            .sessionManagement(s -> s
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers(HttpMethod.GET, "/api/products/**").permitAll()
                .anyRequest().authenticated())
            .oauth2ResourceServer(oauth -> oauth
                .jwt(Customizer.withDefaults()))                  // validate JWT tokens
            .build();
    }
}
```

::: details Full model answer

**Filter chain — request processing order:**
Every HTTP request passes through a chain of filters before reaching your controller:
1. `CorsFilter` — handles Cross-Origin Resource Sharing headers
2. `CsrfFilter` — validates CSRF tokens (for stateful apps with sessions)
3. Authentication filter — extracts credentials (JWT from header, username/password from form, OAuth2 token) and authenticates the user
4. Authorization filter — checks if the authenticated user has permission
5. `ExceptionTranslationFilter` — converts security exceptions to HTTP responses (401 Unauthorized, 403 Forbidden)

**JWT authentication flow (microservices):**
1. Client authenticates with identity provider (MS Entra, Keycloak, Auth0) → receives JWT
2. Client sends `Authorization: Bearer <token>` header with every request
3. Spring Security validates the token: checks signature (using public key from issuer), expiration, issuer and audience claims
4. If valid, extracts claims (user ID, roles) → creates `SecurityContext`
5. Authorization rules check roles/permissions

```yaml
# application.yml — configure JWT issuer
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://login.microsoftonline.com/{tenant}/v2.0
```

**CORS configuration:**
```java
@Bean
CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("https://myapp.com"));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
}
```

**Method-level security:**
```java
@EnableMethodSecurity  // on @Configuration class
// Then on service methods:
@PreAuthorize("hasRole('ADMIN')")
public void deleteUser(Long id) { ... }

@PostAuthorize("returnObject.ownerId == authentication.name")
public Order getOrder(Long id) { ... }

@PreAuthorize("hasPermission(#order, 'WRITE')")
public void updateOrder(Order order) { ... }
```

**Password encoding — always use BCrypt:**
```java
@Bean
PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();  // never store plain text or MD5/SHA passwords
}
```

**Key differences: authentication vs authorization:**
- **Authentication** — who are you? (JWT validation, username/password check)
- **Authorization** — what are you allowed to do? (role checks, permission checks)

:::

> [!TIP] Golden Tip
> Four points interviewers want to hear: **(1)** `WebSecurityConfigurerAdapter` is deprecated — use `SecurityFilterChain` bean (Spring Security 5.7+ / Spring Boot 3.x). **(2)** CSRF can be disabled for stateless APIs — no session = no CSRF risk. **(3)** JWT + OAuth2 Resource Server is the standard for microservices. **(4)** Don't forget CORS — always forgotten but always causes issues with frontend integration.

**Follow-up questions:**
- What is the difference between authentication and authorisation?
- Why can CSRF be disabled for stateless REST APIs?
- How does Spring Security validate a JWT token?
- What is `@PreAuthorize` and how does it differ from URL-based security rules?
