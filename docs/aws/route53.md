---
title: AWS Route 53
description: AWS Route 53 — DNS, record types, routing policies, health checks, and domain management
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, route53, dns, routing-policy, health-check, failover, latency-routing]
estimatedMinutes: 20
---

# AWS Route 53

<DifficultyBadge level="intermediate" />

Route 53 is AWS's scalable DNS and domain registration service. It routes traffic to AWS resources and external endpoints, with health checking and sophisticated routing policies.

---

## DNS Record Types

| Record | Purpose | Example |
|--------|---------|---------|
| **A** | Domain → IPv4 address | `api.mycompany.com → 1.2.3.4` |
| **AAAA** | Domain → IPv6 address | `api.mycompany.com → 2001:db8::1` |
| **CNAME** | Domain → another domain | `www.mycompany.com → mycompany.com` (cannot use at zone apex) |
| **ALIAS** | Domain → AWS resource (Route 53-specific) | `mycompany.com → alb-123.eu-west-1.elb.amazonaws.com` |
| **MX** | Mail exchange servers | Email routing |
| **TXT** | Text data | SPF, DKIM, domain verification |
| **NS** | Name servers for the zone | Delegating a subdomain |

::: tip ALIAS vs CNAME
ALIAS is Route 53-specific and can be used at the zone apex (naked domain like `mycompany.com`). CNAME cannot. ALIAS also doesn't incur DNS query charges for AWS resources.
:::

---

## Hosted Zones

```
Public Hosted Zone:   resolves over the internet
                      mycompany.com → ALB, CloudFront, EC2...

Private Hosted Zone:  resolves within a VPC only
                      internal.mycompany.com → private ECS service, RDS...
```

```bash
# Create a public hosted zone
aws route53 create-hosted-zone \
  --name mycompany.com \
  --caller-reference $(date +%s)

# Create an A record pointing to an ALB
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890 \
  --change-batch '{
    "Changes": [{
      "Action": "UPSERT",
      "ResourceRecordSet": {
        "Name": "api.mycompany.com",
        "Type": "A",
        "AliasTarget": {
          "DNSName": "my-alb-123.eu-west-1.elb.amazonaws.com",
          "EvaluateTargetHealth": true,
          "HostedZoneId": "Z32O12XQLNTSW2"
        }
      }
    }]
  }'
```

---

## Routing Policies

| Policy | Use Case |
|--------|---------|
| **Simple** | Single resource, no health check |
| **Failover** | Active-passive: primary + standby |
| **Latency** | Route to lowest-latency region |
| **Weighted** | A/B testing, gradual traffic shift |
| **Geolocation** | Route by user's country/continent |
| **Geoproximity** | Route by geographic distance with bias |
| **Multivalue Answer** | Return up to 8 healthy IPs (basic load balancing) |
| **IP-based** | Route by client CIDR range |

### Weighted Routing (Blue/Green Deployment)

```json
// 90% traffic to v1, 10% to v2
[
  {
    "Name": "api.mycompany.com",
    "Type": "A",
    "SetIdentifier": "v1",
    "Weight": 90,
    "AliasTarget": { "DNSName": "alb-v1.eu-west-1.elb.amazonaws.com" }
  },
  {
    "Name": "api.mycompany.com",
    "Type": "A",
    "SetIdentifier": "v2",
    "Weight": 10,
    "AliasTarget": { "DNSName": "alb-v2.eu-west-1.elb.amazonaws.com" }
  }
]
```

### Failover Routing

```json
// Primary in eu-west-1, failover to us-east-1
[
  {
    "Name": "api.mycompany.com",
    "Type": "A",
    "SetIdentifier": "primary",
    "Failover": "PRIMARY",
    "HealthCheckId": "hc-12345",
    "AliasTarget": { "DNSName": "alb-ireland.elb.amazonaws.com" }
  },
  {
    "Name": "api.mycompany.com",
    "Type": "A",
    "SetIdentifier": "secondary",
    "Failover": "SECONDARY",
    "AliasTarget": { "DNSName": "alb-virginia.elb.amazonaws.com" }
  }
]
```

---

## Health Checks

```bash
# Create an HTTP health check
aws route53 create-health-check \
  --caller-reference $(date +%s) \
  --health-check-config '{
    "Protocol": "HTTPS",
    "FullyQualifiedDomainName": "api.mycompany.com",
    "Port": 443,
    "ResourcePath": "/actuator/health",
    "RequestInterval": 30,
    "FailureThreshold": 3
  }'
```

**Health check types:**
- **Endpoint** — HTTP/HTTPS/TCP to a specific IP or domain
- **CloudWatch Alarm** — unhealthy when an alarm is in ALARM state
- **Calculated** — AND/OR of other health checks

---

## Route 53 + ACM (Custom Domains for API Gateway / CloudFront)

```bash
# 1. Request certificate
aws acm request-certificate \
  --domain-name api.mycompany.com \
  --validation-method DNS

# 2. ACM gives you a CNAME record to add to Route 53 for validation
# 3. Add the CNAME — ACM auto-validates and issues the certificate

# 4. Create custom domain in API Gateway
aws apigatewayv2 create-domain-name \
  --domain-name api.mycompany.com \
  --domain-name-configurations CertificateArn=arn:aws:acm:...,EndpointType=REGIONAL

# 5. Create ALIAS record in Route 53 pointing to API Gateway domain
```

---

## Interview Quick-Fire

**Q: What is the difference between ALIAS and CNAME?**
Both map a name to another name, but ALIAS is Route 53-specific and works at the zone apex (naked domain). ALIAS also resolves to the actual IP for the client — it's free for AWS resources. CNAME adds an extra DNS lookup and can't be used at the apex.

**Q: How does latency-based routing work?**
Route 53 measures latency between the resolver's region and each configured AWS region. It returns the record pointing to the lowest-latency region. Measurements are updated periodically based on observed latency.

**Q: What is a private hosted zone?**
A DNS zone that only resolves within associated VPCs. Use it for internal service discovery (e.g., `orders.internal → ECS service IP`) without exposing records publicly.

<RelatedTopics :topics="['/aws/', '/aws/api-gateway', '/aws/cloudwatch']" />

[→ Back to AWS Overview](/aws/)
