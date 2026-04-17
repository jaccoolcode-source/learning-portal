---
title: Modern Java Quiz
---

<script setup>
const questions = [
  {
    question: "Which of the following is a valid functional interface?",
    options: [
      "An interface with two abstract methods and one default method",
      "An interface with exactly one abstract method (and any number of default/static methods)",
      "Any interface that extends Runnable",
      "An abstract class with one abstract method"
    ],
    answer: 1,
    explanation: "A functional interface has exactly one abstract method — this is what makes it usable as a lambda target. It can have any number of default and static methods. @FunctionalInterface annotation is optional but recommended — it causes a compile error if the contract is violated. Examples: Runnable, Callable, Predicate, Function, Supplier, Consumer."
  },
  {
    question: "What is the difference between Stream.map() and Stream.flatMap()?",
    options: [
      "map() is for primitives, flatMap() is for objects",
      "map() transforms each element 1-to-1; flatMap() transforms each element to a stream and flattens the result",
      "flatMap() filters null values; map() does not",
      "map() is a terminal operation; flatMap() is intermediate"
    ],
    answer: 1,
    explanation: "map(f) applies function f to each element, producing a Stream<R> of the same size. flatMap(f) applies f to each element to get a Stream<R> per element, then flattens all those streams into one. Classic use case: flatMap(list -> list.stream()) to turn a Stream<List<T>> into a Stream<T>."
  },
  {
    question: "What is the difference between Optional.orElse() and Optional.orElseGet()?",
    options: [
      "orElse() throws if the value is absent; orElseGet() returns null",
      "orElse(value) always evaluates value; orElseGet(supplier) only evaluates the supplier if the value is absent",
      "They are identical in behaviour",
      "orElseGet() is deprecated in Java 17+"
    ],
    answer: 1,
    explanation: "orElse(value) evaluates the default value expression eagerly — even if the Optional is present, the expression is evaluated. orElseGet(supplier) is lazy — the supplier is only called when the Optional is empty. Use orElseGet for expensive defaults (DB calls, object construction) to avoid unnecessary computation."
  },
  {
    question: "Which Stream operations are lazy (intermediate) vs eager (terminal)?",
    options: [
      "filter(), map(), sorted() are terminal; collect(), count(), forEach() are intermediate",
      "filter(), map(), sorted() are intermediate; collect(), count(), forEach() are terminal",
      "All Stream operations are lazy until toList() is called",
      "Laziness only applies to parallel streams"
    ],
    answer: 1,
    explanation: "Intermediate operations (filter, map, sorted, distinct, limit, skip, flatMap, peek) are lazy — they build a pipeline but execute nothing until a terminal operation is called. Terminal operations (collect, count, forEach, findFirst, anyMatch, reduce, toList) trigger the pipeline. This means Stream.of(1,2,3).filter(x->x>0) does nothing until a terminal op is added."
  },
  {
    question: "What does 'var' do in Java 10+?",
    options: [
      "Declares a variable without any type — equivalent to JavaScript's var",
      "Enables local variable type inference — the compiler infers the static type from the initialiser",
      "Creates a dynamically typed variable that can change type at runtime",
      "Declares a nullable reference variable"
    ],
    answer: 1,
    explanation: "var enables local variable type inference. The compiler infers the concrete static type from the right-hand side — it's not dynamic typing. 'var list = new ArrayList<String>()' is exactly equivalent to 'ArrayList<String> list = new ArrayList<>()'. var can only be used for local variables with an initialiser, not fields, parameters, or return types."
  },
  {
    question: "What is a Java Record (Java 16+)?",
    options: [
      "A mutable data class that auto-generates toString()",
      "An immutable data carrier that auto-generates constructor, getters, equals, hashCode, and toString from its components",
      "A database result set wrapper",
      "A class that records all method calls for auditing"
    ],
    answer: 1,
    explanation: "Records are concise immutable data classes. 'record Point(int x, int y) {}' automatically generates: a canonical constructor, accessor methods x() and y(), equals/hashCode based on all components, and toString. Fields are final. Records can't extend classes (they implicitly extend Record), but can implement interfaces. Equivalent to Kotlin data classes."
  },
  {
    question: "What is pattern matching for instanceof (Java 16+)?",
    options: [
      "Allows matching regex patterns on Strings",
      "Combines the instanceof check and cast into one expression, binding the result to a variable",
      "A new switch-based type dispatch mechanism only",
      "Allows instanceof to check generic type parameters at runtime"
    ],
    answer: 1,
    explanation: "Pattern matching eliminates the cast after instanceof: 'if (obj instanceof String s) { s.toUpperCase(); }' — if the check passes, s is already bound as String. Java 21 extends this to switch expressions with pattern matching: 'switch(shape) { case Circle c -> c.radius(); case Rectangle r -> r.width(); }'"
  },
  {
    question: "What is a sealed class (Java 17+)?",
    options: [
      "A class that cannot be instantiated",
      "A class whose direct subclasses are explicitly declared and restricted",
      "A class with all fields declared final",
      "A class that cannot be used as a generic type parameter"
    ],
    answer: 1,
    explanation: "A sealed class declares exactly which classes may extend it using 'permits'. This allows exhaustive pattern matching in switch — the compiler knows all possible subtypes. Each permitted subclass must be final, sealed, or non-sealed. Useful for algebraic data types: 'sealed interface Shape permits Circle, Rectangle, Triangle {}'"
  },
  {
    question: "What is the difference between Predicate.and() and Predicate.or()?",
    options: [
      "and() returns true if both predicates are true (short-circuits on false); or() returns true if either is true (short-circuits on true)",
      "and() evaluates both eagerly; or() is lazy",
      "They are identical — both combine predicates with logical AND",
      "and() is for primitive predicates; or() is for object predicates"
    ],
    answer: 0,
    explanation: "Predicate.and(other) combines with logical AND — short-circuits: if the first predicate returns false, other is not evaluated. Predicate.or(other) combines with logical OR — short-circuits: if first returns true, other is skipped. Predicate.negate() inverts the result. These allow building complex filter conditions: isActive.and(isAdmin).or(isSuperuser)."
  },
  {
    question: "What does CompletableFuture.thenCompose() do vs thenApply()?",
    options: [
      "thenApply transforms the result synchronously; thenCompose chains another CompletableFuture (flatMap for async)",
      "thenCompose runs on a different thread pool; thenApply runs on the caller thread",
      "They are identical — both chain asynchronous computations",
      "thenApply is for void returns; thenCompose is for non-void returns"
    ],
    answer: 0,
    explanation: "thenApply(fn) is like map — applies a function to the result synchronously, returning CompletableFuture<U>. thenCompose(fn) is like flatMap — the function itself returns a CompletableFuture<U>, avoiding a nested CompletableFuture<CompletableFuture<U>>. Use thenCompose when the next step is itself an async operation (another service call, DB query)."
  },
  {
    question: "What is the purpose of Stream.collect(Collectors.groupingBy(...))?",
    options: [
      "Filters the stream into groups based on a predicate",
      "Groups elements by a classifier function into a Map<K, List<V>>",
      "Sorts the stream by the given key",
      "Partitions the stream into exactly two groups: true and false"
    ],
    answer: 1,
    explanation: "Collectors.groupingBy(classifier) collects stream elements into a Map where keys are the result of the classifier function and values are Lists of elements with that key. E.g. orders.stream().collect(groupingBy(Order::getStatus)) produces Map<Status, List<Order>>. partitioningBy() is a special case that produces Map<Boolean, List<T>>."
  },
  {
    question: "What is a method reference? Which of these is a static method reference?",
    options: [
      "Integer::parseInt — references a static method",
      "String::length — references a static method",
      "System.out::println — references a static method",
      "list::add — references a static method"
    ],
    answer: 0,
    explanation: "Integer::parseInt is a static method reference (equivalent to x -> Integer.parseInt(x)). String::length is an instance method reference on an arbitrary instance (x -> x.length()). System.out::println is a bound instance method reference on a specific object. list::add is a bound instance method reference on a captured object. The four types: static, unbound instance, bound instance, constructor (ClassName::new)."
  },
  {
    question: "What is the switch expression (Java 14+) and how does it differ from the switch statement?",
    options: [
      "Switch expressions use -> syntax, return a value, are exhaustive (all cases must be covered), and don't fall through",
      "Switch expressions are identical to switch statements but support lambdas",
      "Switch expressions only work with Strings and enums",
      "Switch expressions replace if-else chains only"
    ],
    answer: 0,
    explanation: "Switch expressions (-> syntax) differ from switch statements in three ways: (1) they are expressions that return a value, (2) they don't fall through between cases — no break needed, (3) they must be exhaustive when used as an expression (all possible values covered, often requiring a default). yield is used in block cases to return a value."
  },
  {
    question: "What is a default method in an interface (Java 8+)?",
    options: [
      "A method with a default (package-private) visibility modifier",
      "A method with a body in an interface, inherited by implementing classes",
      "A constructor substitute for interfaces",
      "A method that returns a default value when the implementation is null"
    ],
    answer: 1,
    explanation: "Default methods (declared with 'default' keyword) allow interfaces to provide a method body. Implementing classes inherit the default implementation but can override it. This enabled adding methods to existing interfaces (like Collection.forEach, Iterable.forEach) without breaking all existing implementations — critical for evolving the Java standard library."
  },
  {
    question: "What does Stream.reduce() do?",
    options: [
      "Removes duplicate elements from the stream",
      "Reduces the stream size by filtering",
      "Combines all stream elements into a single value using an associative accumulator function",
      "Returns the minimum element of the stream"
    ],
    answer: 2,
    explanation: "reduce(identity, accumulator) folds all stream elements into a single value. E.g. stream.reduce(0, Integer::sum) sums all integers. The identity is the neutral element (0 for sum, 1 for product). The accumulator must be associative and stateless for parallel streams to work correctly. collect() is usually preferred over reduce for building collections."
  }
]
</script>

# Modern Java Quiz

Test your knowledge of Java 8–21 features — lambdas, streams, Optional, records, sealed classes, and pattern matching.

<Quiz :questions="questions" />

---

Need a refresher? Review [Modern Java (8–21)](/modern-java/) and [Java Core](/java-core/).
