---
title: Spring Configuration
description: XML vs Java-based Spring configuration — @Configuration, @Bean, @ComponentScan, @PropertySource
category: spring
pageClass: layout-spring
difficulty: intermediate
tags: [spring, configuration, bean, componentscan, propertysource]
related:
  - /spring/ioc-di
  - /spring/spring-boot
estimatedMinutes: 15
---

# Spring Configuration

<DifficultyBadge level="intermediate" />

Spring supports multiple ways to configure the IoC container. Modern Spring uses Java-based `@Configuration` classes. Spring Boot adds autoconfiguration on top.

---

## Java-based Configuration (Modern)

```java
@Configuration          // marks this as a configuration class
@ComponentScan("com.example")  // scans for @Component/@Service/@Repository etc.
@PropertySource("classpath:application.properties")  // loads properties file
public class AppConfig {

    @Value("${db.url}")
    private String dbUrl;

    @Bean  // method name becomes bean name: "dataSource"
    public DataSource dataSource() {
        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(dbUrl);
        return ds;
    }

    @Bean
    public JdbcTemplate jdbcTemplate(DataSource dataSource) {
        // Spring injects the dataSource bean
        return new JdbcTemplate(dataSource);
    }

    @Bean(name = "auditLogger", destroyMethod = "close")
    @Scope("prototype")
    public AuditLogger auditLogger() {
        return new FileAuditLogger("/var/log/audit.log");
    }
}
```

---

## @Bean vs @Component

| | `@Bean` | `@Component` |
|-|---------|-------------|
| Where | In `@Configuration` class | On the class itself |
| Control | Full — you write the factory code | Limited — Spring calls constructor |
| Third-party | ✅ Can register classes you don't own | ❌ Must annotate the class |
| Naming | Method name (or `name` attribute) | Class name lowercase (or `value`) |

Use `@Bean` for:
- Third-party classes (`DataSource`, `ObjectMapper`, `RestTemplate`)
- Complex creation logic
- Conditional beans

---

## Conditional Beans

```java
@Configuration
public class CacheConfig {

    @Bean
    @ConditionalOnProperty(name = "cache.provider", havingValue = "redis")
    public CacheManager redisCacheManager() {
        return new RedisCacheManager(/* ... */);
    }

    @Bean
    @ConditionalOnProperty(name = "cache.provider", havingValue = "caffeine", matchIfMissing = true)
    public CacheManager caffeineCacheManager() {
        return new CaffeineCacheManager();
    }
}
```

Other conditions: `@ConditionalOnClass`, `@ConditionalOnBean`, `@ConditionalOnMissingBean`, `@Profile`.

---

## @Profile

Activate beans for specific environments:

```java
@Configuration
@Profile("dev")
public class DevDataConfig {
    @Bean public DataSource dataSource() { return new EmbeddedDatabaseBuilder().build(); }
}

@Configuration
@Profile("prod")
public class ProdDataConfig {
    @Bean public DataSource dataSource() { return new HikariDataSource(); }
}
```

Activate: `SPRING_PROFILES_ACTIVE=prod` or `--spring.profiles.active=prod`.

---

## @ImportResource (Legacy XML support)

```java
@Configuration
@ImportResource("classpath:legacy-beans.xml")  // load XML bean definitions
public class MigrationConfig { }
```

---

## Bean Naming

```java
@Bean                          // name = "myService" (method name)
public MyService myService() { }

@Bean("specialService")        // name = "specialService"
public MyService specialService() { }

@Bean({"primary", "default"})  // multiple aliases
public MyService primaryService() { }
```

---

## Summary

- `@Configuration` + `@Bean` is the modern, type-safe way to configure Spring.
- `@ComponentScan` scans for stereotype annotations (`@Component`, `@Service`, etc.).
- Use `@Bean` for third-party classes; `@Component` for your own classes.
- `@Profile` activates beans per environment; `@ConditionalOn*` for feature flags.

<RelatedTopics :topics="['/spring/ioc-di', '/spring/spring-boot']" />
