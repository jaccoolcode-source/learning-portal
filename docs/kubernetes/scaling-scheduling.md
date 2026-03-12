---
title: Scaling & Scheduling
description: Kubernetes scaling and scheduling — resource requests and limits, HPA, VPA, Cluster Autoscaler, node affinity, pod affinity, taints and tolerations, PodDisruptionBudget
category: kubernetes
pageClass: layout-kubernetes
difficulty: advanced
tags: [kubernetes, hpa, vpa, autoscaling, resource-limits, affinity, taints, tolerations, pdb]
related:
  - /kubernetes/workloads
  - /kubernetes/production
  - /kubernetes/config-storage
estimatedMinutes: 30
---

# Scaling & Scheduling

<DifficultyBadge level="advanced" />

Kubernetes scheduling decides where Pods run. Autoscaling adjusts how many run. Getting resource requests, limits, and scheduling rules right is the difference between a stable cluster and cascading failures.

---

## Resource Requests and Limits

Every container should declare how much CPU and memory it needs.

```yaml
resources:
  requests:         # minimum guaranteed — used for scheduling decisions
    cpu: "500m"     # 500 millicores = 0.5 vCPU
    memory: "512Mi"
  limits:           # maximum allowed — enforced at runtime
    cpu: "1000m"    # 1 vCPU
    memory: "1Gi"
```

### How Scheduling Uses Requests

```
Node capacity: 4 vCPU, 8 Gi RAM
Already scheduled: 2 vCPU requested, 4 Gi requested
Available for scheduling: 2 vCPU, 4 Gi

New Pod requests 500m CPU, 512Mi RAM → fits → scheduled here
New Pod requests 3000m CPU          → doesn't fit → Pending (tries other nodes)
```

The scheduler only looks at **requests**, not actual usage. A node can be "full" for scheduling but have idle CPU if containers don't use their requests.

### CPU vs Memory Enforcement

| Resource | Exceeds request | Exceeds limit |
|----------|----------------|---------------|
| **CPU** | Throttled (CFS quota) | Throttled (not killed) |
| **Memory** | Allowed (best-effort) | **OOMKilled** (container killed) |

::: warning Memory Limits and Java
Without proper JVM heap config, Java reads host memory, sets a large heap, and gets OOMKilled. Always combine memory limits with JVM flags:
```
-XX:MaxRAMPercentage=75
```
:::

### QoS Classes

Kubernetes assigns a Quality of Service class based on requests and limits:

| QoS Class | Condition | Eviction Priority |
|-----------|-----------|------------------|
| **Guaranteed** | limits = requests (both set, equal) | Last to be evicted |
| **Burstable** | requests < limits (or only one set) | Middle priority |
| **BestEffort** | No requests or limits set | First to be evicted |

```yaml
# Guaranteed (requests == limits)
resources:
  requests:
    cpu: "500m"
    memory: "512Mi"
  limits:
    cpu: "500m"      # same as request
    memory: "512Mi"  # same as request
```

::: tip Production Recommendation
Set requests accurately (profile your app). Set limits to prevent noisy neighbours. For critical services, use Guaranteed QoS. For batch jobs, Burstable is fine.
:::

---

## LimitRange

Default and maximum resource values per namespace, applied automatically to Pods that don't specify them.

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: production
spec:
  limits:
    - type: Container
      default:          # applied when no limits specified
        cpu: "500m"
        memory: "512Mi"
      defaultRequest:   # applied when no requests specified
        cpu: "200m"
        memory: "256Mi"
      max:              # hard maximum — rejected if exceeded
        cpu: "4000m"
        memory: "4Gi"
      min:              # hard minimum
        cpu: "100m"
        memory: "64Mi"

    - type: Pod
      max:
        cpu: "8000m"    # total across all containers in pod
        memory: "8Gi"
```

---

## ResourceQuota

Limits total resource consumption per namespace.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: production-quota
  namespace: production
spec:
  hard:
    # Compute
    requests.cpu: "20"
    requests.memory: 40Gi
    limits.cpu: "40"
    limits.memory: 80Gi

    # Object count
    pods: "100"
    services: "20"
    persistentvolumeclaims: "30"
    secrets: "50"
    configmaps: "50"

    # Storage
    requests.storage: 500Gi
```

---

## HorizontalPodAutoscaler (HPA)

HPA automatically scales the number of Pod replicas based on observed metrics.

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
  namespace: production
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service

  minReplicas: 2
  maxReplicas: 20

  metrics:
    # CPU utilisation (requires metrics-server)
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60   # scale up if avg CPU > 60% of request

    # Memory utilisation
    - type: Resource
      resource:
        name: memory
        target:
          type: AverageValue
          averageValue: 800Mi     # scale up if avg memory > 800 Mi

    # Custom metric (requires custom metrics adapter, e.g. Prometheus Adapter)
    - type: Pods
      pods:
        metric:
          name: http_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"    # 100 req/s per pod

    # External metric (e.g., Pub/Sub queue depth)
    - type: External
      external:
        metric:
          name: pubsub.googleapis.com|subscription|num_undelivered_messages
          selector:
            matchLabels:
              resource.labels.subscription_id: orders-sub
        target:
          type: AverageValue
          averageValue: "500"   # scale if > 500 messages per replica

  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60   # wait 60s before scaling up again
      policies:
        - type: Pods
          value: 4             # add at most 4 pods per scaling event
          periodSeconds: 60
    scaleDown:
      stabilizationWindowSeconds: 300  # wait 5 min before scaling down
      policies:
        - type: Percent
          value: 10            # remove at most 10% of pods per event
          periodSeconds: 60
```

### HPA Scaling Formula

```
desiredReplicas = ceil(currentReplicas × (currentMetricValue / desiredMetricValue))

Example: 3 replicas, CPU at 90%, target 60%
desiredReplicas = ceil(3 × (90 / 60)) = ceil(4.5) = 5
```

---

## VerticalPodAutoscaler (VPA)

VPA adjusts resource **requests and limits** of existing containers based on historical usage — rather than scaling the number of replicas.

```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: order-service-vpa
  namespace: production
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service

  updatePolicy:
    updateMode: "Auto"      # Off | Initial | Recreate | Auto

  resourcePolicy:
    containerPolicies:
      - containerName: app
        minAllowed:
          cpu: "100m"
          memory: "128Mi"
        maxAllowed:
          cpu: "2000m"
          memory: "2Gi"
        controlledResources: ["cpu", "memory"]
```

| `updateMode` | Behaviour |
|-------------|-----------|
| `Off` | Recommend only, no changes |
| `Initial` | Set on Pod creation only |
| `Recreate` | Evict + recreate pods to apply new values |
| `Auto` | Evict when needed (same as Recreate currently) |

::: warning HPA + VPA Conflict
Don't use HPA (CPU/memory) and VPA together on the same deployment — they fight over the same metrics. Use VPA for right-sizing requests, then switch to HPA for scaling. Or use HPA on custom metrics with VPA.
:::

---

## Cluster Autoscaler

Scales the number of **nodes** in the cluster when:
- Pods are **Pending** because no node has enough resources → add nodes
- Nodes are **underutilised** for an extended period → remove nodes

```yaml
# GKE — configured at node pool level
gcloud container node-pools update my-pool \
  --enable-autoscaling \
  --min-nodes=1 \
  --max-nodes=10 \
  --cluster=my-cluster \
  --region=europe-west1
```

---

## Node Affinity

Control which nodes a Pod is scheduled onto.

```yaml
spec:
  affinity:
    nodeAffinity:
      # Hard requirement — pod won't schedule if not met
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: kubernetes.io/arch
                operator: In
                values: ["amd64"]
              - key: cloud.google.com/gke-nodepool
                operator: In
                values: ["high-memory-pool"]

      # Soft preference — scheduler prefers but doesn't require
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          preference:
            matchExpressions:
              - key: topology.kubernetes.io/zone
                operator: In
                values: ["europe-west1-b"]
```

---

## Pod Affinity and Anti-Affinity

Control scheduling relative to other Pods.

```yaml
spec:
  affinity:
    # Pod Anti-Affinity — spread replicas across nodes (HA)
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchLabels:
              app: order-service
          topologyKey: kubernetes.io/hostname   # one pod per node
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app: order-service
            topologyKey: topology.kubernetes.io/zone  # prefer different zones

    # Pod Affinity — co-locate with cache pods (low latency)
    podAffinity:
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 50
          podAffinityTerm:
            labelSelector:
              matchLabels:
                app: redis-cache
            topologyKey: kubernetes.io/hostname
```

### Topology Spread Constraints (Preferred Modern Approach)

```yaml
spec:
  topologySpreadConstraints:
    # Spread evenly across zones
    - maxSkew: 1                          # max imbalance between zones
      topologyKey: topology.kubernetes.io/zone
      whenUnsatisfiable: DoNotSchedule    # or ScheduleAnyway
      labelSelector:
        matchLabels:
          app: order-service

    # Also spread across nodes within each zone
    - maxSkew: 1
      topologyKey: kubernetes.io/hostname
      whenUnsatisfiable: ScheduleAnyway
      labelSelector:
        matchLabels:
          app: order-service
```

---

## Taints and Tolerations

Taints prevent Pods from being scheduled on nodes unless the Pod has a matching toleration. Used to dedicate nodes for specific workloads.

```bash
# Taint a node
kubectl taint nodes gpu-node-1 dedicated=gpu:NoSchedule
kubectl taint nodes spot-node-1 cloud.google.com/gke-spot=true:NoSchedule

# Remove taint
kubectl taint nodes gpu-node-1 dedicated=gpu:NoSchedule-
```

```yaml
# Pod toleration — allows scheduling on tainted node
spec:
  tolerations:
    # Match specific taint
    - key: dedicated
      operator: Equal
      value: gpu
      effect: NoSchedule

    # Match GKE spot instances
    - key: cloud.google.com/gke-spot
      operator: Equal
      value: "true"
      effect: NoSchedule

    # Tolerate any taint with this key
    - key: dedicated
      operator: Exists

    # Tolerate ALL taints (use with extreme care)
    - operator: Exists
```

### Taint Effects

| Effect | Behaviour |
|--------|-----------|
| `NoSchedule` | New Pods without matching toleration won't be scheduled here |
| `PreferNoSchedule` | Scheduler tries to avoid but may still schedule |
| `NoExecute` | Existing Pods without toleration are evicted; new ones blocked |

### Common Pattern: Dedicated Node Pools

```yaml
# GPU pods only — node is tainted with dedicated=gpu:NoSchedule
# Only pods with this toleration run here
spec:
  tolerations:
    - key: dedicated
      value: gpu
      effect: NoSchedule
  affinity:
    nodeAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        nodeSelectorTerms:
          - matchExpressions:
              - key: dedicated
                operator: In
                values: ["gpu"]
```

---

## PodDisruptionBudget (PDB)

Limits voluntary disruptions (node drain, rolling updates, cluster upgrades) to ensure availability is maintained.

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: order-service-pdb
  namespace: production
spec:
  selector:
    matchLabels:
      app: order-service

  # Option 1: minimum available during disruption
  minAvailable: 2       # at least 2 pods must remain running

  # Option 2: maximum unavailable during disruption
  # maxUnavailable: 1   # at most 1 pod can be disrupted at once
  # maxUnavailable: 25% # or a percentage
```

```bash
# kubectl drain respects PDBs — waits until PDB allows eviction
kubectl drain my-node --ignore-daemonsets --delete-emptydir-data

# Check PDB status
kubectl get pdb -n production
# NAME                ALLOWED DISRUPTIONS   MIN AVAILABLE   CURRENT HEALTHY
# order-service-pdb   1                     2               3
```

::: tip PDB Best Practice
Always define PDBs for production services with `minAvailable: N-1` (or `maxUnavailable: 1`). Without a PDB, a node drain can terminate all replicas simultaneously if they all happen to be on that node.
:::

---

## Interview Quick-Fire

**Q: What's the difference between resource requests and limits?**
Requests are what the scheduler guarantees — a pod is only placed on a node with enough free requested resources. Limits are enforced at runtime: CPU is throttled, memory causes OOMKill. Set requests accurately for scheduling; set limits to protect the node from runaway processes.

**Q: What's a QoS class and why does it matter?**
Kubernetes assigns Guaranteed, Burstable, or BestEffort based on whether requests and limits are set and equal. When the node is under memory pressure, BestEffort pods are evicted first, then Burstable, then Guaranteed. Use Guaranteed for critical services.

**Q: When does the Cluster Autoscaler add nodes?**
When Pods are in Pending state because no node has enough free requested resources. The CA simulates scheduling and adds the smallest node that would allow the pending pod to schedule.

**Q: What's the difference between node affinity and taints/tolerations?**
Node affinity is specified on the Pod — "I want to run on nodes with these labels." Taints are specified on the Node — "Don't schedule here unless you tolerate this." They're complementary: taints repel, affinity attracts.

**Q: What does a PodDisruptionBudget protect against?**
Voluntary disruptions only: node drains (for maintenance, upgrades), rolling updates, and HPA scale-down. It does NOT protect against involuntary disruptions (node failure, OOMKill). During a `kubectl drain`, Kubernetes won't evict a pod if doing so would violate the PDB.

**Q: Can you use HPA and VPA together?**
Not on the same metrics. HPA scaling CPU/memory conflicts with VPA adjusting requests (which HPA uses as its baseline). The pattern is: use VPA in `Off` mode to get recommendations, set requests appropriately, then use HPA for scaling. Or use HPA on custom metrics (RPS, queue depth) + VPA for right-sizing CPU/memory.

<RelatedTopics :topics="['/kubernetes/workloads', '/kubernetes/production', '/kubernetes/networking']" />

[→ Back to Kubernetes Overview](/kubernetes/)
