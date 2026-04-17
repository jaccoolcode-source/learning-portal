---
title: Java Core Quiz
---

<script setup>
const questions = [
  {
    question: "What is the contract between equals() and hashCode() in Java?",
    options: [
      "If a.equals(b) is true, then a.hashCode() must equal b.hashCode()",
      "If a.hashCode() == b.hashCode(), then a.equals(b) must be true",
      "equals() and hashCode() are independent — no relationship required",
      "hashCode() must always return a unique value per object"
    ],
    answer: 0,
    explanation: "The contract states: if two objects are equal (equals() returns true), they MUST have the same hash code. The reverse is not required — two objects can share a hash code without being equal (hash collision). Violating this breaks HashMap, HashSet, and all hash-based collections."
  },
  {
    question: "What does String.intern() do?",
    options: [
      "Creates a new String object in the heap",
      "Returns a canonical reference from the String pool, adding it if absent",
      "Converts the String to an immutable byte array",
      "Marks the String for garbage collection"
    ],
    answer: 1,
    explanation: "intern() checks the String pool for an equal string. If found, returns that reference; if not, adds this string to the pool and returns its reference. Useful to reduce memory when many equal strings exist, but rarely needed in modern Java — the JVM automatically pools string literals."
  },
  {
    question: "Why is String immutable in Java?",
    options: [
      "To prevent NullPointerExceptions",
      "Because the JVM requires it for bytecode compilation",
      "For security (e.g. passwords, class names), caching hashCode, and safe sharing across threads",
      "To allow the + operator for concatenation"
    ],
    answer: 2,
    explanation: "String immutability serves several purposes: security (passwords and class-loading names can't be altered after validation), safe use as HashMap keys (hashCode is computed once and cached), and safe sharing across threads without synchronisation. Immutability is a design decision, not a JVM requirement."
  },
  {
    question: "What does type erasure mean for Java generics?",
    options: [
      "Generic types are checked at both compile time and runtime",
      "Type parameters are replaced with Object (or bounds) at compile time and lost at runtime",
      "Generics only work with primitive types",
      "The compiler removes unused generic parameters from bytecode"
    ],
    answer: 1,
    explanation: "Type erasure means List<String> and List<Integer> both become List (raw type) in bytecode. Type parameters are replaced with their upper bound (Object if unbounded, or the bound class). This is why you can't do 'new T()' or 'instanceof List<String>' at runtime — the type information is gone."
  },
  {
    question: "What is the difference between List<? extends Animal> and List<? super Animal>?",
    options: [
      "extends = read-only (producer), super = write-only (consumer) — PECS principle",
      "extends allows writes, super allows reads",
      "Both allow reads and writes — they differ only in inheritance direction",
      "extends is for interfaces, super is for abstract classes"
    ],
    answer: 0,
    explanation: "PECS: Producer Extends, Consumer Super. List<? extends Animal> is a producer — you can read Animals from it, but can't add (compiler doesn't know the exact subtype). List<? super Animal> is a consumer — you can add Animals into it, but reads return Object. Classic example: Collections.copy(dest=super, src=extends)."
  },
  {
    question: "What is the difference between Comparable and Comparator?",
    options: [
      "Comparable defines the natural order inside the class; Comparator defines an external order",
      "Comparable is for primitives; Comparator is for objects",
      "Comparable is thread-safe; Comparator is not",
      "There is no difference — they are interchangeable"
    ],
    answer: 0,
    explanation: "Comparable (compareTo method) is implemented by the class itself to define its natural ordering — e.g. String, Integer implement Comparable. Comparator is a separate strategy object defining an alternative or external ordering, passed to sort methods or TreeMap/TreeSet constructors. A class can have one natural order but many Comparators."
  },
  {
    question: "Which of the following is a checked exception?",
    options: [
      "NullPointerException",
      "IllegalArgumentException",
      "IOException",
      "ArrayIndexOutOfBoundsException"
    ],
    answer: 2,
    explanation: "Checked exceptions extend Exception (not RuntimeException) and must be declared in the method signature with 'throws' or caught. IOException, SQLException, and ClassNotFoundException are classic examples. NullPointerException, IllegalArgumentException, and ArrayIndexOutOfBoundsException are unchecked (extend RuntimeException) — no declaration required."
  },
  {
    question: "What is the output of: String a = \"hello\"; String b = \"hello\"; System.out.println(a == b);",
    options: [
      "false — two different String objects",
      "true — both reference the same String pool entry",
      "Compilation error",
      "It depends on the JVM implementation"
    ],
    answer: 1,
    explanation: "String literals are automatically interned — the JVM puts them in the String pool and reuses the same reference. Both 'a' and 'b' point to the same pool entry, so == returns true. However, 'new String(\"hello\") == new String(\"hello\")' would return false because new forces heap allocation outside the pool."
  },
  {
    question: "What is the difference between static initializer blocks and instance initializer blocks?",
    options: [
      "Static blocks run once when the class is loaded; instance blocks run each time an object is created (before the constructor)",
      "Static blocks run after constructors; instance blocks run before",
      "They are identical — both run when an object is created",
      "Static blocks run in reverse class hierarchy order; instance blocks run in forward order"
    ],
    answer: 0,
    explanation: "A static { } block runs exactly once when the class is first loaded by the classloader — useful for complex static field initialisation. An instance { } block runs every time an object is created, before the constructor body but after super(). Instance blocks are copied into every constructor by the compiler."
  },
  {
    question: "What happens if you override equals() but not hashCode()?",
    options: [
      "Compilation error",
      "Works fine — hashCode is independent",
      "HashMap/HashSet will fail to find objects that are 'equal' by equals()",
      "equals() will always return false"
    ],
    answer: 2,
    explanation: "If you override equals() but not hashCode(), two 'equal' objects may have different hash codes. HashMap and HashSet first look in the bucket determined by hashCode — if equal objects land in different buckets, the map/set will never find the 'duplicate'. This breaks contains(), get(), and put() semantics silently."
  },
  {
    question: "What does the 'final' keyword mean when applied to a reference variable?",
    options: [
      "The object itself becomes immutable",
      "The variable cannot be reassigned to point to a different object",
      "The object cannot be garbage collected",
      "All methods on the object become thread-safe"
    ],
    answer: 1,
    explanation: "final on a reference variable means you cannot reassign the variable — it must always point to the same object. The object itself can still be mutated (e.g. adding to a final List is fine). For true immutability, the object's internals must also be made immutable (final fields, defensive copies)."
  },
  {
    question: "What is the purpose of Object.wait() and what must be true before calling it?",
    options: [
      "Pauses the thread for a fixed time; no precondition required",
      "Releases the CPU; must be called on the current thread object",
      "Causes the thread to wait until notified; must be called while holding the object's monitor (inside synchronized block)",
      "Blocks until another thread calls sleep() on the same object"
    ],
    answer: 2,
    explanation: "wait() must be called inside a synchronized block/method on the same object — otherwise IllegalMonitorStateException is thrown. When called, the thread releases the lock and waits until notify() or notifyAll() is called on the same object. Always use wait() in a loop checking a condition, not an if-statement, to handle spurious wakeups."
  },
  {
    question: "Can a constructor be private? What is this useful for?",
    options: [
      "No — constructors must be public or package-private",
      "Yes — used in Singleton pattern, factory methods, and utility classes",
      "Yes — but only in abstract classes",
      "Yes — but only when the class has no subclasses"
    ],
    answer: 1,
    explanation: "Private constructors are valid and serve several purposes: Singleton (only one instance, created internally), static factory method pattern (control over instance creation), utility classes (prevent instantiation — e.g. java.lang.Math), and builder pattern inner classes. The Enum type also uses private constructors implicitly."
  },
  {
    question: "What is covariant return type in Java?",
    options: [
      "A return type that can be null",
      "An overriding method can declare a more specific (subtype) return type than the overridden method",
      "A method that returns a generic type parameter",
      "A return type that matches the parameter type"
    ],
    answer: 1,
    explanation: "Since Java 5, an overriding method may return a subtype of the parent method's return type. E.g. if Animal has clone() returning Object, Dog can override it returning Dog. This avoids casting at the call site. The JVM handles this via a bridge method generated by the compiler."
  },
  {
    question: "What is the difference between shallow copy and deep copy?",
    options: [
      "Shallow copy duplicates primitive fields only; deep copy also copies reference fields",
      "Shallow copy creates a new object copying field values (references point to same objects); deep copy recursively copies referenced objects too",
      "They are equivalent for immutable objects only",
      "Shallow copy is performed by clone(); deep copy requires serialisation"
    ],
    answer: 1,
    explanation: "Shallow copy creates a new object and copies field values — primitive fields are duplicated, but reference fields still point to the same objects as the original. Deep copy recursively copies all referenced objects, producing a fully independent clone. Object.clone() performs a shallow copy by default; deep copy must be implemented manually or via serialisation."
  }
]
</script>

# Java Core Quiz

Test your understanding of Java fundamentals — `equals`/`hashCode`, Strings, generics, exceptions, and core language features.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Java Core pages](/java-core/) and [Collections](/collections/).
