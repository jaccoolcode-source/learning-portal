---
title: Spring Security
description: Spring Security — filter chain, authentication, authorization, CORS, CSRF, JWT, OAuth2 Resource Server, method security, and rate limiting
category: spring
pageClass: layout-spring
difficulty: advanced
tags: [spring-security, authentication, authorization, jwt, oauth2, cors, csrf]
related:
  - /spring/spring-boot
  - /spring/aop
  - /security/auth-protocols
  - /security/web-attacks
estimatedMinutes: 30
---

# Spring Security

<DifficultyBadge level="advanced" />

Spring Security provides comprehensive security for Spring applications — authentication (who are you?) and authorization (what can you do?). Every request passes through a configurable filter chain before reaching your controllers.

---

## Security Filter Chain

Spring Security works as a chain of Servlet filters. Every request passes through them before reaching controllers.

```
Request
  ↓
SecurityContextPersistenceFilter  (load SecurityContext from session/token)
  ↓
CorsFilter                        (handle CORS preflight and headers)
  ↓
CsrfFilter                        (validate CSRF token — skipped for JWT APIs)
  ↓
UsernamePasswordAuthenticationFilter  (process login)
  ↓
BearerTokenAuthenticationFilter  (process JWT)
  ↓
ExceptionTranslationFilter  (translate security exceptions to HTTP responses)
  ↓
FilterSecurityInterceptor  (check authorization rules)
  ↓
DispatcherServlet → Controller
```

---

## Basic Configuration (Spring Boot 3.x)

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)  // disable for REST APIs
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS)) // JWT: no sessions
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()     // public endpoints
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .requestMatchers("/api/users/**").hasAnyRole("USER", "ADMIN")
                .anyRequest().authenticated()                   // everything else needs auth
            )
            .addFilterBefore(jwtAuthFilter(), UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }
}
```

---

## Authentication

```java
// UserDetails — Spring Security's user representation
@Service
public class MyUserDetailsService implements UserDetailsService {
    @Autowired UserRepository userRepo;

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        User user = userRepo.findByUsername(username)
            .orElseThrow(() -> new UsernameNotFoundException(username));

        return org.springframework.security.core.userdetails.User.builder()
            .username(user.getUsername())
            .password(user.getPasswordHash())  // BCrypt hash
            .roles(user.getRoles().toArray(String[]::new))
            .build();
    }
}
```

---

## JWT Authentication Filter

```java
@Component
public class JwtAuthFilter extends OncePerRequestFilter {
    @Autowired JwtService jwtService;
    @Autowired UserDetailsService userDetailsService;

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                                    FilterChain chain) throws ServletException, IOException {
        String authHeader = req.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            chain.doFilter(req, res);
            return;
        }

        String token = authHeader.substring(7);
        String username = jwtService.extractUsername(token);

        if (username != null && SecurityContextHolder.getContext().getAuthentication() == null) {
            UserDetails user = userDetailsService.loadUserByUsername(username);
            if (jwtService.isTokenValid(token, user)) {
                UsernamePasswordAuthenticationToken authToken =
                    new UsernamePasswordAuthenticationToken(user, null, user.getAuthorities());
                authToken.setDetails(new WebAuthenticationDetailsSource().buildDetails(req));
                SecurityContextHolder.getContext().setAuthentication(authToken);
            }
        }
        chain.doFilter(req, res);
    }
}
```

### JWT Service (Proper SecretKey)

```java
// Dependency: io.jsonwebtoken:jjwt-api:0.12.5 + jjwt-impl + jjwt-jackson
@Service
public class JwtService {
    // Use SecretKey — NOT a raw string
    private final SecretKey signingKey;

    public JwtService(@Value("${jwt.secret-base64}") String secretBase64) {
        // Decode a 256-bit Base64-encoded secret from config
        byte[] keyBytes = Base64.getDecoder().decode(secretBase64);
        this.signingKey = Keys.hmacShaKeyFor(keyBytes); // HS256 requires 256-bit key
    }

    public String generateToken(UserDetails userDetails) {
        return generateToken(Map.of(), userDetails);
    }

    public String generateToken(Map<String, Object> extraClaims, UserDetails userDetails) {
        return Jwts.builder()
            .claims(extraClaims)
            .subject(userDetails.getUsername())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + Duration.ofHours(1).toMillis()))
            .signWith(signingKey) // HS256 by default
            .compact();
    }

    public Claims extractAllClaims(String token) {
        return Jwts.parser()
            .verifyWith(signingKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }

    public String extractUsername(String token) {
        return extractAllClaims(token).getSubject();
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        String username = extractUsername(token);
        Date expiry = extractAllClaims(token).getExpiration();
        return username.equals(userDetails.getUsername()) && expiry.after(new Date());
    }
}
```

Generate a secure Base64 secret:
```bash
# Generate 256-bit (32-byte) random key, Base64-encoded
openssl rand -base64 32
```

---

## CORS Configuration

CORS (Cross-Origin Resource Sharing) controls which origins can make requests to your API.

```java
@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();

    // Allowed origins — be specific in production
    config.setAllowedOrigins(List.of(
        "https://myapp.com",
        "https://admin.myapp.com"
    ));

    // Allowed HTTP methods
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));

    // Allowed request headers
    config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Requested-With"));

    // Expose response headers to browser JS
    config.setExposedHeaders(List.of("X-Total-Count", "X-Page-Number"));

    // Allow cookies / Authorization header in cross-origin requests
    config.setAllowCredentials(true);

    // How long preflight response can be cached (seconds)
    config.setMaxAge(3600L);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", config);
    return source;
}

// Wire into the filter chain
http.cors(cors -> cors.configurationSource(corsConfigurationSource()));
```

::: warning Development vs Production CORS
Never use `allowedOrigins("*")` with `allowCredentials(true)` — browsers reject this combination. In dev, use explicit `http://localhost:3000` etc.
:::

---

## CSRF — When to Enable vs Disable

### CSRF with Session-Based Apps (Keep Enabled)

```java
// Spring Security enables CSRF by default
// For form-based apps, CSRF token is automatically added to forms in Thymeleaf
// <form th:action="@{/transfer}" method="post"> → includes hidden _csrf field

// Customise CSRF cookie (SameSite)
http.csrf(csrf -> csrf
    .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
);
```

### CSRF with REST + JWT (Disable)

```java
// Safe to disable because:
// 1. JWT is in Authorization header — not sent automatically by browsers
// 2. Stateless — no session cookies to hijack
http.csrf(AbstractHttpConfigurer::disable);
```

### SameSite Cookies and CSRF

`SameSite=Strict` cookies are not sent with cross-site requests — this prevents CSRF at the cookie level, complementing Spring's CSRF protection:

```java
@Bean
public CookieSameSiteSupplier applicationCookieSameSiteSupplier() {
    return CookieSameSiteSupplier.ofStrict();
}
```

| SameSite | Cross-site GET | Cross-site POST | CSRF Protection |
|----------|---------------|-----------------|-----------------|
| `Strict` | No cookie sent | No cookie sent | Strong |
| `Lax` | Cookie sent | No cookie sent | Moderate |
| `None` | Cookie sent | Cookie sent | None (requires `Secure`) |

---

## OAuth2 Resource Server

Validate JWT tokens issued by an external authorization server (Keycloak, Auth0, Okta, etc.).

```xml
<!-- pom.xml -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/public/**").permitAll()
            .anyRequest().authenticated()
        )
        .oauth2ResourceServer(oauth2 -> oauth2
            .jwt(jwt -> jwt
                // Spring fetches public keys automatically from issuer's JWKS endpoint
                .decoder(JwtDecoders.fromOidcIssuerLocation(
                    "https://your-auth-server.com/realms/myrealm"
                ))
                // Map JWT claims to Spring Security authorities
                .jwtAuthenticationConverter(jwtAuthenticationConverter())
            )
        )
        .build();
}

@Bean
public JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtGrantedAuthoritiesConverter converter = new JwtGrantedAuthoritiesConverter();
    converter.setAuthorityPrefix("ROLE_");
    converter.setAuthoritiesClaimName("roles"); // claim name in your JWT

    JwtAuthenticationConverter jwtConverter = new JwtAuthenticationConverter();
    jwtConverter.setJwtGrantedAuthoritiesConverter(converter);
    return jwtConverter;
}
```

```yaml
# application.yml — simpler alternative to Java config
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://your-auth-server.com/realms/myrealm
          # jwk-set-uri: https://your-auth-server.com/realms/myrealm/protocol/openid-connect/certs
```

---

## Method-level Security

```java
@Configuration
@EnableMethodSecurity  // enable @PreAuthorize, @PostAuthorize, @Secured
public class MethodSecurityConfig { }

@Service
public class AdminService {
    @PreAuthorize("hasRole('ADMIN')")
    public List<User> getAllUsers() { ... }

    @PreAuthorize("hasRole('ADMIN') or #userId == authentication.principal.id")
    public User getUser(Long userId) { ... }

    @PostAuthorize("returnObject.owner == authentication.name")
    public Document getDocument(Long id) { ... }

    @Secured({"ROLE_ADMIN", "ROLE_MANAGER"})
    public void deleteUser(Long id) { ... }
}
```

---

## Accessing Current User

```java
// In controllers:
@GetMapping("/profile")
public UserProfile getProfile(@AuthenticationPrincipal UserDetails user) {
    return profileService.getProfile(user.getUsername());
}

// In services (via SecurityContext):
public String getCurrentUsername() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    return auth != null ? auth.getName() : null;
}
```

---

## Refresh Token Flow

```java
@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @PostMapping("/refresh")
    public ResponseEntity<TokenResponse> refresh(
            @CookieValue("refresh_token") String refreshToken,
            HttpServletResponse response) {

        // 1. Validate refresh token (from DB — enables revocation)
        RefreshToken storedToken = refreshTokenService.findAndValidate(refreshToken);

        // 2. Rotate: invalidate old token, issue new one
        refreshTokenService.invalidate(storedToken);
        String newRefreshToken = refreshTokenService.create(storedToken.getUser());

        // 3. Issue new access token
        String accessToken = jwtService.generateToken(storedToken.getUser());

        // 4. Set new refresh token as HttpOnly cookie
        ResponseCookie cookie = ResponseCookie.from("refresh_token", newRefreshToken)
            .httpOnly(true)
            .secure(true)
            .sameSite("Strict")
            .maxAge(Duration.ofDays(7))
            .path("/api/auth/refresh")
            .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());

        return ResponseEntity.ok(new TokenResponse(accessToken));
    }
}
```

---

## Rate Limiting (Bucket4j)

Rate limiting is not built into Spring Security, but commonly paired with it.

```xml
<dependency>
    <groupId>com.bucket4j</groupId>
    <artifactId>bucket4j-core</artifactId>
    <version>8.9.0</version>
</dependency>
```

```java
@Component
public class RateLimitFilter extends OncePerRequestFilter {
    // In-memory — use Redis-backed Bucket4j for distributed systems
    private final Map<String, Bucket> buckets = new ConcurrentHashMap<>();

    private Bucket createBucket() {
        return Bucket.builder()
            .addLimit(Bandwidth.classic(100, Refill.intervally(100, Duration.ofMinutes(1))))
            .build();
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String clientIp = request.getRemoteAddr();
        Bucket bucket = buckets.computeIfAbsent(clientIp, k -> createBucket());

        if (bucket.tryConsume(1)) {
            filterChain.doFilter(request, response);
        } else {
            response.setStatus(429);
            response.getWriter().write("Too Many Requests");
        }
    }
}
```

---

## Summary

| Concern | Spring Security Solution |
|---------|------------------------|
| Authentication | `UserDetailsService`, `AuthenticationManager` |
| Password storage | `BCryptPasswordEncoder` / `Argon2PasswordEncoder` |
| JWT (self-issued) | `JwtService` + `JwtAuthFilter` (custom) |
| JWT (external IdP) | `oauth2ResourceServer().jwt()` |
| CORS | `CorsConfigurationSource` bean |
| CSRF | Enabled by default; disable for stateless REST+JWT |
| Method security | `@PreAuthorize`, `@PostAuthorize`, `@Secured` |
| Rate limiting | Bucket4j (external library) |

<RelatedTopics :topics="['/security/auth-protocols', '/security/web-attacks', '/spring/spring-boot', '/spring/aop']" />

[→ Take the Spring Quiz](/quizzes/spring-quiz)
