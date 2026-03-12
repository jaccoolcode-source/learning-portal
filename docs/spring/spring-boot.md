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

## Autoconfiguration

Spring Boot reads `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` from each starter JAR. Each entry is a `@Configuration` class with `@Conditional` guards.

```java
// Example: DataSource autoconfiguration (simplified)
@AutoConfiguration
@ConditionalOnClass({ DataSource.class, EmbeddedDatabaseType.class })
@ConditionalOnMissingBean(DataSource.class)    // ← skip if user defined their own
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

**Key insight:** If you define your own `DataSource` bean, autoconfiguration backs off (`@ConditionalOnMissingBean`).

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

<RelatedTopics :topics="['/spring/configuration', '/spring/ioc-di', '/spring/spring-data', '/spring/testing']" />
