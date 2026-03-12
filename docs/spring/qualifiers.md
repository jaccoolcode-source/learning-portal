---
title: "@Qualifier, @Primary & Cyclic Dependencies"
description: Resolving multiple bean candidates with @Qualifier and @Primary, and handling circular dependency issues in Spring
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, qualifier, primary, cyclic-dependencies, autowired]
related:
  - /spring/ioc-di
  - /spring/bean-scopes
estimatedMinutes: 15
---

# @Qualifier, @Primary & Cyclic Dependencies

<DifficultyBadge level="intermediate" />

When Spring finds multiple beans matching a type, it needs guidance. `@Qualifier` and `@Primary` provide disambiguation. Cyclic dependencies are a common Spring startup error.

---

## The Ambiguity Problem

```java
public interface MessageSender {
    void send(String message, String to);
}

@Component public class EmailSender implements MessageSender { ... }
@Component public class SmsSender implements MessageSender { ... }

@Service
public class NotificationService {
    @Autowired
    private MessageSender sender; // ← NoUniqueBeanDefinitionException!
    // Spring finds 2 candidates: EmailSender and SmsSender
}
```

---

## @Qualifier

Specify exactly which bean to inject by name:

```java
@Service
public class NotificationService {
    private final MessageSender emailSender;
    private final MessageSender smsSender;

    public NotificationService(
            @Qualifier("emailSender") MessageSender emailSender,
            @Qualifier("smsSender") MessageSender smsSender) {
        this.emailSender = emailSender;
        this.smsSender   = smsSender;
    }

    public void notifyByEmail(String message, String email) {
        emailSender.send(message, email);
    }

    public void notifyBySms(String message, String phone) {
        smsSender.send(message, phone);
    }
}
```

**Bean name defaults** to the class name with lowercase first letter: `EmailSender` → `emailSender`.

---

## Custom Qualifier Annotation

```java
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Qualifier
public @interface Primary {}

@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Qualifier
public @interface Fallback {}

// Usage
@Component @Primary   public class EmailSender implements MessageSender { ... }
@Component @Fallback  public class SmsSender implements MessageSender { ... }

public NotificationService(@Primary MessageSender primary, @Fallback MessageSender fallback) { ... }
```

---

## @Primary

Mark one bean as the default when multiple candidates exist:

```java
@Component
@Primary  // this one is injected when no @Qualifier specified
public class EmailSender implements MessageSender { ... }

@Component
public class SmsSender implements MessageSender { ... }

@Service
public class NotificationService {
    @Autowired
    private MessageSender sender; // gets EmailSender (the @Primary one)
}
```

::: tip @Primary vs @Qualifier
- `@Primary` sets a **default** — used when no `@Qualifier` is specified
- `@Qualifier` is **explicit** — overrides `@Primary` when specified
- Use `@Primary` for "the usual" bean, `@Qualifier` for "the specific" one
:::

---

## Inject All Candidates

```java
@Service
public class CompositeNotifier {
    private final List<MessageSender> senders;

    // Spring injects ALL MessageSender beans
    public CompositeNotifier(List<MessageSender> senders) {
        this.senders = senders;
    }

    public void notifyAll(String message, String recipient) {
        senders.forEach(s -> s.send(message, recipient));
    }
}
```

---

## Cyclic Dependencies

A cyclic dependency occurs when:
- Bean A depends on Bean B
- Bean B depends on Bean A

```java
@Service
public class AService {
    @Autowired private BService b; // A needs B
}

@Service
public class BService {
    @Autowired private AService a; // B needs A → cycle!
}
```

Spring **can** handle this for setter/field injection (singletons), but **cannot** for constructor injection (it would need to create both before either exists).

Spring 6.x/Boot 3.x now **fails by default** on cyclic dependencies to force you to fix the design.

---

## How to Fix Cyclic Dependencies

### Option 1: Refactor — extract shared logic

This is almost always the right fix. The cycle usually indicates a design smell.

```java
// Extract shared logic into a third bean
@Service
public class SharedService { /* logic both A and B needed */ }

@Service
public class AService { AService(SharedService shared) { ... } }

@Service
public class BService { BService(SharedService shared) { ... } }
```

### Option 2: @Lazy on one injection point

```java
@Service
public class AService {
    private final BService b;
    public AService(@Lazy BService b) { this.b = b; }
}
```

`@Lazy` defers `BService` creation — proxy injected immediately, real bean created on first use.

### Option 3: Setter injection (for one side)

```java
@Service
public class AService {
    private BService b;

    @Autowired
    public void setBService(BService b) { this.b = b; } // setter injection breaks constructor cycle
}
```

### Option 4: ApplicationContext.getBean()

Last resort — look up the bean on demand instead of injecting it at construction time.

---

## Summary

- `@Qualifier("beanName")` explicitly selects which bean to inject.
- `@Primary` marks the default bean for unqualified injection.
- Cyclic dependencies signal a design problem — refactor to extract shared logic.
- If refactoring isn't possible, use `@Lazy` on one side.
- Spring Boot 3+ fails on cyclic dependencies by default (good — fix the design!).

<RelatedTopics :topics="['/spring/ioc-di', '/spring/bean-scopes', '/spring/bean-lifecycle']" />
