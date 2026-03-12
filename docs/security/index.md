---
title: Security
description: Comprehensive security reference for Java developers — web attacks, cryptography, TLS, authentication protocols, and secure coding practices
category: security
pageClass: layout-security
difficulty: intermediate
tags: [security, owasp, cryptography, tls, jwt, oauth2, secure-coding]
related:
  - /spring/spring-security
  - /databases/sql
estimatedMinutes: 10
---

# Security

<DifficultyBadge level="intermediate" />

Security is a cross-cutting concern that every Java developer needs to understand — not just for interviews, but for building software that doesn't get compromised. This section covers the full picture: attacks, defences, cryptographic primitives, transport security, authentication protocols, and day-to-day secure coding.

---

## What's Covered

| Topic | Key Concepts |
|-------|-------------|
| [Web Attacks](/security/web-attacks) | OWASP Top 10 — XSS, CSRF, SQLi, SSRF, IDOR, XXE, path traversal |
| [Cryptography](/security/cryptography) | Hashing, AES, RSA/ECDSA, HMAC, digital signatures, key derivation |
| [TLS / SSL / HTTPS](/security/tls-ssl) | Handshake, certificates, CA chain, HSTS, CSP, mutual TLS |
| [Auth Protocols](/security/auth-protocols) | Sessions, JWT, OAuth2 flows, OIDC, SAML |
| [Secure Coding](/security/secure-coding) | Input validation, secrets management, SAST/DAST, Spring headers |

For Spring-specific security configuration see [Spring Security](/spring/spring-security).

---

## Why Security Matters for Interviews

Senior and mid-level Java/Spring interviews routinely include:

- **"How do you prevent SQL injection in your app?"** — input validation, PreparedStatement, JPA
- **"What's the difference between authentication and authorization?"** — who you are vs what you can do
- **"Explain JWT — structure, signing, storage risks"** — header/payload/signature, HttpOnly cookie vs localStorage
- **"How does OAuth2 Authorization Code + PKCE work?"** — the full flow, what PKCE prevents
- **"When would you disable CSRF protection?"** — stateless JWT REST APIs

---

## Core Concepts to Internalize

### Defence in Depth
Never rely on a single security control. Layer your defences:
1. Validate input at the boundary
2. Encode output for the target context
3. Use parameterised queries
4. Apply least-privilege at every layer
5. Log and monitor anomalies

### Threat Modelling (STRIDE)
| Threat | Description | Example |
|--------|-------------|---------|
| **S**poofing | Impersonating another user/system | JWT forgery |
| **T**ampering | Modifying data in transit | MITM, parameter tampering |
| **R**epudiation | Denying actions | Missing audit logs |
| **I**nformation disclosure | Exposing sensitive data | Stack traces in responses |
| **D**enial of service | Exhausting resources | ReDoS, brute force |
| **E**levation of privilege | Gaining unauthorised access | IDOR, broken auth |

### CIA Triad
- **Confidentiality** — only authorised parties can read data (TLS, encryption)
- **Integrity** — data hasn't been tampered with (HMAC, digital signatures)
- **Availability** — system remains accessible (rate limiting, DDoS protection)

---

## Quick Reference: Common Spring Security Setup

```java
@Bean
public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
    return http
        .csrf(AbstractHttpConfigurer::disable)      // REST + JWT = no CSRF needed
        .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
        .authorizeHttpRequests(auth -> auth
            .requestMatchers("/api/public/**").permitAll()
            .anyRequest().authenticated()
        )
        .oauth2ResourceServer(oauth2 -> oauth2.jwt(Customizer.withDefaults()))
        .headers(headers -> headers
            .frameOptions(HeadersConfigurer.FrameOptionsConfig::deny)
            .contentSecurityPolicy(csp -> csp.policyDirectives("default-src 'self'"))
        )
        .build();
}
```

<RelatedTopics :topics="['/spring/spring-security', '/security/web-attacks', '/security/auth-protocols']" />
