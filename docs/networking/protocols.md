---
title: Protocols — TCP, UDP, DNS, HTTP
description: TCP vs UDP, DNS resolution, HTTP/HTTPS, common ports, and practical networking for developers
category: networking
pageClass: layout-networking
difficulty: beginner
tags: [networking, tcp, udp, dns, http, https, ports, protocol]
estimatedMinutes: 25
---

# Protocols — TCP, UDP, DNS, HTTP

<DifficultyBadge level="beginner" />

Protocols define the rules for communication between networked systems. These are the ones developers and DevOps engineers encounter most.

---

## TCP vs UDP

### TCP — Transmission Control Protocol

TCP is **connection-oriented** and **reliable**. Before any data is sent, a three-way handshake establishes a connection.

```
Three-way handshake:
  Client  ──SYN──────────▶  Server
  Client  ◀──SYN-ACK──────  Server
  Client  ──ACK──────────▶  Server
  (connection established)

Four-way teardown:
  Client  ──FIN──────────▶  Server
  Client  ◀──ACK───────────  Server
  Client  ◀──FIN───────────  Server
  Client  ──ACK──────────▶  Server
```

**TCP guarantees:**
- **Delivery** — lost packets are retransmitted
- **Ordering** — packets arrive in the order sent
- **Flow control** — sender slows down if receiver is overwhelmed
- **Congestion control** — backs off on network congestion

### UDP — User Datagram Protocol

UDP is **connectionless** and **unreliable** — no handshake, no retransmission, no ordering.

```
Client  ──datagram──▶  Server  (fire and forget)
```

### TCP vs UDP Comparison

| Feature | TCP | UDP |
|---------|-----|-----|
| Connection | Required (3-way handshake) | None |
| Reliability | Guaranteed (retransmit on loss) | Best-effort (may lose packets) |
| Ordering | Guaranteed | Not guaranteed |
| Speed | Slower (overhead) | Faster (minimal overhead) |
| Header size | 20–60 bytes | 8 bytes |
| Use cases | HTTP, HTTPS, SSH, databases | DNS, video streaming, VoIP, games |

::: tip When to use UDP
Use UDP when: low latency matters more than perfect delivery (video calls — a dropped frame is fine), or the application handles reliability itself (DNS retries, QUIC protocol).
:::

---

## Common Port Numbers

Ports identify specific services on a host. Range: 0–65535.
- **0–1023:** Well-known ports (require root/admin to bind)
- **1024–49151:** Registered ports
- **49152–65535:** Dynamic/ephemeral (used by clients for outgoing connections)

| Port | Protocol | Service |
|------|----------|---------|
| 20, 21 | TCP | FTP (data, control) |
| 22 | TCP | SSH |
| 23 | TCP | Telnet (unencrypted — avoid) |
| 25 | TCP | SMTP (email sending) |
| 53 | TCP + UDP | DNS |
| 80 | TCP | HTTP |
| 110 | TCP | POP3 (email retrieval) |
| 143 | TCP | IMAP |
| 389 | TCP | LDAP |
| 443 | TCP | HTTPS |
| 465 / 587 | TCP | SMTP with TLS |
| 636 | TCP | LDAPS (LDAP over TLS) |
| 3306 | TCP | MySQL |
| 5432 | TCP | PostgreSQL |
| 5672 | TCP | AMQP (RabbitMQ) |
| 6379 | TCP | Redis |
| 8080 | TCP | HTTP alternate (dev servers) |
| 8443 | TCP | HTTPS alternate |
| 9092 | TCP | Kafka |
| 9200 | TCP | OpenSearch / Elasticsearch HTTP |
| 27017 | TCP | MongoDB |

---

## DNS — Domain Name System

DNS translates human-readable names (`api.mycompany.com`) into IP addresses (`93.184.216.34`).

### Resolution Chain

```
Browser asks: "What is the IP of api.mycompany.com?"

1. Check local cache (OS, browser)
   ↓ (cache miss)
2. Ask Recursive Resolver (your ISP or 8.8.8.8 / 1.1.1.1)
   ↓ (resolver doesn't know)
3. Ask Root Name Server (.)  → "ask .com TLD server"
   ↓
4. Ask .com TLD Server       → "ask ns1.mycompany.com"
   ↓
5. Ask Authoritative Server (ns1.mycompany.com)
   → returns: api.mycompany.com = 93.184.216.34  (A record)
   ↓
6. Recursive Resolver returns IP to client and caches it (TTL)
```

### DNS Record Types (quick reference)

| Record | Maps | Example |
|--------|------|---------|
| **A** | Name → IPv4 | `api.mycompany.com → 1.2.3.4` |
| **AAAA** | Name → IPv6 | `api.mycompany.com → 2001:db8::1` |
| **CNAME** | Name → Name | `www → mycompany.com` |
| **MX** | Domain → mail server | `mycompany.com → mail.mycompany.com` |
| **TXT** | Name → text | SPF, DKIM, domain verification |
| **NS** | Zone → name servers | Delegates a subdomain |
| **PTR** | IP → Name (reverse) | `1.2.3.4 → api.mycompany.com` |
| **SOA** | Zone metadata | Primary NS, email, serial, TTL defaults |

### TTL (Time to Live)

```
TTL = how long resolvers cache the record (seconds)

Low TTL  (60s)   → changes propagate quickly,   more DNS queries
High TTL (86400s) → changes are slow to propagate, fewer DNS queries

Before a DNS migration: lower TTL to 60s well in advance.
After migration settles: raise TTL back to 3600s or more.
```

---

## HTTP / HTTPS

### HTTP Request/Response

```
Request:
  GET /orders/123 HTTP/1.1
  Host: api.mycompany.com
  Authorization: Bearer eyJhbGc...
  Content-Type: application/json

Response:
  HTTP/1.1 200 OK
  Content-Type: application/json
  Cache-Control: max-age=60
  
  {"orderId":"123","status":"DELIVERED"}
```

### HTTP Methods

| Method | Meaning | Body | Idempotent |
|--------|---------|------|-----------|
| GET | Retrieve resource | No | Yes |
| POST | Create resource | Yes | No |
| PUT | Replace resource | Yes | Yes |
| PATCH | Partial update | Yes | No |
| DELETE | Delete resource | No | Yes |
| HEAD | Same as GET, no body | No | Yes |
| OPTIONS | List allowed methods | No | Yes |

### HTTP Status Codes

| Range | Category | Examples |
|-------|----------|---------|
| 2xx | Success | 200 OK, 201 Created, 204 No Content |
| 3xx | Redirect | 301 Moved Permanently, 302 Found, 304 Not Modified |
| 4xx | Client error | 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found, 429 Too Many Requests |
| 5xx | Server error | 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout |

### HTTPS and TLS

HTTPS = HTTP + **TLS** (Transport Layer Security). The TLS handshake happens before any HTTP data is exchanged.

```
Client                          Server
  │──── ClientHello ──────────▶ │  (TLS version, cipher suites)
  │◀─── ServerHello + Cert ──── │  (chosen cipher, server certificate)
  │─── verify cert against CA ─ │  (client validates certificate chain)
  │──── Key Exchange ─────────▶ │  (agree on session key)
  │◀─── Finished ────────────── │
  │──── Finished ─────────────▶ │
  │           (encrypted HTTP begins)
```

**TLS 1.3** (current standard): 1-RTT handshake (TLS 1.2 = 2-RTT), removes weak ciphers, mandatory forward secrecy.

---

## TCP Connection States

Useful when debugging with `netstat` or `ss`:

| State | Meaning |
|-------|---------|
| `LISTEN` | Server waiting for connections |
| `SYN_SENT` | Client sent SYN, waiting for SYN-ACK |
| `ESTABLISHED` | Connection active, data flowing |
| `TIME_WAIT` | Connection closing, waiting for delayed packets (2×MSL ≈ 60s) |
| `CLOSE_WAIT` | Remote closed, local hasn't yet |
| `FIN_WAIT_1/2` | Local initiated close |

```bash
# Show all listening ports
ss -tlnp

# Show established connections
ss -tnp state established

# Show TIME_WAIT connections (common on high-traffic servers)
ss -tn state time-wait | wc -l
```

---

## Interview Quick-Fire

**Q: Why does DNS use both TCP and UDP?**
UDP (port 53) for normal queries — fast, low overhead, responses fit in a single datagram. TCP (port 53) for large responses (>512 bytes), zone transfers (AXFR), and DNSSEC responses. DNS over HTTPS (DoH) and DNS over TLS (DoT) are modern encrypted alternatives.

**Q: What is TIME_WAIT and why does it matter?**
After a TCP connection closes, the socket waits 2×MSL (~60s) before being reused. This ensures delayed packets from the old connection don't corrupt a new one. High-throughput servers can accumulate thousands of TIME_WAIT sockets — tune `net.ipv4.tcp_tw_reuse` or use connection pooling.

**Q: What's the difference between 401 and 403?**
`401 Unauthorized` means the request lacks valid authentication credentials — the client should authenticate. `403 Forbidden` means the client is authenticated but doesn't have permission — even correct credentials won't help.

<RelatedTopics :topics="['/networking/ip-addressing', '/networking/subnetting', '/security/tls-ssl']" />

[→ Back to Networking Overview](/networking/)
