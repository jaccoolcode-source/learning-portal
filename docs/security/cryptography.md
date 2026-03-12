---
title: Cryptography
description: Cryptographic primitives for Java developers — hashing, symmetric encryption, asymmetric encryption, HMAC, digital signatures, and key derivation
category: security
pageClass: layout-security
difficulty: advanced
tags: [cryptography, hashing, bcrypt, aes, rsa, hmac, digital-signatures, pbkdf2]
related:
  - /security/tls-ssl
  - /security/auth-protocols
  - /security/secure-coding
estimatedMinutes: 30
---

# Cryptography

<DifficultyBadge level="advanced" />

Cryptography is the mathematical foundation of security. You don't need to implement algorithms — but you must know which ones to use, when, and why certain choices are dangerous.

---

## Mental Model: One-Way vs Two-Way

```
One-way (Hashing)        → Cannot recover original. Use for passwords, integrity checks.
Two-way (Encryption)     → Can decrypt with correct key. Use for data that must be read later.
Signing                  → Proves authenticity + integrity without hiding content.
```

---

## Hashing

Hashing produces a fixed-size digest from arbitrary input. A secure hash is:
- **Deterministic** — same input → same output
- **One-way** — cannot derive input from output
- **Collision-resistant** — hard to find two inputs with same output
- **Avalanche effect** — tiny input change → completely different output

### Algorithm Comparison

| Algorithm | Output Size | Status | Use Case |
|-----------|------------|--------|----------|
| MD5 | 128-bit | **Broken** — never for security | Legacy checksums only |
| SHA-1 | 160-bit | **Deprecated** | Never for new code |
| SHA-256 | 256-bit | Secure | General integrity, HMAC, TLS |
| SHA-512 | 512-bit | Secure | Higher security requirement |
| bcrypt | 60-char string | Secure | **Password storage** |
| Argon2id | Variable | Recommended | **Password storage (preferred)** |

### Password Hashing in Java

```java
// BCrypt via Spring Security
PasswordEncoder encoder = new BCryptPasswordEncoder(12); // cost factor 12
String hash = encoder.encode("myPassword123");

boolean matches = encoder.matches("myPassword123", hash);

// Argon2 (OWASP recommendation for new systems)
PasswordEncoder argon2 = new Argon2PasswordEncoder(
    16,    // saltLength bytes
    32,    // hashLength bytes
    1,     // parallelism
    65536, // memory in KB (64 MB)
    3      // iterations
);

// NEVER store plaintext or reversibly encrypted passwords
// NEVER use MD5/SHA-1/SHA-256 alone for passwords (no salt, too fast)
```

::: danger Password Anti-patterns
```java
// WRONG — fast hash, no salt, rainbow table vulnerable
String hash = DigestUtils.md5Hex(password);

// WRONG — reversible
String encoded = Base64.encode(password.getBytes());

// WRONG — SHA-256 alone (still too fast, brute-forceable)
MessageDigest md = MessageDigest.getInstance("SHA-256");
byte[] hash = md.digest(password.getBytes());
```
:::

### General Purpose SHA-256

```java
import java.security.MessageDigest;
import java.util.HexFormat;

public static String sha256(String input) throws NoSuchAlgorithmException {
    MessageDigest md = MessageDigest.getInstance("SHA-256");
    byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
    return HexFormat.of().formatHex(hash);
}
```

---

## Symmetric Encryption (AES)

Same key for encryption and decryption. Fast — suitable for large data.

### AES-GCM (Recommended Mode)

GCM (Galois/Counter Mode) provides **authenticated encryption** — it detects tampering.

```java
import javax.crypto.*;
import javax.crypto.spec.*;
import java.security.*;

public class AesGcmService {
    private static final String ALGORITHM = "AES/GCM/NoPadding";
    private static final int KEY_SIZE = 256;       // bits
    private static final int IV_SIZE = 12;         // bytes (96-bit IV for GCM)
    private static final int TAG_LENGTH = 128;     // bits

    // Generate a new key (store this securely!)
    public SecretKey generateKey() throws NoSuchAlgorithmException {
        KeyGenerator keyGen = KeyGenerator.getInstance("AES");
        keyGen.init(KEY_SIZE, SecureRandom.getInstanceStrong());
        return keyGen.generateKey();
    }

    // Encrypt — returns IV + ciphertext combined
    public byte[] encrypt(byte[] plaintext, SecretKey key) throws Exception {
        byte[] iv = new byte[IV_SIZE];
        SecureRandom.getInstanceStrong().nextBytes(iv);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH, iv));
        byte[] ciphertext = cipher.doFinal(plaintext);

        // Prepend IV to ciphertext
        byte[] result = new byte[IV_SIZE + ciphertext.length];
        System.arraycopy(iv, 0, result, 0, IV_SIZE);
        System.arraycopy(ciphertext, 0, result, IV_SIZE, ciphertext.length);
        return result;
    }

    // Decrypt — extracts IV from beginning
    public byte[] decrypt(byte[] ivPlusCiphertext, SecretKey key) throws Exception {
        byte[] iv = Arrays.copyOfRange(ivPlusCiphertext, 0, IV_SIZE);
        byte[] ciphertext = Arrays.copyOfRange(ivPlusCiphertext, IV_SIZE, ivPlusCiphertext.length);

        Cipher cipher = Cipher.getInstance(ALGORITHM);
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_LENGTH, iv));
        return cipher.doFinal(ciphertext);
    }
}
```

### AES Modes Comparison

| Mode | Authenticated | Parallelisable | Notes |
|------|--------------|----------------|-------|
| ECB | No | Yes | **Never use** — identical blocks produce identical ciphertext |
| CBC | No | Decrypt only | Needs separate MAC; padding oracle attacks |
| CTR | No | Yes | Needs separate MAC |
| **GCM** | **Yes** | Yes | **Recommended** — AEAD, widely used in TLS |
| CCM | Yes | No | Used in constrained environments |

---

## Asymmetric Encryption (RSA / ECDSA)

Different keys for encryption (public) and decryption (private). Slow — typically used to exchange symmetric keys, or for digital signatures.

### RSA Key Pair Generation

```java
import java.security.*;

KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
kpg.initialize(2048); // 2048 minimum; 4096 for sensitive data
KeyPair keyPair = kpg.generateKeyPair();

PublicKey publicKey = keyPair.getPublic();
PrivateKey privateKey = keyPair.getPrivate();
```

### RSA Encryption (small data / key exchange)

```java
// Encrypt with recipient's public key
Cipher cipher = Cipher.getInstance("RSA/ECB/OAEPWithSHA-256AndMGF1Padding");
cipher.init(Cipher.ENCRYPT_MODE, publicKey);
byte[] ciphertext = cipher.doFinal(plaintextBytes);

// Decrypt with private key
cipher.init(Cipher.DECRYPT_MODE, privateKey);
byte[] plaintext = cipher.doFinal(ciphertext);
```

::: tip RSA in Practice
RSA doesn't encrypt large data directly. In practice:
1. Generate a random AES session key
2. Encrypt the session key with RSA (public key)
3. Encrypt the actual data with AES
This is called **hybrid encryption** — TLS uses this pattern.
:::

### ECDSA (Elliptic Curve) — for Signatures

ECDSA provides equivalent security to RSA with much smaller key sizes:

| RSA Key Size | ECDSA Key Size | Security Level |
|-------------|----------------|---------------|
| 2048-bit | 224-bit | ~112-bit |
| 3072-bit | 256-bit | ~128-bit |
| 7680-bit | 384-bit | ~192-bit |

---

## HMAC (Hash-based Message Authentication Code)

HMAC proves both **integrity** (data not tampered) and **authenticity** (sender has the secret key). It's a symmetric authentication code.

```java
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public static byte[] hmacSha256(byte[] data, byte[] secretKey) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(secretKey, "HmacSHA256"));
    return mac.doFinal(data);
}

// Constant-time comparison (prevent timing attacks)
public static boolean verifyHmac(byte[] received, byte[] expected) {
    return MessageDigest.isEqual(received, expected);
}
```

**HMAC vs plain Hash:**
- `SHA-256(data)` — anyone can verify, anyone can forge
- `HMAC-SHA256(data, key)` — only parties with the key can verify or forge

---

## Digital Signatures

Digital signatures use **asymmetric keys**: sign with **private key**, verify with **public key**.

Properties:
- **Authentication** — only private key holder could sign
- **Integrity** — signature invalidates if data changes
- **Non-repudiation** — signer cannot deny signing

```java
// Sign with private key
Signature signer = Signature.getInstance("SHA256withRSA");
signer.initSign(privateKey);
signer.update(data);
byte[] signature = signer.sign();

// Verify with public key
Signature verifier = Signature.getInstance("SHA256withRSA");
verifier.initVerify(publicKey);
verifier.update(data);
boolean valid = verifier.verify(signature);
```

**HMAC vs Digital Signature:**
| | HMAC | Digital Signature |
|--|------|-----------------|
| Keys | Symmetric (shared secret) | Asymmetric (private/public) |
| Non-repudiation | No | Yes |
| Performance | Fast | Slow (RSA) |
| Use case | API authentication, JWT (HS256) | JWT (RS256), certificates, code signing |

---

## Key Derivation (PBKDF2 / Argon2)

When you must derive a cryptographic key from a password (not ideal, but sometimes necessary):

```java
// PBKDF2 — acceptable, but Argon2 is preferred
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

public static byte[] pbkdf2(char[] password, byte[] salt,
                             int iterations, int keyLengthBits)
        throws Exception {
    PBEKeySpec spec = new PBEKeySpec(password, salt, iterations, keyLengthBits);
    SecretKeyFactory skf = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256");
    byte[] key = skf.generateSecret(spec).getEncoded();
    spec.clearPassword(); // clear sensitive data
    return key;
}

// Recommended parameters (2024):
// iterations: 600,000+ for PBKDF2-HMAC-SHA256
// keyLength: 256 bits
// salt: 16 bytes minimum, random
```

---

## Secure Random Number Generation

```java
// CORRECT — cryptographically secure
SecureRandom random = SecureRandom.getInstanceStrong();
byte[] token = new byte[32]; // 256 bits
random.nextBytes(token);
String tokenHex = HexFormat.of().formatHex(token);

// For session tokens, API keys, CSRF tokens:
String sessionToken = Base64.getUrlEncoder().withoutPadding()
    .encodeToString(token);

// WRONG — not cryptographically secure
Random random = new Random(); // predictable seed!
Math.random();               // same issue
```

---

## Cryptography Decision Tree

```
Need to store a password?
  → bcrypt (cost 12+) or Argon2id

Need to verify data integrity + authenticity (shared secret)?
  → HMAC-SHA256

Need to encrypt data at rest?
  → AES-256-GCM

Need to encrypt data for a specific recipient?
  → RSA (key exchange) + AES (data)  OR  ECDH + AES

Need to prove who signed something (non-repudiation)?
  → RSA-SHA256 or ECDSA signature

Need a general-purpose hash (not passwords)?
  → SHA-256 or SHA-3

Need a random token?
  → SecureRandom, 256 bits minimum
```

<RelatedTopics :topics="['/security/tls-ssl', '/security/auth-protocols', '/security/web-attacks']" />

[→ Back to Security Overview](/security/)
