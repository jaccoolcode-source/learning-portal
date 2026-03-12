---
title: Generics
description: Java generics from basics to wildcards, bounded type parameters, and type erasure
category: java-core
pageClass: layout-java-core
difficulty: intermediate
tags: [java, generics, wildcards, type-erasure, bounded-types]
related:
  - /collections/interfaces
  - /modern-java/java8
estimatedMinutes: 20
---

# Generics

<DifficultyBadge level="intermediate" />

Generics allow you to write type-safe code that works with different types without casting. They're everywhere in Java's Collections framework, Streams API, and Spring.

---

## Why Generics?

### Before generics (Java 1.4)

```java
List list = new ArrayList();
list.add("Hello");
list.add(42);  // no error!

String s = (String) list.get(1);  // ClassCastException at runtime!
```

### With generics (Java 5+)

```java
List<String> list = new ArrayList<>();
list.add("Hello");
list.add(42);  // compile error — caught early!

String s = list.get(0);  // no cast needed
```

---

## Generic Classes

```java
public class Box<T> {
    private T value;

    public Box(T value) { this.value = value; }
    public T get() { return value; }

    @Override
    public String toString() { return "Box[" + value + "]"; }
}

Box<String> stringBox = new Box<>("Hello");
Box<Integer> intBox = new Box<>(42);
```

---

## Generic Methods

```java
public class Utils {
    // T is inferred from arguments
    public static <T> List<T> repeat(T item, int times) {
        List<T> result = new ArrayList<>();
        for (int i = 0; i < times; i++) result.add(item);
        return result;
    }
}

List<String> strings = Utils.repeat("Java", 3);  // ["Java", "Java", "Java"]
```

---

## Bounded Type Parameters

### Upper bound — `extends`

```java
// T must be Number or a subtype (Integer, Double, etc.)
public static <T extends Number> double sum(List<T> list) {
    return list.stream().mapToDouble(Number::doubleValue).sum();
}

sum(List.of(1, 2, 3));       // works
sum(List.of(1.5, 2.5));     // works
sum(List.of("a", "b"));     // compile error
```

### Multiple bounds

```java
// T must implement both Comparable and Serializable
public <T extends Comparable<T> & Serializable> T max(T a, T b) {
    return a.compareTo(b) >= 0 ? a : b;
}
```

---

## Wildcards

Wildcards (`?`) express "some unknown type" and are used in method parameters.

### Unbounded wildcard `<?>`

```java
public void printList(List<?> list) {
    for (Object o : list) System.out.println(o);
}
// Can read as Object, cannot add anything (except null)
```

### Upper-bounded wildcard `<? extends T>` — **Producer Extends**

```java
// Read numbers from any list of Number subtype
public double sum(List<? extends Number> list) {
    return list.stream().mapToDouble(Number::doubleValue).sum();
}

sum(new ArrayList<Integer>());  // OK
sum(new ArrayList<Double>());   // OK
```

### Lower-bounded wildcard `<? super T>` — **Consumer Super**

```java
// Add Integers into any list that can hold them
public void addNumbers(List<? super Integer> list) {
    list.add(1);
    list.add(2);
}

addNumbers(new ArrayList<Integer>());  // OK
addNumbers(new ArrayList<Number>());   // OK
addNumbers(new ArrayList<Object>());   // OK
```

::: tip PECS — Producer Extends, Consumer Super
- If you only **read** from a collection → `? extends T` (producer)
- If you only **write** to a collection → `? super T` (consumer)
- If you do both → use the exact type `T`
:::

---

## Type Erasure

Generics are a **compile-time feature only**. At runtime, all generic type information is erased and replaced with `Object` (or the bound type).

```java
List<String> strings = new ArrayList<>();
List<Integer> ints = new ArrayList<>();

System.out.println(strings.getClass() == ints.getClass()); // true!
// Both are ArrayList at runtime
```

### Implications

```java
// Cannot do:
if (obj instanceof List<String>) { }   // compile error — can't check generic type
new T();                                // can't instantiate generic type
T[] array = new T[10];                 // can't create generic array

// Can do:
if (obj instanceof List<?>) { }       // unbounded wildcard OK
```

### Why was erasure chosen?

Backward compatibility with pre-Java-5 bytecode. The JVM never learned about generics — the compiler handles everything.

---

## Common Patterns

### Generic interface with multiple implementations

```java
public interface Converter<F, T> {
    T convert(F from);
}

Converter<String, Integer> toInt = Integer::parseInt;
Converter<Integer, String> toString = Object::toString;
```

### Bounded wildcards in APIs

```java
// Collections.copy signature — classic PECS example
public static <T> void copy(List<? super T> dest, List<? extends T> src)
```

---

## Quick Reference

| Syntax | Meaning | Read | Write |
|--------|---------|------|-------|
| `List<T>` | Exact type T | ✅ as T | ✅ |
| `List<?>` | Unknown type | ✅ as Object | ❌ |
| `List<? extends T>` | T or subtype | ✅ as T | ❌ |
| `List<? super T>` | T or supertype | ✅ as Object | ✅ T |

---

## Summary

- Generics provide compile-time type safety and eliminate casts.
- Use `<T extends Bound>` to restrict what types are allowed.
- Use `<? extends T>` when reading; `<? super T>` when writing (PECS).
- Types are erased at runtime — you can't check `instanceof List<String>`.

<RelatedTopics :topics="['/collections/interfaces', '/modern-java/java8', '/collections/implementations']" />
