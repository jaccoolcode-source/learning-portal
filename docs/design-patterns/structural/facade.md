---
title: Facade Pattern
description: Provide a simplified interface to a complex subsystem — Spring JdbcTemplate as the canonical example
category: design-patterns
pageClass: layout-design-patterns
difficulty: beginner
tags: [facade, structural, java, design-patterns, spring]
related:
  - /design-patterns/structural/adapter
  - /design-patterns/structural/proxy
estimatedMinutes: 10
---

# Facade Pattern

<DifficultyBadge level="beginner" />

**Intent:** Provide a simplified interface to a complex subsystem. A facade defines a higher-level interface that makes the subsystem easier to use.

---

## Problem

A subsystem has many components with complex interactions. Clients only need a simple, coherent API — not the internals.

---

## Example: Home Theater Facade

```java
// Complex subsystem classes
class Projector    { void on() {} void setInput(String s) {} void off() {} }
class SoundSystem  { void on() {} void setVolume(int v) {} void off() {} }
class StreamingBox { void on() {} void play(String movie) {} void off() {} }
class Lights       { void dim(int level) {} void brighten() {} }

// Facade — simple API for complex subsystem
public class HomeTheaterFacade {
    private final Projector projector;
    private final SoundSystem sound;
    private final StreamingBox streaming;
    private final Lights lights;

    public HomeTheaterFacade(Projector p, SoundSystem s, StreamingBox st, Lights l) {
        this.projector = p;  this.sound = s;
        this.streaming = st; this.lights = l;
    }

    public void watchMovie(String movie) {
        lights.dim(30);
        projector.on();
        projector.setInput("HDMI");
        sound.on();
        sound.setVolume(50);
        streaming.on();
        streaming.play(movie);
        System.out.println("Enjoy " + movie + "!");
    }

    public void endMovie() {
        streaming.off();
        sound.off();
        projector.off();
        lights.brighten();
    }
}

// Client — one method instead of 8
HomeTheaterFacade theater = new HomeTheaterFacade(/* ... */);
theater.watchMovie("Inception");
```

---

## Spring Examples

Spring's template classes are facades over complex Java APIs:

```java
// JdbcTemplate: facade over JDBC
// Without JdbcTemplate:
Connection conn = dataSource.getConnection();
PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
ps.setLong(1, userId);
ResultSet rs = ps.executeQuery();
while (rs.next()) { /* map row */ }
rs.close(); ps.close(); conn.close(); // and handle exceptions...

// With JdbcTemplate facade:
User user = jdbcTemplate.queryForObject(
    "SELECT * FROM users WHERE id = ?",
    (rs, row) -> new User(rs.getLong("id"), rs.getString("name")),
    userId
);
```

`RestTemplate` (HTTP client facade), `RedisTemplate`, `KafkaTemplate` follow the same pattern.

---

## Summary

- Facade simplifies a complex subsystem with a clean, minimal API.
- Clients depend on the facade, not the subsystem's internal classes.
- Spring's template classes are the best real-world examples.
- Facade doesn't prevent advanced users from accessing subsystem directly if needed.

<RelatedTopics :topics="['/design-patterns/structural/adapter', '/spring/spring-data']" />
