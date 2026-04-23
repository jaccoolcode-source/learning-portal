---
title: Spring Boot
description: Spring Boot autoconfiguration, starters, @SpringBootApplication, properties, and actuator
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring-boot, autoconfiguration, starters, actuator, springbootapplication]
related:
  - /spring/configuration
  - /spring/ioc-di
  - /spring/spring-data
estimatedMinutes: 20
---

# Spring Boot

<DifficultyBadge level="intermediate" />

Spring Boot removes the configuration boilerplate from Spring. Convention over configuration: sensible defaults for everything, override what you need.

---

## What Spring Boot Provides

| Feature | Description |
|---------|-------------|
| **Autoconfiguration** | Configures beans based on classpath and properties |
| **Starters** | Dependency bundles with compatible versions |
| **Embedded server** | Runs as a standalone JAR (Tomcat/Jetty/Netty) |
| **Actuator** | Production monitoring endpoints |
| **Developer tools** | Hot reload in dev mode |

---

## @SpringBootApplication

```java
@SpringBootApplication
// Equivalent to:
// @SpringBootConfiguration  (extends @Configuration)
// @EnableAutoConfiguration  (triggers autoconfiguration)
// @ComponentScan            (scans current package + subpackages)
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

---

## Autoconfiguration — How It Works

Spring Boot's "magic" is autoconfiguration. Instead of defining dozens of beans manually, Spring Boot reads your classpath and properties, then wires everything automatically.

### Step-by-step startup sequence

1. `@SpringBootApplication` activates `@EnableAutoConfiguration`.
2. Spring Boot reads `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` from **every JAR on the classpath**. Each entry is a `@Configuration` class candidate.
3. Each candidate is evaluated against its `@Conditional` annotations. Only classes whose conditions pass are loaded.
4. Passing `@Configuration` classes register their `@Bean` methods into the `ApplicationContext`.
5. Your own `@Configuration` classes take priority — autoconfiguration is always last.

```java
// What Spring Boot does internally (simplified):
List<String> candidates = loadFromAutoConfigurationImports(); // all starters
for (String className : candidates) {
    Class<?> config = Class.forName(className);
    if (allConditionsMet(config)) {
        context.register(config);     // loads its @Bean methods
    }
}
```

### @Conditional Annotations

Each autoconfiguration class uses `@Conditional` guards to decide whether to apply itself:

| Annotation | Condition |
|-----------|-----------|
| `@ConditionalOnClass(Foo.class)` | `Foo` is on the classpath |
| `@ConditionalOnMissingClass("com.Foo")` | `Foo` is NOT on the classpath |
| `@ConditionalOnBean(DataSource.class)` | A `DataSource` bean already exists |
| `@ConditionalOnMissingBean(DataSource.class)` | No `DataSource` bean exists yet |
| `@ConditionalOnProperty("app.feature.enabled")` | Property is set to `true` |
| `@ConditionalOnProperty(value="...", havingValue="redis")` | Property equals a specific value |
| `@ConditionalOnWebApplication` | Application is a web app (Servlet or Reactive) |
| `@ConditionalOnNotWebApplication` | Not a web app |
| `@ConditionalOnResource("classpath:banner.txt")` | File exists on classpath |
| `@ConditionalOnExpression("${app.x} && ${app.y}")` | SpEL expression is true |

```java
// Example: DataSource autoconfiguration (simplified)
@AutoConfiguration
@ConditionalOnClass({ DataSource.class, EmbeddedDatabaseType.class })  // only if JDBC is on classpath
@ConditionalOnMissingBean(DataSource.class)    // ← back off if user defined their own
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public DataSource dataSource(DataSourceProperties properties) {
        return DataSourceBuilder.create()
            .url(properties.getUrl())
            .username(properties.getUsername())
            .password(properties.getPassword())
            .build();
    }
}
```

**Key insight:** If you define your own `DataSource` bean, autoconfiguration backs off (`@ConditionalOnMissingBean`). This is how you override any default.

### Disabling Specific Autoconfiguration

```java
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,
    HibernateJpaAutoConfiguration.class
})
public class MyApplication { ... }

// Or via properties:
// spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration
```

### Debug What Was Auto-Configured

```properties
# Print autoconfiguration report at startup
debug=true
```

Or check `/actuator/conditions` endpoint — lists all autoconfiguration classes and whether each condition passed or failed.

### Writing a Custom Autoconfiguration

```java
// 1. Create your @Configuration class with conditions
@AutoConfiguration
@ConditionalOnClass(MyLibrary.class)
@ConditionalOnMissingBean(MyService.class)
@EnableConfigurationProperties(MyLibraryProperties.class)
public class MyLibraryAutoConfiguration {

    @Bean
    public MyService myService(MyLibraryProperties props) {
        return new MyService(props.getApiKey());
    }
}

// 2. Register it in:
// src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
// com.example.MyLibraryAutoConfiguration
```

This is exactly how third-party starters (Redis, Kafka, etc.) integrate with Spring Boot.

---

## Common Starters

| Starter | What it includes |
|---------|-----------------|
| `spring-boot-starter-web` | Spring MVC, Tomcat, Jackson |
| `spring-boot-starter-data-jpa` | Hibernate, Spring Data JPA, HikariCP |
| `spring-boot-starter-security` | Spring Security |
| `spring-boot-starter-test` | JUnit 5, Mockito, AssertJ, MockMvc |
| `spring-boot-starter-actuator` | Metrics, health, info endpoints |
| `spring-boot-starter-cache` | Cache abstraction (`@Cacheable`) |
| `spring-boot-starter-validation` | Bean Validation (Hibernate Validator) |

---

## application.properties / application.yml

```properties
# Server
server.port=8080
server.servlet.context-path=/api

# DataSource
spring.datasource.url=jdbc:postgresql://localhost:5432/mydb
spring.datasource.username=admin
spring.datasource.password=secret
spring.datasource.hikari.maximum-pool-size=20

# JPA
spring.jpa.show-sql=true
spring.jpa.hibernate.ddl-auto=validate

# Logging
logging.level.com.example=DEBUG
logging.level.org.springframework.security=DEBUG
```

```yaml
# YAML equivalent
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: admin
    password: secret
  jpa:
    show-sql: true
    hibernate:
      ddl-auto: validate
```

---

## @ConfigurationProperties

Type-safe binding of properties to a class:

```java
@ConfigurationProperties(prefix = "app.email")
@Component
public class EmailProperties {
    private String host = "smtp.gmail.com";
    private int port = 587;
    private boolean ssl = true;
    private String from;
    // getters/setters
}
```

```properties
app.email.host=smtp.company.com
app.email.port=465
app.email.from=noreply@company.com
```

---

## Spring Boot Actuator

```properties
management.endpoints.web.exposure.include=health,info,metrics,env
management.endpoint.health.show-details=always
```

| Endpoint | Description |
|----------|-------------|
| `/actuator/health` | Application health status |
| `/actuator/info` | Application info (version, etc.) |
| `/actuator/metrics` | JVM, HTTP, custom metrics |
| `/actuator/env` | Environment properties |
| `/actuator/beans` | All Spring beans |
| `/actuator/mappings` | All URL mappings |

---

## Profiles in Spring Boot

```properties
# application.properties (default)
spring.profiles.active=dev

# application-dev.properties (overrides for dev)
spring.datasource.url=jdbc:h2:mem:testdb
logging.level.root=DEBUG

# application-prod.properties (overrides for prod)
spring.datasource.url=jdbc:postgresql://prod-server/db
logging.level.root=WARN
```

---

## Summary

- `@SpringBootApplication` = `@ComponentScan` + `@Configuration` + `@EnableAutoConfiguration`.
- Autoconfiguration provides beans conditionally — backs off if you define your own.
- Starters bundle compatible dependencies — no version conflicts.
- `@ConfigurationProperties` provides type-safe property binding.
- Profiles separate environment-specific config cleanly.
- Use `debug=true` or `/actuator/conditions` to debug which autoconfiguration classes are active.

---

## Interview Quick-Fire

**Q: How does Spring Boot autoconfiguration work internally?**
On startup, `@EnableAutoConfiguration` triggers Spring Boot to load all class names from `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` across all JARs. For each candidate class, Spring evaluates its `@Conditional` annotations. Classes whose conditions pass are registered as `@Configuration` sources — their `@Bean` methods create beans. Your own `@Configuration` classes take priority; autoconfiguration always runs last and backs off via `@ConditionalOnMissingBean` if you've already defined a bean.

**Q: What is `@ConditionalOnMissingBean` and why is it important?**
`@ConditionalOnMissingBean(DataSource.class)` tells Spring Boot: "only register this bean if no bean of type `DataSource` exists yet." This is the mechanism that lets you override any autoconfigured bean — simply define your own `@Bean` of the same type in a `@Configuration` class. Without it, autoconfiguration would register a duplicate bean and cause a conflict.

**Q: What is the difference between `@Value` and `@ConfigurationProperties`?**
`@Value("${app.email.host}")` injects a single property by key — simple but scattered. `@ConfigurationProperties(prefix = "app.email")` binds an entire property subtree to a typed POJO — better for grouped settings: you get IDE autocompletion, validation with `@Validated`, and all properties in one place. Prefer `@ConfigurationProperties` for anything with more than 2–3 related properties.

<RelatedTopics :topics="['/spring/configuration', '/spring/ioc-di', '/spring/spring-data', '/spring/testing']" />
