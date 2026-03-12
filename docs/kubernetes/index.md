---
title: Kubernetes
description: Kubernetes overview — cluster architecture, control plane, worker nodes, core objects, and essential kubectl commands
category: kubernetes
pageClass: layout-kubernetes
difficulty: intermediate
tags: [kubernetes, k8s, cluster, kubectl, pods, control-plane, nodes]
related:
  - /kubernetes/workloads
  - /kubernetes/networking
  - /docker/index
  - /gcp/compute
estimatedMinutes: 20
---

# Kubernetes

<DifficultyBadge level="intermediate" />

Kubernetes (K8s) is a container orchestration platform. It automates deployment, scaling, self-healing, and networking of containerised workloads across a cluster of machines.

---

## Cluster Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     CONTROL PLANE                       │
│                                                         │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │  API Server  │  │  etcd    │  │  Scheduler         │ │
│  │  (kube-      │  │ (cluster │  │  (assign pods      │ │
│  │   apiserver) │  │  state)  │  │   to nodes)        │ │
│  └─────────────┘  └──────────┘  └────────────────────┘ │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Controller Manager (ReplicaSet, Deployment,     │   │
│  │  Node, Job, ServiceAccount controllers...)       │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
         │                │                │
    ┌────▼────┐      ┌────▼────┐      ┌────▼────┐
    │  Node 1 │      │  Node 2 │      │  Node 3 │
    │         │      │         │      │         │
    │ kubelet │      │ kubelet │      │ kubelet │
    │kube-    │      │kube-    │      │kube-    │
    │ proxy   │      │ proxy   │      │ proxy   │
    │containerd      │containerd      │containerd
    │ [pods]  │      │ [pods]  │      │ [pods]  │
    └─────────┘      └─────────┘      └─────────┘
```

### Control Plane Components

| Component | Role |
|-----------|------|
| **kube-apiserver** | The front door. All communication goes through it. Validates + stores objects in etcd. |
| **etcd** | Distributed key-value store. Single source of truth for all cluster state. |
| **kube-scheduler** | Watches for unscheduled Pods and assigns them to nodes based on resource availability, affinity, taints. |
| **kube-controller-manager** | Runs control loops: ReplicaSet controller ensures N replicas, Node controller watches for dead nodes, etc. |
| **cloud-controller-manager** | Cloud-specific controllers (provision load balancers, volumes, nodes). Runs on managed clusters (GKE, EKS, AKS). |

### Node Components

| Component | Role |
|-----------|------|
| **kubelet** | Agent on every node. Ensures containers described in PodSpecs are running and healthy. |
| **kube-proxy** | Maintains iptables/IPVS rules for Service networking. Routes traffic to correct Pod IPs. |
| **Container runtime** | Runs containers. Usually `containerd` or `CRI-O`. (Docker was removed as a runtime in K8s 1.24.) |

---

## Core Objects

| Object | API Group | What It Is |
|--------|-----------|-----------|
| **Pod** | core | Smallest deployable unit. One or more containers sharing network + storage. |
| **ReplicaSet** | apps | Ensures N identical Pod replicas are running at all times. |
| **Deployment** | apps | Manages ReplicaSets. Handles rolling updates, rollbacks. |
| **StatefulSet** | apps | Like Deployment but for stateful apps — stable names, ordered startup. |
| **DaemonSet** | apps | Runs one Pod per node (or per selector-matched node). |
| **Job** | batch | Runs Pod(s) to completion. |
| **CronJob** | batch | Runs Jobs on a schedule. |
| **Service** | core | Stable network endpoint for a set of Pods. |
| **Ingress** | networking.k8s.io | HTTP/S routing rules — maps URLs to Services. |
| **ConfigMap** | core | Non-secret configuration data. |
| **Secret** | core | Sensitive data (passwords, tokens, certs). Base64-encoded. |
| **PersistentVolume** | core | Cluster-level storage resource. |
| **PersistentVolumeClaim** | core | Pod's request for storage. |
| **Namespace** | core | Virtual cluster — isolates resources within a cluster. |
| **ServiceAccount** | core | Identity for Pods. Used for RBAC and Workload Identity. |
| **HorizontalPodAutoscaler** | autoscaling | Scales Deployment/StatefulSet based on metrics. |
| **NetworkPolicy** | networking.k8s.io | Firewall rules for Pod-to-Pod traffic. |

---

## Namespaces

Namespaces provide virtual isolation within a cluster.

```bash
# Built-in namespaces
kubectl get namespaces
# default        — default namespace when none specified
# kube-system    — system components (CoreDNS, kube-proxy)
# kube-public    — publicly readable, rarely used
# kube-node-lease — node heartbeat objects

# Create
kubectl create namespace production
kubectl create namespace staging

# Work in a namespace
kubectl get pods -n production
kubectl apply -f deployment.yaml -n production

# Set default namespace for current context
kubectl config set-context --current --namespace=production
```

Resource names must be unique within a namespace. Cross-namespace communication uses the full DNS name: `service.namespace.svc.cluster.local`.

---

## Essential kubectl Commands

### Context and Cluster

```bash
# View config
kubectl config view
kubectl config get-contexts
kubectl config current-context

# Switch context (cluster)
kubectl config use-context gke_project_region_cluster

# Switch namespace
kubectl config set-context --current --namespace=production
```

### Get and Describe

```bash
# Get resources
kubectl get pods
kubectl get pods -n production
kubectl get pods -A              # all namespaces
kubectl get pods -o wide         # extra columns (node, IP)
kubectl get pods -o yaml         # full YAML definition
kubectl get pods -o json
kubectl get pods -l app=my-app   # filter by label
kubectl get pods --field-selector=status.phase=Running

# Describe (detailed info + events)
kubectl describe pod my-pod-abc123
kubectl describe deployment my-app
kubectl describe node my-node

# Get all resources in namespace
kubectl get all -n production
```

### Apply and Delete

```bash
# Apply (create or update) — declarative, preferred
kubectl apply -f deployment.yaml
kubectl apply -f ./k8s/                    # apply all files in directory
kubectl apply -f ./k8s/ --recursive       # recurse into subdirectories
kubectl apply -k ./overlays/production    # Kustomize

# Delete
kubectl delete -f deployment.yaml
kubectl delete pod my-pod
kubectl delete pod my-pod --grace-period=0 --force   # immediate kill
kubectl delete pods -l app=my-app

# Dry run (validate without applying)
kubectl apply -f deployment.yaml --dry-run=client
kubectl apply -f deployment.yaml --dry-run=server    # server-side validation
```

### Debugging

```bash
# Logs
kubectl logs my-pod
kubectl logs my-pod -c my-container    # specific container in multi-container pod
kubectl logs -f my-pod                 # follow
kubectl logs --previous my-pod         # logs from previous (crashed) container
kubectl logs -l app=my-app --all-containers=true  # all pods matching label

# Exec
kubectl exec -it my-pod -- /bin/sh
kubectl exec -it my-pod -c sidecar -- /bin/bash

# Port forward (local:remote)
kubectl port-forward pod/my-pod 8080:8080
kubectl port-forward service/my-service 8080:80
kubectl port-forward deployment/my-app 8080:8080

# Copy files
kubectl cp my-pod:/app/logs/app.log ./app.log
kubectl cp ./config.yml my-pod:/app/config.yml

# Events (sorted by time — first thing to check when something's wrong)
kubectl get events -n production --sort-by='.lastTimestamp'
kubectl get events -n production --field-selector=reason=BackOff

# Top (requires metrics-server)
kubectl top pods -n production
kubectl top nodes

# Debug with ephemeral container (K8s 1.23+)
kubectl debug -it my-pod --image=busybox --target=app
```

### Rollouts

```bash
kubectl rollout status deployment/my-app
kubectl rollout history deployment/my-app
kubectl rollout undo deployment/my-app
kubectl rollout undo deployment/my-app --to-revision=3
kubectl rollout pause deployment/my-app
kubectl rollout resume deployment/my-app
kubectl rollout restart deployment/my-app    # triggers rolling restart
```

---

## Declarative vs Imperative

```bash
# Imperative (quick, not reproducible)
kubectl run my-pod --image=myapp:1.0
kubectl create deployment my-app --image=myapp:1.0 --replicas=3
kubectl expose deployment my-app --port=80 --target-port=8080

# Declarative (preferred — version controlled, reproducible)
kubectl apply -f deployment.yaml

# Generate YAML starters from imperative commands
kubectl create deployment my-app --image=myapp:1.0 --dry-run=client -o yaml > deployment.yaml
kubectl create service clusterip my-svc --tcp=80:8080 --dry-run=client -o yaml > service.yaml
```

---

## What's Covered

| Page | Contents |
|------|----------|
| [Workloads](/kubernetes/workloads) | Pod, Deployment, StatefulSet, DaemonSet, Job, CronJob, init containers |
| [Networking](/kubernetes/networking) | Services, Ingress, DNS, NetworkPolicy |
| [Config & Storage](/kubernetes/config-storage) | ConfigMap, Secret, PV, PVC, StorageClass |
| [Scaling & Scheduling](/kubernetes/scaling-scheduling) | HPA, VPA, resource limits, affinity, taints, PodDisruptionBudget |
| [Production Patterns](/kubernetes/production) | Probes, RBAC, security contexts, zero-downtime deploys, debugging |

<RelatedTopics :topics="['/kubernetes/workloads', '/kubernetes/networking', '/docker/index', '/gcp/compute']" />
