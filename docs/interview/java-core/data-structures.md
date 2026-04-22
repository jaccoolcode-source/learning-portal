# Data Structures & Core Classes

**Part I — Q1 to Q7** · [← Core Java Overview](./index)

---

## Q1: How does HashMap work internally?

> The #1 most asked Core Java interview question.

HashMap stores key-value pairs in an internal `Node<K,V>[]` array called `table`. Each array slot is a **bucket**. The index for any key is computed from its hash. Collisions are handled first with a linked list, then upgraded to a red-black tree above a threshold.

```java
static class Node<K,V> {
    int hash;
    K key;
    V value;
    Node<K,V> next;  // linked list for collisions
}
```

**Key numbers to know:**
- Default initial capacity: **16**
- Default load factor: **0.75** (resize when 75% full)
- Treeify threshold: **8** nodes → linked list converts to red-black tree
- Untreeify threshold: **6** nodes → tree reverts to linked list
- Min treeify capacity: **64** (below this, HashMap resizes instead of treeifying)

::: details Full model answer

**`put(key, value)` — step by step**

1. If key is `null` → bucket index 0 (HashMap allows one null key; ConcurrentHashMap does NOT)
2. Compute perturbed hash: `hash = hashCode ^ (hashCode >>> 16)` — mixes upper and lower 16 bits to reduce collisions when capacity is small
3. Bucket index: `index = hash & (capacity - 1)` — equivalent to `hash % capacity` but faster; this is why capacity must be a power of 2
4. If bucket is empty → place new Node, done
5. If bucket is occupied (collision) → iterate nodes, check hash + reference + equals in that order:
   - Match found → replace existing value, return old value
   - No match → add new Node at the **tail** (Java 8+ uses tail insertion)

**`get(key)` process:** compute hash, calculate index, iterate bucket nodes comparing hash + equals.

**Java version evolution:**
| Version | Change |
|---------|--------|
| Java 1.2 | HashMap introduced, head insertion, linked list only |
| Java 7 | Still head insertion — **critical bug**: concurrent resize could create cyclic linked list → infinite loop on `get()` |
| Java 8 | Tail insertion (fixes cyclic list), treeification at threshold 8, clever rehashing (one bit check to determine new position) |
| Java 9–17 | No structural changes, minor serialization improvements |
| Java 21 | Added `SequencedMap` interface to `LinkedHashMap` — `getFirst()`/`getLast()` methods |

**Resize / Rehashing:**
When `size > capacity * loadFactor` (default: 12 elements), HashMap doubles the table. Java 8 optimization: since capacity doubled, each element either stays at the same index or moves to `oldIndex + oldCapacity` — determinable by checking just one bit of the hash.

Pre-size when you know the expected count: `new HashMap<>(expectedSize / 0.75 + 1)`

**hashCode/equals contract:**
1. `a.equals(b)` → `a.hashCode() == b.hashCode()` (mandatory)
2. Same hashCode does NOT mean equal (collisions are allowed)
3. If you override `equals()`, you MUST override `hashCode()`

Breaking the contract: overriding `equals()` without `hashCode()` means two logically equal objects land in different buckets → `map.get()` returns `null` even though the element is there.

**Thread safety alternatives:**
- `HashMap` — NOT thread-safe
- `Collections.synchronizedMap()` — locks the entire map (simple but slow under contention)
- `ConcurrentHashMap` — per-bucket locking (CAS for empty buckets, synchronized on first node for collisions); does NOT allow null keys or values

:::

> [!TIP] Golden Tip
> Mention these four points to stand out: **(1)** Java 7 infinite loop bug with head insertion, **(2)** treeification at threshold 8 and why (probability < 0.00000006 with a good hash function), **(3)** resize cost and `initialCapacity` optimization trick, **(4)** the hashCode/equals contract and what breaks when you violate it.

**Follow-up questions:**
- What happens if two keys have the same hashCode?
- Can HashMap cause an infinite loop? *(Yes — Java 7, concurrent resize)*
- Why is ConcurrentHashMap preferred over synchronizedMap?
- What's the difference between HashMap and LinkedHashMap?

---

## Q2: `==` vs `equals()` and the hashCode contract

> Almost always asked. Gets surprisingly many wrong answers.

`==` compares **references** (memory addresses) for objects. `equals()` compares **content** — but only if overridden. The default `Object.equals()` is just `==`.

```java
String s1 = new String("hello");
String s2 = new String("hello");
s1 == s2;       // false — different objects in heap
s1.equals(s2);  // true  — same content

// String pool edge case:
String s3 = "hello";
String s4 = "hello";
s3 == s4;       // true — both reference the same pool entry
```

::: details Full model answer

**The `==` operator:**
- Primitives (`int`, `double`, etc.): compares **values** — `5 == 5` is true
- Objects: compares **references** — checks if both variables point to the same object in memory

**`equals()` method:**
The default implementation in `java.lang.Object` is just reference comparison (`this == obj`). Most standard library classes override it for content comparison: `String`, `Integer`, `List`, etc. For your own classes you must override it yourself.

**Correct `equals()` override:**
```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;                      // same reference → equal
    if (o == null || getClass() != o.getClass()) return false;  // null or wrong type
    Person person = (Person) o;
    return age == person.age && Objects.equals(name, person.name);
}
```

**The hashCode contract:**
1. Equal objects MUST have the same hashCode
2. Same hashCode does NOT require equality (collisions are OK)
3. hashCode must be consistent — same object, same result (assuming no state change)

**Classic bug — breaking the contract:**
```java
Person p1 = new Person("Jan");
Map<Person, String> map = new HashMap<>();
map.put(p1, "developer");  // hashCode(p1) → bucket 5

Person p2 = new Person("Jan");
map.get(p2);  // returns NULL!
// equals() says p1 == p2, but different hashCodes → different buckets
// equals() is never even called
```

**Best key practices:**
- Use immutable objects as keys — `String` is ideal (immutable, hashCode cached after first call)
- Java 16+ `record` types auto-generate correct `equals()` and `hashCode()` — perfect keys with zero boilerplate
- Never use a mutable object as a key and then modify it — its hashCode changes and the entry becomes "invisible"

:::

> [!TIP] Golden Tip
> Give the concrete `Person` + `HashMap` bug example — it shows you've hit this in practice. Then mention that Java 16+ records auto-generate correct `equals()` and `hashCode()`, making them excellent HashMap keys with zero boilerplate.

**Follow-up questions:**
- What is `String.intern()` and when would you use it?
- Why is `String` cached in the String pool but `new String("x")` is not?
- Can you use a mutable object as a HashMap key?

---

## Q3: ArrayList vs LinkedList

> The answer is almost always "use ArrayList". The interesting part is *why*.

Both implement `List`. The real difference is internal structure — `ArrayList` is a dynamic array; `LinkedList` is a doubly-linked list of nodes scattered in heap memory.

| Operation | ArrayList | LinkedList |
|-----------|-----------|------------|
| `get(index)` | **O(1)** | O(n) |
| `add()` at end | **O(1)** amortized | O(1) |
| `add(index, e)` middle | O(n) | O(n)† |
| `remove(index)` | O(n) | O(n)† |
| Memory per element | compact | +16–24 bytes (prev/next refs) |
| CPU cache behaviour | **excellent** | poor (nodes scattered in heap) |

†O(n) to find the position, O(1) to update pointers.

::: details Full model answer

**ArrayList internals:**
- Backed by `Object[]`, default initial capacity 10
- When full, grows to `oldCapacity + (oldCapacity >> 1)` — approximately 1.5×
- `get(index)` is O(1): address = `baseAddress + index * elementSize`
- `add()` at end is amortized O(1) — occasional O(n) copy on growth, but rare
- `add(index, e)` in middle: must shift all subsequent elements right → O(n)
- **CPU cache locality**: contiguous memory means the CPU prefetches adjacent elements efficiently. This is a massive real-world advantage not captured by Big-O.

**LinkedList internals:**
```java
// Each element is wrapped in a Node
private static class Node<E> {
    E item;
    Node<E> next;
    Node<E> prev;
}
```
- `get(index)` is O(n): must traverse from head or tail
- `add()` at head/tail: O(1) — just update 2 pointers
- Higher memory overhead: each element needs an extra `Node` object with two references (~16–24 extra bytes per element depending on JVM)
- Nodes are scattered in heap → frequent CPU cache misses → poor real-world performance even when Big-O looks the same

**When to use which:**
- **ArrayList** — the right choice ~95% of the time. Random access, iteration, most general-purpose use.
- **LinkedList** — rarely justified. Only consider it if you need a `Deque`/`Queue` and do very frequent insertions/removals at both ends. But `ArrayDeque` is usually better even then.

:::

> [!TIP] Golden Tip
> Quote Joshua Bloch (author of `LinkedList`): *"Does anyone actually use LinkedList? I wrote it, and I never use it."* This shows you understand that theoretical Big-O doesn't always match real-world performance — **CPU cache locality makes ArrayList win in almost every practical scenario.**

**Follow-up questions:**
- When would you choose `ArrayDeque` over `LinkedList`?
- What is the growth factor of ArrayList and why?
- How does memory layout affect iteration performance?

---

## Q4: String vs StringBuilder vs StringBuffer

> String is immutable; StringBuilder is mutable and fast; StringBuffer is synchronized (rarely used).

```java
// BAD — creates a new String object on every iteration
String result = "";
for (int i = 0; i < 1000; i++) {
    result += i + ",";  // new String each time!
}

// GOOD — one mutable object modified in place
StringBuilder sb = new StringBuilder();
for (int i = 0; i < 1000; i++) {
    sb.append(i).append(",");
}
String result = sb.toString();
```

::: details Full model answer

**String — immutable:**
Every "modification" creates a new `String` object. The original is unchanged.

Why is String immutable?
1. **Thread safety** — immutable objects are inherently thread-safe
2. **Security** — Strings hold class names, URLs, credentials; mutability would be dangerous
3. **hashCode caching** — String caches its `hashCode` after the first call; since content never changes, it's always valid → makes String an excellent HashMap key
4. **String pool** (see below)

**String Pool:**
A special heap area storing unique String literals. `"hello"` literals share the same object; `new String("hello")` always creates a new heap object outside the pool.
```java
String s1 = "hello";              // from pool
String s2 = "hello";              // same pool entry → s1 == s2 is TRUE
String s3 = new String("hello");  // new heap object → s1 == s3 is FALSE
String s4 = s3.intern();          // adds to pool / returns pool ref → s1 == s4 TRUE
```
**Rule:** always use `equals()` for String comparison, never `==`.

**StringBuilder — mutable, not thread-safe:**
Modifies the internal `char[]` / `byte[]` in place. Use inside a single method (single thread).

**StringBuffer — mutable, thread-safe:**
All methods are `synchronized`. Slower due to locking overhead. Rarely used in modern Java — if you're building strings across threads, there are better concurrent utilities.

**Compiler optimization history:**
| Version | What the compiler does with `+` |
|---------|--------------------------------|
| Pre-Java 9 | Converts `a + b + c` to `new StringBuilder().append(a).append(b).append(c).toString()` — but creates a **new** StringBuilder on each loop iteration |
| Java 9+ | Uses `invokedynamic` + `StringConcatFactory` — JVM picks the optimal strategy at runtime (faster). Loop problem still exists — explicit StringBuilder recommended in loops. |
| Java 9+ (Compact Strings) | Internal storage changed from `char[]` (2 bytes/char) to `byte[]` (1 byte/char for Latin-1). Halves memory for ASCII strings. Non-Latin-1 strings still use 2 bytes/char, indicated by a `coder` field. |

:::

> [!TIP] Golden Tip
> Mention three things interviewers love: **(1)** String pool — why `"hello" == "hello"` is true but `new String("hello") == "hello"` is false. **(2)** `invokedynamic` + `StringConcatFactory` since Java 9. **(3)** Compact Strings (`byte[]` instead of `char[]`) since Java 9. These show JVM internals knowledge.

**Follow-up questions:**
- Why is `String` declared `final`?
- What does `String.intern()` do and when is it useful?
- What's the difference between the String pool and the heap?

---

## Q5: The `final` keyword

> `final` means different things depending on where you use it. The reference trap is the most common interview trick.

```java
// final primitive — value cannot change
final int MAX = 100;
MAX = 200;  // COMPILATION ERROR

// final reference — REFERENCE cannot change, but object CAN be modified
final List<String> list = new ArrayList<>();
list.add("hello");    // ALLOWED — modifying the object
list = new ArrayList<>();  // COMPILATION ERROR — changing the reference
```

::: details Full model answer

**final variables:**
- Primitive: value cannot change after initialization — it becomes a constant
- Reference: the reference cannot point to a different object, but **the object itself can still be mutated**
- Must be initialized exactly once: at declaration, in an instance initializer, or in every constructor path

**final methods:**
Cannot be overridden by subclasses. Used when a method's behaviour must be preserved:
```java
public class BankAccount {
    public final void validateTransaction(Transaction t) {
        // critical validation — no subclass can override this
    }
}
```

**final classes:**
Cannot be extended. `String`, `Integer`, and all wrapper classes are final — ensures immutability and security (no malicious subclass can override behaviour).
```java
public final class String { ... }  // cannot extend String
```

**Effectively final (Java 8+):**
A variable not declared `final` but never reassigned. Lambda expressions and anonymous classes can only capture effectively final variables:
```java
String name = "Jan";  // effectively final — never reassigned
Runnable r = () -> System.out.println(name);  // OK

String name2 = "Jan";
name2 = "Anna";  // reassigned → no longer effectively final
Runnable r2 = () -> System.out.println(name2);  // COMPILATION ERROR
```

**JVM optimization:**
The JIT compiler can inline `final` methods and treat `final` fields as compile-time constants, enabling additional optimizations.

:::

> [!TIP] Golden Tip
> Three points: **(1)** `final` reference ≠ immutable object — the object's state can still change. **(2)** "effectively final" for lambdas (Java 8+). **(3)** JIT can inline `final` methods and treat `final` fields as constants — there's a performance benefit.

**Follow-up questions:**
- What is the difference between `final` and immutable?
- Why can a lambda capture an effectively final variable but not a reassigned one?
- Can a `final` class have non-final fields?

---

## Q6: The `static` keyword

> `static` means "belongs to the class, not to any instance." One copy, shared by all.

```java
public class User {
    private static int totalUsers = 0;  // ONE copy, shared across all instances
    private String name;                // each instance has its own

    public User(String name) {
        this.name = name;
        totalUsers++;  // modifies the shared counter
    }
}
```

::: details Full model answer

**static fields:**
- Exactly one copy shared by all instances
- Stored in **Metaspace** (Java 8+; previously PermGen)
- Initialized when the class is first loaded by the ClassLoader
- Lives as long as the ClassLoader lives (typically the application lifetime)

**static methods:**
- Can be called without creating an instance: `Math.sqrt(16)`
- Cannot access instance fields or methods — no `this` reference
- Cannot be overridden polymorphically — **method hiding** instead:

```java
class Parent { static void greet() { System.out.println("Parent"); } }
class Child extends Parent { static void greet() { System.out.println("Child"); } }

Parent p = new Child();
p.greet();  // prints "Parent"! (compile-time type determines the call)
```
This is **early binding** (resolved at compile time) vs instance method **late binding** (resolved at runtime via vtable).

**static blocks:**
Run once when the class is first loaded, before any constructor. Used for complex initialization:
```java
public class DatabaseConfig {
    private static final Map<String, String> DEFAULTS;

    static {
        DEFAULTS = new HashMap<>();
        DEFAULTS.put("host", "localhost");
        DEFAULTS.put("port", "5432");
    }
}
```

**static nested classes:**
A `static` nested class does NOT hold a reference to the outer class instance. Non-static inner classes implicitly hold this reference → can prevent the outer class from being garbage collected (memory leak).

Always prefer static nested classes unless you specifically need access to the outer class's instance members.

**Memory leak risk:**
In application servers with multiple ClassLoaders (hot-deploying WAR files), static fields can prevent ClassLoader garbage collection, causing `OutOfMemoryError` over time.

:::

> [!TIP] Golden Tip
> Two power moves: **(1)** mention the ClassLoader memory leak — static fields in hot-deployed applications can prevent GC of the old ClassLoader. **(2)** explain that static methods use early binding (compile time), which is why they can't be overridden polymorphically — this shows deep understanding of how the JVM resolves method calls.

**Follow-up questions:**
- What is the difference between a static nested class and an inner class?
- Can static methods be synchronized?
- Why can't you call `super` on a static method?

---

## Q7: Comparable vs Comparator

> `Comparable` is the natural order baked into the class. `Comparator` is an external, swappable ordering strategy.

```java
// Comparable — one natural order, defined inside the class
public class Employee implements Comparable<Employee> {
    @Override
    public int compareTo(Employee other) {
        return this.name.compareTo(other.name);  // natural order: alphabetical by name
    }
}
Collections.sort(employees);  // uses compareTo() automatically

// Comparator — multiple orderings, defined outside
Comparator<Employee> bySalary = Comparator.comparing(Employee::getSalary);
Comparator<Employee> byName   = Comparator.comparing(Employee::getName);
employees.sort(bySalary);
employees.sort(byName);
```

::: details Full model answer

**`Comparable<T>`:**
- Interface with one method: `int compareTo(T other)`
- Return convention: negative (this < other), zero (equal), positive (this > other)
- Implemented by the class itself — defines its "natural" ordering
- `String` (alphabetical), `Integer` (numerical), `LocalDate` (chronological)
- A class can have only **one** natural ordering

**`Comparator<T>`:**
- Separate interface — ordering defined outside the class
- Create multiple Comparators for the same class, each with different logic
- Useful when: you can't modify the class (third-party library), you need multiple orderings, or ordering depends on context

**Modern Comparator API (Java 8+):**
```java
// Single field
Comparator.comparing(Employee::getSalary)

// Multi-level sort
Comparator.comparing(Employee::getDepartment)
    .thenComparing(Employee::getSalary, Comparator.reverseOrder())
    .thenComparing(Employee::getName)
// sort by department ascending, then salary descending, then name ascending

// Null handling
Comparator.nullsFirst(Comparator.comparing(Employee::getName))
Comparator.nullsLast(Comparator.naturalOrder())

// Reverse
Comparator.comparing(Employee::getSalary).reversed()
```

**`compareTo` consistency with `equals`:**
If `a.compareTo(b) == 0`, then `a.equals(b)` should ideally be `true`. Inconsistency causes problems in `TreeSet` and `TreeMap` — an element can appear to be "not there" because the tree navigation uses `compareTo`, but `contains()` in some contexts uses `equals`.

**When to use which:**
- `Comparable`: one obvious natural ordering baked into the domain model
- `Comparator`: multiple orderings, third-party classes, context-dependent sorting

:::

> [!TIP] Golden Tip
> Show fluency with `Comparator.comparing().thenComparing()` chains — it signals modern Java style. Also mention `compareTo` consistency with `equals`: violating it causes silent bugs in `TreeSet` and `TreeMap`.

**Follow-up questions:**
- What happens if `compareTo` is inconsistent with `equals` in a `TreeSet`?
- Can you sort a `List` that contains `null` elements?
- What does `Integer.compare(a, b)` do and why is it safer than `a - b`?
