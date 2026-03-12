---
title: Spring Framework Quiz
---

<script setup>
const questions = [
  {
    question: "What is the default scope of a Spring bean?",
    options: [
      "prototype",
      "request",
      "session",
      "singleton"
    ],
    answer: 3,
    explanation: "Spring beans are singleton-scoped by default, meaning the Spring container creates exactly one instance per ApplicationContext and returns that same instance for every injection point. Note this is per-ApplicationContext, not per-JVM."
  },
  {
    question: "What is the default transaction propagation behavior of @Transactional in Spring?",
    options: [
      "REQUIRES_NEW",
      "REQUIRED",
      "NESTED",
      "SUPPORTS"
    ],
    answer: 1,
    explanation: "REQUIRED is the default propagation. It means: use the existing transaction if one is active; if not, create a new one. This ensures the method always runs within a transaction without creating unnecessary overhead."
  },
  {
    question: "When does Spring use CGLIB proxies instead of JDK dynamic proxies for AOP?",
    options: [
      "When the bean class implements at least one interface",
      "When the bean class does not implement any interface",
      "CGLIB is always used regardless of interfaces",
      "JDK dynamic proxies are always used regardless of interfaces"
    ],
    answer: 1,
    explanation: "JDK dynamic proxies require the target class to implement an interface (the proxy implements the same interface). When the bean has no interface, Spring falls back to CGLIB, which creates a subclass of the target at runtime. Since Spring Boot 2.x, CGLIB is the default even when interfaces exist."
  },
  {
    question: "What is the key difference between @SpringBootTest and @WebMvcTest?",
    options: [
      "@SpringBootTest tests only repository layer; @WebMvcTest tests the full stack",
      "@SpringBootTest loads the full ApplicationContext; @WebMvcTest loads only the web layer (controllers, filters, MVC config)",
      "They are identical — both load the same application context",
      "@WebMvcTest loads the full context; @SpringBootTest loads only the service layer"
    ],
    answer: 1,
    explanation: "@SpringBootTest starts the entire Spring ApplicationContext (all beans), suitable for integration tests. @WebMvcTest is a slice test that only loads MVC-related beans (controllers, @ControllerAdvice, filters) and mocks the rest, making it faster and more focused."
  },
  {
    question: "What does @Autowired do when applied to a constructor, field, or setter?",
    options: [
      "It marks the bean as a singleton",
      "It instructs Spring's IoC container to inject the matching bean dependency by type",
      "It defines the bean's transaction scope",
      "It tells Spring to create a new bean instance for each injection point"
    ],
    answer: 1,
    explanation: "@Autowired tells the Spring container to resolve and inject a collaborating bean into this field, constructor parameter, or setter. Resolution is by type first; if multiple candidates exist, @Qualifier or @Primary disambiguates. Constructor injection is generally preferred."
  },
  {
    question: "How does ApplicationContext differ from BeanFactory?",
    options: [
      "BeanFactory is more feature-rich; ApplicationContext is a lightweight subset",
      "They are identical — ApplicationContext is just an alias for BeanFactory",
      "ApplicationContext is more feature-rich, adding event publishing, i18n, AOP, and eager singleton initialization",
      "ApplicationContext only supports prototype beans; BeanFactory supports all scopes"
    ],
    answer: 2,
    explanation: "BeanFactory is the basic IoC container with lazy bean initialization. ApplicationContext extends BeanFactory and adds: eager singleton initialization, event publishing (ApplicationEventPublisher), internationalization (MessageSource), AOP integration, and resource loading. In practice, always use ApplicationContext."
  },
  {
    question: "What is the key difference between @Component and @Bean?",
    options: [
      "@Component is for Spring beans; @Bean is for non-Spring objects only",
      "@Component auto-detects and registers a class via classpath scanning; @Bean explicitly declares a bean inside a @Configuration class method, giving you full control over instantiation",
      "@Bean creates singleton beans; @Component creates prototype beans",
      "They are interchangeable and have identical semantics"
    ],
    answer: 1,
    explanation: "@Component (and its specializations @Service, @Repository, @Controller) marks a class for component scanning — Spring auto-detects and registers it. @Bean is used in @Configuration classes to explicitly define a bean, which is essential when you need to configure third-party classes you cannot annotate directly."
  },
  {
    question: "What happens when Spring detects a circular dependency between two beans using constructor injection?",
    options: [
      "Spring resolves it silently using a proxy",
      "Spring creates both beans in a random order and sets references after creation",
      "Spring throws a BeanCurrentlyInCreationException at startup",
      "Spring falls back to field injection automatically"
    ],
    answer: 2,
    explanation: "Constructor injection circular dependencies cannot be resolved because to create Bean A, Bean B must exist, but to create Bean B, Bean A must exist. Spring throws BeanCurrentlyInCreationException at startup. With field/setter injection, Spring can use a partially-constructed bean (via the 'third-level cache'), but this is a design smell to avoid."
  },
  {
    question: "What effect does the @Lazy annotation have on a Spring bean?",
    options: [
      "The bean is created eagerly at startup but initialized lazily",
      "The bean instance is created only when it is first requested (on first use), not at ApplicationContext startup",
      "The bean is never created unless explicitly called by name",
      "@Lazy marks the bean as prototype-scoped"
    ],
    answer: 1,
    explanation: "By default, singleton beans are eagerly initialized at ApplicationContext startup. @Lazy defers creation until the bean is first accessed. This can improve startup time but delays the discovery of configuration errors. It can also be used to break circular dependency issues in setter/field injection."
  },
  {
    question: "What happens when @Transactional is placed on a private method in a Spring-managed bean?",
    options: [
      "The transaction is applied normally just like a public method",
      "Spring throws a configuration error at startup",
      "The annotation has no effect because Spring AOP proxies cannot intercept private methods",
      "The method is promoted to protected scope automatically"
    ],
    answer: 2,
    explanation: "Spring AOP works through proxies (JDK or CGLIB). A proxy can only intercept calls that go through the proxy object — i.e., public methods called from outside the bean. Private methods are called directly on the target object bypassing the proxy, so @Transactional (and any AOP advice) is silently ignored."
  }
]
</script>

# Spring Framework Quiz

Test your knowledge of Spring's core container, AOP, transactions, and testing support.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Spring Framework study pages](/spring/).
