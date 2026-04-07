---
title: Security Quiz
---

<script setup>
const questions = [
  {
    question: "Which OWASP Top 10 vulnerability allows an attacker to execute arbitrary SQL by injecting malicious input into a query?",
    options: [
      "Broken Access Control",
      "Cryptographic Failures",
      "Injection (SQL Injection)",
      "Insecure Design"
    ],
    answer: 2,
    explanation: "SQL Injection falls under the Injection category (A03 in OWASP Top 10 2021). An attacker manipulates input to alter the SQL query structure, e.g., entering `' OR '1'='1` in a login form. Prevention: use parameterized queries/prepared statements, never concatenate user input into SQL."
  },
  {
    question: "In OAuth2, which grant type should a backend server use to obtain an access token on behalf of a user?",
    options: [
      "Client Credentials Grant",
      "Authorization Code Grant (with PKCE for public clients)",
      "Implicit Grant",
      "Resource Owner Password Credentials Grant"
    ],
    answer: 1,
    explanation: "Authorization Code Grant is the most secure OAuth2 flow for user-delegated access. The user authenticates with the authorization server, receives a code, which the backend exchanges for a token. Implicit Grant is deprecated (token in URL). Client Credentials is for machine-to-machine (no user). PKCE extends Authorization Code for public clients (SPAs, mobile)."
  },
  {
    question: "What claims are typically found in a JWT (JSON Web Token)?",
    options: [
      "Only encrypted user credentials",
      "Registered claims (iss, sub, exp, iat, aud), public claims, and private claims",
      "Only the user's database primary key",
      "Binary session data encoded in Base64"
    ],
    answer: 1,
    explanation: "JWT payload contains claims: Registered (standardized — iss=issuer, sub=subject, exp=expiration, iat=issued-at, aud=audience), Public (collision-resistant, IANA-registered), Private (agreed between parties). JWT is NOT encrypted by default (JWS = signed, JWE = encrypted). Never put sensitive data in a non-encrypted JWT."
  },
  {
    question: "What does the TLS handshake accomplish?",
    options: [
      "It compresses the HTTP payload to reduce bandwidth",
      "It establishes a shared secret key for symmetric encryption and authenticates the server (optionally the client) using certificates",
      "It authenticates the user with username and password over an encrypted channel",
      "It replaces HTTP headers with binary format for efficiency"
    ],
    answer: 1,
    explanation: "TLS handshake: (1) Client hello with supported cipher suites, (2) Server sends certificate (public key), (3) Key exchange (RSA or ECDHE) establishes a shared pre-master secret, (4) Both derive symmetric session keys, (5) Encrypted communication begins. The handshake authenticates the server and negotiates encryption — not user authentication."
  },
  {
    question: "What is CSRF (Cross-Site Request Forgery) and how is it prevented?",
    options: [
      "An attack where malicious JavaScript reads cookies from another origin; prevented by HttpOnly cookies",
      "An attack where a malicious site tricks a user's browser into making authenticated requests to another site; prevented by CSRF tokens or SameSite cookie attribute",
      "An attack that injects malicious scripts into a web page; prevented by Content Security Policy",
      "An attack that forges HTTP response headers; prevented by HTTPS"
    ],
    answer: 1,
    explanation: "CSRF exploits the browser's automatic cookie sending. A malicious page submits a form to your bank — the browser includes session cookies. Prevention: CSRF tokens (unique secret per session validated server-side), SameSite=Strict/Lax cookie attribute (browser won't send cookies on cross-site requests), or checking Origin/Referer headers."
  },
  {
    question: "Why is bcrypt preferred over MD5 or SHA-256 for password hashing?",
    options: [
      "bcrypt produces shorter hashes that are faster to store",
      "bcrypt is intentionally slow (configurable work factor) and incorporates a salt, making brute-force and rainbow table attacks computationally expensive",
      "bcrypt is a two-way encryption algorithm that allows password recovery",
      "bcrypt is faster than MD5/SHA-256 for hardware-accelerated GPUs"
    ],
    answer: 1,
    explanation: "MD5/SHA-256 are fast general-purpose hashes — attackers can compute billions per second on GPUs. bcrypt (and Argon2, scrypt) is deliberately slow with a configurable cost factor. It also automatically salts each hash, defeating rainbow tables. The slowness is the security feature. Never use unsalted MD5/SHA for passwords."
  },
  {
    question: "What is Cross-Site Scripting (XSS) and what is the difference between stored and reflected XSS?",
    options: [
      "XSS exploits server-side template engines; stored XSS persists in config files, reflected XSS is in URL parameters",
      "XSS injects malicious scripts into web pages viewed by other users; stored XSS is saved to the database, reflected XSS is returned immediately in the response from a malicious URL",
      "XSS is the same as CSRF; stored vs reflected refers to the type of cookie used",
      "XSS only affects JavaScript applications; stored XSS is in localStorage, reflected XSS is in sessionStorage"
    ],
    answer: 1,
    explanation: "Stored XSS: malicious script saved to DB (e.g., in a comment), executed when other users view it. Reflected XSS: script in URL parameter, reflected in response (e.g., search query). DOM-based XSS manipulates client-side DOM. Prevention: output encoding (HTML entity escaping), Content-Security-Policy header, input validation."
  },
  {
    question: "What is the principle of least privilege in security?",
    options: [
      "Users should have the minimum privileges required to perform their tasks, nothing more",
      "Systems should use the cheapest (lowest-cost) security mechanisms available",
      "Privileged accounts should have fewer features than regular accounts",
      "Security checks should be the last resort, not the first defense"
    ],
    answer: 0,
    explanation: "Least privilege: grant only the permissions needed for a task. A read-only reporting service shouldn't have write access to the database. A payment service shouldn't access user profile data. This limits blast radius if a component is compromised. Apply to users, services, processes, and database accounts."
  },
  {
    question: "What is the difference between authentication and authorization?",
    options: [
      "Authentication checks what you can do; authorization checks who you are",
      "Authentication verifies identity (who are you?); authorization determines permissions (what are you allowed to do?)",
      "They are synonymous — both verify user credentials",
      "Authentication is for humans; authorization is for services"
    ],
    answer: 1,
    explanation: "Authentication: proving identity (login with username/password, certificate, biometric). Authorization: determining what actions an authenticated identity is permitted (role-based access control, permission checks). Common attack: Broken Access Control (OWASP #1) — authenticated user accesses data they're not authorized for."
  },
  {
    question: "What is a timing attack, and how can it affect authentication?",
    options: [
      "An attack that overloads a server with time-intensive computations",
      "An attack that measures the time taken by operations to infer secret data — e.g., a string comparison that returns faster for wrong passwords can reveal the correct password character by character",
      "An attack that exploits server clock drift to forge JWT expiration times",
      "A DoS attack timed to coincide with scheduled maintenance windows"
    ],
    answer: 1,
    explanation: "Timing attacks exploit variable execution time. A naive string comparison like `storedPassword.equals(input)` short-circuits on the first mismatch — an attacker measures response time to deduce correct characters. Mitigation: use constant-time comparison (MessageDigest.isEqual() or dedicated libs). This applies to HMAC validation and token comparison too."
  },
  {
    question: "What is the purpose of a Content Security Policy (CSP) header?",
    options: [
      "It encrypts HTTP response bodies to prevent interception",
      "It instructs the browser which sources of scripts, styles, and other resources are trusted, mitigating XSS by blocking unauthorized script execution",
      "It restricts which HTTP methods (GET, POST, etc.) clients can use",
      "It configures CORS to allow cross-origin resource sharing"
    ],
    answer: 1,
    explanation: "CSP is an HTTP response header that declares trusted content sources. Example: `Content-Security-Policy: default-src 'self'; script-src 'self' cdn.example.com`. The browser blocks scripts loaded from untrusted origins, even if injected via XSS. It's a defense-in-depth measure — not a replacement for output encoding."
  },
  {
    question: "What is the difference between symmetric and asymmetric encryption?",
    options: [
      "Symmetric uses one key for both encryption and decryption; asymmetric uses a public key to encrypt and a private key to decrypt (or vice versa for signing)",
      "Symmetric is only for file encryption; asymmetric is only for network communication",
      "Symmetric is slower but more secure; asymmetric is faster but less secure",
      "They are the same algorithm — symmetric uses 128-bit keys, asymmetric uses 256-bit keys"
    ],
    answer: 0,
    explanation: "Symmetric (AES): same key encrypts and decrypts — fast, used for bulk data. Key distribution is the challenge. Asymmetric (RSA, EC): key pair — public key encrypts/verifies, private key decrypts/signs. Slower but solves key distribution. TLS uses asymmetric crypto to exchange a symmetric session key, then symmetric for the actual data."
  }
]
</script>

# Security Quiz

Test your knowledge of OWASP Top 10, OAuth2, JWT, TLS, SQL injection, CSRF, and secure coding practices.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Security study pages](/security/).
