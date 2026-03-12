---
title: I/O & NIO
description: Java I/O fundamentals — Reader vs InputStream, the NIO Path API, Files utility, and non-blocking channels
category: java-core
pageClass: layout-java-core
difficulty: intermediate
tags: [java, io, nio, reader, inputstream, path, files, channel]
related:
  - /java-core/strings
  - /modern-java/java8
estimatedMinutes: 20
---

# I/O & NIO

<DifficultyBadge level="intermediate" />

Java has two I/O systems: the classic `java.io` (blocking, stream-based, Java 1) and `java.nio` (buffers, channels, optional non-blocking, Java 4+). Modern code prefers NIO's `Path`/`Files` API.

---

## java.io — Streams & Readers

The classic API has two hierarchies:

| Hierarchy | Base class | Works with |
|-----------|-----------|-----------|
| **Byte streams** | `InputStream` / `OutputStream` | Raw bytes — images, audio, binary |
| **Character streams** | `Reader` / `Writer` | Text with charset conversion |

### Key classes

```
InputStream
├── FileInputStream          — read bytes from file
├── ByteArrayInputStream     — read bytes from byte[]
└── FilterInputStream
    └── BufferedInputStream  — buffered reading (wraps another stream)
        └── DataInputStream  — read primitives (int, long, etc.)

Reader
├── FileReader               — read chars from file (uses platform charset)
├── StringReader             — read from String
└── BufferedReader           — line-by-line reading
    └── InputStreamReader    — bridge: byte stream → char stream with charset
```

### Reading a text file

```java
// Old way — always close resources with try-with-resources
try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(new FileInputStream("data.txt"), StandardCharsets.UTF_8))) {
    String line;
    while ((line = reader.readLine()) != null) {
        System.out.println(line);
    }
}
```

::: tip Always specify charset explicitly
`new FileReader("file.txt")` uses the platform default charset — different on Windows vs Linux. Always use `StandardCharsets.UTF_8` or specify explicitly.
:::

---

## java.nio — The Modern API

### Path and Files (Java 7+)

`java.nio.file.Path` replaces `java.io.File`. `java.nio.file.Files` provides convenient static methods.

```java
import java.nio.file.*;
import java.nio.charset.StandardCharsets;

Path path = Path.of("data", "report.txt");  // Java 11+

// Read entire file
String content = Files.readString(path, StandardCharsets.UTF_8);   // Java 11+

// Read all lines
List<String> lines = Files.readAllLines(path, StandardCharsets.UTF_8);

// Stream lines (lazy, good for large files)
try (Stream<String> stream = Files.lines(path, StandardCharsets.UTF_8)) {
    stream.filter(l -> l.contains("ERROR")).forEach(System.out::println);
}

// Write
Files.writeString(path, "Hello, World!", StandardCharsets.UTF_8);
Files.write(path, lines, StandardCharsets.UTF_8, StandardOpenOption.APPEND);

// Copy, move, delete
Files.copy(source, dest, StandardCopyOption.REPLACE_EXISTING);
Files.move(source, dest, StandardCopyOption.ATOMIC_MOVE);
Files.delete(path);

// Check existence / type
Files.exists(path)
Files.isRegularFile(path)
Files.isDirectory(path)

// Walk directory tree
Files.walk(Path.of("src"))
     .filter(Files::isRegularFile)
     .filter(p -> p.toString().endsWith(".java"))
     .forEach(System.out::println);
```

### Path operations

```java
Path p = Path.of("/home/user/docs/report.txt");

p.getFileName()   // report.txt
p.getParent()     // /home/user/docs
p.getRoot()       // /
p.toString()      // /home/user/docs/report.txt

// Resolve (append)
Path base = Path.of("/home/user");
Path full = base.resolve("docs/report.txt"); // /home/user/docs/report.txt

// Relativize
base.relativize(full);  // docs/report.txt
```

---

## Channels and Buffers (NIO2)

For high-performance or non-blocking I/O, NIO uses `Channel` + `Buffer` instead of streams.

```java
// Read file into buffer
try (FileChannel channel = FileChannel.open(Path.of("data.bin"), StandardOpenOption.READ)) {
    ByteBuffer buffer = ByteBuffer.allocate(1024);
    while (channel.read(buffer) > 0) {
        buffer.flip();       // switch from write to read mode
        while (buffer.hasRemaining()) {
            byte b = buffer.get();
            // process b
        }
        buffer.clear();      // reset for next read
    }
}
```

### Buffer modes

```
Buffer states:
  after allocate: position=0, limit=capacity  ← "write mode"
  after flip():   position=0, limit=old_pos   ← "read mode"
  after clear():  position=0, limit=capacity  ← back to write mode
  after compact(): unread data moved to start  ← partial read
```

::: info When to use Channels
Use channels with `Selector` for **non-blocking** I/O (many connections, one thread). For most application code, `Files` / `BufferedReader` is simpler and sufficient.
:::

---

## Comparison

| | `java.io` | `java.nio` |
|-|-----------|-----------|
| Programming model | Stream (byte-by-byte / char-by-char) | Buffer + Channel |
| Blocking | Always blocking | Blocking or non-blocking |
| API style | Old, verbose | Modern, fluent (via `Files`) |
| Best for | Simple file operations | High-performance, many concurrent connections |
| File operations | `File` class (limited) | `Path` + `Files` (rich API) |

---

## Serialisation

```java
// Writes object state to a stream
try (ObjectOutputStream oos = new ObjectOutputStream(new FileOutputStream("obj.ser"))) {
    oos.writeObject(myObject); // class must implement Serializable
}

// Reads it back
try (ObjectInputStream ois = new ObjectInputStream(new FileInputStream("obj.ser"))) {
    MyClass obj = (MyClass) ois.readObject();
}
```

::: danger Serialisation is a security risk
Never deserialise data from untrusted sources. Java deserialisation exploits are a well-known attack vector. Prefer JSON (Jackson/Gson) or Protocol Buffers for data interchange.
:::

---

## Quick Reference

| Task | Best API |
|------|---------|
| Read text file | `Files.readString()` / `Files.readAllLines()` |
| Stream large file | `Files.lines()` |
| Write text file | `Files.writeString()` |
| Copy/Move/Delete | `Files.copy/move/delete` |
| Check path info | `Files.exists()`, `Files.isDirectory()` |
| High-performance binary | `FileChannel` + `ByteBuffer` |
| Non-blocking server | `ServerSocketChannel` + `Selector` |

---

## Summary

- Use `Reader`/`Writer` for text, `InputStream`/`OutputStream` for binary.
- Always specify charset explicitly — never rely on platform defaults.
- Prefer `java.nio.file.Path` + `Files` over `java.io.File` for all file operations.
- Use `Files.lines()` for streaming large files without loading all into memory.
- `Channel` + `Buffer` for high-performance or non-blocking I/O.

<RelatedTopics :topics="['/java-core/strings', '/modern-java/java8', '/concurrency/']" />
