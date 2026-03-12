---
title: Compute — VM / GKE / Cloud Run
description: GCP compute options — Compute Engine VMs, GKE workloads (Deployments, Services, ConfigMaps, HPA), and Cloud Run for serverless containers, with Java deployment patterns
category: gcp
pageClass: layout-gcp
difficulty: intermediate
tags: [compute-engine, gke, cloud-run, kubernetes, docker, java, gcp]
related:
  - /gcp/iam
  - /architecture/microservices
estimatedMinutes: 35
---

# Compute: VM / GKE / Cloud Run

<DifficultyBadge level="intermediate" />

GCP offers three main compute layers: VMs (full control), GKE (orchestrated containers), and Cloud Run (serverless containers). Knowing which to use — and how to deploy Java applications to each — is a common interview topic.

---

## Decision Guide

```
Do you need full OS-level control, GPU, or custom kernel?
  → Compute Engine (VM)

Do you have complex stateful workloads, need Kubernetes primitives
(custom controllers, CRDs, StatefulSets, init containers)?
  → GKE

Does your service receive HTTP requests and you want zero infrastructure management?
  → Cloud Run

Do you run event-driven, short-lived functions (< 60min)?
  → Cloud Functions (v2, built on Cloud Run)
```

| | Compute Engine | GKE | Cloud Run |
|-|----------------|-----|-----------|
| Abstraction | Machine | Pod | Container |
| Startup time | Minutes | Seconds | ~100ms cold start |
| Scale to zero | No | No (nodes stay) | **Yes** |
| Pricing | Per second, always-on | Per node, always-on | Per request (CPU + memory) |
| State | Persistent disk | PersistentVolume | Ephemeral (use Cloud Storage) |
| Networking | VPC, static IP | VPC, Ingress, Load Balancer | HTTPS endpoint auto-provisioned |
| Best for | Legacy lift-and-shift, GPU/TPU | Microservices needing full k8s | HTTP services, event-driven, CI jobs |

---

## Compute Engine (VMs)

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Machine type** | CPU + RAM combination (e.g., `e2-standard-4` = 4 vCPU, 16 GB RAM) |
| **Zone** | Specific location within a region (`us-central1-a`). VMs live in one zone. |
| **Region** | Geographic area containing multiple zones (`us-central1`). |
| **Disk** | Boot disk + optional persistent data disks (HDD or SSD) |
| **Snapshot** | Point-in-time copy of a disk (backup / golden image) |
| **Instance template** | Configuration blueprint for creating VMs |
| **MIG** | Managed Instance Group — creates N identical VMs from a template |

### Machine Type Families

| Family | vCPU:RAM ratio | Use case |
|--------|---------------|----------|
| **E2** | Balanced | Cost-optimised general purpose |
| **N2 / N2D** | Balanced | General purpose, higher performance |
| **C2** | Compute-heavy | Compute-intensive (games, HPC) |
| **M3** | Memory-heavy | In-memory databases, SAP HANA |
| **A2 / G2** | GPU | ML training/inference |
| **T2A** | ARM (Ampere) | Cost-efficient ARM workloads |

### Create and SSH to a VM

```bash
# Create VM
gcloud compute instances create my-java-app \
  --zone=us-central1-a \
  --machine-type=e2-standard-2 \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --service-account=my-app-sa@my-project.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=http-server \
  --boot-disk-size=50GB

# SSH
gcloud compute ssh my-java-app --zone=us-central1-a

# Start / stop
gcloud compute instances start my-java-app --zone=us-central1-a
gcloud compute instances stop my-java-app --zone=us-central1-a
```

### Startup Script (Install Java, Run App)

```bash
# Passed via --metadata-from-file=startup-script=startup.sh
#!/bin/bash
set -euo pipefail

# Install Java 21
apt-get update && apt-get install -y wget
wget -O /tmp/jdk.deb https://download.java.net/...
dpkg -i /tmp/jdk.deb

# Download app JAR from Cloud Storage
gsutil cp gs://my-bucket/myapp.jar /opt/myapp/myapp.jar

# Run as a systemd service
cat > /etc/systemd/system/myapp.service <<EOF
[Unit]
Description=My Java App
[Service]
ExecStart=/usr/bin/java -Xmx2g -jar /opt/myapp/myapp.jar
Restart=always
[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now myapp
```

---

## GKE (Google Kubernetes Engine)

GKE is managed Kubernetes. Google manages the control plane; you manage workloads and optionally node pools.

### GKE Cluster Modes

| Mode | Description |
|------|-------------|
| **Standard** | You manage node pools (machine types, autoscaling config, node count) |
| **Autopilot** | Google manages nodes — you only define Pod specs; billed per Pod resource |

### Core Kubernetes Objects (GKE Context)

#### Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: production
spec:
  replicas: 3
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      serviceAccountName: order-service-ksa   # Workload Identity KSA
      containers:
        - name: app
          image: europe-docker.pkg.dev/my-project/my-repo/order-service:1.2.3
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: production
            - name: DB_PASSWORD               # from Secret
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: password
          envFrom:
            - configMapRef:
                name: order-service-config    # bulk env from ConfigMap
          resources:
            requests:
              cpu: "500m"       # 0.5 vCPU guaranteed
              memory: "512Mi"
            limits:
              cpu: "1000m"      # max 1 vCPU
              memory: "1Gi"
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 20
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 15
```

#### Service (internal load balancer)

```yaml
apiVersion: v1
kind: Service
metadata:
  name: order-service
spec:
  selector:
    app: order-service
  ports:
    - port: 80
      targetPort: 8080
  type: ClusterIP           # internal only
  # type: LoadBalancer      # external GCP Load Balancer
  # type: NodePort          # exposed on each node's IP
```

#### ConfigMap

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
data:
  PUBSUB_TOPIC: orders-topic
  BIGQUERY_DATASET: analytics
  LOG_LEVEL: INFO
```

#### Secret

```bash
# Create secret from literal values
kubectl create secret generic db-credentials \
  --from-literal=password='supersecret' \
  --namespace=production

# Or from a file
kubectl create secret generic tls-cert \
  --from-file=tls.crt=./server.crt \
  --from-file=tls.key=./server.key
```

#### HorizontalPodAutoscaler (HPA)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: order-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: order-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60    # scale up when avg CPU > 60%
    - type: Resource
      resource:
        name: memory
        target:
          type: AverageValue
          averageValue: 800Mi
```

### GKE Ingress (External HTTPS Traffic)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: order-service-ingress
  annotations:
    kubernetes.io/ingress.class: "gce"   # GCP HTTP(S) Load Balancer
    kubernetes.io/ingress.global-static-ip-name: "my-static-ip"
    networking.gke.io/managed-certificates: "my-ssl-cert"
spec:
  rules:
    - host: api.myapp.com
      http:
        paths:
          - path: /api/orders
            pathType: Prefix
            backend:
              service:
                name: order-service
                port:
                  number: 80
```

### Useful kubectl Commands

```bash
# Rollout
kubectl apply -f deployment.yaml
kubectl rollout status deployment/order-service -n production
kubectl rollout undo deployment/order-service -n production     # rollback

# Inspect
kubectl get pods -n production -l app=order-service
kubectl describe pod order-service-7d5f8b-xk2p9 -n production
kubectl logs -f order-service-7d5f8b-xk2p9 -n production --tail=100

# Scale manually
kubectl scale deployment order-service --replicas=5 -n production

# Exec into a pod
kubectl exec -it order-service-7d5f8b-xk2p9 -n production -- /bin/sh

# Port-forward for local debugging
kubectl port-forward service/order-service 8080:80 -n production
```

### Spring Boot on GKE — Health Probes

Spring Boot Actuator exposes dedicated Kubernetes probes out of the box (Spring Boot 2.3+):

```yaml
# application.yml
management:
  endpoint:
    health:
      probes:
        enabled: true           # exposes /actuator/health/liveness and /readiness
      show-details: never       # don't expose internal details publicly
  health:
    livenessState:
      enabled: true
    readinessState:
      enabled: true
```

```yaml
# Deployment probe config
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  failureThreshold: 3
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  failureThreshold: 3
  periodSeconds: 5
```

---

## Cloud Run

Cloud Run runs stateless containers that auto-scale to zero. Perfect for HTTP services, event-driven processors, and scheduled jobs.

### Deploy a Spring Boot App

```bash
# 1. Containerise with Buildpacks (no Dockerfile needed for Spring Boot)
./mvnw spring-boot:build-image -Dspring-boot.build-image.imageName=my-app:latest

# 2. Push to Artifact Registry
gcloud auth configure-docker europe-docker.pkg.dev
docker tag my-app:latest europe-docker.pkg.dev/my-project/my-repo/my-app:1.0.0
docker push europe-docker.pkg.dev/my-project/my-repo/my-app:1.0.0

# 3. Deploy to Cloud Run
gcloud run deploy order-service \
  --image=europe-docker.pkg.dev/my-project/my-repo/my-app:1.0.0 \
  --region=europe-west1 \
  --service-account=my-app-sa@my-project.iam.gserviceaccount.com \
  --set-env-vars="SPRING_PROFILES_ACTIVE=production" \
  --set-secrets="DB_PASSWORD=db-password:latest" \
  --min-instances=0 \     # scale to zero
  --max-instances=100 \
  --memory=1Gi \
  --cpu=1 \
  --concurrency=80 \      # requests per instance before scaling out
  --allow-unauthenticated  # public endpoint
```

### Cloud Run Service YAML

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: order-service
  annotations:
    run.googleapis.com/ingress: all   # or 'internal-and-cloud-load-balancing'
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "100"
        run.googleapis.com/cpu-throttling: "false"  # always-on CPU (not just during request)
    spec:
      serviceAccountName: my-app-sa@my-project.iam.gserviceaccount.com
      containerConcurrency: 80
      containers:
        - image: europe-docker.pkg.dev/my-project/my-repo/order-service:1.0.0
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: production
          resources:
            limits:
              cpu: "1"
              memory: 1Gi
```

### Cloud Run Triggers

| Trigger | Use Case |
|---------|----------|
| HTTP | REST API, webhooks |
| Pub/Sub push | Event-driven processing |
| Cloud Scheduler | Cron jobs |
| Eventarc | Cloud Storage events, Firestore, Audit Logs |

```bash
# Pub/Sub push to Cloud Run
gcloud pubsub subscriptions create orders-sub \
  --topic=orders \
  --push-endpoint=https://order-service-xyz.run.app/pubsub \
  --push-auth-service-account=pubsub-invoker@my-project.iam.gserviceaccount.com

# Grant Pub/Sub permission to invoke the Cloud Run service
gcloud run services add-iam-policy-binding order-service \
  --member="serviceAccount:pubsub-invoker@my-project.iam.gserviceaccount.com" \
  --role="roles/run.invoker" \
  --region=europe-west1
```

### Cold Starts and Optimisation

Cold start = a new container instance is started to handle a request. For Java Spring Boot, this can be 3–10 seconds.

**Mitigation strategies:**

```bash
# Minimum instances — keep at least 1 warm (costs money)
--min-instances=1

# CPU always allocated (not throttled between requests)
--cpu-throttling=false  # or annotation: run.googleapis.com/cpu-throttling: "false"
```

```xml
<!-- Spring Boot native image (GraalVM) — drastically reduces cold start -->
<plugin>
  <groupId>org.graalvm.buildtools</groupId>
  <artifactId>native-maven-plugin</artifactId>
</plugin>
```

```bash
# Build native image
./mvnw -Pnative native:compile

# Result: single binary, cold start < 100ms vs ~5s for JVM
```

### Cloud Run Concurrency vs GKE

A single Cloud Run instance handles multiple requests concurrently (default 80). For CPU-bound work, set concurrency to 1 — one request per instance.

---

## Artifact Registry

The managed container registry (replaced Container Registry / gcr.io).

```bash
# Create repository
gcloud artifacts repositories create my-repo \
  --repository-format=docker \
  --location=europe-west1

# Configure Docker auth
gcloud auth configure-docker europe-west1-docker.pkg.dev

# Push
docker push europe-west1-docker.pkg.dev/my-project/my-repo/my-app:1.0.0

# Pull in GKE / Cloud Run (same project — uses Workload Identity automatically)
image: europe-west1-docker.pkg.dev/my-project/my-repo/my-app:1.0.0
```

---

## Interview Quick-Fire

**Q: When would you choose Cloud Run over GKE?**
Cloud Run for stateless HTTP services where you want zero infrastructure management, scale to zero, and pay-per-request. GKE when you need full Kubernetes primitives (StatefulSets, custom controllers, complex scheduling, or services that need always-on nodes).

**Q: What is a Managed Instance Group?**
A MIG creates and manages N identical VMs from an instance template. It provides autoscaling, auto-healing (replaces unhealthy VMs), and rolling updates.

**Q: What happens during a GKE rolling update?**
Kubernetes incrementally replaces old Pods with new ones. It starts new Pods, waits until they pass readiness probes, then terminates old ones. The `maxSurge` and `maxUnavailable` parameters control the rollout speed.

**Q: How does Cloud Run handle Pub/Sub messages?**
Pub/Sub sends an HTTP POST to the Cloud Run service URL with the message wrapped in a Pub/Sub push envelope. The service returns 200 to ack, or non-2xx to nack (retry).

**Q: What is the difference between liveness and readiness probes?**
Liveness: is the container alive? Failure → restart the container. Readiness: is the container ready to serve traffic? Failure → remove from load balancer, but don't restart. Use readiness for startup warmup and circuit-breaker patterns.

<RelatedTopics :topics="['/gcp/iam', '/gcp/pubsub', '/architecture/microservices']" />

[→ Back to GCP Overview](/gcp/)
