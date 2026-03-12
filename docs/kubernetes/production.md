---
title: Production Patterns
description: Kubernetes production patterns — liveness, readiness and startup probes, RBAC, ServiceAccounts, security contexts, zero-downtime deploys, graceful shutdown, and debugging
category: kubernetes
pageClass: layout-kubernetes
difficulty: advanced
tags: [kubernetes, probes, rbac, security-context, serviceaccount, zero-downtime, debugging, production]
related:
  - /kubernetes/workloads
  - /kubernetes/scaling-scheduling
  - /kubernetes/networking
  - /docker/production
estimatedMinutes: 35
---

# Production Patterns

<DifficultyBadge level="advanced" />

Running workloads in Kubernetes production requires more than getting YAML to apply. This page covers probes, RBAC, security hardening, zero-downtime deploys, and debugging techniques.

---

## Probes

Probes are health checks Kubernetes runs against containers to decide whether to restart them or route traffic to them.

### Three Probe Types

| Probe | Failure Action | Use For |
|-------|---------------|---------|
| **Liveness** | Restart container | Detect deadlocks, stuck threads — app alive but not progressing |
| **Readiness** | Remove from Service endpoints | Startup warmup, temporary overload — app alive but not ready for traffic |
| **Startup** | Restart container (only during startup) | Slow-starting apps — disables liveness during initial startup period |

### Probe Methods

```yaml
# HTTP GET — most common for web apps
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
    httpHeaders:
      - name: Accept
        value: application/json

# TCP Socket — port must accept connection
livenessProbe:
  tcpSocket:
    port: 8080

# Exec — run command inside container; non-zero exit = failure
livenessProbe:
  exec:
    command: ["java", "-version"]

# gRPC — for gRPC health protocol (K8s 1.24+)
livenessProbe:
  grpc:
    port: 50051
    service: "liveness"
```

### Probe Configuration Fields

```yaml
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  initialDelaySeconds: 30   # wait before first check (give app time to start)
  periodSeconds: 10         # check every 10s
  timeoutSeconds: 5         # fail if no response in 5s
  failureThreshold: 3       # fail after 3 consecutive failures
  successThreshold: 1       # succeed after 1 success (only relevant for readiness)
```

### Spring Boot Probe Setup

```yaml
# application.yml
management:
  endpoint:
    health:
      probes:
        enabled: true
      show-details: never
  health:
    livenessState:
      enabled: true
    readinessState:
      enabled: true
```

```yaml
# Deployment probe config for Spring Boot
startupProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  failureThreshold: 30      # allow up to 30 × 10s = 5 min for startup
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  initialDelaySeconds: 0    # startup probe handles the wait
  periodSeconds: 5
  failureThreshold: 3
  successThreshold: 1

livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  initialDelaySeconds: 0    # startup probe handles the wait
  periodSeconds: 15
  failureThreshold: 3
```

### Readiness vs Liveness Decision Tree

```
App is stuck in infinite loop / deadlock
  → Liveness fails → container restarted

App started but still loading caches / warming up
  → Readiness fails → removed from LB, not restarted
  → Liveness still passes → not killed during warmup

App is overloaded (too many requests, high GC pressure)
  → Readiness fails → taken out of rotation temporarily
  → When load drops → readiness passes → added back

App is broken but appears alive (e.g., returns 200 but wrong data)
  → Neither probe catches this → need application-level alerting
```

---

## Zero-Downtime Deployments

Getting truly zero-downtime rollouts requires several pieces working together.

### Step 1 — Correct Rolling Update Strategy

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1         # extra pods above desired count
    maxUnavailable: 0   # never go below desired count (critical for zero-downtime)
```

### Step 2 — Readiness Probe

The new pod only receives traffic after its readiness probe passes. Without this, traffic hits the pod before it's ready.

### Step 3 — preStop Hook + terminationGracePeriodSeconds

When a pod is terminating, Kubernetes simultaneously:
1. Removes the pod from Service endpoints
2. Sends `SIGTERM` to the container

There's a propagation delay before the load balancer stops sending traffic. The `preStop` hook adds a small sleep to absorb this.

```yaml
spec:
  terminationGracePeriodSeconds: 60   # total budget for graceful shutdown

  containers:
    - name: app
      lifecycle:
        preStop:
          exec:
            command: ["sh", "-c", "sleep 5"]   # wait for LB to drain
```

### Step 4 — Graceful Shutdown in Spring Boot

```yaml
# application.yml
server:
  shutdown: graceful             # finish in-flight requests before shutdown

spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s  # max time to drain requests
```

### Full Zero-Downtime Timeline

```
1. kubectl apply -f deployment.yaml (new image)
2. New pod starts → startup probe runs
3. New pod passes readiness probe → added to endpoints
4. Old pod receives SIGTERM
   → preStop hook sleeps 5s (LB draining)
   → Spring Boot graceful shutdown (30s to finish requests)
   → SIGKILL after terminationGracePeriodSeconds if not done
5. New pod fully handles traffic ✓
```

---

## RBAC (Role-Based Access Control)

RBAC controls who can do what with Kubernetes API resources.

```
Subject (User / Group / ServiceAccount)
  + RoleBinding (namespace-scoped) or ClusterRoleBinding (cluster-wide)
  → Role (namespace-scoped) or ClusterRole (cluster-wide)
  → Permissions (verbs on resources)
```

### Role (namespace-scoped)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: production
rules:
  - apiGroups: [""]                    # "" = core API group
    resources: ["pods", "pods/log"]
    verbs: ["get", "list", "watch"]

  - apiGroups: ["apps"]
    resources: ["deployments"]
    verbs: ["get", "list", "watch", "update", "patch"]

  - apiGroups: [""]
    resources: ["configmaps"]
    verbs: ["get", "list"]
```

### ClusterRole (cluster-wide or reusable)

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: monitoring-reader
rules:
  - apiGroups: [""]
    resources: ["nodes", "pods", "services", "endpoints"]
    verbs: ["get", "list", "watch"]
  - apiGroups: ["metrics.k8s.io"]
    resources: ["nodes", "pods"]
    verbs: ["get", "list"]
```

### RoleBinding

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: pod-reader-binding
  namespace: production
subjects:
  # Bind to a user
  - kind: User
    name: jane@mycompany.com
    apiGroup: rbac.authorization.k8s.io

  # Bind to a group
  - kind: Group
    name: backend-team
    apiGroup: rbac.authorization.k8s.io

  # Bind to a ServiceAccount
  - kind: ServiceAccount
    name: order-service-sa
    namespace: production

roleRef:
  kind: Role            # or ClusterRole
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

### Common Verbs

| Verb | HTTP Method |
|------|------------|
| `get` | GET (single resource) |
| `list` | GET (collection) |
| `watch` | GET with `?watch=true` |
| `create` | POST |
| `update` | PUT |
| `patch` | PATCH |
| `delete` | DELETE |
| `deletecollection` | DELETE (collection) |

```bash
# Check what you can do
kubectl auth can-i get pods -n production
kubectl auth can-i create deployments -n production --as=jane@mycompany.com

# List all permissions for a service account
kubectl auth can-i --list --as=system:serviceaccount:production:order-service-sa
```

---

## ServiceAccounts

Every Pod runs with a ServiceAccount identity. Used for RBAC and Workload Identity (GKE, EKS).

```yaml
# Create ServiceAccount
apiVersion: v1
kind: ServiceAccount
metadata:
  name: order-service-sa
  namespace: production
  annotations:
    # GKE Workload Identity — maps to GCP service account
    iam.gke.io/gcp-service-account: order-service@my-project.iam.gserviceaccount.com
automountServiceAccountToken: false  # opt-in for token mounting (security best practice)
```

```yaml
# Deployment uses the ServiceAccount
spec:
  serviceAccountName: order-service-sa
  automountServiceAccountToken: true  # needed if app calls K8s API
```

```bash
# Default ServiceAccount in each namespace — avoid using it
# Always create a dedicated SA per workload
kubectl get serviceaccount -n production
```

---

## Pod Security Context

Applies security settings to all containers in a Pod.

```yaml
spec:
  securityContext:
    runAsNonRoot: true        # reject if container tries to run as root
    runAsUser: 1001           # UID for all containers
    runAsGroup: 1001          # GID for all containers
    fsGroup: 1001             # GID for volume mounts (files created in volumes get this GID)
    fsGroupChangePolicy: OnRootMismatch  # only change ownership if needed (faster)
    seccompProfile:
      type: RuntimeDefault    # apply default seccomp profile (filter syscalls)
    sysctls:                  # kernel parameter tuning (privileged only)
      - name: net.core.somaxconn
        value: "1024"

  containers:
    - name: app
      securityContext:
        allowPrivilegeEscalation: false  # can't gain more privileges than parent
        readOnlyRootFilesystem: true     # container FS is read-only
        capabilities:
          drop: ["ALL"]                  # drop all Linux capabilities
          add: ["NET_BIND_SERVICE"]      # re-add only if needed (e.g., bind port < 1024)
```

### Pod Security Admission (K8s 1.25+)

Enforces security standards at the namespace level — replaces PodSecurityPolicy.

```bash
# Label a namespace to enforce the restricted profile
kubectl label namespace production \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/enforce-version=latest \
  pod-security.kubernetes.io/warn=restricted \
  pod-security.kubernetes.io/audit=restricted
```

| Profile | Restrictions |
|---------|-------------|
| `privileged` | No restrictions |
| `baseline` | Blocks known privilege escalations |
| `restricted` | Follows hardening best practices (non-root, no capabilities, read-only FS) |

---

## Namespaces for Environment Isolation

```bash
# Per-environment namespaces on same cluster
kubectl create namespace development
kubectl create namespace staging
kubectl create namespace production

# Apply ResourceQuota per namespace
kubectl apply -f quota-prod.yaml -n production

# Restrict cross-namespace traffic with NetworkPolicy
# Each namespace has its own RBAC, quotas, network policies
```

---

## Debugging Runbook

### Pod Won't Start

```bash
# Check pod status and events
kubectl describe pod <pod-name> -n production

# Common reasons:
# ImagePullBackOff   → wrong image name, missing imagePullSecret
# CrashLoopBackOff   → app crashing on startup (check logs)
# Pending            → no node has enough resources, or affinity not satisfied
# OOMKilled          → exceeded memory limit
# Init:Error         → init container failed

# Check logs (including previous crashed container)
kubectl logs <pod-name> -n production
kubectl logs <pod-name> -n production --previous

# Check node resources
kubectl describe node <node-name>
kubectl top nodes
kubectl top pods -n production
```

### Service Not Routing Traffic

```bash
# 1. Check service selector matches pod labels
kubectl get service order-service -n production -o yaml | grep selector
kubectl get pods -n production -l app=order-service  # pods must have matching labels

# 2. Check endpoints — must not be empty
kubectl get endpoints order-service -n production
# Empty endpoints = no pods match selector, or pods failing readiness probe

# 3. Check readiness probe
kubectl describe pod <pod-name> | grep -A 10 Readiness

# 4. Test from inside cluster
kubectl run debug --rm -it --image=curlimages/curl -- /bin/sh
curl http://order-service.production.svc.cluster.local/actuator/health

# 5. Check NetworkPolicy isn't blocking
kubectl get networkpolicy -n production
```

### DNS Not Resolving

```bash
# Run a debug pod
kubectl run dns-debug --rm -it --image=busybox -- nslookup order-service.production.svc.cluster.local

# Check CoreDNS logs
kubectl logs -n kube-system -l k8s-app=kube-dns

# Check CoreDNS configmap
kubectl get configmap coredns -n kube-system -o yaml
```

### High CPU / Memory

```bash
# Per-container resource usage
kubectl top pods -n production --containers

# Resource requests vs actual usage
kubectl describe nodes | grep -A 10 "Allocated resources"

# HPA status
kubectl get hpa -n production
kubectl describe hpa order-service-hpa -n production

# Recent events
kubectl get events -n production --sort-by='.lastTimestamp' | tail -20
```

### Exec into Running Pod

```bash
# Standard shell
kubectl exec -it <pod-name> -n production -- /bin/sh

# Specific container in multi-container pod
kubectl exec -it <pod-name> -c sidecar -n production -- /bin/bash

# Distroless / no shell — use ephemeral debug container (K8s 1.23+)
kubectl debug -it <pod-name> --image=busybox --target=app -n production
```

---

## Production Checklist

| Category | Check |
|----------|-------|
| **Probes** | Startup + readiness + liveness all configured |
| **Resources** | Requests and limits set on every container |
| **QoS** | Critical services use Guaranteed QoS |
| **Rolling update** | `maxUnavailable: 0`, `maxSurge: 1` |
| **Graceful shutdown** | `preStop` sleep, Spring `graceful` shutdown |
| **Replicas** | At least 2 for any production service |
| **PDB** | PodDisruptionBudget defined |
| **Anti-affinity** | Pods spread across nodes/zones |
| **RBAC** | Dedicated ServiceAccount per workload |
| **Security context** | Non-root, no privilege escalation, read-only FS |
| **Secrets** | No plaintext secrets in env or ConfigMaps |
| **NetworkPolicy** | Default deny + explicit allow rules |
| **Namespace** | Resources namespaced correctly; quotas set |
| **Resource quota** | LimitRange + ResourceQuota on namespace |
| **Image** | Pinned tag (not `latest`), scanned for CVEs |
| **Logging** | Logs to stdout/stderr; no log files in container |

---

## Interview Quick-Fire

**Q: What's the difference between liveness and readiness probes?**
Liveness: is the container alive? Failure triggers a restart. Readiness: is the container ready to serve traffic? Failure removes it from the Service's endpoints but doesn't restart it. Use readiness for warmup and circuit-breaker scenarios; liveness for deadlock detection.

**Q: What is a startup probe and when do you need it?**
A startup probe disables liveness and readiness probes until it passes. Use it for slow-starting apps (JVM warmup, cache loading) where a fixed `initialDelaySeconds` is too fragile — a startup probe retries for a configurable period without affecting the live liveness check.

**Q: How do you achieve zero-downtime rolling updates?**
Combine: `maxUnavailable: 0` + `maxSurge: 1` so new pods start before old ones stop; readiness probe so traffic only reaches ready pods; `preStop` sleep to absorb load-balancer propagation delay; `terminationGracePeriodSeconds` and Spring's graceful shutdown to drain in-flight requests.

**Q: What is the difference between a Role and a ClusterRole?**
A Role grants permissions within a single namespace. A ClusterRole grants permissions cluster-wide (or can be bound to a namespace via RoleBinding). ClusterRoles are also used for non-namespaced resources (Nodes, PersistentVolumes).

**Q: What does `readOnlyRootFilesystem: true` do?**
The container's root filesystem is mounted read-only. The process can't write to it. You must explicitly mount writable paths via emptyDir, tmpfs, or volumes. This prevents malware from writing to the container FS and limits what an attacker can do if they achieve code execution.

**Q: Why should every workload have its own ServiceAccount?**
The default ServiceAccount is shared across all workloads in the namespace. If one workload is compromised, it has whatever permissions that SA has — potentially affecting all workloads. Dedicated SAs enable least-privilege RBAC, Workload Identity bindings, and easier auditing.

<RelatedTopics :topics="['/kubernetes/workloads', '/kubernetes/scaling-scheduling', '/kubernetes/networking', '/docker/production']" />

[→ Back to Kubernetes Overview](/kubernetes/)
