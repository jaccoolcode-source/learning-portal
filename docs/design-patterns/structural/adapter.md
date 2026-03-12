---
title: Adapter Pattern
description: Convert one interface to another that clients expect — class adapter vs object adapter, with real Java examples
category: design-patterns
pageClass: layout-design-patterns
difficulty: intermediate
tags: [adapter, structural, java, design-patterns, interface]
related:
  - /design-patterns/structural/decorator
  - /design-patterns/structural/facade
  - /design-patterns/structural/proxy
estimatedMinutes: 12
---

# Adapter Pattern

<DifficultyBadge level="intermediate" />

**Intent:** Convert the interface of a class into another interface clients expect. Adapter lets classes work together that couldn't otherwise because of incompatible interfaces.

Also known as: **Wrapper**

---

## Problem

You have an existing class with a useful implementation, but its interface doesn't match what your client code expects.

---

## Object Adapter (Composition — preferred)

```java
// Target interface — what client expects
public interface JsonParser {
    Map<String, Object> parse(String json);
}

// Adaptee — existing class with incompatible interface
public class LegacyXmlParser {
    public Document parseXml(String xml) { /* ... */ return null; }
    public String extractField(Document doc, String field) { /* ... */ return ""; }
}

// Adapter — wraps Adaptee, implements Target
public class XmlToJsonAdapter implements JsonParser {
    private final LegacyXmlParser xmlParser;

    public XmlToJsonAdapter(LegacyXmlParser xmlParser) {
        this.xmlParser = xmlParser;
    }

    @Override
    public Map<String, Object> parse(String input) {
        // Convert: XML input → Document → Map
        Document doc = xmlParser.parseXml(wrapInXml(input));
        Map<String, Object> result = new HashMap<>();
        result.put("data", xmlParser.extractField(doc, "data"));
        return result;
    }

    private String wrapInXml(String data) { return "<root>" + data + "</root>"; }
}

// Client uses JsonParser — doesn't know about XML
JsonParser parser = new XmlToJsonAdapter(new LegacyXmlParser());
Map<String, Object> data = parser.parse("<name>Alice</name>");
```

---

## Class Adapter (Inheritance)

```java
// Only possible if Adaptee is a class (not final) and Java's single inheritance
public class XmlParserAdapter extends LegacyXmlParser implements JsonParser {
    @Override
    public Map<String, Object> parse(String input) {
        Document doc = parseXml(input); // inherited method
        // convert...
        return Map.of();
    }
}
```

::: tip Prefer object adapter (composition)
Class adapter is limited by Java's single inheritance. Object adapter is more flexible — you can adapt multiple objects of the same type.
:::

---

## Real-World Examples

- `InputStreamReader` — adapts `InputStream` to `Reader` interface
- `Arrays.asList()` — adapts array to `List`
- Spring's `HandlerAdapter` — adapts different controller types to a uniform handler interface
- `Runnable` → `Callable` adapters in `java.util.concurrent`
- JDBC driver implementations — adapt database-specific protocol to standard `Connection`/`Statement` interfaces

---

## Summary

- Adapter makes incompatible interfaces work together.
- Prefer object adapter (composition) over class adapter (inheritance).
- Common when integrating third-party or legacy code.

<RelatedTopics :topics="['/design-patterns/structural/decorator', '/design-patterns/structural/facade', '/design-patterns/structural/proxy']" />
