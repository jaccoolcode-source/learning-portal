---
title: Abstract Factory Pattern
description: Create families of related objects without specifying their concrete classes — cross-platform UI example
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [abstract-factory, creational, java, design-patterns]
related:
  - /design-patterns/creational/factory-method
  - /design-patterns/creational/builder
estimatedMinutes: 15
---

# Abstract Factory Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Provide an interface for creating families of related or dependent objects without specifying their concrete classes.

---

## Problem

You need to create groups of related objects that must be used together — but the exact concrete types depend on a runtime condition (OS, theme, database vendor, etc.).

---

## Structure

```
AbstractFactory
  ├── createButton(): AbstractButton
  └── createCheckbox(): AbstractCheckbox

WindowsFactory implements AbstractFactory
  ├── createButton()   → WindowsButton
  └── createCheckbox() → WindowsCheckbox

MacFactory implements AbstractFactory
  ├── createButton()   → MacButton
  └── createCheckbox() → MacCheckbox
```

---

## Java Example: Cross-platform UI

```java
// Abstract Products
public interface Button {
    void render();
    void onClick();
}

public interface Checkbox {
    void render();
    boolean isChecked();
}

// Concrete Products — Windows
public class WindowsButton implements Button {
    @Override public void render()   { System.out.println("[Win] Rendering button"); }
    @Override public void onClick()  { System.out.println("[Win] Button clicked"); }
}

public class WindowsCheckbox implements Checkbox {
    private boolean checked;
    @Override public void render()        { System.out.println("[Win] Rendering checkbox"); }
    @Override public boolean isChecked()  { return checked; }
}

// Concrete Products — Mac
public class MacButton implements Button {
    @Override public void render()  { System.out.println("[Mac] Rendering button"); }
    @Override public void onClick() { System.out.println("[Mac] Button clicked"); }
}

public class MacCheckbox implements Checkbox {
    private boolean checked;
    @Override public void render()       { System.out.println("[Mac] Rendering checkbox"); }
    @Override public boolean isChecked() { return checked; }
}

// Abstract Factory
public interface UIFactory {
    Button createButton();
    Checkbox createCheckbox();
}

// Concrete Factories
public class WindowsUIFactory implements UIFactory {
    @Override public Button createButton()     { return new WindowsButton(); }
    @Override public Checkbox createCheckbox() { return new WindowsCheckbox(); }
}

public class MacUIFactory implements UIFactory {
    @Override public Button createButton()     { return new MacButton(); }
    @Override public Checkbox createCheckbox() { return new MacCheckbox(); }
}

// Client — depends only on abstractions
public class Application {
    private final Button button;
    private final Checkbox checkbox;

    public Application(UIFactory factory) {
        this.button   = factory.createButton();
        this.checkbox = factory.createCheckbox();
    }

    public void render() {
        button.render();
        checkbox.render();
    }
}

// Wiring
String os = System.getProperty("os.name");
UIFactory factory = os.contains("Win") ? new WindowsUIFactory() : new MacUIFactory();
Application app = new Application(factory);
app.render();
```

---

## Abstract Factory vs Factory Method

| Aspect | Factory Method | Abstract Factory |
|--------|---------------|-----------------|
| Creates | One product | Family of products |
| How | Subclass overrides one method | Compose a factory object |
| Coupling | Product types vary | Product *families* vary |

---

## Real-World Examples

- `javax.xml.parsers.DocumentBuilderFactory` — parser families
- `java.sql.Connection` → creates `Statement`, `PreparedStatement` (JDBC factory)
- Spring's `ApplicationContext` — creates beans, acts as abstract factory
- Swing Look-and-Feel (`LookAndFeel` factory)

---

## Summary

- Abstract Factory creates *families* of related objects.
- Client depends on the factory interface, not concrete types — easy to switch families.
- Harder to extend than Factory Method (adding a product requires changing the factory interface).

<RelatedTopics :topics="['/design-patterns/creational/factory-method', '/design-patterns/creational/builder']" />
