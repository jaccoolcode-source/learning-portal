---
title: Prototype Pattern
description: Create new objects by copying (cloning) existing ones — Java clone(), copy constructors, and deep vs shallow copy
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [prototype, creational, java, clone, design-patterns]
related:
  - /design-patterns/creational/builder
  - /java-core/object-class
estimatedMinutes: 10
---

# Prototype Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Specify the kinds of objects to create using a prototypical instance, and create new objects by copying (cloning) this prototype.

---

## Problem

Creating an object from scratch is expensive (e.g., loading configuration, establishing a DB connection, doing complex calculations). You want to copy an existing ready instance instead.

---

## Using Cloneable

```java
public class NetworkConfig implements Cloneable {
    private String host;
    private int port;
    private List<String> allowedIPs;

    public NetworkConfig(String host, int port) {
        this.host = host;
        this.port = port;
        this.allowedIPs = new ArrayList<>();
    }

    // Shallow clone — allowedIPs list is shared!
    @Override
    public NetworkConfig clone() {
        try {
            return (NetworkConfig) super.clone();
        } catch (CloneNotSupportedException e) {
            throw new AssertionError(); // can't happen
        }
    }
}
```

::: warning Shallow vs Deep copy
`Object.clone()` is a **shallow copy** — it copies field values, but if a field is a reference type, both original and clone share the same underlying object. Mutating the list in one affects the other!
:::

### Deep clone

```java
@Override
public NetworkConfig clone() {
    try {
        NetworkConfig copy = (NetworkConfig) super.clone();
        copy.allowedIPs = new ArrayList<>(this.allowedIPs); // deep copy of list
        return copy;
    } catch (CloneNotSupportedException e) {
        throw new AssertionError();
    }
}
```

---

## Preferred: Copy Constructor

Java's `clone()` has well-documented issues (see [Object class](/java-core/object-class)). A copy constructor is cleaner:

```java
public class UserProfile {
    private String username;
    private String email;
    private Set<String> roles;

    // Copy constructor — explicit, null-safe, no casting
    public UserProfile(UserProfile other) {
        this.username = other.username;
        this.email    = other.email;
        this.roles    = new HashSet<>(other.roles); // deep copy
    }

    public UserProfile withRole(String role) {
        UserProfile copy = new UserProfile(this);
        copy.roles.add(role);
        return copy;
    }
}

// Usage
UserProfile admin = new UserProfile(baseUser).withRole("ADMIN");
```

---

## Prototype Registry

```java
public class ShapeRegistry {
    private final Map<String, Shape> prototypes = new HashMap<>();

    public void register(String name, Shape prototype) {
        prototypes.put(name, prototype);
    }

    public Shape get(String name) {
        return prototypes.get(name).clone(); // returns clone, not original
    }
}
```

---

## Real-World Examples

- `Object.clone()` — shallow copy
- Copy constructors in domain objects
- Spring's `BeanDefinition.cloneBeanDefinition()` — clone bean definitions
- `ArrayList` copy constructor: `new ArrayList<>(original)`
- Java Records (Java 16+) — `withers` can be added for immutable prototyping

---

## Summary

- Prototype clones existing objects instead of creating from scratch.
- Use copy constructors over `Cloneable` — explicit, type-safe, no exceptions.
- Always decide: shallow copy or deep copy for mutable fields?

<RelatedTopics :topics="['/design-patterns/creational/builder', '/java-core/object-class']" />
