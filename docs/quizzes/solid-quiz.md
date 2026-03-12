---
title: SOLID Principles Quiz
---

<script setup>
const questions = [
  {
    question: "A class called `UserManager` handles user authentication, sends welcome emails, and writes audit logs. Which SOLID principle does this violate?",
    options: [
      "Open/Closed Principle",
      "Single Responsibility Principle",
      "Liskov Substitution Principle",
      "Interface Segregation Principle"
    ],
    answer: 1,
    explanation: "The Single Responsibility Principle states a class should have only one reason to change. UserManager has three responsibilities — authentication, emailing, and logging — so it has three reasons to change."
  },
  {
    question: "You need to add a new payment method to a PaymentProcessor class. According to the Open/Closed Principle, what is the correct approach?",
    options: [
      "Edit the existing PaymentProcessor class to add the new payment method",
      "Delete the old class and rewrite it with the new method included",
      "Create a new class that extends or implements a PaymentProcessor abstraction",
      "Add a flag parameter to the existing method"
    ],
    answer: 2,
    explanation: "OCP states classes should be open for extension but closed for modification. The correct approach is to extend the existing abstraction (interface or abstract class) rather than modifying working code."
  },
  {
    question: "Which of the following is a classic Liskov Substitution Principle violation?",
    options: [
      "A Dog class overrides speak() to return 'Woof' instead of 'Generic animal sound'",
      "A Square class extends Rectangle and overrides setWidth() to also set the height",
      "A Circle class implements a Shape interface with a draw() method",
      "A ReadOnlyList extends ArrayList and overrides add() to call the parent implementation"
    ],
    answer: 1,
    explanation: "Square violating LSP through Rectangle is the canonical example. If code sets width=5 and height=10 expecting area=50, a Square (where setWidth also sets height) breaks that expectation. Subtypes must be substitutable for their base types without altering correctness."
  },
  {
    question: "A `Worker` interface has methods: `work()`, `eat()`, and `sleep()`. A `RobotWorker` class implements it but throws UnsupportedOperationException for eat() and sleep(). Which principle is violated?",
    options: [
      "Single Responsibility Principle",
      "Open/Closed Principle",
      "Liskov Substitution Principle",
      "Interface Segregation Principle"
    ],
    answer: 3,
    explanation: "ISP states clients should not be forced to depend on methods they do not use. RobotWorker is forced to implement biological methods it cannot support. The fix is to split Worker into Workable, Eatable, and Sleepable interfaces."
  },
  {
    question: "Which design accurately follows the Dependency Inversion Principle?",
    options: [
      "class OrderService { private MySQLDatabase db = new MySQLDatabase(); }",
      "class OrderService { private Database db; public OrderService(Database db) { this.db = db; } }",
      "class OrderService extends MySQLDatabase { }",
      "class OrderService { public void save() { new MySQLDatabase().save(); } }"
    ],
    answer: 1,
    explanation: "DIP requires high-level modules to depend on abstractions, not concretions. Injecting a Database interface (abstraction) via the constructor means OrderService is decoupled from any specific database implementation."
  },
  {
    question: "Spring's dependency injection framework primarily supports which SOLID principle?",
    options: [
      "Single Responsibility Principle",
      "Open/Closed Principle",
      "Interface Segregation Principle",
      "Dependency Inversion Principle"
    ],
    answer: 3,
    explanation: "Spring DI enforces the Dependency Inversion Principle by injecting abstractions (interfaces) into dependent classes rather than having them instantiate concrete implementations directly."
  },
  {
    question: "In Spring, what SOLID principle does the @Autowired annotation most directly relate to?",
    options: [
      "Single Responsibility Principle — it splits concerns across beans",
      "Open/Closed Principle — it allows extending beans without modifying them",
      "Dependency Inversion Principle — it injects abstractions via IoC",
      "Liskov Substitution Principle — it ensures bean substitutability"
    ],
    answer: 2,
    explanation: "@Autowired performs dependency injection, which is the mechanism Spring uses to implement DIP. The container resolves and injects the correct implementation of an interface at runtime, so high-level classes depend on abstractions, not concretions."
  },
  {
    question: "The Strategy pattern lets you swap algorithms at runtime without changing the client. Which SOLID principle does this most directly enable?",
    options: [
      "Single Responsibility Principle",
      "Open/Closed Principle",
      "Liskov Substitution Principle",
      "Dependency Inversion Principle"
    ],
    answer: 1,
    explanation: "Strategy enables OCP: you can add new algorithms (extend) without modifying the client class (closed for modification). Each strategy is a separate class encapsulating one algorithm."
  },
  {
    question: "Abstract Factory provides an interface for creating families of related objects without specifying their concrete classes. Which SOLID principle does this primarily support?",
    options: [
      "Single Responsibility Principle",
      "Open/Closed Principle",
      "Liskov Substitution Principle",
      "Dependency Inversion Principle"
    ],
    answer: 3,
    explanation: "Abstract Factory supports DIP: clients depend on the abstract factory interface rather than concrete factory implementations. High-level code creates objects through an abstraction, remaining decoupled from concrete types."
  },
  {
    question: "A subclass overrides a method from its parent class and throws UnsupportedOperationException instead of implementing the behavior. Which principle does this most directly violate?",
    options: [
      "Single Responsibility Principle",
      "Open/Closed Principle",
      "Liskov Substitution Principle",
      "Interface Segregation Principle"
    ],
    answer: 2,
    explanation: "Throwing UnsupportedOperationException in a subclass violates LSP because the subclass can no longer be substituted for the parent without breaking the caller. Code that handles the parent type expects the method to work, and the exception destroys that guarantee. java.util.Stack extending Vector is a real-world example."
  }
]
</script>

# SOLID Principles Quiz

Test your understanding of the five SOLID design principles and how they apply in real Java and Spring code.

<Quiz :questions="questions" />

---

Need a refresher? Review the [SOLID Principles study page](/principles/solid).
