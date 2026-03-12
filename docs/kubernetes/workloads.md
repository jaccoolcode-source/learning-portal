---
title: Workloads
description: Kubernetes workloads — Pod, Deployment, StatefulSet, DaemonSet, Job, CronJob, init containers, multi-container patterns, rolling updates, and rollbacks
category: kubernetes
pageClass: layout-kubernetes
difficulty: intermediate
tags: [kubernetes, pods, deployment, statefulset, daemonset, job, cronjob, rolling-update]
related:
  - /kubernetes/index
  - /kubernetes/networking
  - /kubernetes/config-storage
  - /kubernetes/scaling-scheduling
estimatedMinutes: 35
---

# Workloads

<DifficultyBadge level="intermediate" />

A workload is an application running on Kubernetes. Kubernetes provides several workload resources — each designed for a specific type of application.

---

## Pod

The smallest deployable unit in Kubernetes. A Pod wraps one or more containers that share:
- The same **network namespace** (same IP, communicate via `localhost`)
- The same **storage volumes**
- The same **lifecycle** (scheduled, started, stopped together)

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-pod
  namespace: production
  labels:
    app: my-app
    version: "1.2.3"
spec:
  containers:
    - name: app
      image: myapp:1.2.3
      ports:
        - containerPort: 8080
      env:
        - name: SPRING_PROFILES_ACTIVE
          value: production
      resources:
        requests:
          cpu: "250m"
          memory: "256Mi"
        limits:
          cpu: "1000m"
          memory: "1Gi"
```

::: tip Don't Create Pods Directly
Raw Pods are not rescheduled if a node dies. Always use a controller (Deployment, StatefulSet, etc.) that manages Pods for you.
:::

### Multi-Container Patterns

Multiple containers in one Pod share the network and volumes.

| Pattern | Description | Example |
|---------|-------------|---------|
| **Sidecar** | Extends the main container | Log shipper, proxy (Envoy), metrics exporter |
| **Ambassador** | Proxy to external services | Local proxy that handles retry/auth to a remote DB |
| **Adapter** | Transforms output of main container | Normalise logs/metrics to a standard format |

```yaml
# Sidecar: app + log shipper sharing a volume
spec:
  containers:
    - name: app
      image: myapp:1.0
      volumeMounts:
        - name: logs
          mountPath: /app/logs

    - name: log-shipper
      image: fluent-bit:latest
      volumeMounts:
        - name: logs
          mountPath: /logs
          readOnly: true

  volumes:
    - name: logs
      emptyDir: {}
```

---

## Deployment

The standard controller for stateless applications. Manages a ReplicaSet under the hood.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
  annotations:
    deployment.kubernetes.io/revision: "3"
spec:
  replicas: 3

  selector:
    matchLabels:
      app: order-service      # must match template labels

  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1             # can create 1 extra pod above desired during rollout
      maxUnavailable: 0       # never reduce below desired count (zero-downtime)

  template:
    metadata:
      labels:
        app: order-service    # must match selector.matchLabels
        version: "1.2.3"
    spec:
      serviceAccountName: order-service-sa

      # Graceful shutdown — wait for in-flight requests
      terminationGracePeriodSeconds: 60

      containers:
        - name: app
          image: myregistry.io/order-service:1.2.3
          imagePullPolicy: IfNotPresent    # Always | IfNotPresent | Never

          ports:
            - containerPort: 8080
              name: http

          env:
            - name: SPRING_PROFILES_ACTIVE
              value: production
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: password

          envFrom:
            - configMapRef:
                name: order-service-config

          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"

          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 10
            failureThreshold: 3

          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 15
            failureThreshold: 3

          lifecycle:
            preStop:
              exec:
                # Give load balancer time to remove pod before shutdown begins
                command: ["sh", "-c", "sleep 5"]
```

### Rolling Update Strategy

```
Before: [v1] [v1] [v1]   replicas=3, maxSurge=1, maxUnavailable=0

Step 1: [v1] [v1] [v1] [v2]   surge: create new pod (4 total)
Step 2: [v1] [v1] [v2]        v2 is ready → terminate one v1
Step 3: [v1] [v1] [v2] [v2]   surge again
Step 4: [v1] [v2] [v2]        another v1 terminated
Step 5: [v1] [v2] [v2] [v2]   surge again
Step 6: [v2] [v2] [v2]        last v1 terminated ✓
```

### Rollback

```bash
# Check rollout history
kubectl rollout history deployment/order-service -n production
# REVISION  CHANGE-CAUSE
# 1         Initial deploy
# 2         Update to 1.1.0
# 3         Update to 1.2.3

# Undo last rollout
kubectl rollout undo deployment/order-service -n production

# Roll back to specific revision
kubectl rollout undo deployment/order-service --to-revision=2 -n production

# Annotate deployments for meaningful history
kubectl annotate deployment/order-service kubernetes.io/change-cause="Bump to v1.2.3"
```

---

## StatefulSet

For stateful applications that need:
- **Stable, unique network identity** (`pod-0`, `pod-1`, `pod-2` — predictable names)
- **Ordered, graceful startup and termination** (pod-0 first, then pod-1, etc.)
- **Stable persistent storage** (each Pod gets its own PVC that survives restarts)

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: production
spec:
  serviceName: postgres-headless   # must reference a Headless Service
  replicas: 3
  selector:
    matchLabels:
      app: postgres

  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
        - name: postgres
          image: postgres:16
          ports:
            - containerPort: 5432
          env:
            - name: POSTGRES_DB
              value: orders
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: postgres-secret
                  key: password
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data

  # Each pod gets its own PVC (not shared)
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        storageClassName: standard-rwo
        resources:
          requests:
            storage: 10Gi
```

**StatefulSet Pod naming:**
```
postgres-0   → /var/lib/postgresql/data  (its own PVC: data-postgres-0)
postgres-1   → /var/lib/postgresql/data  (its own PVC: data-postgres-1)
postgres-2   → /var/lib/postgresql/data  (its own PVC: data-postgres-2)

DNS: postgres-0.postgres-headless.production.svc.cluster.local
```

### StatefulSet vs Deployment

| | Deployment | StatefulSet |
|-|-----------|------------|
| Pod names | Random suffix | Stable ordinal (`pod-0`, `pod-1`) |
| Startup order | Parallel | Sequential (0, 1, 2…) |
| Shutdown order | Any order | Reverse (2, 1, 0) |
| Storage | Shared volume | Per-pod PVC |
| DNS | Service only | Individual pod DNS |
| Use for | Stateless apps | Databases, Kafka brokers, ZooKeeper |

---

## DaemonSet

Ensures exactly **one Pod runs on every node** (or every node matching a selector). New nodes get the Pod automatically; Pod is removed when node is removed.

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: log-collector
  namespace: logging
spec:
  selector:
    matchLabels:
      app: log-collector
  template:
    metadata:
      labels:
        app: log-collector
    spec:
      tolerations:
        # Run on control plane nodes too (optional)
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
      containers:
        - name: fluent-bit
          image: fluent/fluent-bit:latest
          volumeMounts:
            - name: varlog
              mountPath: /var/log
            - name: varlibdockercontainers
              mountPath: /var/lib/docker/containers
              readOnly: true
      volumes:
        - name: varlog
          hostPath:
            path: /var/log
        - name: varlibdockercontainers
          hostPath:
            path: /var/lib/docker/containers
```

**Common DaemonSet use cases:** log collection (Fluent Bit, Filebeat), metrics collection (node-exporter), network plugins (Calico, Cilium), storage drivers, security agents.

---

## Job

Runs one or more Pods to **completion**. Pods are not restarted after success.

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: db-migration
spec:
  completions: 1        # total successful completions required
  parallelism: 1        # pods running concurrently
  backoffLimit: 3       # retry up to 3 times on failure
  activeDeadlineSeconds: 300  # fail job if not done in 5 min

  template:
    spec:
      restartPolicy: OnFailure   # Never | OnFailure (required — not Always)
      containers:
        - name: migration
          image: flyway/flyway:10
          args: ["migrate"]
          env:
            - name: FLYWAY_URL
              value: jdbc:postgresql://postgres:5432/orders
          envFrom:
            - secretRef:
                name: db-credentials
```

### Parallel Jobs

```yaml
spec:
  completions: 10   # process 10 items total
  parallelism: 3    # 3 pods at a time
  # Each pod picks up one item; job completes when 10 are done
```

---

## CronJob

Runs Jobs on a cron schedule.

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: daily-report
  namespace: production
spec:
  schedule: "0 2 * * *"         # 02:00 UTC daily (standard cron syntax)
  timeZone: "Europe/Warsaw"      # K8s 1.27+ — specify timezone
  concurrencyPolicy: Forbid      # Allow | Forbid | Replace
  successfulJobsHistoryLimit: 3  # keep last 3 successful job records
  failedJobsHistoryLimit: 1      # keep last 1 failed job record
  startingDeadlineSeconds: 120   # fail if can't start within 2 min of scheduled time

  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          containers:
            - name: report-generator
              image: myapp:1.0
              args: ["--generate-report", "--date=yesterday"]
              resources:
                requests:
                  cpu: "200m"
                  memory: "256Mi"
```

| `concurrencyPolicy` | Behaviour |
|---------------------|-----------|
| `Allow` | Multiple Jobs can run simultaneously |
| `Forbid` | Skip new Job if previous is still running |
| `Replace` | Cancel running Job and start new one |

---

## Init Containers

Init containers run to completion **before** app containers start. They run sequentially and must all succeed.

```yaml
spec:
  initContainers:
    # 1. Wait for database to be ready
    - name: wait-for-db
      image: busybox:latest
      command:
        - sh
        - -c
        - |
          until nc -z postgres 5432; do
            echo "Waiting for postgres..."
            sleep 2
          done
          echo "Postgres is up!"

    # 2. Run database migrations
    - name: run-migrations
      image: flyway/flyway:10
      args: ["migrate"]
      envFrom:
        - secretRef:
            name: db-credentials

  # Main container starts only after both init containers succeed
  containers:
    - name: app
      image: myapp:1.0
```

**Init container use cases:**
- Wait for dependencies (DB, message broker, other services)
- Pre-populate a shared volume with config or data
- Register the pod with an external system
- Run database migrations before app starts

---

## Interview Quick-Fire

**Q: What's the difference between a Pod and a Deployment?**
A Pod is a single instance of running containers. If it dies, it's gone. A Deployment is a controller that maintains a desired number of Pod replicas, handles rolling updates, and reschedules Pods if a node fails.

**Q: When would you use a StatefulSet instead of a Deployment?**
When pods need stable, persistent identities — databases, message brokers, distributed caches. StatefulSets give each pod a predictable name (`pod-0`), its own PVC that survives restarts, and ordered startup/shutdown.

**Q: What is a DaemonSet?**
A controller that runs exactly one Pod on every node. Used for infrastructure concerns that need a presence on every node: log collectors, metrics exporters, network plugins.

**Q: What's the difference between `restartPolicy: Never` and `restartPolicy: OnFailure` in a Job?**
`OnFailure` restarts the container in the same Pod on failure (up to `backoffLimit`). `Never` creates a new Pod on failure. `Never` is better for observability — the failed pod remains for log inspection. `OnFailure` is simpler when you just want retries.

**Q: What do init containers give you that a startup script doesn't?**
Init containers are separate images with different tools and can be written by different teams. They have their own resource limits, they always run to completion before the main container starts, and they're visible in `kubectl describe` as distinct phases. A startup script runs inside the main container and can't easily block startup waiting for external services.

<RelatedTopics :topics="['/kubernetes/networking', '/kubernetes/config-storage', '/kubernetes/scaling-scheduling', '/kubernetes/production']" />

[→ Back to Kubernetes Overview](/kubernetes/)
