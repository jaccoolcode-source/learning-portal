---
title: Networking Fundamentals
description: Networking overview — OSI model, IP addressing, subnetting, and protocols for developers and DevOps engineers
category: networking
pageClass: layout-networking
difficulty: beginner
tags: [networking, osi, tcp-ip, ip-addressing, subnetting, dns]
estimatedMinutes: 10
---

# Networking Fundamentals

<DifficultyBadge level="beginner" />

Networking knowledge is foundational for cloud infrastructure, DevOps, and backend development. Understanding IP addresses, subnets, and protocols lets you reason about VPCs, security groups, load balancers, and DNS.

---

## OSI Model (7 Layers)

The OSI model is a conceptual framework describing how data moves through a network.

```
Layer 7 — Application   HTTP, HTTPS, DNS, FTP, SMTP, gRPC
Layer 6 — Presentation  TLS/SSL encryption, data encoding
Layer 5 — Session       Session establishment, management
Layer 4 — Transport     TCP, UDP — ports, reliability, flow control
Layer 3 — Network       IP — addressing, routing between networks
Layer 2 — Data Link     Ethernet, MAC addresses — LAN communication
Layer 1 — Physical      Cables, switches, radio waves — bits on wire
```

In practice, **TCP/IP** collapses this into 4 layers: Application, Transport, Internet (Network), Link.

| When you hear… | It's layer… |
|----------------|-------------|
| "HTTP request" | 7 (Application) |
| "TLS handshake" | 6 (Presentation) |
| "TCP connection" | 4 (Transport) |
| "IP packet" | 3 (Network) |
| "MAC address" | 2 (Data Link) |

---

## Why It Matters for Developers

| Scenario | Networking concept |
|----------|--------------------|
| AWS VPC design | IP addressing, CIDR, subnets |
| Security group rules | Port numbers, CIDR ranges |
| DNS not resolving | DNS resolution chain |
| Load balancer setup | TCP/HTTP, health checks, ports |
| Kubernetes networking | Pod CIDRs, Services, CNI |
| Debugging connectivity | traceroute, ping, netstat |

---

## Sections

- [IP Addressing](./ip-addressing) — IPv4 binary structure, private ranges, IPv6
- [Subnetting & CIDR](./subnetting) — masks, CIDR notation, calculating ranges
- [Protocols](./protocols) — TCP vs UDP, DNS, HTTP/HTTPS, port reference
