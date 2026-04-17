---
title: ECS & EKS
description: AWS container orchestration — ECS task definitions, Fargate, EKS managed Kubernetes, and when to use each
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, ecs, eks, fargate, containers, kubernetes, docker, orchestration]
estimatedMinutes: 35
---

# ECS & EKS

<DifficultyBadge level="intermediate" />

AWS offers two primary container orchestration platforms: **ECS** (AWS-native, simpler) and **EKS** (managed Kubernetes, more portable and powerful).

---

## ECS — Elastic Container Service

ECS is AWS's proprietary container orchestrator. It manages the scheduling and lifecycle of Docker containers.

### Key Concepts

```
Cluster
  └── Service (desired count = 3)
        └── Task (running instance of task definition)
              └── Container(s) (Docker containers per task)

Task Definition (like a docker-compose file — CPU, memory, image, env vars, ports)
```

| Concept | Description |
|---------|-------------|
| **Cluster** | Logical grouping of tasks/services (backed by EC2 or Fargate). |
| **Task Definition** | Blueprint: image, CPU/memory, env vars, volumes, IAM role. |
| **Task** | A running instance of a task definition (1+ containers). |
| **Service** | Maintains desired task count, integrates with ALB, handles deployments. |
| **Fargate** | Serverless launch type — no EC2 to manage. AWS provisions compute per task. |

### Task Definition (JSON)

```json
{
  "family": "order-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::123456789:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::123456789:role/orderServiceRole",
  "containerDefinitions": [
    {
      "name": "order-service",
      "image": "123456789.dkr.ecr.eu-west-1.amazonaws.com/order-service:latest",
      "portMappings": [{ "containerPort": 8080 }],
      "environment": [
        { "name": "SPRING_PROFILES_ACTIVE", "value": "prod" }
      ],
      "secrets": [
        { "name": "DB_PASSWORD", "valueFrom": "arn:aws:secretsmanager:..." }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/order-service",
          "awslogs-region": "eu-west-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:8080/actuator/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

### ECS Launch Types

| Launch Type | You Manage | AWS Manages | Best For |
|-------------|-----------|-------------|----------|
| **Fargate** | Nothing | EC2, OS, patching | Most workloads — no ops overhead |
| **EC2** | EC2 instances, AMI updates | ECS scheduling | GPU workloads, custom OS, cost optimization |

### ECS Service Deployment

```bash
# Rolling update (default) — gradually replaces old tasks
aws ecs update-service \
  --cluster prod \
  --service order-service \
  --task-definition order-service:42 \
  --deployment-configuration "minimumHealthyPercent=50,maximumPercent=200"

# Blue/green deployment via CodeDeploy — two target groups, instant switchover
```

---

## EKS — Elastic Kubernetes Service

EKS is managed Kubernetes — AWS runs the control plane (API server, etcd), you run worker nodes.

### Architecture

```
EKS Control Plane (AWS managed — multi-AZ, auto-patched)
  └── API Server, etcd, Scheduler, Controller Manager

Node Groups (your EC2s or Fargate)
  └── Node (EC2 instance with kubelet + kube-proxy)
        └── Pod (1+ containers)
              └── Container
```

### EKS vs ECS

| | ECS | EKS |
|--|-----|-----|
| **Learning curve** | Low | High (Kubernetes knowledge required) |
| **Portability** | AWS-only | Any Kubernetes (on-prem, GKE, AKS) |
| **Ecosystem** | AWS-native integrations | Massive Kubernetes ecosystem |
| **Complexity** | Simple | Complex but flexible |
| **Auto-scaling** | ECS Service Auto Scaling | HPA, VPA, Cluster Autoscaler |
| **Best for** | Teams going all-in on AWS | Multi-cloud, existing K8s expertise |

### Kubernetes Fundamentals on EKS

```yaml
# Deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
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
      serviceAccountName: order-service-sa   # maps to IAM role via IRSA
      containers:
        - name: order-service
          image: 123456789.dkr.ecr.eu-west-1.amazonaws.com/order-service:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "250m"
              memory: "512Mi"
            limits:
              cpu: "500m"
              memory: "1Gi"
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: password
```

### IRSA — IAM Roles for Service Accounts

IRSA maps a Kubernetes ServiceAccount to an AWS IAM Role without embedding credentials.

```bash
# Create IAM role with trust policy for the service account
eksctl create iamserviceaccount \
  --cluster prod \
  --namespace default \
  --name order-service-sa \
  --attach-policy-arn arn:aws:iam::123456789:policy/OrderServicePolicy \
  --approve
```

### EKS Add-ons

| Add-on | Purpose |
|--------|---------|
| **AWS Load Balancer Controller** | Provisions ALB/NLB from Ingress/Service objects |
| **EBS CSI Driver** | Dynamic EBS volume provisioning for PersistentVolumes |
| **EFS CSI Driver** | Shared EFS volumes (ReadWriteMany) |
| **Cluster Autoscaler / Karpenter** | Scale EC2 nodes based on pod demand |
| **AWS VPC CNI** | Native VPC networking for pods (each pod gets a VPC IP) |

---

## Fargate: ECS vs EKS

Both ECS and EKS support Fargate (serverless nodes):
- **ECS Fargate:** simpler, task-level granularity
- **EKS Fargate:** run pods serverlessly, but with Kubernetes API — no persistent volumes, no DaemonSets

---

## Interview Quick-Fire

**Q: When would you choose ECS over EKS?**
ECS is simpler and sufficient for teams going fully AWS-native who don't need Kubernetes portability. EKS is preferred when the team already knows Kubernetes, needs multi-cloud flexibility, or relies on the K8s ecosystem (Helm, Argo CD, Istio).

**Q: What is Fargate and what problem does it solve?**
Fargate is a serverless compute engine for containers — you don't provision or manage EC2 instances. AWS allocates resources per task/pod. It eliminates OS patching, capacity planning, and node management.

**Q: What is IRSA?**
IAM Roles for Service Accounts — maps a Kubernetes ServiceAccount to an IAM Role using OIDC federation. Pods running with that ServiceAccount get temporary AWS credentials via the metadata service, without storing access keys.

<RelatedTopics :topics="['/aws/', '/aws/iam', '/kubernetes/']" />

[→ Back to AWS Overview](/aws/)
