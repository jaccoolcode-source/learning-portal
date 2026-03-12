---
title: KISS, DRY & YAGNI
description: Three software engineering heuristics that prevent over-engineering and keep codebases clean
category: principles
pageClass: layout-principles
difficulty: beginner
tags: [kiss, dry, yagni, clean-code, refactoring]
related:
  - /principles/oop
  - /principles/solid
estimatedMinutes: 10
---

# KISS, DRY & YAGNI

<DifficultyBadge level="beginner" />

If SOLID tells you *how* to design classes, these three heuristics tell you *when to stop*. They prevent the most common form of technical debt: unnecessary complexity.

---

## KISS — Keep It Simple, Stupid

> *"The simplest solution that works is almost always the best one."*

Complexity has a cost: harder to read, test, debug, and onboard. Before adding an abstraction, ask: *does this actually solve a real problem I have today?*

### ❌ Over-engineered

```java
public class StringProcessor {
    private final List<Function<String, String>> pipeline = new ArrayList<>();

    public StringProcessor addStep(Function<String, String> step) {
        pipeline.add(step);
        return this;
    }

    public String process(String input) {
        return pipeline.stream().reduce(Function.identity(), Function::andThen).apply(input);
    }
}

// Usage for... reversing a string
new StringProcessor().addStep(String::trim).addStep(s -> new StringBuilder(s).reverse().toString()).process("  hello  ");
```

### ✅ Simple

```java
String result = new StringBuilder("  hello  ".trim()).reverse().toString();
```

::: tip Ask yourself
Would a junior developer understand this in 30 seconds? If not, it may be too complex.
:::

---

## DRY — Don't Repeat Yourself

> *"Every piece of knowledge must have a single, unambiguous, authoritative representation in a system."*

Duplication means changes must be made in multiple places — and they often aren't, leading to bugs.

### ❌ Duplication

```java
public class InvoiceService {
    public double calculateTax(double amount) {
        return amount * 0.23; // VAT hardcoded
    }
}

public class OrderService {
    public double addTax(double price) {
        return price * 0.23; // Same logic, different name
    }
}
```

### ✅ Single source of truth

```java
public final class TaxCalculator {
    private static final double VAT_RATE = 0.23;

    public static double applyVat(double amount) {
        return amount * VAT_RATE;
    }
}

// Both services delegate to TaxCalculator
```

::: warning DRY is about knowledge, not code
Two identical-looking pieces of code might represent *different concepts* that happen to look the same today. Extracting them into one method creates **accidental coupling** — if one changes, you're forced to change both. Only DRY when the pieces represent the same concept.
:::

---

## YAGNI — You Aren't Gonna Need It

> *"Implement things when you actually need them, never when you just foresee that you might need them."* — Ron Jeffries (XP)

Pre-emptive abstraction is the most common form of waste in software projects.

### ❌ Premature generalisation

```java
// "Let's support plugins someday..."
public interface DataExporter<T, R, C extends Config<T>> {
    R export(T data, C config, ExportContext ctx);
    void validate(T data, ValidationContext ctx);
    ExportMetadata getMetadata();
}
```

When you only need:

### ✅ What you actually need today

```java
public void exportToCsv(List<Order> orders, String filePath) {
    // write CSV, done
}
```

Refactor when the second use case actually arrives — not before.

---

## When Rules Conflict

| Situation | Rule wins |
|-----------|-----------|
| Same business logic in 3+ places | **DRY** — extract it |
| Tempted to build a framework "for later" | **YAGNI** — build what you need |
| Adding complexity to be "flexible" | **KISS** — simplify |
| Two similar-looking things with different meanings | DRY **loses** — keep them separate |

---

## Summary

- **KISS**: the simplest solution is usually best. Complexity is a liability.
- **DRY**: eliminate knowledge duplication, not accidental code similarity.
- **YAGNI**: build for current requirements, not imagined future ones.

Together with SOLID, these heuristics form the foundation of pragmatic, professional software design.

<RelatedTopics :topics="['/principles/oop', '/principles/solid']" />
