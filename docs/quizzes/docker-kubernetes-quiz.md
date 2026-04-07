---
title: Docker & Kubernetes Quiz
---

<script setup>
const questions = [
  {
    question: "What is a Docker image layer, and why does layer ordering in a Dockerfile matter?",
    options: [
      "Layers are security zones; ordering determines which layer runs with root privileges",
      "Each Dockerfile instruction creates a read-only layer; layers are cached. Placing rarely-changing instructions (e.g., installing dependencies) before frequently-changing ones (e.g., copying app code) maximizes cache hits and speeds up builds",
      "Layer ordering only matters for multi-stage builds",
      "Layers are just metadata labels — ordering has no performance impact"
    ],
    answer: 1,
    explanation: "Each RUN/COPY/ADD instruction adds a layer. Docker caches layers — if a layer hasn't changed, it reuses the cache. If COPY . . comes before RUN mvn install, every code change invalidates the mvn install layer. Best practice: COPY pom.xml first → RUN mvn dependency:resolve → COPY src → RUN mvn package."
  },
  {
    question: "In Docker Compose, what does `depends_on` guarantee?",
    options: [
      "It waits until the dependent service is fully healthy and ready to accept connections",
      "It only ensures the dependent container has started (process launched), NOT that the service inside is ready",
      "It creates a network link between the services",
      "It shares environment variables between dependent services"
    ],
    answer: 1,
    explanation: "depends_on only waits for the container to start (Docker daemon starts the process), not for the service to be ready (e.g., Postgres accepting connections). For readiness, use healthcheck in Compose or a wait script like wait-for-it.sh / dockerize. Since Compose v2, depends_on supports condition: service_healthy with healthchecks."
  },
  {
    question: "How do Docker Compose services communicate with each other by default?",
    options: [
      "Through the host network — they share the host's IP address",
      "Through a default bridge network created by Compose; services are accessible by their service name as the DNS hostname",
      "Only through explicitly defined port mappings on the host",
      "Through shared volumes — Compose does not provide network communication"
    ],
    answer: 1,
    explanation: "Compose creates a default bridge network for all services. Services resolve each other by service name via Docker's embedded DNS. For example, a Spring app service named 'app' can connect to a database service named 'postgres' using jdbc:postgresql://postgres:5432/db. No port mapping needed for service-to-service communication."
  },
  {
    question: "What is the difference between a Kubernetes Pod and a Deployment?",
    options: [
      "A Pod is a group of Deployments; a Deployment is a single container",
      "A Pod is the smallest deployable unit (one or more containers sharing network/storage); a Deployment manages a ReplicaSet to maintain desired Pod replicas, handle rolling updates, and enable rollbacks",
      "A Deployment runs one container; a Pod runs multiple containers",
      "They are equivalent — Pod is the old name, Deployment is the new name"
    ],
    answer: 1,
    explanation: "Pod: one or more containers with shared network namespace (localhost) and volumes. Pods are ephemeral — if a node fails, the Pod is gone. Deployment: a controller that declares desired state (replicas, image version). It creates a ReplicaSet that ensures the right number of Pods are running. Handles rolling updates and rollbacks."
  },
  {
    question: "What are the four main Kubernetes Service types?",
    options: [
      "Internal, External, Load-balanced, Headless",
      "ClusterIP, NodePort, LoadBalancer, ExternalName",
      "HTTP, TCP, UDP, gRPC",
      "Primary, Secondary, Tertiary, Quaternary"
    ],
    answer: 1,
    explanation: "ClusterIP (default): internal cluster access only. NodePort: exposes on each Node's IP at a static port (30000-32767). LoadBalancer: provisions a cloud load balancer (GCP/AWS/Azure) with a public IP. ExternalName: maps a service to an external DNS name (CNAME). Headless (ClusterIP: None): returns Pod IPs directly for stateful applications."
  },
  {
    question: "What is the difference between a ConfigMap and a Secret in Kubernetes?",
    options: [
      "ConfigMap stores configuration data as plain text key-value pairs; Secret stores sensitive data (passwords, tokens, keys) that Kubernetes base64-encodes and can encrypt at rest",
      "They are identical — Secret is just a ConfigMap with a different name",
      "ConfigMap data is encrypted; Secret data is plain text",
      "ConfigMap is cluster-scoped; Secret is namespace-scoped"
    ],
    answer: 0,
    explanation: "ConfigMap: plain text non-sensitive config (e.g., DB_HOST, APP_PORT). Secret: sensitive data — base64-encoded (NOT encrypted by default) and restricted by RBAC. Enable etcd encryption at rest for true Secret security. Both can be mounted as volumes or injected as environment variables. Never commit Secret YAML with real values to Git."
  },
  {
    question: "What does the Horizontal Pod Autoscaler (HPA) do?",
    options: [
      "Automatically increases the CPU and memory resources of existing Pods",
      "Automatically scales the number of Pod replicas based on observed metrics (CPU utilization, custom metrics)",
      "Horizontally expands Persistent Volumes when they run low on storage",
      "Distributes Pods evenly across Kubernetes nodes"
    ],
    answer: 1,
    explanation: "HPA monitors metrics (default: CPU utilization via metrics-server) and adjusts replica count to meet the target. Example: target 50% CPU, current 80% → HPA scales up. Scale down after sustained low usage. For scaling based on custom metrics (queue depth, requests/sec), integrate with Prometheus Adapter or KEDA."
  },
  {
    question: "What is the purpose of a Kubernetes liveness probe vs a readiness probe?",
    options: [
      "Liveness: checks if the container is ready to receive traffic; Readiness: checks if the container is alive",
      "Liveness: determines if the container should be restarted (unhealthy = restart); Readiness: determines if the Pod should receive traffic (not ready = removed from Service endpoints)",
      "They are identical — both restart the container when the check fails",
      "Liveness is for HTTP services; Readiness is for TCP services"
    ],
    answer: 1,
    explanation: "Liveness probe: if it fails, Kubernetes kills and restarts the container (e.g., detect deadlock). Readiness probe: if it fails, the Pod is removed from the Service's endpoint list — no traffic sent — but NOT restarted (e.g., warming up, overloaded). A Pod can be alive but not ready. Both support HTTP GET, TCP socket, and exec commands."
  },
  {
    question: "What is a multi-stage Docker build and what is its primary benefit?",
    options: [
      "A build that runs on multiple Docker hosts simultaneously for speed",
      "A Dockerfile with multiple FROM stages — allows using a full build image (JDK, Maven) to compile, then copying only the artifact into a minimal runtime image, producing a much smaller final image",
      "A build process that creates multiple image variants (development, production) in one Dockerfile run",
      "A technique to build Docker images in parallel using BuildKit"
    ],
    answer: 1,
    explanation: "Multi-stage builds solve bloated images. Stage 1 (builder): FROM maven:3.9 → copies source → mvn package. Stage 2 (runtime): FROM eclipse-temurin:21-jre → COPY --from=builder target/app.jar → CMD. Final image contains only the JRE and JAR, not Maven, source code, or build tools. Typical reduction: 500MB → 80MB."
  },
  {
    question: "What is a Kubernetes Namespace and why is it used?",
    options: [
      "A DNS namespace prefix added to all service names in a cluster",
      "A virtual cluster within a Kubernetes cluster that provides isolation for resources, enabling multi-tenancy, environment separation (dev/staging/prod), and RBAC scoping",
      "A naming convention for Docker images in a registry",
      "A reserved area in node memory for Kubernetes system processes"
    ],
    answer: 1,
    explanation: "Namespaces partition a cluster into virtual sub-clusters. Resources (Pods, Services, ConfigMaps) are namespace-scoped. Use cases: separate dev/staging/prod environments, team isolation, resource quota limits per namespace, RBAC policies scoped per namespace. Cluster-scoped resources (Nodes, PersistentVolumes, ClusterRoles) exist outside namespaces."
  },
  {
    question: "What is the role of etcd in a Kubernetes cluster?",
    options: [
      "etcd is the container runtime that runs Pods on worker nodes",
      "etcd is a distributed key-value store that serves as Kubernetes' backing store — storing all cluster state, configuration, and object metadata",
      "etcd is the network plugin that manages Pod networking",
      "etcd is the scheduler that assigns Pods to nodes"
    ],
    answer: 1,
    explanation: "etcd is the Kubernetes brain. All cluster state (Deployments, Services, Secrets, Pod status) is stored in etcd. The API server is the only component that reads/writes to etcd directly. etcd uses the Raft consensus protocol for HA. Losing etcd without a backup means losing all cluster configuration — backup etcd in production."
  },
  {
    question: "What is a Kubernetes StatefulSet and when should you use it instead of a Deployment?",
    options: [
      "StatefulSet runs Pods with root privileges; use it when containers need elevated permissions",
      "StatefulSet provides stable network identities (pod-name-0, pod-name-1), stable persistent storage, and ordered deployment/scaling; use it for stateful applications like databases, Kafka, ZooKeeper",
      "StatefulSet is a Deployment with auto-scaling disabled",
      "StatefulSet guarantees that only one Pod replica runs at a time"
    ],
    answer: 1,
    explanation: "StatefulSet guarantees: stable Pod names (app-0, app-1), stable DNS hostnames, ordered startup/shutdown (app-0 before app-1), stable PersistentVolumeClaims that survive pod rescheduling. Use for: databases (PostgreSQL, Cassandra), message brokers (Kafka, ZooKeeper), any app where each instance has unique identity or persistent state."
  }
]
</script>

# Docker & Kubernetes Quiz

Test your knowledge of Docker images, multi-stage builds, Docker Compose networking, Kubernetes workloads, Services, ConfigMaps, and autoscaling.

<Quiz :questions="questions" />

---

Need a refresher? Review the [Docker](/docker/) and [Kubernetes](/kubernetes/) study pages.
