# Exceptions & Resource Management

**Part II — Q8 to Q9** · [← Core Java Overview](./index)

---

## Q8: Exception hierarchy

> Understanding this tree is a prerequisite for every other exception topic.

Java's exception system is a class hierarchy rooted at `Throwable`:

```
java.lang.Throwable
├── java.lang.Error                    (unchecked)
│       ├── OutOfMemoryError
│       ├── StackOverflowError
│       └── VirtualMachineError
└── java.lang.Exception
        ├── RuntimeException           (unchecked)
        │       ├── NullPointerException
        │       ├── IllegalArgumentException
        │       ├── IndexOutOfBoundsException
        │       ├── ClassCastException
        │       └── UnsupportedOperationException
        └── Checked Exceptions
                ├── IOException
                ├── SQLException
                └── ClassNotFoundException
```

**The key distinction — checked vs unchecked:**

| | Checked | Unchecked |
|--|---------|-----------|
| Extends | `Exception` (not `RuntimeException`) | `RuntimeException` or `Error` |
| Compiler enforces | Yes — must catch or declare `throws` | No |
| Represents | Recoverable external conditions | Programming errors / JVM failures |
| Examples | `IOException`, `SQLException` | `NullPointerException`, `IllegalArgumentException` |

::: details Full model answer

**Errors:**
Represent serious JVM-level problems — `OutOfMemoryError`, `StackOverflowError`, `VirtualMachineError`. Never catch these in application code; there is usually nothing you can do to recover.

**Checked exceptions:**
The compiler forces you to handle them — either catch with `try-catch` or propagate with `throws`. They represent recoverable conditions outside the programmer's control: file not found, network failure, database error.

```java
// Option 1 — declare
public void readFile() throws IOException {
    BufferedReader reader = new BufferedReader(new FileReader("data.txt"));
}

// Option 2 — catch
public void readFile() {
    try {
        BufferedReader reader = new BufferedReader(new FileReader("data.txt"));
    } catch (IOException e) {
        log.error("Failed to read file", e);
    }
}
```

**Unchecked exceptions (RuntimeException):**
The compiler does not force you to handle them. They typically represent programming errors that should be fixed in code: `NullPointerException` (forgot null check), `IllegalArgumentException` (invalid input), `ArrayIndexOutOfBoundsException`. In modern Java, most business logic exceptions are unchecked.

**Best practices:**
1. Catch the most specific exception first — `IOException` before `Exception`
2. Never catch `Throwable` or `Error` in application code
3. Never swallow exceptions silently — `catch (Exception e) {}` is a bug waiting to happen; at minimum, log it
4. Use multi-catch (Java 7+): `catch (IOException | SQLException e)` — both types, one block
5. Prefer unchecked exceptions for business logic errors (Spring's philosophy)
6. Create domain-specific exceptions: `throw new OrderNotFoundException(orderId)`

**Exception chaining:**
When catching and rethrowing, always preserve the original cause:
```java
try {
    // ...
} catch (SQLException e) {
    throw new DataAccessException("Failed to load order", e);  // pass cause
}
// Accessible via: e.getCause()
```

:::

> [!TIP] Golden Tip
> Mention that **Spring uses unchecked exceptions exclusively**. Spring wraps checked `SQLExceptions` in unchecked `DataAccessException`. This design avoids cluttering business code with `try-catch` blocks and keeps service methods clean. It's a deliberate architectural choice — knowing *why* Spring made it shows senior-level thinking.

**Follow-up questions:**
- Why did Java introduce checked exceptions, and why do many modern frameworks avoid them?
- What is the difference between `throw` and `throws`?
- Can you catch multiple exceptions in one `catch` block? How?
- What happens if you catch `Exception` — does it also catch `Error`?

---

## Q9: try-with-resources

> Introduced in Java 7 to solve resource leaks. Know the `AutoCloseable` contract and suppressed exceptions.

```java
// Old way — verbose, error-prone, exception-swallowing bug
BufferedReader reader = null;
try {
    reader = new BufferedReader(new FileReader("data.txt"));
    String line = reader.readLine();
} finally {
    if (reader != null) {
        try { reader.close(); }
        catch (IOException e) { /* close exception swallows the original! */ }
    }
}

// Modern way (Java 7+) — clean, safe, correct
try (BufferedReader reader = new BufferedReader(new FileReader("data.txt"))) {
    String line = reader.readLine();
} catch (IOException e) {
    log.error("Error reading file", e);
}
// reader.close() called automatically, even if an exception is thrown
```

::: details Full model answer

**How it works:**
Any object declared in the `try(...)` header is automatically closed at the end of the block. The resource must implement `AutoCloseable` — which has a single method `close()`. Almost all I/O and JDBC classes implement it: `InputStream`, `OutputStream`, `Reader`, `Writer`, `Connection`, `PreparedStatement`, `ResultSet`.

**Multiple resources — closed in reverse order:**
```java
try (Connection conn        = dataSource.getConnection();
     PreparedStatement stmt = conn.prepareStatement("SELECT * FROM users");
     ResultSet rs           = stmt.executeQuery()) {

    while (rs.next()) {
        // process results
    }
}
// Closed in REVERSE order: rs → stmt → conn
// This matters for JDBC: ResultSet before PreparedStatement before Connection
```

**Suppressed exceptions — the key differentiator from `finally`:**

The old `finally` approach has a critical bug: if both the `try` body and `finally`'s `close()` throw, the `finally` exception **overwrites** the original — you lose the real cause.

`try-with-resources` solves this: if both the body and `close()` throw, the `close()` exception is added as a **suppressed exception** on the primary exception — nothing is lost.

```java
try {
    // ...
} catch (IOException e) {
    Throwable[] suppressed = e.getSuppressed();  // exceptions from close()
}
```

**Custom AutoCloseable:**
```java
public class DatabaseTransaction implements AutoCloseable {
    private final Connection conn;

    public DatabaseTransaction(Connection conn) {
        this.conn = conn;
    }

    @Override
    public void close() throws SQLException {
        conn.rollback();  // auto-rollback on abnormal exit
        conn.close();
    }
}

try (DatabaseTransaction tx = new DatabaseTransaction(conn)) {
    // perform operations — tx.close() rolls back and closes if anything throws
    conn.commit();
}
```

**Java 9 improvement — effectively final resources:**
In Java 9+, you can use a variable declared outside the `try` if it's effectively final — avoids re-declaring already-named resources:
```java
Connection conn = getConnection();  // declared outside
try (conn) {                         // Java 9+: no need to re-declare
    // use conn
}
```

:::

> [!TIP] Golden Tip
> Always mention **suppressed exceptions** — most candidates know `try-with-resources` closes resources automatically, but suppressed exceptions are what separates the answer from "good" to "senior level". Also: in Spring, `JdbcTemplate` and Spring Data handle JDBC resource management automatically — but knowing the underlying mechanism matters for debugging and for writing correct plain JDBC code.

**Follow-up questions:**
- What interface must a resource implement to be used in try-with-resources?
- What order are multiple resources closed in, and why does it matter?
- What are suppressed exceptions and how do you access them?
- How does try-with-resources differ from a `finally` block in terms of exception handling?
