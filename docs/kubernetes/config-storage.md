---
title: Config & Storage
description: Kubernetes config and storage — ConfigMaps, Secrets, PersistentVolumes, PersistentVolumeClaims, StorageClasses, dynamic provisioning, and volume types
category: kubernetes
pageClass: layout-kubernetes
difficulty: intermediate
tags: [kubernetes, configmap, secrets, persistentvolume, pvc, storageclass, volumes]
related:
  - /kubernetes/workloads
  - /kubernetes/production
  - /docker/networking-volumes
estimatedMinutes: 25
---

# Config & Storage

<DifficultyBadge level="intermediate" />

Applications need configuration and persistent storage. Kubernetes provides dedicated objects for both — decoupling config from container images and abstracting underlying storage infrastructure.

---

## ConfigMap

A ConfigMap holds non-secret configuration data as key-value pairs or file content.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-service-config
  namespace: production
data:
  # Simple key-value
  LOG_LEVEL: INFO
  PUBSUB_TOPIC: orders-topic
  MAX_RETRY_COUNT: "3"

  # File content (multi-line)
  application.properties: |
    server.port=8080
    spring.datasource.url=jdbc:postgresql://postgres:5432/orders
    logging.level.root=INFO

  logback.xml: |
    <configuration>
      <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder><pattern>%d{HH:mm:ss} %-5level %msg%n</pattern></encoder>
      </appender>
      <root level="${LOG_LEVEL:-INFO}"><appender-ref ref="STDOUT"/></root>
    </configuration>
```

### Using ConfigMaps in Pods

```yaml
spec:
  containers:
    - name: app
      image: myapp:1.0

      # Method 1: All keys as env vars
      envFrom:
        - configMapRef:
            name: order-service-config

      # Method 2: Specific keys as env vars
      env:
        - name: LOG_LEVEL
          valueFrom:
            configMapKeyRef:
              name: order-service-config
              key: LOG_LEVEL

        - name: MAX_RETRY
          valueFrom:
            configMapKeyRef:
              name: order-service-config
              key: MAX_RETRY_COUNT

      # Method 3: Mount as files in a volume
      volumeMounts:
        - name: config-volume
          mountPath: /app/config
          readOnly: true

  volumes:
    - name: config-volume
      configMap:
        name: order-service-config
        # Optional: mount specific keys as specific filenames
        items:
          - key: application.properties
            path: application.properties
          - key: logback.xml
            path: logback.xml
```

**Volume mount result:**
```
/app/config/application.properties  ← content of application.properties key
/app/config/logback.xml             ← content of logback.xml key
```

::: tip Volume Mounts Auto-Update
ConfigMap volume mounts are updated automatically when the ConfigMap changes (with a short delay ~1 min). Environment variables from ConfigMaps do NOT update — they're set at Pod start. Use volume mounts for config files that support hot-reload.
:::

---

## Secret

Secrets hold sensitive data. Values are base64-encoded (not encrypted by default — encryption at rest requires additional cluster config).

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: production
type: Opaque   # generic; other types: kubernetes.io/tls, kubernetes.io/dockerconfigjson
data:
  # Values must be base64-encoded
  username: b3JkZXJz         # echo -n "orders" | base64
  password: c3VwZXJzZWNyZXQ= # echo -n "supersecret" | base64

# OR use stringData — Kubernetes encodes automatically
stringData:
  username: orders
  password: supersecret
```

```bash
# Create from literals (kubectl encodes automatically)
kubectl create secret generic db-credentials \
  --from-literal=username=orders \
  --from-literal=password=supersecret \
  -n production

# Create from files
kubectl create secret generic tls-certs \
  --from-file=tls.crt=./server.crt \
  --from-file=tls.key=./server.key

# Create TLS secret (type: kubernetes.io/tls)
kubectl create secret tls myapp-tls \
  --cert=./server.crt \
  --key=./server.key

# Create Docker registry auth
kubectl create secret docker-registry regcred \
  --docker-server=europe-docker.pkg.dev \
  --docker-username=_json_key \
  --docker-password="$(cat key.json)"

# View (decoded)
kubectl get secret db-credentials -o jsonpath='{.data.password}' | base64 -d
```

### Using Secrets in Pods

```yaml
spec:
  # Pull images from private registry
  imagePullSecrets:
    - name: regcred

  containers:
    - name: app
      # Method 1: All keys as env vars
      envFrom:
        - secretRef:
            name: db-credentials

      # Method 2: Specific keys as env vars
      env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: password
              optional: false   # fail if secret/key doesn't exist

      # Method 3: Mount as files (preferred for TLS certs, key files)
      volumeMounts:
        - name: secrets-vol
          mountPath: /run/secrets
          readOnly: true

  volumes:
    - name: secrets-vol
      secret:
        secretName: db-credentials
        defaultMode: 0400   # read-only by owner
```

### Secret Types

| Type | Description |
|------|-------------|
| `Opaque` | Generic key-value (default) |
| `kubernetes.io/tls` | TLS certificate and key |
| `kubernetes.io/dockerconfigjson` | Docker registry credentials |
| `kubernetes.io/service-account-token` | ServiceAccount token |
| `kubernetes.io/ssh-auth` | SSH credentials |
| `kubernetes.io/basic-auth` | Username + password |

::: warning Secrets Are Not Encrypted by Default
Secrets are base64-encoded in etcd — not encrypted. Anyone with etcd access can read them. Enable **Encryption at Rest** via `EncryptionConfiguration`, or use an external secret manager (Vault, AWS Secrets Manager, GCP Secret Manager) with the Secrets Store CSI driver.
:::

---

## Volumes

Volumes provide storage to containers in a Pod. Unlike container filesystems, volumes survive container restarts (but not Pod deletion, for most types).

### Common Volume Types

| Type | Persists Pod delete? | Use Case |
|------|---------------------|----------|
| `emptyDir` | No | Scratch space, shared between containers in a pod |
| `hostPath` | Yes (on that node) | Node-level data, avoid in production |
| `configMap` | N/A | Mount ConfigMap as files |
| `secret` | N/A | Mount Secret as files |
| `persistentVolumeClaim` | Yes | Persistent app data |
| `nfs` | Yes | Shared filesystem |
| `projected` | N/A | Combine multiple sources (SA token, configmap, secret) |

```yaml
# emptyDir — created fresh for each pod, lost when pod is deleted
volumes:
  - name: cache
    emptyDir:
      sizeLimit: 1Gi    # optional size limit
      medium: Memory    # store in RAM (tmpfs) — empty string = disk

# hostPath — mounts host node filesystem path (use with care)
volumes:
  - name: host-logs
    hostPath:
      path: /var/log/myapp
      type: DirectoryOrCreate

# projected — combine ServiceAccount token + ConfigMap into one volume
volumes:
  - name: projected-vol
    projected:
      sources:
        - serviceAccountToken:
            path: token
            expirationSeconds: 3600
        - configMap:
            name: my-config
```

---

## PersistentVolume (PV) and PersistentVolumeClaim (PVC)

PVs decouple storage from Pods. An administrator provisions PVs; developers claim storage via PVCs.

```
Admin creates PV (or StorageClass does it dynamically)
  ↓
Developer creates PVC (requests storage size + access mode)
  ↓
Kubernetes binds PVC to a matching PV (1:1 binding)
  ↓
Pod mounts the PVC as a volume
```

### Access Modes

| Mode | Short | Description |
|------|-------|-------------|
| `ReadWriteOnce` | RWO | One node can mount read-write |
| `ReadOnlyMany` | ROX | Many nodes can mount read-only |
| `ReadWriteMany` | RWX | Many nodes can mount read-write (NFS, CephFS) |
| `ReadWriteOncePod` | RWOP | One Pod only (K8s 1.22+) |

### PersistentVolume (admin-created)

```yaml
apiVersion: v1
kind: PersistentVolume
metadata:
  name: postgres-pv
spec:
  capacity:
    storage: 50Gi
  accessModes:
    - ReadWriteOnce
  persistentVolumeReclaimPolicy: Retain   # Retain | Delete | Recycle
  storageClassName: standard-rwo
  gcePersistentDisk:                      # GCP persistent disk
    pdName: my-postgres-disk
    fsType: ext4
```

**Reclaim policies:**
| Policy | After PVC deleted |
|--------|------------------|
| `Retain` | PV stays (manual cleanup needed) |
| `Delete` | PV and underlying storage deleted |
| `Recycle` | Deprecated — basic scrub |

### PersistentVolumeClaim (developer-created)

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
  namespace: production
spec:
  accessModes:
    - ReadWriteOnce
  storageClassName: standard-rwo
  resources:
    requests:
      storage: 10Gi
```

### Pod Using PVC

```yaml
spec:
  containers:
    - name: postgres
      image: postgres:16
      volumeMounts:
        - name: data
          mountPath: /var/lib/postgresql/data

  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: postgres-data
```

---

## StorageClass and Dynamic Provisioning

StorageClass enables **dynamic provisioning** — PVs are created automatically when a PVC is created.

```yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: fast-ssd
  annotations:
    storageclass.kubernetes.io/is-default-class: "false"
provisioner: pd.csi.storage.gke.io    # GKE CSI driver
parameters:
  type: pd-ssd                         # GCP SSD persistent disk
  replication-type: regional-pd        # replicated across zones
reclaimPolicy: Delete
allowVolumeExpansion: true
volumeBindingMode: WaitForFirstConsumer  # delay binding until pod is scheduled
```

```bash
# List storage classes
kubectl get storageclasses

# Common GKE storage classes:
# standard-rwo       (default) — standard persistent disk, RWO
# premium-rwo        — SSD persistent disk, RWO
# standard-rwx       — Filestore NFS, RWX
```

### Dynamic Provisioning Flow

```
PVC created → Kubernetes finds matching StorageClass
            → Calls provisioner (CSI driver)
            → Cloud API creates disk
            → PV created automatically
            → PVC bound to PV
            → Pod can mount PVC
```

---

## Volume Expansion

```yaml
# StorageClass must have allowVolumeExpansion: true
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-data
spec:
  resources:
    requests:
      storage: 20Gi   # increased from 10Gi
```

```bash
kubectl apply -f pvc.yaml
# For offline resize: delete the pod, resize, recreate
# For online resize (supported by some CSI drivers): no downtime needed
```

---

## Secrets Store CSI Driver (External Secrets)

Sync secrets from external stores (Vault, AWS Secrets Manager, GCP Secret Manager) into Kubernetes Secrets or directly mounted volumes.

```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: gcp-secrets
spec:
  provider: gcp
  parameters:
    secrets: |
      - resourceName: "projects/my-project/secrets/db-password/versions/latest"
        fileName: "db-password"
```

```yaml
# Pod uses the CSI volume — secret mounted at /mnt/secrets/db-password
volumes:
  - name: secrets-store
    csi:
      driver: secrets-store.csi.k8s.io
      readOnly: true
      volumeAttributes:
        secretProviderClass: gcp-secrets
```

---

## Interview Quick-Fire

**Q: What's the difference between a ConfigMap and a Secret?**
Both store key-value data. ConfigMap is for non-sensitive config (log levels, feature flags, property files). Secrets are for sensitive data (passwords, tokens, certs) — stored base64-encoded and can be encrypted at rest. Access can be controlled separately via RBAC.

**Q: What's the difference between mounting a Secret as env vars vs a volume?**
Env vars are set at container start and never updated. Volume mounts update automatically when the Secret changes (with a short delay). For credentials that rotate, volume mounts are better. For values that never change, env vars are simpler.

**Q: What's a PersistentVolumeClaim and why does it exist?**
It's a request for storage. It separates what an application needs (10 Gi, ReadWriteOnce) from how that storage is provisioned (which cloud disk, which NFS server). Developers write PVCs without knowing the underlying infrastructure; admins or StorageClasses handle provisioning.

**Q: What is `WaitForFirstConsumer` volume binding mode?**
The PVC doesn't bind to a PV until a Pod that uses it is scheduled. This ensures the volume is provisioned in the same availability zone as the Pod's node — critical for zone-local storage like GCP persistent disks.

**Q: What happens to a PVC when you delete a StatefulSet?**
PVCs created by `volumeClaimTemplates` in a StatefulSet are NOT deleted when the StatefulSet is deleted — they persist. This is intentional for data safety. You must delete PVCs manually if you want to reclaim storage.

<RelatedTopics :topics="['/kubernetes/workloads', '/kubernetes/scaling-scheduling', '/kubernetes/production']" />

[→ Back to Kubernetes Overview](/kubernetes/)
