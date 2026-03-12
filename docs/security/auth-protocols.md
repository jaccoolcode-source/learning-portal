---
title: Auth Protocols (JWT, OAuth2, OIDC)
description: Session-based auth, JWT structure and pitfalls, OAuth2 flows (Authorization Code + PKCE, Client Credentials), OpenID Connect, and SAML overview
category: security
pageClass: layout-security
difficulty: advanced
tags: [authentication, jwt, oauth2, oidc, saml, session, pkce, authorization-code]
related:
  - /spring/spring-security
  - /security/cryptography
  - /security/tls-ssl
estimatedMinutes: 35
---

# Auth Protocols (JWT, OAuth2, OIDC)

<DifficultyBadge level="advanced" />

Authentication tells you **who** someone is. Authorization tells you **what they can do**. This page covers the protocols that handle both — from simple session cookies to modern federated identity.

---

## Session-Based Authentication

The traditional stateful approach. The server stores session state.

```
1. User submits credentials
2. Server validates, creates session in DB/Redis
3. Server sends Set-Cookie: sessionId=abc123; HttpOnly; Secure; SameSite=Strict
4. Browser sends cookie automatically on subsequent requests
5. Server looks up session in DB to identify user
6. On logout: server deletes session record
```

```java
// Spring Security — form login with sessions (default)
http
    .formLogin(form -> form
        .loginPage("/login")
        .defaultSuccessUrl("/dashboard")
    )
    .logout(logout -> logout
        .logoutUrl("/logout")
        .invalidateHttpSession(true)
        .deleteCookies("JSESSIONID")
    )
    .sessionManagement(session -> session
        .maximumSessions(1)              // prevent concurrent sessions
        .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
    );
```

**Pros:** Easy revocation, simple implementation
**Cons:** Server must store state (scaling challenge), CSRF vulnerable

### Secure Cookie Attributes

| Attribute | Purpose |
|-----------|---------|
| `HttpOnly` | JS cannot read cookie → prevents XSS theft |
| `Secure` | Cookie sent over HTTPS only |
| `SameSite=Strict` | Cookie not sent in cross-site requests → prevents CSRF |
| `SameSite=Lax` | Cookie sent for top-level navigations (form submits blocked) |
| `Max-Age` / `Expires` | Cookie lifetime |

---

## JWT (JSON Web Token)

JWTs are **stateless** tokens. The server doesn't store session data — all information is in the token itself.

### Structure

```
Header.Payload.Signature

eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9
.eyJzdWIiOiJ1c2VyMTIzIiwicm9sZXMiOlsiVVNFUiJdLCJpYXQiOjE2MDAwMDAsImV4cCI6MTYwMDM2MH0
.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
```

**Header** (Base64URL decoded):
```json
{ "alg": "HS256", "typ": "JWT" }
```

**Payload** (Base64URL decoded):
```json
{
  "sub": "user123",
  "roles": ["USER"],
  "iat": 1600000,     // issued at
  "exp": 1600360,     // expiry (6 minutes)
  "iss": "myapp.com"  // issuer
}
```

**Signature:**
```
HMAC-SHA256(base64url(header) + "." + base64url(payload), secretKey)
```

### JWT in Spring Boot

```java
// Dependency
// implementation 'io.jsonwebtoken:jjwt-api:0.12.5'
// implementation 'io.jsonwebtoken:jjwt-impl:0.12.5'
// implementation 'io.jsonwebtoken:jjwt-jackson:0.12.5'

@Service
public class JwtService {
    // Use a proper SecretKey — NOT a raw string
    private final SecretKey signingKey;

    public JwtService(@Value("${jwt.secret-base64}") String secretBase64) {
        byte[] keyBytes = Base64.getDecoder().decode(secretBase64);
        this.signingKey = Keys.hmacShaKeyFor(keyBytes); // requires 256-bit key
    }

    public String generateToken(UserDetails user) {
        return Jwts.builder()
            .subject(user.getUsername())
            .claim("roles", user.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority).toList())
            .issuedAt(new Date())
            .expiration(new Date(System.currentTimeMillis() + Duration.ofHours(1).toMillis()))
            .signWith(signingKey)  // defaults to HS256
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

    public boolean isTokenExpired(String token) {
        return extractAllClaims(token).getExpiration().before(new Date());
    }

    public boolean isTokenValid(String token, UserDetails userDetails) {
        String username = extractUsername(token);
        return username.equals(userDetails.getUsername()) && !isTokenExpired(token);
    }
}
```

### RS256 (Asymmetric JWT — preferred for production)

Sign with **private key**, verify with **public key**. Resource servers can verify without the secret.

```java
// Generate RSA key pair
KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
kpg.initialize(2048);
KeyPair keyPair = kpg.generateKeyPair();

// Sign
String token = Jwts.builder()
    .subject("user123")
    .signWith(keyPair.getPrivate(), Jwts.SIG.RS256)
    .compact();

// Verify (at resource server — only needs public key)
Jwts.parser()
    .verifyWith(keyPair.getPublic())
    .build()
    .parseSignedClaims(token);
```

### JWT Storage Options

| Location | XSS Risk | CSRF Risk | Notes |
|----------|----------|-----------|-------|
| `localStorage` | **High** — JS-accessible | Low | **Avoid** — XSS steals token |
| `sessionStorage` | **High** — JS-accessible | Low | Cleared on tab close, still XSS-vulnerable |
| `HttpOnly cookie` | Low — JS can't read | **High** without SameSite | Best for web apps with `SameSite=Strict` |
| Memory (JS variable) | Medium | Low | Lost on page refresh |

**Best practice for web apps:** `HttpOnly; Secure; SameSite=Strict` cookie with short-lived access tokens + refresh token rotation.

### JWT Pitfalls

| Pitfall | Problem | Fix |
|---------|---------|-----|
| `alg: none` attack | Token with no signature accepted | Explicitly reject `none` algorithm |
| Algorithm confusion | HS256 key used as RS256 public key | Validate algorithm header; use library defaults |
| No expiry | Stolen token valid forever | Always set `exp` claim |
| Sensitive data in payload | Payload is Base64 decoded, not encrypted | Never put passwords, PII in JWT payload |
| Weak secret (HS256) | Brute-forceable | Use 256-bit+ random key; prefer RS256 |

---

## Refresh Token Flow

```
1. Login → server issues: access token (15min) + refresh token (7 days, HttpOnly cookie)
2. Client uses access token for API calls
3. Access token expires → 401
4. Client sends refresh token → server validates, issues new access + refresh tokens
5. Old refresh token is invalidated (rotation)
6. Logout → invalidate refresh token in DB
```

```
POST /auth/refresh
Cookie: refresh_token=<long-lived-token>

Response:
{
  "accessToken": "eyJ...",     // short-lived
}
Set-Cookie: refresh_token=<new-token>; HttpOnly; Secure; SameSite=Strict
```

::: warning Refresh Token Security
- Refresh tokens MUST be stored server-side to enable revocation
- Implement **refresh token rotation** — each use issues a new token, old one invalidated
- If a refresh token is reused (already rotated), this indicates theft → revoke all sessions
:::

---

## OAuth 2.0

OAuth 2.0 is an **authorization framework** — it delegates access without sharing credentials.

### Key Roles

| Role | Description |
|------|-------------|
| **Resource Owner** | The user |
| **Client** | Your application requesting access |
| **Authorization Server** | Issues tokens (e.g., Google, Auth0, Keycloak) |
| **Resource Server** | API that accepts access tokens |

### Authorization Code Flow + PKCE (Recommended for Web/Mobile)

```
1. Client generates code_verifier (random string) + code_challenge = SHA256(code_verifier)

2. Redirect user to Authorization Server:
   GET /authorize?
     response_type=code
     &client_id=myapp
     &redirect_uri=https://myapp.com/callback
     &scope=openid profile email
     &state=random-csrf-token       ← prevent CSRF
     &code_challenge=BASE64URL(SHA256(verifier))
     &code_challenge_method=S256

3. User authenticates + consents at Authorization Server

4. Authorization Server redirects back:
   GET https://myapp.com/callback?code=AUTH_CODE&state=random-csrf-token

5. Client verifies state, then exchanges code:
   POST /token
   code=AUTH_CODE
   &code_verifier=ORIGINAL_VERIFIER  ← proves client is who it says
   &grant_type=authorization_code
   &client_id=myapp
   &redirect_uri=https://myapp.com/callback

6. Authorization Server validates code_verifier against code_challenge
   → Returns access_token + id_token + refresh_token
```

**Why PKCE?** Prevents authorization code interception attacks. Even if the code is intercepted, attacker doesn't have the `code_verifier`.

### Client Credentials Flow (Machine-to-Machine)

No user involved — service-to-service authentication.

```
POST /token
grant_type=client_credentials
&client_id=service-a
&client_secret=secret123
&scope=api.read

→ Returns: access_token (no refresh token)
```

```java
// Spring OAuth2 client (machine-to-machine)
@Bean
public WebClient webClient(OAuth2AuthorizedClientManager authorizedClientManager) {
    ServletOAuth2AuthorizedClientExchangeFilterFunction oauth2Client =
        new ServletOAuth2AuthorizedClientExchangeFilterFunction(authorizedClientManager);
    oauth2Client.setDefaultClientRegistrationId("my-service");
    return WebClient.builder()
        .apply(oauth2Client.oauth2Configuration())
        .build();
}
```

### OAuth2 Resource Server in Spring

```java
// pom.xml: spring-boot-starter-oauth2-resource-server

@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/public/**").permitAll()
            .anyRequest().authenticated()
        )
        .oauth2ResourceServer(oauth2 -> oauth2
            .jwt(jwt -> jwt
                .decoder(JwtDecoders.fromOidcIssuerLocation("https://your-auth-server.com"))
            )
        )
        .build();
}

// application.yml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://your-auth-server.com
          # OR: jwk-set-uri: https://your-auth-server.com/.well-known/jwks.json
```

### Implicit Flow (Deprecated)

The Implicit Flow returned tokens directly in the URL fragment — insecure because tokens appear in browser history and server logs. **Do not use.** Always use Authorization Code + PKCE.

---

## OpenID Connect (OIDC)

OIDC is an **identity layer on top of OAuth 2.0**. While OAuth 2.0 handles authorization ("can this app access my files?"), OIDC handles authentication ("who is this user?").

```
OAuth 2.0 gives you: access_token (opaque or JWT to access APIs)
OIDC adds:           id_token (JWT with user identity claims)
                     /userinfo endpoint (standard user profile endpoint)
```

### ID Token Claims

```json
{
  "iss": "https://accounts.google.com",
  "sub": "110169484474386276334",
  "aud": "your-client-id",
  "exp": 1600360000,
  "iat": 1600356400,
  "email": "user@example.com",
  "email_verified": true,
  "name": "John Doe",
  "picture": "https://..."
}
```

### OIDC Discovery

Authorization servers expose a discovery endpoint:
```
GET https://your-auth-server.com/.well-known/openid-configuration

Returns:
{
  "issuer": "https://your-auth-server.com",
  "authorization_endpoint": "https://your-auth-server.com/authorize",
  "token_endpoint": "https://your-auth-server.com/token",
  "jwks_uri": "https://your-auth-server.com/.well-known/jwks.json",
  "userinfo_endpoint": "https://your-auth-server.com/userinfo",
  ...
}
```

---

## SAML 2.0 (Overview)

SAML (Security Assertion Markup Language) is an XML-based federation protocol, common in enterprise/SSO contexts. Older than OAuth2/OIDC.

```
Browser      →  Service Provider (SP) = Your App
                    ↓ Redirect to IdP
Browser      →  Identity Provider (IdP) = Active Directory, Okta, etc.
                    ↓ User authenticates
                    ↓ IdP generates XML Assertion (signed)
Browser      →  SP (POST with SAML Assertion)
                    ↓ SP validates signature
                    ↓ Grants access
```

**SAML vs OIDC:**
| | SAML | OIDC |
|--|------|------|
| Format | XML | JSON/JWT |
| Age | 2005 | 2014 |
| Mobile support | Poor | Excellent |
| Complexity | High | Moderate |
| Enterprise adoption | Very high | Growing rapidly |

---

## Comparison Summary

| Protocol | Stateful? | Use Case |
|----------|-----------|----------|
| Session cookie | Yes | Traditional web apps |
| JWT (stateless) | No | REST APIs, microservices |
| OAuth2 (Auth Code + PKCE) | Depends | Third-party access delegation |
| OAuth2 (Client Credentials) | No | Service-to-service |
| OIDC | Depends | SSO, social login |
| SAML | Yes (via session) | Enterprise SSO |

<RelatedTopics :topics="['/spring/spring-security', '/security/cryptography', '/security/tls-ssl']" />

[→ Back to Security Overview](/security/)
