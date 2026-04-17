---
title: IP Addressing
description: IPv4 binary structure, dotted-decimal notation, public vs private ranges, special addresses, and IPv6 overview
category: networking
pageClass: layout-networking
difficulty: beginner
tags: [networking, ipv4, ipv6, private-ranges, binary, rfc1918]
estimatedMinutes: 20
---

# IP Addressing

<DifficultyBadge level="beginner" />

An IP address is a numerical label assigned to every device on a network. It serves two purposes: **identification** (who are you?) and **location** (how do we reach you?).

---

## IPv4 Structure

An IPv4 address is **32 bits** long, written as four **octets** (8-bit groups) in dotted-decimal notation.

```
Binary:          11000000 . 10101000 . 00000001 . 00001010
Decimal:            192   .   168   .     1    .    10
Written as:                  192.168.1.10
```

### Converting Octet to Decimal

Each bit in an octet represents a power of 2:

```
Bit position:  128   64   32   16    8    4    2    1
               2⁷    2⁶   2⁵   2⁴   2³   2²   2¹   2⁰

Example: 11000000
         128 + 64 + 0 + 0 + 0 + 0 + 0 + 0  =  192

Example: 10101000
         128 + 0 + 32 + 0 + 8 + 0 + 0 + 0  =  168

Example: 00001010
         0 + 0 + 0 + 0 + 8 + 0 + 2 + 0     =  10
```

**Range per octet:** 0–255 (2⁸ = 256 possible values).

---

## Public vs Private Addresses

Most IP addresses are **public** — routable on the internet. **Private** addresses (RFC 1918) are reserved for internal networks and are never routed on the internet.

| Range | CIDR | Addresses | Common use |
|-------|------|-----------|-----------|
| `10.0.0.0` – `10.255.255.255` | `10.0.0.0/8` | ~16.7 million | Large enterprise, AWS VPC |
| `172.16.0.0` – `172.31.255.255` | `172.16.0.0/12` | ~1 million | Medium networks, Docker default |
| `192.168.0.0` – `192.168.255.255` | `192.168.0.0/16` | 65,536 | Home routers, small offices |

::: tip Why private ranges?
IPv4 only has ~4.3 billion addresses (2³²). Private ranges allow millions of devices to share a small pool of public IPs using **NAT** (Network Address Translation) — your home router does this for all your devices.
:::

---

## Special Addresses

| Address | Purpose |
|---------|---------|
| `127.0.0.1` | Loopback — always refers to "this machine" (`localhost`) |
| `127.0.0.0/8` | Entire loopback range (127.x.x.x) |
| `0.0.0.0` | "All interfaces" — used in server bindings to listen on every NIC |
| `255.255.255.255` | Limited broadcast — all hosts on local network |
| `169.254.x.x` | APIPA — auto-assigned when DHCP fails (link-local) |

---

## IPv4 Address Classes (Legacy)

Before CIDR, addresses were grouped into classes. You still see this terminology in interviews.

| Class | First octet | Range | Default mask | Purpose |
|-------|-------------|-------|-------------|---------|
| A | 0–127 | `1.0.0.0`–`126.255.255.255` | `/8` (255.0.0.0) | Large orgs |
| B | 128–191 | `128.0.0.0`–`191.255.255.255` | `/16` (255.255.0.0) | Medium orgs |
| C | 192–223 | `192.0.0.0`–`223.255.255.255` | `/24` (255.255.255.0) | Small networks |
| D | 224–239 | `224.0.0.0`–`239.255.255.255` | — | Multicast |
| E | 240–255 | `240.0.0.0`–`255.255.255.255` | — | Reserved/experimental |

::: info Classless routing (CIDR) replaced classful
Modern networks use CIDR (`/24`, `/28`, etc.) instead of fixed class boundaries, allowing much more flexible address allocation. See [Subnetting & CIDR](./subnetting).
:::

---

## IPv6

IPv4's 32-bit address space (~4.3 billion) is exhausted. **IPv6** uses **128-bit** addresses — 2¹²⁸ ≈ 340 undecillion addresses.

```
IPv4:  192.168.1.10

IPv6:  2001:0db8:85a3:0000:0000:8a2e:0370:7334
       → shortened: 2001:db8:85a3::8a2e:370:7334
         (:: = one run of consecutive zero groups)
```

### IPv6 Notation Rules

```
Full:      2001:0db8:0000:0000:0000:0000:0000:0001
Remove leading zeros per group: 2001:db8:0:0:0:0:0:1
Replace longest run of zeros with ::  2001:db8::1
```

### IPv6 Special Addresses

| Address | Equivalent |
|---------|-----------|
| `::1` | Loopback (= 127.0.0.1) |
| `::` | Unspecified (= 0.0.0.0) |
| `fe80::/10` | Link-local (= 169.254.x.x) |
| `fc00::/7` | Unique local (= RFC 1918 private) |

**In practice:** Most AWS, GCP, and Azure infrastructure still primarily uses IPv4 in VPCs. IPv6 is enabled optionally (dual-stack). You'll mostly see IPv6 in public-facing load balancers and CDNs.

---

## Interview Quick-Fire

**Q: What is the difference between a public and a private IP address?**
Private IPs (RFC 1918 ranges: 10.x, 172.16–31.x, 192.168.x) are only routable within local networks — routers drop them at the internet boundary. Public IPs are globally unique and routable on the internet. NAT translates between them.

**Q: Why is `0.0.0.0` used in server bindings?**
It means "listen on all available network interfaces." A server bound to `0.0.0.0:8080` accepts connections on any NIC — loopback, LAN, public IP. Binding to `127.0.0.1:8080` only accepts local connections.

**Q: What is APIPA (169.254.x.x)?**
Automatic Private IP Addressing — a host assigns itself a 169.254.x.x address when it can't reach a DHCP server. It's a sign that DHCP has failed; the device can only communicate with others on the same link that also self-assigned 169.254.x.x addresses.

<RelatedTopics :topics="['/networking/', '/networking/subnetting', '/networking/protocols']" />

[→ Back to Networking Overview](/networking/)
