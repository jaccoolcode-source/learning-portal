---
title: Spring Framework — Overview
description: Spring Framework overview — IoC/DI, Bean lifecycle, AOP, Spring Boot, Spring Data, Spring Security
category: spring
pageClass: layout-spring
---

# Spring Framework

<DifficultyBadge level="intermediate" />

Spring is the most widely used Java framework. Understanding its core concepts — IoC/DI, Bean lifecycle, AOP — is mandatory for any Java backend developer.

---

## What You'll Learn

| Topic | Key Concepts |
|-------|-------------|
| [IoC & Dependency Injection](./ioc-di) | ApplicationContext, `@Autowired`, constructor injection, DI types |
| [Bean Lifecycle](./bean-lifecycle) | `@PostConstruct`, `@PreDestroy`, `InitializingBean`, `BeanPostProcessor` |
| [Bean Scopes](./bean-scopes) | Singleton, Prototype, Request, Session, Application |
| [Configuration](./configuration) | XML vs Java `@Configuration`, `@ComponentScan`, `@Bean` |
| [AOP](./aop) | Advice, Pointcut, JoinPoint, `@Transactional`, `@Cacheable` |
| [@Qualifier & Cyclic Deps](./qualifiers) | `@Qualifier`, `@Primary`, cyclic dependency resolution |
| [Spring Boot](./spring-boot) | Auto-configuration, starters, `@SpringBootApplication` |
| [Spring Data / JPA](./spring-data) | Repositories, `@Entity`, Hibernate, session management |
| [Spring Security](./spring-security) | Authentication, Authorization, JWT, OAuth2 |
| [Testing](./testing) | `@SpringBootTest`, `@WebMvcTest`, `@MockBean` |

---

## The Big Picture

```
┌─────────────────────── Spring Application ──────────────────────────┐
│                                                                      │
│  ApplicationContext (IoC Container)                                  │
│  ├── BeanFactory (creates, wires, manages beans)                     │
│  ├── Bean: OrderService → depends on → OrderRepository              │
│  ├── Bean: OrderRepository → depends on → DataSource               │
│  └── Bean: DataSource (configured by Spring Boot auto-config)       │
│                                                                      │
│  AOP Layer (cross-cutting concerns)                                  │
│  ├── @Transactional → proxy wraps service methods                   │
│  ├── @Cacheable → proxy caches return values                        │
│  └── @Async → proxy runs method on thread pool                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Quick Facts

- **Default bean scope is singleton** — one instance per ApplicationContext
- **Constructor injection is preferred** over field injection (testable, immutable)
- **`@Transactional` only works on public methods** (proxy limitation)
- **Spring Boot** = Spring + autoconfiguration + opinionated defaults
- **Spring Data** generates repository implementations from method names

<RelatedTopics :topics="['/design-patterns/structural/proxy', '/design-patterns/creational/factory-method', '/design-patterns/behavioral/template-method']" />
