---
title: Secure Coding
description: Input validation, secrets management, dependency scanning, SAST/DAST, Spring security headers, and common Java security pitfalls
category: security
pageClass: layout-security
difficulty: intermediate
tags: [secure-coding, input-validation, secrets-management, sast, dast, java-security]
related:
  - /security/web-attacks
  - /security/cryptography
  - /spring/spring-security
estimatedMinutes: 25
---

# Secure Coding

<DifficultyBadge level="intermediate" />

Secure coding is the practice of writing software that is resistant to attack by default. It's not a feature you add later — it's a mindset applied throughout development.

---

## Input Validation

**Validate at every system boundary.** Never trust data from users, other services, file uploads, or URL parameters.

### Principles

| Principle | Description |
|-----------|-------------|
| **Whitelist, not blacklist** | Define what's allowed, reject everything else |
| **Validate early** | Reject invalid input before it reaches business logic |
| **Validate the right thing** | Check type, length, format, range, and encoding |
| **Don't rely on client-side only** | Always validate server-side too |

```java
// Bean Validation (Jakarta Validation API)
public class CreateUserRequest {
    @NotBlank(message = "Username is required")
    @Size(min = 3, max = 50)
    @Pattern(regexp = "^[a-zA-Z0-9_-]+$", message = "Alphanumeric, underscore, hyphen only")
    private String username;

    @Email
    @NotBlank
    private String email;

    @NotBlank
    @Size(min = 12, message = "Password must be at least 12 characters")
    private String password;

    @Min(0) @Max(150)
    private int age;
}

// Controller — trigger validation
@PostMapping("/users")
public ResponseEntity<UserResponse> createUser(
        @Valid @RequestBody CreateUserRequest request,
        BindingResult bindingResult) {
    if (bindingResult.hasErrors()) {
        // Return 400 with field errors
        return ResponseEntity.badRequest().body(buildErrorResponse(bindingResult));
    }
    return ResponseEntity.ok(userService.create(request));
}
```

### Common Validation Mistakes

```java
// WRONG — blacklist approach (incomplete)
if (input.contains("<script>")) throw new Exception("Invalid!");
// Attacker uses: <SCRIPT>, &#60;script&#62;, <scr<script>ipt>

// RIGHT — allow only expected characters
if (!input.matches("^[a-zA-Z0-9 .,'-]{1,200}$")) {
    throw new ValidationException("Invalid input");
}

// WRONG — no length limit (ReDoS or memory exhaustion)
processInput(request.getBody());

// RIGHT — enforce maximum sizes
@RequestBody @Size(max = 10_000) String body

// WRONG — trusting file extension
if (filename.endsWith(".png")) processImage(file);

// RIGHT — validate content type (magic bytes)
byte[] header = Files.readNBytes(path, 4);
if (!isMagicBytePng(header)) throw new ValidationException("Not a PNG");
```

---

## Secrets Management

Never hardcode credentials, API keys, or secrets in source code.

### Where NOT to Store Secrets

```java
// WRONG — hardcoded
private static final String DB_PASSWORD = "supersecret123";
private static final String JWT_SECRET = "my-secret-key";

// WRONG — in application.properties committed to git
spring.datasource.password=supersecret123
```

### Environment Variables (Minimum)

```java
// application.yml — reference env vars
spring:
  datasource:
    password: ${DB_PASSWORD}
jwt:
  secret: ${JWT_SECRET_BASE64}

// Java — read env vars
String secret = System.getenv("JWT_SECRET_BASE64");
if (secret == null) throw new IllegalStateException("JWT_SECRET_BASE64 not set");
```

### Spring Cloud Vault / HashiCorp Vault

```yaml
# application.yml
spring:
  cloud:
    vault:
      host: vault.company.internal
      port: 8200
      scheme: https
      authentication: KUBERNETES  # pod identity
      kubernetes:
        role: myapp-role
      kv:
        enabled: true
        backend: secret
        default-context: myapp
```

Vault provides:
- Dynamic database credentials (short-lived, auto-rotated)
- Secret versioning and auditing
- Fine-grained access policies

### AWS Secrets Manager / Parameter Store

```java
// AWS SDK v2
SecretsManagerClient client = SecretsManagerClient.create();
GetSecretValueResponse response = client.getSecretValue(
    GetSecretValueRequest.builder()
        .secretId("prod/myapp/db-password")
        .build()
);
String secret = response.secretString();
```

### Secrets Anti-patterns

- Never log secrets (mask in logs: `password=***`)
- Never put secrets in URLs (appear in server logs, browser history)
- Never store in version control — even in history (use `git filter-repo` to clean)
- Rotate secrets regularly; invalidate on personnel change
- Use least-privilege: each service only has access to its own secrets

---

## Dependency Vulnerabilities

Third-party libraries are your biggest attack surface by volume.

### OWASP Dependency-Check (Maven)

```xml
<plugin>
    <groupId>org.owasp</groupId>
    <artifactId>dependency-check-maven</artifactId>
    <version>9.0.9</version>
    <configuration>
        <failBuildOnCVSS>7</failBuildOnCVSS>  <!-- fail on high/critical -->
        <suppressionFile>dependency-check-suppressions.xml</suppressionFile>
    </configuration>
    <executions>
        <execution>
            <goals><goal>check</goal></goals>
        </execution>
    </executions>
</plugin>
```

### Snyk CLI

```bash
# Scan Maven project
snyk test --file=pom.xml

# Continuously monitor
snyk monitor
```

### Practices

- Pin transitive dependency versions in BOM
- Review dependency additions in code reviews
- Enable GitHub Dependabot for automated PRs
- Maintain a Software Bill of Materials (SBOM — `cyclonedx-maven-plugin`)
- Subscribe to security advisories (GitHub Security Advisories, NVD)

---

## SAST and DAST

| Tool Type | When It Runs | What It Finds |
|-----------|-------------|---------------|
| **SAST** (Static) | At build time, on source code | SQL injection patterns, hardcoded secrets, unsafe APIs |
| **DAST** (Dynamic) | Against running app | XSS, injection, auth bypasses, misconfigurations |
| **IAST** (Interactive) | At test time, instrumented | Combination of SAST + DAST findings |
| **SCA** (Composition) | At build time, on dependencies | Known CVEs in third-party libraries |

### SpotBugs + Find Security Bugs (SAST)

```xml
<!-- Maven plugin -->
<plugin>
    <groupId>com.github.spotbugs</groupId>
    <artifactId>spotbugs-maven-plugin</artifactId>
    <version>4.8.3.0</version>
    <dependencies>
        <dependency>
            <groupId>com.h3xstream.findsecbugs</groupId>
            <artifactId>findsecbugs-plugin</artifactId>
            <version>1.12.0</version>
        </dependency>
    </dependencies>
    <configuration>
        <effort>Max</effort>
        <threshold>Low</threshold>
        <plugins>
            <plugin>
                <groupId>com.h3xstream.findsecbugs</groupId>
                <artifactId>findsecbugs-plugin</artifactId>
                <version>1.12.0</version>
            </plugin>
        </plugins>
    </configuration>
</plugin>
```

Find Security Bugs detects: SQL injection, XSS, XXE, command injection, weak cryptography, hardcoded credentials.

### OWASP ZAP (DAST)

```bash
# Quick scan against running application
docker run -t owasp/zap2docker-stable zap-baseline.py \
    -t https://myapp.example.com \
    -r report.html
```

---

## Common Java Security Pitfalls

### 1. Object Deserialization

```java
// DANGEROUS — never deserialize untrusted data with native Java serialization
ObjectInputStream ois = new ObjectInputStream(inputStream);
Object obj = ois.readObject(); // RCE risk if class has dangerous readObject()

// SAFE alternatives:
// - Use JSON (Jackson, Gson)
// - Use Protocol Buffers
// - If you must use Java serialization, use a filter:
ObjectInputStream ois = new ObjectInputStream(inputStream);
ois.setObjectInputFilter(info -> {
    if (info.serialClass() != null
            && !allowedClasses.contains(info.serialClass().getName())) {
        return ObjectInputFilter.Status.REJECTED;
    }
    return ObjectInputFilter.Status.ALLOWED;
});
```

### 2. Command Injection via Runtime.exec()

```java
// VULNERABLE
String filename = request.getParam("file");
Runtime.getRuntime().exec("convert " + filename + " output.pdf"); // injection!

// SAFE — use ProcessBuilder with argument array
ProcessBuilder pb = new ProcessBuilder("convert", filename, "output.pdf");
pb.redirectErrorStream(true);
Process process = pb.start();
```

### 3. Insecure Temporary Files

```java
// VULNERABLE — predictable file name, race condition
File temp = new File("/tmp/upload" + System.currentTimeMillis() + ".tmp");

// SAFE
Path temp = Files.createTempFile("upload-", ".tmp");
temp.toFile().deleteOnExit();
// Set restrictive permissions
Files.setPosixFilePermissions(temp, PosixFilePermissions.fromString("rw-------"));
```

### 4. Sensitive Data in Logs

```java
// WRONG — passwords, tokens, PII in logs
log.info("Login: user={}, password={}", username, password);
log.debug("Token: {}", jwtToken);

// RIGHT — mask sensitive fields
log.info("Login attempt: user={}", username);
log.debug("Token issued: subject={}, expiry={}", subject, expiry);

// Use log4j2/logback masking patterns
// <PatternLayout pattern="%m%n">
//   <replace regex="password=\S+" replacement="password=***"/>
// </PatternLayout>
```

### 5. Integer Overflow / Type Safety

```java
// Potential overflow when converting from long to int
long userCount = getUserCount(); // could be > Integer.MAX_VALUE
int count = (int) userCount;    // silent overflow!

// Safe: keep as long, or check bounds
if (userCount > Integer.MAX_VALUE) throw new ArithmeticException("Count overflow");
int count = Math.toIntExact(userCount); // throws ArithmeticException on overflow
```

---

## Spring Security Headers Checklist

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        // 1. Transport security
        .requiresChannel(channel -> channel.anyRequest().requiresSecure()) // HTTPS only

        // 2. Headers
        .headers(headers -> headers
            .httpStrictTransportSecurity(hsts -> hsts
                .maxAgeInSeconds(31536000)
                .includeSubDomains(true)
            )
            .contentSecurityPolicy(csp -> csp
                .policyDirectives("default-src 'self'; object-src 'none'")
            )
            .frameOptions(frame -> frame.deny())
            .contentTypeOptions(Customizer.withDefaults())
            .referrerPolicy(referrer -> referrer
                .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
            )
        )

        // 3. CSRF (only disable for stateless JWT APIs)
        .csrf(AbstractHttpConfigurer::disable)

        // 4. Session management
        .sessionManagement(session -> session
            .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
        )

        // 5. Exception handling
        .exceptionHandling(ex -> ex
            .authenticationEntryPoint((req, res, authEx) ->
                res.sendError(401, "Unauthorized"))
            .accessDeniedHandler((req, res, accessEx) ->
                res.sendError(403, "Forbidden"))
        )
        .build();
}
```

---

## Secure Coding Checklist

### Input / Output
- [ ] Validate all input at system boundaries
- [ ] Use whitelist validation (allowlist expected characters)
- [ ] Set maximum input sizes
- [ ] Encode output for target context (HTML, SQL, shell)

### Authentication & Authorization
- [ ] Hash passwords with bcrypt/Argon2
- [ ] Enforce password complexity and minimum length
- [ ] Rate-limit authentication endpoints
- [ ] Implement account lockout after N failures
- [ ] Verify resource ownership (IDOR prevention)
- [ ] Use `@PreAuthorize` for method-level security

### Secrets
- [ ] No secrets in source code
- [ ] Use environment variables or a secrets vault
- [ ] Rotate secrets regularly
- [ ] Never log sensitive data

### Dependencies
- [ ] Run OWASP Dependency-Check or Snyk in CI
- [ ] Fail build on high/critical CVEs
- [ ] Review all new dependency additions

### Transport
- [ ] Enforce HTTPS everywhere
- [ ] Set HSTS header
- [ ] Use TLS 1.2+, disable older versions

### Error Handling
- [ ] Generic error messages to clients
- [ ] Full details logged server-side only
- [ ] No stack traces or internal paths exposed

<RelatedTopics :topics="['/security/web-attacks', '/security/cryptography', '/spring/spring-security']" />

[→ Back to Security Overview](/security/)
