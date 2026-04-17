---
title: Subnetting & CIDR
description: Subnet masks, CIDR notation, calculating network ranges, usable hosts, and AWS VPC design examples
category: networking
pageClass: layout-networking
difficulty: intermediate
tags: [networking, subnetting, cidr, subnet-mask, vpc, network-address, broadcast]
estimatedMinutes: 35
---

# Subnetting & CIDR

<DifficultyBadge level="intermediate" />

Subnetting divides a large IP network into smaller, more manageable sub-networks. **CIDR** (Classless Inter-Domain Routing) notation is the modern way to express subnets.

---

## What a Subnet Mask Does

An IP address has two parts: the **network** portion and the **host** portion. The subnet mask defines where the boundary is.

```
IP address:   192.168.1.10
Subnet mask:  255.255.255.0

In binary:
IP:     11000000.10101000.00000001.00001010
Mask:   11111111.11111111.11111111.00000000
        ←——————— network ————————→ ←host→

The 1s in the mask = network bits (fixed — identifies the subnet)
The 0s in the mask = host bits  (variable — identifies the device)
```

**Network address** = IP AND mask = `192.168.1.0`
**Host portion** = last octet = `10` (this device is host #10 on this subnet)

---

## CIDR Notation

CIDR replaces the verbose mask with a **prefix length** — the count of `1` bits in the mask.

```
255.255.255.0  →  /24   (24 ones: 11111111.11111111.11111111.00000000)
255.255.0.0    →  /16   (16 ones: 11111111.11111111.00000000.00000000)
255.0.0.0      →  /8    ( 8 ones: 11111111.00000000.00000000.00000000)
255.255.255.240→  /28   (28 ones: 11111111.11111111.11111111.11110000)
```

Written together:
```
192.168.1.0/24    →  the /24 subnet starting at 192.168.1.0
10.0.0.0/8        →  the /8  subnet starting at 10.0.0.0
```

---

## Calculating a Subnet — Step by Step

### Example: `192.168.1.0/24`

| | Value |
|-|-------|
| **Prefix length** | /24 |
| **Host bits** | 32 − 24 = **8** |
| **Total addresses** | 2⁸ = **256** |
| **Network address** | `192.168.1.0` (all host bits = 0) |
| **Broadcast address** | `192.168.1.255` (all host bits = 1) |
| **Usable hosts** | 256 − 2 = **254** (`192.168.1.1` – `192.168.1.254`) |

### Example: `10.0.4.0/28`

| | Value |
|-|-------|
| **Prefix length** | /28 |
| **Host bits** | 32 − 28 = **4** |
| **Total addresses** | 2⁴ = **16** |
| **Network address** | `10.0.4.0` (all host bits = 0) |
| **Broadcast address** | `10.0.4.15` (all host bits = 1: `0000` + `1111` = 15) |
| **Usable hosts** | 16 − 2 = **14** (`10.0.4.1` – `10.0.4.14`) |

::: tip The -2 rule
Always subtract 2 from total addresses: **network address** (first) and **broadcast address** (last) are reserved and cannot be assigned to hosts. AWS additionally reserves 3 more addresses per subnet (first 4 + last), so a `/24` gives 251 usable in AWS.
:::

---

## Common Subnet Reference

| CIDR | Mask | Total IPs | Usable Hosts |
|------|------|-----------|--------------|
| /8  | 255.0.0.0       | 16,777,216 | 16,777,214 |
| /16 | 255.255.0.0     | 65,536     | 65,534     |
| /20 | 255.255.240.0   | 4,096      | 4,094      |
| /22 | 255.255.252.0   | 1,024      | 1,022      |
| /24 | 255.255.255.0   | 256        | 254        |
| /25 | 255.255.255.128 | 128        | 126        |
| /26 | 255.255.255.192 | 64         | 62         |
| /27 | 255.255.255.224 | 32         | 30         |
| /28 | 255.255.255.240 | 16         | 14         |
| /29 | 255.255.255.248 | 8          | 6          |
| /30 | 255.255.255.252 | 4          | 2          |
| /31 | 255.255.255.254 | 2          | 0 (point-to-point links) |
| /32 | 255.255.255.255 | 1          | 1 (single host route) |

---

## Subdividing a Network — Worked Example

**Task:** Divide `192.168.1.0/24` into 4 equal subnets.

4 subnets = 2² → borrow 2 bits from host portion → /24 + 2 = **/26**

```
Subnet 1:  192.168.1.0/26    hosts: .1 – .62    broadcast: .63
Subnet 2:  192.168.1.64/26   hosts: .65 – .126  broadcast: .127
Subnet 3:  192.168.1.128/26  hosts: .129 – .190 broadcast: .191
Subnet 4:  192.168.1.192/26  hosts: .193 – .254 broadcast: .255
```

**How to find the next subnet:** add the block size (2^host bits) to the network address.
Block size for /26 = 2⁶ = 64. So: `.0`, `.64`, `.128`, `.192`.

---

## Network Address and Broadcast — Binary Proof

```
Given: 192.168.1.75/26

Step 1: mask for /26 = 11111111.11111111.11111111.11000000

Step 2: 192.168.1.75 in binary = 11000000.10101000.00000001.01001011

Step 3: network address = IP AND mask
   11000000.10101000.00000001.01001011
   11111111.11111111.11111111.11000000
   ————————————————————————————————————
   11000000.10101000.00000001.01000000  =  192.168.1.64  ← network addr

Step 4: broadcast = network addr OR (NOT mask)
   NOT mask = 00000000.00000000.00000000.00111111
   11000000.10101000.00000001.01000000
   00000000.00000000.00000000.00111111
   ————————————————————————————————————
   11000000.10101000.00000001.01111111  =  192.168.1.127 ← broadcast

Usable range: 192.168.1.65 – 192.168.1.126
```

---

## AWS VPC Subnetting

AWS VPCs use RFC 1918 private ranges. A typical design:

```
VPC: 10.0.0.0/16  (65,536 addresses)
  ├── Public subnet AZ-a:   10.0.1.0/24   (251 usable)
  ├── Public subnet AZ-b:   10.0.2.0/24
  ├── Private subnet AZ-a:  10.0.11.0/24
  ├── Private subnet AZ-b:  10.0.12.0/24
  └── DB subnet AZ-a:       10.0.21.0/24
```

**Why /16 for a VPC?**
Gives 65,534 addresses — plenty of room to carve out many /24 subnets across multiple AZs without running out. AWS reserves 5 addresses per subnet (first 4 + last 1).

**Why /24 for subnets?**
251 usable addresses — enough for most service tiers. Easy to reason about (last octet = host within subnet).

---

## Security Group CIDR Rules

```
Inbound rule: allow HTTPS from anywhere
  Source: 0.0.0.0/0   (/0 = all 32 bits are host bits = every IP)

Inbound rule: allow SSH only from office
  Source: 203.0.113.0/24   (only IPs in that /24 range)

Inbound rule: allow traffic from another subnet
  Source: 10.0.11.0/24    (only private subnet AZ-a)

Inbound rule: allow single IP
  Source: 10.0.1.5/32     (/32 = exactly one IP)
```

---

## Quick Mental Math Tricks

```
/24 → 256 addresses, 254 usable  (memorise this one)
/25 → half of /24 = 128 addresses
/26 → quarter of /24 = 64
/27 → 32
/28 → 16
/29 → 8
/30 → 4 (2 usable — point-to-point links)

Each step down (/24 → /25) halves the addresses.
Each step up (/24 → /23) doubles them.

"How many /27s fit in a /24?"
  /24 = 256 addresses, /27 = 32 addresses → 256 / 32 = 8 subnets
```

---

## Interview Quick-Fire

**Q: What is the difference between a subnet mask and CIDR prefix?**
They express the same thing differently. `255.255.255.0` in dotted-decimal = `/24` in CIDR. The prefix is the count of `1` bits in the mask. CIDR notation (`/24`) is more compact and universally preferred today.

**Q: What is the network address and why can't you assign it to a host?**
The network address has all host bits set to 0 — it identifies the subnet itself, not a device. It's used in routing tables to represent the entire subnet. Similarly, broadcast (all host bits = 1) is reserved for sending to all hosts on the subnet.

**Q: How many usable hosts are in a /28?**
Host bits = 32 − 28 = 4. Total addresses = 2⁴ = 16. Usable = 16 − 2 = **14** (minus network + broadcast). In AWS: 16 − 5 = **11**.

**Q: You have 10.0.0.0/8 and need to create 500 subnets each with at least 100 hosts. What prefix?**
100 hosts → need at least 7 host bits (2⁷ = 128 − 2 = 126 ≥ 100). So prefix = 32 − 7 = /25. 500 subnets of /25 fit easily in a /8 (2^(25-8) = 2^17 = 131,072 possible /25s).

<RelatedTopics :topics="['/networking/ip-addressing', '/networking/protocols', '/aws/']" />

[→ Back to Networking Overview](/networking/)
