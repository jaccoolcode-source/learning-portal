---
title: Networking
description: Kubernetes networking — Service types (ClusterIP, NodePort, LoadBalancer), headless services, Ingress, DNS, NetworkPolicy, and Endpoints
category: kubernetes
pageClass: layout-kubernetes
difficulty: intermediate
tags: [kubernetes, networking, services, ingress, dns, networkpolicy, clusterip, loadbalancer]
related:
  - /kubernetes/workloads
  - /kubernetes/production
  - /docker/networking-volumes
estimatedMinutes: 30
---

# Networking

<DifficultyBadge level="intermediate" />

Kubernetes networking solves three problems: Pod-to-Pod communication, exposing services within the cluster, and exposing services to the outside world.

---

## Networking Model

Kubernetes requires:
1. **Every Pod gets its own IP** — Pods communicate directly without NAT
2. **Nodes can communicate with all Pods** without NAT
3. **Pod IP = what the Pod thinks its IP is** — no masquerading

This is implemented by CNI plugins: Calico, Cilium, Flannel, Weave.

```
Pod A (10.0.1.5) ──────────────────── Pod B (10.0.2.7)
                                       (different node, same flat network)
```

**The problem Services solve:** Pod IPs are ephemeral — Pods are replaced on rollouts, crashes, and reschedules. You can't hardcode Pod IPs. Services provide a stable virtual IP that load-balances across a set of Pods.

---

## Service

A Service is a stable network endpoint for a dynamic set of Pods. It selects Pods using a **label selector** and maintains a list of healthy endpoints.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
  namespace: production
spec:
  selector:
    app: order-service      # selects all pods with this label
  ports:
    - name: http
      port: 80              # port clients connect to
      targetPort: 8080      # port the Pod listens on
      protocol: TCP
  type: ClusterIP           # default
```

### Service Types

#### ClusterIP (default — internal only)

```yaml
spec:
  type: ClusterIP
  # clusterIP: 10.96.45.23   auto-assigned, or set explicitly
```

- Accessible only within the cluster
- Gets a stable virtual IP (the `clusterIP`)
- Used for Pod-to-Pod communication

```bash
# From inside any pod:
curl http://order-service.production.svc.cluster.local/api/orders
curl http://order-service/api/orders  # short form (same namespace)
```

#### NodePort (external via node IP)

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30080      # 30000-32767; auto-assigned if omitted
```

- Opens `nodePort` on **every node's IP**
- External traffic: `<NodeIP>:30080` → `ClusterIP:80` → `Pod:8080`
- Not suitable for production — exposes node IPs, no TLS, no host-based routing

#### LoadBalancer (external via cloud LB)

```yaml
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 8080
  # GKE/EKS/AKS provisions a cloud load balancer and assigns external IP
```

```bash
kubectl get service order-service
# NAME            TYPE           CLUSTER-IP     EXTERNAL-IP      PORT(S)
# order-service   LoadBalancer   10.96.45.23    34.90.12.5       80:31234/TCP
```

- Cloud controller provisions a real load balancer (GCP TCP/UDP LB, AWS ELB)
- One LB per Service — expensive at scale; use Ingress instead for HTTP

#### ExternalName

```yaml
spec:
  type: ExternalName
  externalName: my-db.rds.amazonaws.com
  # Resolves "my-db" inside cluster → returns CNAME to external DNS name
  # No proxying, no IP, just DNS CNAME
```

Use for abstracting external dependencies — swap `externalName` to migrate from external DB to in-cluster DB without changing app config.

### Service Type Summary

| Type | Accessible From | Use Case |
|------|----------------|----------|
| `ClusterIP` | Inside cluster only | Pod-to-Pod, most services |
| `NodePort` | Outside via node IP | Dev/testing, on-prem without LB |
| `LoadBalancer` | Outside via cloud LB | Production (non-HTTP), TCP services |
| `ExternalName` | Inside cluster | Abstract external services via DNS |

---

## Headless Service

A Service with `clusterIP: None` — no virtual IP, no load balancing. DNS returns the individual Pod IPs directly.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: postgres-headless
spec:
  clusterIP: None          # headless
  selector:
    app: postgres
  ports:
    - port: 5432
```

**DNS for headless service:**
```
postgres-headless.production.svc.cluster.local
  → [10.0.1.5, 10.0.2.7, 10.0.3.9]  (all pod IPs)

postgres-0.postgres-headless.production.svc.cluster.local
  → 10.0.1.5  (specific pod — used by StatefulSets)
```

Required by StatefulSets so each pod gets a stable, individual DNS name.

---

## Kubernetes DNS

Every cluster runs a DNS server (CoreDNS). Every Pod is configured to use it as its resolver.

### DNS Resolution

```
<service>.<namespace>.svc.cluster.local
<pod-ip-dashed>.<namespace>.pod.cluster.local

# Examples
order-service.production.svc.cluster.local
postgres-0.postgres-headless.production.svc.cluster.local

# Short forms (same namespace)
order-service            → resolves if in same namespace
order-service.production → resolves cross-namespace
```

### DNS Search Path

Pods are configured with search domains so short names resolve:

```
search production.svc.cluster.local svc.cluster.local cluster.local
```

So `http://order-service/` from a pod in `production` namespace resolves to `order-service.production.svc.cluster.local`.

---

## Ingress

Ingress provides HTTP/S routing at Layer 7 — host-based and path-based routing to multiple backend Services, using a single LoadBalancer IP/cloud LB.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: api-ingress
  namespace: production
  annotations:
    # Annotations are ingress-controller specific
    nginx.ingress.kubernetes.io/rewrite-target: /
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "10m"
    cert-manager.io/cluster-issuer: letsencrypt-prod   # auto TLS via cert-manager
spec:
  ingressClassName: nginx     # which IngressClass (controller) to use

  tls:
    - hosts:
        - api.myapp.com
        - admin.myapp.com
      secretName: myapp-tls   # Secret with tls.crt and tls.key

  rules:
    # Host-based routing
    - host: api.myapp.com
      http:
        paths:
          - path: /orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 80

          - path: /payments
            pathType: Prefix
            backend:
              service:
                name: payment-service
                port:
                  number: 80

          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80

    - host: admin.myapp.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: admin-service
                port:
                  number: 80
```

### Path Types

| Type | Behaviour |
|------|-----------|
| `Exact` | Matches the exact URL path only |
| `Prefix` | Matches all paths with this prefix (`/api` matches `/api`, `/api/v1`, `/api/orders`) |
| `ImplementationSpecific` | Controller-specific (regex, etc.) |

### Ingress Controllers

Ingress is just a spec — you need a controller to implement it:

| Controller | Notes |
|-----------|-------|
| **NGINX Ingress** | Most common open-source, rich annotation support |
| **Traefik** | Auto-discovers services, easy Let's Encrypt |
| **GKE Ingress** | Provisions GCP HTTP(S) Load Balancer natively |
| **AWS ALB Controller** | Provisions AWS Application Load Balancer |
| **Istio Gateway** | Service mesh — advanced traffic management |

### Ingress vs LoadBalancer Service

| | LoadBalancer Service | Ingress |
|-|---------------------|---------|
| Layer | L4 (TCP/UDP) | L7 (HTTP/S) |
| Routing | By port | By host + path |
| TLS | On the LB | At the Ingress controller |
| Cost | 1 LB per service | 1 LB for all HTTP services |
| Use for | Non-HTTP (gRPC raw, TCP) | HTTP/HTTPS APIs, web apps |

---

## NetworkPolicy

NetworkPolicy is a namespace-scoped firewall for Pod traffic. Without any NetworkPolicy, all Pods can reach all other Pods.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: order-service-policy
  namespace: production
spec:
  # Apply this policy to pods with this label
  podSelector:
    matchLabels:
      app: order-service

  policyTypes:
    - Ingress
    - Egress

  ingress:
    # Allow traffic from pods with label app=api-gateway in any namespace
    - from:
        - podSelector:
            matchLabels:
              app: api-gateway
      ports:
        - protocol: TCP
          port: 8080

    # Allow traffic from the monitoring namespace
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
      ports:
        - protocol: TCP
          port: 8080

  egress:
    # Allow outbound to postgres in same namespace
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432

    # Allow outbound to kafka
    - to:
        - podSelector:
            matchLabels:
              app: kafka
      ports:
        - protocol: TCP
          port: 9092

    # Always allow DNS
    - ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

### Default Deny All (Zero-Trust Starting Point)

```yaml
# Deny all ingress to all pods in namespace
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: production
spec:
  podSelector: {}     # applies to all pods
  policyTypes:
    - Ingress
---
# Deny all egress
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-egress
  namespace: production
spec:
  podSelector: {}
  policyTypes:
    - Egress
```

::: tip NetworkPolicy Requires a CNI Plugin
NetworkPolicy is enforced by the CNI plugin, not Kubernetes itself. Ensure your cluster uses a policy-enforcing CNI: Calico, Cilium, or Weave. Basic Flannel does not enforce NetworkPolicy.
:::

---

## Endpoints and EndpointSlices

When a Service selects Pods, Kubernetes creates an Endpoints object listing the ready Pod IPs.

```bash
kubectl get endpoints order-service -n production
# NAME            ENDPOINTS                           AGE
# order-service   10.0.1.5:8080,10.0.2.7:8080,10.0.3.9:8080   5d
```

kube-proxy reads Endpoints and programs iptables/IPVS rules for routing. When a Pod fails its readiness probe, it's removed from Endpoints and stops receiving traffic immediately.

---

## Interview Quick-Fire

**Q: What's the difference between ClusterIP and LoadBalancer services?**
ClusterIP is internal-only — reachable within the cluster via the virtual IP. LoadBalancer provisions an external cloud load balancer with a public IP, making the service reachable from the internet. LoadBalancer builds on ClusterIP internally.

**Q: What problem does Ingress solve vs having a LoadBalancer per service?**
Each LoadBalancer service costs money (a real cloud LB) and only routes one service. Ingress uses a single LB and routes multiple services by hostname and path, with TLS termination at one point. Much cheaper and easier to manage for HTTP workloads.

**Q: How does Kubernetes DNS resolve `postgres` from a pod in the `production` namespace?**
The pod's `/etc/resolv.conf` search path includes `production.svc.cluster.local`. So `postgres` expands to `postgres.production.svc.cluster.local`, which CoreDNS resolves to the Service's ClusterIP.

**Q: What is a headless service and when do you need one?**
A Service with `clusterIP: None`. It doesn't do load balancing — DNS returns all individual Pod IPs. StatefulSets require headless services so each pod gets a stable, unique DNS name (`pod-0.service.namespace.svc.cluster.local`).

**Q: What happens to traffic when a pod fails its readiness probe?**
The pod is removed from the Service's Endpoints list. kube-proxy updates iptables/IPVS rules so no new requests are routed to it. The pod is not restarted (that's liveness), just taken out of rotation until it passes readiness again.

**Q: Why do NetworkPolicy rules need to include port 53?**
Without an explicit egress rule allowing UDP/TCP port 53, pods with egress NetworkPolicy can't resolve DNS names — all service-name-based connections fail. Always add DNS egress rules when using default-deny egress policies.

<RelatedTopics :topics="['/kubernetes/workloads', '/kubernetes/config-storage', '/kubernetes/production']" />

[→ Back to Kubernetes Overview](/kubernetes/)
