---
title: API Authentication & Authorization
description: API keys, HMAC request signing, mTLS, scopes and permissions, rate limiting by API key, key rotation, and comparison of auth strategies
category: architecture
pageClass: layout-architecture
difficulty: intermediate
tags: [api-keys, hmac, signing, mtls, scopes, rate-limiting, key-rotation, api-security]
related:
  - /architecture/rest-web
  - /security/auth-protocols
  - /security/cryptography
  - /spring/spring-security
estimatedMinutes: 20
---

# API Authentication & Authorization

<DifficultyBadge level="intermediate" />

Different API use cases call for different auth strategies. This page covers API keys, HMAC request signing, and scopes — the patterns used by AWS, Stripe, Twilio, and most SaaS APIs.

> **Session auth / JWT / OAuth2** are covered in [Auth Protocols](/security/auth-protocols) and [Spring Security](/spring/spring-security). This page focuses on machine-to-machine and third-party integration patterns.

---

## Auth Strategy Comparison

| Strategy | Best For | Pros | Cons |
|----------|----------|------|------|
| **API Key (header)** | Simple M2M, third-party integrations | Simple to implement and use | Static secret — stolen key grants full access |
| **HMAC request signing** | High-security M2M (AWS Sig v4 style) | Proves request integrity, replay protection | Complex to implement on both sides |
| **OAuth2 Client Credentials** | Trusted service-to-service | Standard, short-lived tokens, scope-limited | Requires token endpoint + token management |
| **mTLS** | Internal microservices, high-assurance M2M | No shared secret, certificate-based identity | PKI infrastructure required |
| **JWT (Bearer)** | User-facing APIs, delegated access | Self-contained, stateless, short-lived | Token size, no revocation without blacklist |

---

## API Keys

### Design Decisions

```
Format: {prefix}_{random}
  Example: sk_live_<your32bytesofentropy>

Prefix benefits:
  - "sk_" → secret key (never expose publicly)
  - "pk_" → public key (safe in frontend)
  - "live" vs "test" → environment separation
  - Easy to identify in logs, scan in git commits (GitHub secret scanning)

Length: 32+ bytes of entropy (256-bit)
  Generated with: SecureRandom — NOT Math.random(), NOT UUID
```

### Key Generation

```java
@Service
public class ApiKeyService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();
    private static final String PREFIX = "sk_live_";

    public ApiKey generateKey(Long userId, String description, Set<String> scopes) {
        // 1. Generate cryptographically secure random key
        byte[] randomBytes = new byte[32];
        SECURE_RANDOM.nextBytes(randomBytes);
        String rawKey = PREFIX + Base64.getUrlEncoder().withoutPadding()
            .encodeToString(randomBytes);

        // 2. Hash for storage — NEVER store raw keys
        String hashedKey = hashKey(rawKey);

        // 3. Store hashed key with metadata
        ApiKeyEntity entity = ApiKeyEntity.builder()
            .id(UUID.randomUUID())
            .userId(userId)
            .keyHash(hashedKey)
            .keyPrefix(rawKey.substring(0, 12))  // store prefix for identification
            .description(description)
            .scopes(scopes)
            .createdAt(Instant.now())
            .active(true)
            .build();

        apiKeyRepo.save(entity);

        // 4. Return raw key ONCE — never retrievable again after this
        return new ApiKey(rawKey, entity.getId());
    }

    private String hashKey(String rawKey) {
        // SHA-256 is fine for API keys (keys have high entropy — no need for bcrypt)
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawKey.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }
}
```

> **Never store raw API keys.** Store only the hash. When validating, hash the incoming key and compare against stored hashes. This way, a DB breach does not expose keys.

### Validation in Spring Security

```java
@Component
public class ApiKeyAuthFilter extends OncePerRequestFilter {

    private final ApiKeyRepository apiKeyRepo;

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer sk_")) {
            chain.doFilter(request, response);
            return;
        }

        String rawKey = authHeader.substring("Bearer ".length());
        String keyHash = hashKey(rawKey);

        Optional<ApiKeyEntity> apiKey = apiKeyRepo.findByKeyHash(keyHash);

        if (apiKey.isEmpty() || !apiKey.get().isActive()) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            return;
        }

        ApiKeyEntity key = apiKey.get();

        // Build authentication with scopes as granted authorities
        List<GrantedAuthority> authorities = key.getScopes().stream()
            .map(scope -> new SimpleGrantedAuthority("SCOPE_" + scope))
            .toList();

        Authentication auth = new ApiKeyAuthentication(key.getUserId(), key, authorities);
        SecurityContextHolder.getContext().setAuthentication(auth);

        // Update last used timestamp (async to avoid slowing request)
        apiKeyRepo.updateLastUsedAsync(key.getId(), Instant.now());

        chain.doFilter(request, response);
    }
}

// Register filter before UsernamePasswordAuthenticationFilter
@Configuration
public class SecurityConfig {
    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http,
                                                    ApiKeyAuthFilter apiKeyFilter) throws Exception {
        http
            .addFilterBefore(apiKeyFilter, UsernamePasswordAuthenticationFilter.class)
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/admin/**").hasAuthority("SCOPE_admin")
                .requestMatchers(HttpMethod.POST, "/api/**").hasAuthority("SCOPE_write")
                .requestMatchers(HttpMethod.GET, "/api/**").hasAuthority("SCOPE_read")
                .anyRequest().authenticated()
            )
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
        return http.build();
    }
}
```

---

## Scopes

Scopes restrict what an API key can do — principle of least privilege:

```
Common scope patterns:
  read          → GET only
  write         → POST, PUT, PATCH
  delete        → DELETE
  admin         → all operations including account management

  Resource-level:
  products:read
  products:write
  orders:read
  users:admin

Example — Stripe-style:
  Restricted key with: charges:read, customers:write
  Cannot: refund charges, manage webhooks, access API keys
```

```java
// Enforce scope in controller
@RestController
@RequestMapping("/api/products")
public class ProductController {

    @GetMapping
    @PreAuthorize("hasAuthority('SCOPE_read') or hasAuthority('SCOPE_products:read')")
    public List<ProductDto> list() { ... }

    @PostMapping
    @PreAuthorize("hasAuthority('SCOPE_write') or hasAuthority('SCOPE_products:write')")
    public ProductDto create(@RequestBody CreateProductRequest req) { ... }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('SCOPE_delete') or hasAuthority('SCOPE_admin')")
    public void delete(@PathVariable Long id) { ... }
}
```

---

## HMAC Request Signing (AWS Signature v4 Style)

API keys authenticate *who* is calling. HMAC signing additionally proves *what* was sent — the complete request (URL, headers, body) is part of the signature. Prevents man-in-the-middle tampering and replay attacks.

### How It Works

```
1. Provider issues: Access Key ID + Secret Access Key
   Access Key ID:     AKIAIOSFODNN7EXAMPLE      (public — sent in header)
   Secret Access Key: wJalrXUtnFEMI/K7MDENG     (private — used to sign, never sent)

2. For each request, client constructs:
   StringToSign = HTTPMethod + "\n"
               + CanonicalURI + "\n"
               + CanonicalQueryString + "\n"
               + CanonicalHeaders + "\n"  (Host, Content-Type, X-Timestamp, ...)
               + HashedBody                (SHA-256 of request body)

3. Signature = HMAC-SHA256(SecretKey, StringToSign)

4. Send header:
   Authorization: HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE,
                  SignedHeaders=host;content-type;x-timestamp,
                  Signature=<hex>
```

### Client: Signing a Request

```java
public class HmacRequestSigner {

    public HttpHeaders sign(String method, URI uri, String body,
                            String accessKeyId, String secretKey) throws Exception {
        String timestamp = Instant.now().toString();  // ISO 8601 UTC
        String contentType = "application/json";

        // 1. Canonical request
        String hashedBody = sha256Hex(body == null ? "" : body);
        String canonicalRequest = method + "\n"
            + uri.getPath() + "\n"
            + (uri.getQuery() != null ? uri.getQuery() : "") + "\n"
            + "content-type:" + contentType + "\n"
            + "host:" + uri.getHost() + "\n"
            + "x-timestamp:" + timestamp + "\n\n"
            + "content-type;host;x-timestamp\n"
            + hashedBody;

        // 2. String to sign
        String stringToSign = "HMAC-SHA256\n" + timestamp + "\n" + sha256Hex(canonicalRequest);

        // 3. Compute signature
        String signature = hmacSha256Hex(secretKey, stringToSign);

        // 4. Build Authorization header
        HttpHeaders headers = new HttpHeaders();
        headers.set("Content-Type", contentType);
        headers.set("X-Timestamp", timestamp);
        headers.set("Authorization",
            "HMAC-SHA256 Credential=" + accessKeyId + "," +
            "SignedHeaders=content-type;host;x-timestamp," +
            "Signature=" + signature);
        return headers;
    }

    private String sha256Hex(String input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return HexFormat.of().formatHex(digest.digest(input.getBytes(StandardCharsets.UTF_8)));
    }

    private String hmacSha256Hex(String key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return HexFormat.of().formatHex(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }
}
```

### Server: Verifying the Signature

```java
@Component
public class HmacSignatureVerifier {

    private static final long TIMESTAMP_TOLERANCE_SECONDS = 300;

    public boolean verify(HttpServletRequest request, String body,
                          String accessKeyId, String secretKey) {
        String authHeader = request.getHeader("Authorization");
        String timestamp = request.getHeader("X-Timestamp");

        if (authHeader == null || timestamp == null) return false;

        // 1. Replay attack check — reject stale requests
        Instant requestTime = Instant.parse(timestamp);
        if (Math.abs(Duration.between(Instant.now(), requestTime).getSeconds())
                > TIMESTAMP_TOLERANCE_SECONDS) {
            log.warn("Rejected stale HMAC request from {}", accessKeyId);
            return false;
        }

        // 2. Recompute signature using same algorithm
        // ... (same canonical request construction as client)
        String expectedSignature = computeExpectedSignature(request, body, secretKey, timestamp);

        // 3. Extract received signature
        String receivedSignature = extractSignature(authHeader);

        // 4. Constant-time comparison
        return MessageDigest.isEqual(
            expectedSignature.getBytes(StandardCharsets.UTF_8),
            receivedSignature.getBytes(StandardCharsets.UTF_8)
        );
    }
}
```

---

## Rate Limiting by API Key

Different API key tiers get different rate limits:

```java
@Component
public class ApiKeyRateLimiter {

    private final RedisTemplate<String, String> redis;

    // Sliding window rate limit per API key
    public boolean isAllowed(String apiKeyId, RateLimitTier tier) {
        String key = "ratelimit:" + apiKeyId;
        long now = System.currentTimeMillis();
        long windowMs = 60_000;  // 1 minute window

        // Redis sliding window (Lua script for atomicity)
        String script = """
            local key = KEYS[1]
            local now = tonumber(ARGV[1])
            local window = tonumber(ARGV[2])
            local limit = tonumber(ARGV[3])

            redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
            local count = redis.call('ZCARD', key)

            if count < limit then
                redis.call('ZADD', key, now, now)
                redis.call('PEXPIRE', key, window)
                return 1
            end
            return 0
            """;

        Long result = redis.execute(
            new DefaultRedisScript<>(script, Long.class),
            List.of(key),
            String.valueOf(now),
            String.valueOf(windowMs),
            String.valueOf(tier.getRequestsPerMinute())
        );

        return result != null && result == 1L;
    }
}

public enum RateLimitTier {
    FREE(60),        // 60 req/min
    STARTER(600),    // 600 req/min
    PROFESSIONAL(6000),
    ENTERPRISE(60000);

    private final int requestsPerMinute;
}
```

```java
// Rate limit headers (inform clients of limits)
response.setHeader("X-RateLimit-Limit", String.valueOf(tier.getRequestsPerMinute()));
response.setHeader("X-RateLimit-Remaining", String.valueOf(remaining));
response.setHeader("X-RateLimit-Reset", String.valueOf(resetTimestamp));
// On limit exceeded: HTTP 429 Too Many Requests
// Retry-After: 45  (seconds until next window)
```

---

## Key Rotation

```
Best practices for key lifecycle:

1. Allow multiple active keys per account
   → Rotation without downtime: create new, update client, delete old

2. Key expiry
   → Optional: set expiry date on keys for time-limited access
   → Warn 30/7/1 days before expiry via email

3. Immediate revocation
   → Invalidate key instantly on: suspected compromise, employee offboarding
   → Cached auth (Redis) must honour revocation — use short TTL or pub/sub invalidation

4. Audit log
   → Log every API key usage: key prefix, IP, endpoint, timestamp
   → Alert on unusual patterns: new IP, high error rate, unusual hours
```

```java
// Key revocation with Redis cache invalidation
@Service
public class ApiKeyRevocationService {

    public void revokeKey(UUID keyId) {
        // 1. Mark inactive in DB
        apiKeyRepo.setInactive(keyId, Instant.now());

        // 2. Publish revocation event — all instances invalidate their cache
        redisTemplate.convertAndSend("api-key-revoked", keyId.toString());

        // 3. Audit log
        auditLog.record("API_KEY_REVOKED", keyId, SecurityContextHolder.getContext());
    }
}

// All app instances subscribe and evict from local cache
@Component
public class ApiKeyRevocationListener {

    @RedisListener(topic = "api-key-revoked")
    public void onRevocation(String keyId) {
        localApiKeyCache.evict(keyId);
    }
}
```

---

## Interview Quick-Fire

**Q: Why store a hash of API keys instead of the raw key?**
If the database is compromised, raw keys expose all integrations immediately. With hashed storage, the attacker gets hashes that can't be reversed to valid keys. SHA-256 is appropriate here (unlike passwords) because API keys already have 256 bits of entropy — brute force is computationally infeasible. Show the raw key once at creation, then it's unrecoverable — just like GitHub personal access tokens.

**Q: What does HMAC request signing protect that API keys alone don't?**
API keys authenticate who is calling, but an intercepted key or MITM attack can send any payload. HMAC signing binds the signature to the exact request content (URL, headers, body hash) — any tampering invalidates the signature. It also includes a timestamp in the signed data, so a captured valid request can't be replayed after the tolerance window (typically 5 minutes). AWS Signature v4 is the canonical example.

**Q: How do you implement rate limiting per API key?**
Use a Redis sliding window: for each request, add the current timestamp to a sorted set keyed by API key ID, remove entries older than the window, and check if count exceeds the limit — all in a Lua script for atomicity. Different key tiers get different limits. Return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `Retry-After` headers so clients can adapt. Return HTTP 429 on limit exceeded.

<RelatedTopics :topics="['/architecture/rest-web', '/security/auth-protocols', '/security/cryptography', '/spring/spring-security']" />

[→ Back to Architecture Overview](/architecture/)
