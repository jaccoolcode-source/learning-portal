---
title: Bean Lifecycle
description: Spring bean lifecycle from instantiation to destruction — @PostConstruct, @PreDestroy, BeanPostProcessor, InitializingBean
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, bean-lifecycle, postconstruct, predestroy, beanpostprocessor]
related:
  - /spring/ioc-di
  - /spring/bean-scopes
estimatedMinutes: 20
---

# Bean Lifecycle

<DifficultyBadge level="intermediate" />

Every Spring bean goes through a well-defined lifecycle. Knowing the phases helps you initialise resources properly, avoid subtle bugs, and implement cross-cutting concerns.

---

## Lifecycle Overview

```
1. Bean class instantiated (constructor called)
2. Dependencies injected (@Autowired, setter)
3. BeanNameAware.setBeanName() (optional)
4. BeanFactoryAware.setBeanFactory() (optional)
5. ApplicationContextAware.setApplicationContext() (optional)
6. BeanPostProcessor.postProcessBeforeInitialization() [all processors]
7. @PostConstruct method called
8. InitializingBean.afterPropertiesSet() (if implemented)
9. @Bean(initMethod = "...") called (if configured)
10. BeanPostProcessor.postProcessAfterInitialization() [all processors] ← AOP proxies created here
11. Bean is ready for use
    ...
12. Container shutdown begins
13. @PreDestroy method called
14. DisposableBean.destroy() (if implemented)
15. @Bean(destroyMethod = "...") called (if configured)
```

---

## @PostConstruct and @PreDestroy

The standard, annotation-based approach:

```java
@Component
public class DatabaseConnectionPool {
    private Connection[] pool;

    @PostConstruct          // called after DI is complete
    public void init() {
        System.out.println("Initialising connection pool...");
        pool = new Connection[10];
        for (int i = 0; i < pool.length; i++) {
            pool[i] = createConnection();
        }
    }

    @PreDestroy             // called before bean is destroyed
    public void cleanup() {
        System.out.println("Closing connections...");
        for (Connection conn : pool) {
            closeQuietly(conn);
        }
    }

    private Connection createConnection() { return null; } // placeholder
    private void closeQuietly(Connection c) {}
}
```

::: tip When to use @PostConstruct
Use `@PostConstruct` instead of the constructor for:
- Database connections (DI is complete, config values are available)
- Starting background threads (don't start work in the constructor)
- Cache warming
- Validation (verify required dependencies are valid)
:::

---

## InitializingBean and DisposableBean

Older approach — implement interfaces:

```java
@Component
public class CacheService implements InitializingBean, DisposableBean {

    @Override
    public void afterPropertiesSet() throws Exception {
        // same as @PostConstruct
        warmUpCache();
    }

    @Override
    public void destroy() throws Exception {
        // same as @PreDestroy
        flushCache();
    }
}
```

**Avoid this approach** in new code — it couples your class to Spring APIs. `@PostConstruct`/`@PreDestroy` are standard Java (JSR-250) and don't require Spring.

---

## @Bean with initMethod / destroyMethod

For third-party classes you can't annotate:

```java
@Configuration
public class AppConfig {
    @Bean(initMethod = "start", destroyMethod = "stop")
    public SomeThirdPartyService thirdPartyService() {
        return new SomeThirdPartyService();
    }
}
```

Spring calls `start()` after construction and `stop()` on shutdown.

---

## BeanPostProcessor

Intercepts **all** beans during initialisation. Used to implement AOP, validation, etc.

```java
@Component
public class LoggingBeanPostProcessor implements BeanPostProcessor {

    @Override
    public Object postProcessBeforeInitialization(Object bean, String beanName) {
        System.out.println("Before init: " + beanName);
        return bean; // return bean (or a wrapper/proxy)
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        System.out.println("After init: " + beanName);
        // Spring AOP replaces beans with proxies here!
        return bean;
    }
}
```

::: info This is how @Transactional works
`AnnotationAwareAspectJAutoProxyCreator` is a `BeanPostProcessor` that creates proxies for beans with `@Transactional`, `@Cacheable`, `@Async` etc. in `postProcessAfterInitialization`.
:::

---

## Common Lifecycle Pitfalls

### @PostConstruct in a Prototype bean
`@PreDestroy` is NOT called for prototype beans — Spring doesn't track their lifecycle after creation. You must manage destruction yourself.

### Calling @Transactional methods from @PostConstruct
The proxy may not be fully set up during `@PostConstruct`. Prefer event-based init using `ApplicationListener<ContextRefreshedEvent>` or `@EventListener(ContextRefreshedEvent.class)`:

```java
@Component
public class DataLoader {
    @Autowired OrderRepository repo;

    @EventListener(ContextRefreshedEvent.class)
    public void onContextRefreshed() {
        // Safe to call @Transactional methods here
        repo.loadInitialData();
    }
}
```

---

## Lifecycle by Scope

| Scope | @PostConstruct | @PreDestroy | Notes |
|-------|---------------|------------|-------|
| Singleton | Once at startup | Once at shutdown | Normal lifecycle |
| Prototype | Each creation | **Never called** | You manage destruction |
| Request | Each request | End of request | Web only |
| Session | Each session | Session expiry | Web only |

---

## Summary

- `@PostConstruct` → initialise after DI is complete. `@PreDestroy` → cleanup before bean is destroyed.
- Prefer annotations over implementing `InitializingBean`/`DisposableBean`.
- `BeanPostProcessor` intercepts all beans — this is how AOP proxies are created.
- Prototype beans don't call `@PreDestroy` — manage cleanup manually.

<RelatedTopics :topics="['/spring/ioc-di', '/spring/bean-scopes', '/spring/aop']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
