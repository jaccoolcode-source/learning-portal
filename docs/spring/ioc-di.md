---
title: IoC & Dependency Injection
description: Inversion of Control and Dependency Injection in Spring — ApplicationContext, autowiring, injection types, and best practices
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, ioc, di, dependency-injection, autowired, applicationcontext]
related:
  - /spring/bean-lifecycle
  - /spring/bean-scopes
  - /spring/configuration
  - /principles/solid
estimatedMinutes: 25
---

# IoC & Dependency Injection

<DifficultyBadge level="intermediate" />

Dependency Injection (DI) is the mechanism that enables the Dependency Inversion Principle in practice. Spring's IoC container manages object creation and wiring so you don't have to.

---

## Inversion of Control

**Without IoC:** Your code creates its own dependencies.

```java
// Traditional — tight coupling
public class OrderService {
    private final OrderRepository repo = new JpaOrderRepository(); // hardcoded!
    private final EmailService email = new SmtpEmailService();      // hardcoded!
}
```

**With IoC:** The container creates and injects dependencies.

```java
// IoC — loose coupling
@Service
public class OrderService {
    private final OrderRepository repo;
    private final EmailService email;

    // Spring injects these — OrderService doesn't create them
    public OrderService(OrderRepository repo, EmailService email) {
        this.repo  = repo;
        this.email = email;
    }
}
```

The **ApplicationContext** is Spring's IoC container — it creates beans, resolves their dependencies, and manages their lifecycle.

---

## Types of Dependency Injection

### 1. Constructor Injection (Recommended)

```java
@Service
public class PaymentService {
    private final PaymentGateway gateway;
    private final AuditLogger logger;

    // Since Spring 4.3, @Autowired is optional if there's only one constructor
    public PaymentService(PaymentGateway gateway, AuditLogger logger) {
        this.gateway = gateway;
        this.logger  = logger;
    }
}
```

**Why preferred:**
- Dependencies are final — immutable
- Makes dependencies explicit — visible in constructor
- Easy to test — just pass mocks in the constructor
- Fails fast if a dependency is missing (at startup, not at runtime)

### 2. Setter Injection

```java
@Service
public class ReportService {
    private EmailSender emailSender;

    @Autowired
    public void setEmailSender(EmailSender emailSender) {
        this.emailSender = emailSender;
    }
}
```

**When to use:** Optional dependencies, or when circular dependencies prevent constructor injection.

### 3. Field Injection (Not Recommended)

```java
@Service
public class UserService {
    @Autowired
    private UserRepository repository; // ← avoid this!
}
```

**Problems:**
- Hidden dependency (not visible in constructor)
- Can't make field `final`
- Hard to test (need reflection or Spring context)
- Hides too many dependencies (easy to add more without noticing)

---

## ApplicationContext

The IoC container. Loaded at application startup, it scans for beans and wires them.

```java
// Programmatic usage (rarely needed directly)
ApplicationContext ctx = new AnnotationConfigApplicationContext(AppConfig.class);

OrderService orderService = ctx.getBean(OrderService.class);
orderService.placeOrder(order);
```

In Spring Boot, the context starts automatically via `SpringApplication.run()`.

### Key ApplicationContext implementations

| Class | Use case |
|-------|---------|
| `AnnotationConfigApplicationContext` | Java-based config |
| `ClassPathXmlApplicationContext` | XML config |
| `WebApplicationContext` | Web apps |
| `SpringBootApplicationContext` | Spring Boot (wraps the above) |

---

## @Autowired Resolution Order

When Spring resolves an `@Autowired` dependency:

1. **By type** — find all beans of the required type
2. **If one match** → inject it
3. **If multiple matches** → try to narrow by **field/parameter name** (must match bean name)
4. **If still ambiguous** → throw `NoUniqueBeanDefinitionException`

```java
// Two implementations of PaymentProcessor
@Component("creditCard")
public class CreditCardProcessor implements PaymentProcessor { ... }

@Component("payPal")
public class PayPalProcessor implements PaymentProcessor { ... }

@Service
public class CheckoutService {
    // Spring picks 'payPal' bean by matching parameter name
    public CheckoutService(PaymentProcessor payPal) { ... }

    // Or be explicit:
    @Qualifier("creditCard")
    public CheckoutService(PaymentProcessor processor) { ... }
}
```

---

## @ComponentScan

```java
@Configuration
@ComponentScan(basePackages = "com.example.app")
public class AppConfig { }
```

Spring scans the package and registers classes annotated with:
- `@Component` — generic component
- `@Service` — service layer
- `@Repository` — data access layer (+ exception translation)
- `@Controller` / `@RestController` — web layer

All are aliases for `@Component` — the distinction is semantic.

---

## @Autowired on Collections

```java
@Service
public class ReportAggregator {
    // Spring injects ALL ReportGenerator beans into this list
    private final List<ReportGenerator> generators;

    public ReportAggregator(List<ReportGenerator> generators) {
        this.generators = generators;
    }
}
```

Useful for plugin-style architectures where you want all implementations.

---

## Lazy Initialisation

```java
@Service
@Lazy  // bean created only when first requested
public class HeavyAnalyticsService {
    public HeavyAnalyticsService() {
        System.out.println("Slow initialisation...");
    }
}
```

Or lazy at injection point:

```java
@Autowired
@Lazy
private HeavyAnalyticsService analytics; // only initialised when analytics.someMethod() is called
```

---

## Quick Reference

| Annotation | Purpose |
|-----------|---------|
| `@Component` | Generic Spring-managed bean |
| `@Service` | Service layer (semantic alias) |
| `@Repository` | DAO layer + JDBC exception translation |
| `@Controller` | MVC controller |
| `@RestController` | `@Controller` + `@ResponseBody` |
| `@Autowired` | Inject dependency (skip if only one constructor) |
| `@Qualifier("name")` | Disambiguate multiple candidates |
| `@Primary` | Default bean when multiple candidates |
| `@Lazy` | Defer bean creation |
| `@Value("${key}")` | Inject property value |

---

## Summary

- IoC means the container creates and wires objects — you declare dependencies, Spring provides them.
- **Prefer constructor injection**: immutable, explicit, testable.
- Spring resolves `@Autowired` by type first, then by name.
- `@Component`, `@Service`, `@Repository`, `@Controller` are all component-scan markers.

<RelatedTopics :topics="['/spring/bean-lifecycle', '/spring/bean-scopes', '/spring/configuration', '/principles/solid']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
