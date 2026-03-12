---
title: Design Patterns Quiz
---

<script setup>
const questions = [
  {
    question: "What does the Singleton pattern guarantee in a standard single-classloader Java application?",
    options: [
      "One instance per thread",
      "One instance per method call",
      "One instance per JVM (classloader)",
      "One instance per package"
    ],
    answer: 2,
    explanation: "Singleton ensures only one instance of a class is created per classloader (typically per JVM process). Note: in Spring, @Bean singletons are scoped per ApplicationContext, not the JVM — a subtle but common interview distinction."
  },
  {
    question: "What is the key difference between the Factory Method and Abstract Factory patterns?",
    options: [
      "Factory Method creates a single product; Abstract Factory creates families of related products",
      "Abstract Factory uses inheritance; Factory Method uses composition",
      "Factory Method is used for database access; Abstract Factory is used for UI components only",
      "They are identical patterns with different names"
    ],
    answer: 0,
    explanation: "Factory Method defines an interface for creating one product and lets subclasses decide which class to instantiate. Abstract Factory provides an interface for creating families of related or dependent objects (e.g., Button + Checkbox for Windows vs Mac) without specifying concrete classes."
  },
  {
    question: "How does the Decorator pattern differ from classical inheritance for adding behavior?",
    options: [
      "Decorator is compile-time only; inheritance is runtime",
      "Decorator wraps an object at runtime to add behavior without changing its class; inheritance adds behavior at compile time through subclassing",
      "Inheritance is always preferred over Decorator for performance reasons",
      "Decorator changes the interface; inheritance keeps the same interface"
    ],
    answer: 1,
    explanation: "Decorator adds responsibilities to an object dynamically at runtime by wrapping it in a decorator object that has the same interface. Inheritance adds behavior statically at compile time and can cause a class explosion when multiple combinations are needed. java.io streams are a classic Decorator example."
  },
  {
    question: "In the Observer pattern, what are the two main participants?",
    options: [
      "Proxy and RealSubject",
      "Context and Strategy",
      "Subject (Publisher) and Observers (Subscribers)",
      "Facade and Subsystem"
    ],
    answer: 2,
    explanation: "Observer defines a one-to-many dependency: when the Subject changes state, it notifies all registered Observers. The Subject maintains a list of Observers and calls their update() method on state changes. This is also known as the Publish-Subscribe pattern."
  },
  {
    question: "What is the primary purpose of the Strategy pattern?",
    options: [
      "To ensure only one instance of a class exists",
      "To define a family of algorithms, encapsulate each one, and make them interchangeable",
      "To provide a simplified interface to a complex subsystem",
      "To convert the interface of a class into another interface clients expect"
    ],
    answer: 1,
    explanation: "Strategy defines a family of algorithms, encapsulates each one in a separate class implementing a common interface, and makes them interchangeable. The client holds a reference to the Strategy interface and can switch algorithms at runtime. Sorting with Comparator is a real-world example."
  },
  {
    question: "Which of the following is NOT a recognized type of Proxy pattern?",
    options: [
      "Virtual Proxy (lazy initialization of expensive objects)",
      "Protection Proxy (access control)",
      "Remote Proxy (represents object in another address space)",
      "Singleton Proxy (ensures single instance creation)"
    ],
    answer: 3,
    explanation: "The three classic Proxy types are: Virtual (lazy-loads expensive objects), Protection (controls access based on permissions), and Remote (represents a remote object locally, e.g., RMI stubs). 'Singleton Proxy' is not a recognized GoF proxy type."
  },
  {
    question: "What problem does the Builder pattern solve compared to telescoping constructors?",
    options: [
      "Builder reduces memory usage by sharing object state",
      "Builder avoids a proliferation of constructors with different parameter combinations and makes object construction readable and flexible",
      "Builder enforces immutability by preventing setter methods",
      "Builder is faster than constructors at runtime"
    ],
    answer: 1,
    explanation: "Telescoping constructors — where you have many constructors with different subsets of optional parameters — become unreadable and error-prone. Builder separates construction from representation, letting you set only the parameters you need in a fluent, named style. Lombok's @Builder is a common Java usage."
  },
  {
    question: "How does the Template Method pattern work?",
    options: [
      "It uses composition to delegate algorithm steps to strategy objects",
      "It uses inheritance to define the skeleton of an algorithm in a base class, deferring specific steps to subclasses",
      "It creates a template object that is copied (prototyped) for each use",
      "It wraps an object to add behavior at runtime"
    ],
    answer: 1,
    explanation: "Template Method defines the overall algorithm structure in a base class method (the template method), calling abstract or overridable hook methods for steps that vary. Subclasses override those specific steps without changing the algorithm's skeleton. It is inheritance-based, unlike Strategy which uses composition."
  },
  {
    question: "What is the purpose of the Facade pattern?",
    options: [
      "To add responsibilities to an object dynamically",
      "To provide a unified, simplified interface to a set of interfaces in a complex subsystem",
      "To define a one-to-many dependency between objects",
      "To ensure an object can be replaced by its subtypes"
    ],
    answer: 1,
    explanation: "Facade provides a higher-level interface that makes a complex subsystem easier to use. It does not encapsulate the subsystem (clients can still access it directly) but reduces coupling and complexity for typical use cases. A service layer in a Spring app often acts as a facade."
  },
  {
    question: "Which design pattern does Spring AOP use to intercept method calls and apply cross-cutting concerns?",
    options: [
      "Decorator pattern",
      "Observer pattern",
      "Proxy pattern",
      "Chain of Responsibility pattern"
    ],
    answer: 2,
    explanation: "Spring AOP uses the Proxy pattern. For interface-based beans, it creates JDK dynamic proxies; for class-based beans (no interface), it uses CGLIB subclass proxies. The proxy intercepts method calls and applies advice (logging, transactions, security) before delegating to the real object."
  }
]
</script>

# Design Patterns Quiz

Test your knowledge of the 23 GoF design patterns — their intent, structure, and real-world Java applications.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Design Patterns study pages](/design-patterns/).
