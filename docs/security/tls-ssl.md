---
title: TLS / SSL / HTTPS
description: TLS 1.2 vs 1.3 handshake, X.509 certificates, CA chain, PKI, HTTPS security headers, mutual TLS, and certificate pinning
category: security
pageClass: layout-security
difficulty: advanced
tags: [tls, ssl, https, certificates, pki, hsts, csp, mutual-tls, certificate-pinning]
related:
  - /security/cryptography
  - /security/auth-protocols
  - /spring/spring-security
estimatedMinutes: 30
---

# TLS / SSL / HTTPS

<DifficultyBadge level="advanced" />

TLS (Transport Layer Security) is the cryptographic protocol that secures virtually all internet communication. Understanding the handshake, certificate chain, and security headers is essential for building and debugging secure applications.

---

## What TLS Provides

| Property | Mechanism |
|----------|-----------|
| **Confidentiality** | Symmetric encryption (AES-GCM) after key exchange |
| **Integrity** | AEAD (Authenticated Encryption with Associated Data) |
| **Authentication** | X.509 certificates signed by trusted CAs |
| **Forward Secrecy** | Ephemeral key exchange (ECDHE) — past sessions can't be decrypted if private key is later compromised |

---

## TLS 1.2 Handshake

```
Client                                    Server
  |                                         |
  |------ ClientHello ─────────────────────>|
  |   (TLS version, cipher suites, random)  |
  |                                         |
  |<----- ServerHello ──────────────────────|
  |   (chosen cipher suite, random)         |
  |                                         |
  |<----- Certificate ──────────────────────|
  |   (server's X.509 cert chain)           |
  |                                         |
  |<----- ServerHelloDone ─────────────────-|
  |                                         |
  |------ ClientKeyExchange ───────────────>|
  |   (pre-master secret, RSA encrypted)    |
  |                                         |
  |   [Both derive master secret from randoms + pre-master]
  |                                         |
  |------ ChangeCipherSpec ────────────────>|
  |------ Finished (encrypted) ────────────>|
  |                                         |
  |<----- ChangeCipherSpec ─────────────────|
  |<----- Finished (encrypted) ─────────────|
  |                                         |
  |====== Encrypted application data =======|
```

TLS 1.2 requires **2 round trips** before data can flow.

---

## TLS 1.3 Handshake (Faster & More Secure)

```
Client                                    Server
  |                                         |
  |------ ClientHello ─────────────────────>|
  |   (TLS 1.3, key_share, cipher suites)   |
  |   Client sends key share immediately    |
  |                                         |
  |<----- ServerHello ──────────────────────|
  |<----- EncryptedExtensions ──────────────|
  |<----- Certificate ──────────────────────|
  |<----- CertificateVerify ────────────────|
  |<----- Finished ─────────────────────────|
  |   [Keys derived — Server can now send data]
  |                                         |
  |------ Finished ────────────────────────>|
  |====== Encrypted application data =======|
```

TLS 1.3 requires only **1 round trip**. Also supports **0-RTT** (resumption, but with replay risk).

### TLS 1.2 vs 1.3 Comparison

| Feature | TLS 1.2 | TLS 1.3 |
|---------|---------|---------|
| Handshake round trips | 2 | 1 |
| Forward secrecy | Optional (ECDHE) | **Mandatory** |
| RSA key exchange | Supported | **Removed** |
| Cipher suites | Many (some weak) | 5 strong only |
| 0-RTT resumption | Via session tickets | Supported (replay risk) |
| Weak ciphers (RC4, 3DES) | Allowed | **Removed** |

::: tip Minimum TLS Version
Configure servers to require **TLS 1.2 minimum**. Disable TLS 1.0 and 1.1 — both are deprecated.
:::

---

## X.509 Certificates

A certificate binds a **public key** to an **identity** (domain name, organisation).

### Certificate Structure

```
Certificate
├── Version (v3)
├── Serial Number
├── Signature Algorithm (SHA256withRSA)
├── Issuer (CA name)
├── Validity
│   ├── Not Before: 2024-01-01
│   └── Not After:  2025-01-01
├── Subject (domain: example.com)
├── Subject Public Key Info
│   ├── Algorithm: RSA
│   └── Public Key: (2048-bit)
└── Extensions
    ├── Subject Alternative Names: [example.com, www.example.com]
    ├── Key Usage: Digital Signature, Key Encipherment
    ├── Extended Key Usage: TLS Web Server Authentication
    └── Basic Constraints: CA:FALSE
```

### Certificate Types

| Type | Validation | Use Case |
|------|-----------|----------|
| DV (Domain Validated) | Domain control only | Most websites, automated (Let's Encrypt) |
| OV (Organisation Validated) | Domain + org identity | Business websites |
| EV (Extended Validated) | Full org vetting | High-assurance banking, etc. |
| Wildcard | `*.example.com` | All subdomains |
| SAN | Multiple domains | One cert for many domains |

---

## PKI — Certificate Authority Chain

```
Root CA (self-signed, offline, in OS/browser trust store)
  └─── Intermediate CA (signed by Root CA)
         └─── Leaf Certificate (signed by Intermediate CA, your server cert)
```

**Verification process:**
1. Browser receives server's leaf certificate
2. Checks it's signed by a trusted Intermediate CA
3. Checks Intermediate CA is signed by a Root CA in the trust store
4. Verifies certificate is not expired and not revoked (OCSP / CRL)
5. Checks Subject Alternative Name matches the hostname

### Certificate Revocation

| Method | Description |
|--------|-------------|
| **CRL** (Certificate Revocation List) | List of revoked serial numbers, downloaded periodically |
| **OCSP** (Online Certificate Status Protocol) | Real-time revocation check |
| **OCSP Stapling** | Server fetches and caches OCSP response, sends it with handshake (recommended) |

---

## HTTPS Security Headers

These HTTP response headers instruct browsers to enforce additional security policies.

### HSTS (HTTP Strict Transport Security)

Tells browsers to only connect over HTTPS, even if user types `http://`.

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

- `max-age=31536000` — 1 year in seconds
- `includeSubDomains` — applies to all subdomains
- `preload` — submit to Chrome/Firefox preload list (hardcoded HTTPS)

```java
// Spring Security
http.headers(headers -> headers
    .httpStrictTransportSecurity(hsts -> hsts
        .maxAgeInSeconds(31536000)
        .includeSubDomains(true)
        .preload(true)
    )
);
```

### Content Security Policy (CSP)

Restricts which resources the browser can load, preventing XSS.

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-{random}'; object-src 'none'; base-uri 'self'
```

| Directive | Meaning |
|-----------|---------|
| `default-src 'self'` | Load all resource types from same origin only |
| `script-src 'nonce-xyz'` | Only execute scripts with matching nonce |
| `object-src 'none'` | Block all plugins (Flash, etc.) |
| `upgrade-insecure-requests` | Auto-upgrade HTTP to HTTPS |

```java
http.headers(headers -> headers
    .contentSecurityPolicy(csp -> csp
        .policyDirectives(
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; " +
            "object-src 'none'"
        )
    )
);
```

### Other Security Headers

```java
http.headers(headers -> headers
    // Prevent clickjacking — deny embedding in iframes
    .frameOptions(frame -> frame.deny())

    // Prevent MIME sniffing
    .contentTypeOptions(Customizer.withDefaults())

    // XSS filter (legacy browsers)
    .xssProtection(xss -> xss.headerValue(XXssProtectionHeaderWriter.HeaderValue.ENABLED_MODE_BLOCK))

    // Referrer Policy
    .referrerPolicy(referrer -> referrer
        .policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN)
    )

    // Permissions Policy (limits browser features)
    .permissionsPolicy(permissions -> permissions
        .policy("camera=(), microphone=(), geolocation=()")
    )
);
```

| Header | Purpose |
|--------|---------|
| `X-Frame-Options: DENY` | Prevent clickjacking via iframes |
| `X-Content-Type-Options: nosniff` | Prevent MIME-type sniffing |
| `Referrer-Policy: strict-origin` | Control referrer information |
| `Permissions-Policy` | Restrict browser feature access |

---

## Mutual TLS (mTLS)

In standard TLS, only the server presents a certificate. In **mutual TLS**, both client and server authenticate with certificates. Common in microservices and API-to-API communication.

```
Client                              Server
  |                                   |
  |--- ClientHello ─────────────────>|
  |<-- ServerHello + Certificate ─────|
  |                                   |
  |--- ClientCertificate ───────────>|  ← Client also sends cert
  |--- CertificateVerify ───────────>|  ← Client proves it has private key
  |--- Finished ────────────────────>|
  |<-- Finished ──────────────────────|
  |====== Encrypted + Mutually Authenticated ======|
```

```java
// Spring Boot mTLS configuration (application.yml)
server:
  ssl:
    enabled: true
    key-store: classpath:server-keystore.p12
    key-store-password: ${KEY_STORE_PASSWORD}
    key-store-type: PKCS12
    trust-store: classpath:client-truststore.p12  # trusted client CAs
    trust-store-password: ${TRUST_STORE_PASSWORD}
    client-auth: need  # NEED = require, WANT = optional
```

---

## Certificate Pinning

Certificate pinning hardcodes the expected certificate (or its public key hash) in the client, preventing attacks even if a CA is compromised.

```java
// OkHttp (Android / Java HTTP client)
OkHttpClient client = new OkHttpClient.Builder()
    .certificatePinner(new CertificatePinner.Builder()
        .add("api.example.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        // Pin the public key hash, not the cert (survives cert renewal)
        .build()
    )
    .build();
```

::: warning Certificate Pinning Trade-offs
- Pinning prevents CA-compromise MITM attacks
- But: if you pin incorrectly or forget to update pins before cert renewal → **outage**
- Consider pinning the intermediate CA's public key rather than the leaf cert
- Always include backup pins
:::

---

## Common TLS Vulnerabilities

| Vulnerability | Description | Mitigation |
|--------------|-------------|------------|
| BEAST | CBC mode attack in TLS 1.0 | Use TLS 1.2+ |
| POODLE | SSL 3.0 fallback attack | Disable SSL 3.0 and TLS 1.0 |
| HEARTBLEED | OpenSSL buffer over-read | Update OpenSSL |
| FREAK | Weak export-grade RSA | Remove export cipher suites |
| DROWN | SSLv2 decrypts TLS traffic | Disable SSLv2 everywhere |
| SWEET32 | 64-bit block cipher birthday attack | Disable 3DES |
| Downgrade | Force weaker protocol version | TLS_FALLBACK_SCSV |

---

## Spring Boot TLS Configuration

```yaml
# application.yml
server:
  port: 8443
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
    key-store-password: ${SSL_KEY_STORE_PASSWORD}
    key-store-type: PKCS12
    key-alias: myapp
    # TLS version constraints
    enabled-protocols: TLSv1.2,TLSv1.3
    # Cipher suite allowlist (TLS 1.3 suites are always enabled)
    ciphers:
      - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
      - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
```

<RelatedTopics :topics="['/security/cryptography', '/security/auth-protocols', '/spring/spring-security']" />

[→ Back to Security Overview](/security/)
