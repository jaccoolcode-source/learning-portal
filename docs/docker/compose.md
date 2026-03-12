---
title: Docker Compose
description: Docker Compose — multi-container stacks, service configuration, depends_on with healthchecks, environment variables, profiles, named volumes, networking, and real-world Spring Boot stacks
category: docker
pageClass: layout-docker
difficulty: intermediate
tags: [docker-compose, docker, multi-container, spring-boot, postgres, kafka, redis]
related:
  - /docker/networking-volumes
  - /docker/dockerfile
  - /messaging/kafka-core
estimatedMinutes: 30
---

# Docker Compose

<DifficultyBadge level="intermediate" />

Docker Compose defines and runs multi-container applications from a single YAML file. It's the standard tool for local development environments and is increasingly used for integration testing in CI.

---

## File Structure

```yaml
# docker-compose.yml (or compose.yml — preferred in newer versions)
name: my-app              # project name (prefix for containers, networks, volumes)

services:
  service-name:           # container definition
    image: or build: ...
    # ...

volumes:                  # named volumes declaration
  my-volume:

networks:                 # custom networks
  my-network:
```

---

## Core Compose File

```yaml
name: order-platform

services:

  # ─── Application ────────────────────────────────────────────────────────────
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - APP_VERSION=dev
    image: order-service:dev
    container_name: order-service
    ports:
      - "8080:8080"
      - "5005:5005"   # remote debug
    environment:
      SPRING_PROFILES_ACTIVE: local
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/orders
      SPRING_DATASOURCE_USERNAME: orders
      SPRING_DATASOURCE_PASSWORD: secret
      SPRING_KAFKA_BOOTSTRAP_SERVERS: kafka:9092
      SPRING_DATA_REDIS_HOST: redis
    env_file:
      - .env.local      # additional env vars from file
    depends_on:
      postgres:
        condition: service_healthy   # wait for postgres healthcheck to pass
      kafka:
        condition: service_healthy
      redis:
        condition: service_started   # just started, no healthcheck
    networks:
      - app-net
    volumes:
      - app-logs:/app/logs
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8080/actuator/health"]
      interval: 30s
      timeout: 5s
      start_period: 40s
      retries: 3

  # ─── PostgreSQL ─────────────────────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: postgres
    environment:
      POSTGRES_DB: orders
      POSTGRES_USER: orders
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"   # expose for local DB clients (DBeaver, IntelliJ)
    volumes:
      - postgres-data:/var/lib/postgresql/data
      - ./init-scripts:/docker-entrypoint-initdb.d:ro  # run SQL on first start
    networks:
      - app-net
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U orders -d orders"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  # ─── Redis ──────────────────────────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: redis
    command: redis-server --requirepass secret --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    networks:
      - app-net
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "secret", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── Zookeeper (required for Kafka) ─────────────────────────────────────────
  zookeeper:
    image: confluentinc/cp-zookeeper:7.6.0
    container_name: zookeeper
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    networks:
      - app-net

  # ─── Kafka ──────────────────────────────────────────────────────────────────
  kafka:
    image: confluentinc/cp-kafka:7.6.0
    container_name: kafka
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"       # for containers on the same network
      - "29092:29092"     # for host machine (e.g. Kafka UI, local producers)
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:29092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
    volumes:
      - kafka-data:/var/lib/kafka/data
    networks:
      - app-net
    healthcheck:
      test: ["CMD", "kafka-topics", "--bootstrap-server", "localhost:9092", "--list"]
      interval: 30s
      timeout: 10s
      retries: 5
      start_period: 30s

  # ─── Kafka UI (optional dev tool) ───────────────────────────────────────────
  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    container_name: kafka-ui
    depends_on:
      - kafka
    ports:
      - "8090:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:9092
    networks:
      - app-net
    profiles:
      - tools             # only starts with: docker compose --profile tools up

volumes:
  postgres-data:
  redis-data:
  kafka-data:
  app-logs:

networks:
  app-net:
    driver: bridge
```

---

## depends_on and Healthchecks

`depends_on` with `condition: service_healthy` waits for the dependency's healthcheck to pass before starting the dependent service. Without this, your app may start before Postgres is ready.

```yaml
depends_on:
  postgres:
    condition: service_healthy    # wait for healthcheck pass
  kafka:
    condition: service_healthy
  redis:
    condition: service_started    # started (not necessarily healthy)
  migration:
    condition: service_completed_successfully  # run-once init container
```

### One-shot migration container

```yaml
services:
  flyway:
    image: flyway/flyway:10
    command: migrate
    environment:
      FLYWAY_URL: jdbc:postgresql://postgres:5432/orders
      FLYWAY_USER: orders
      FLYWAY_PASSWORD: secret
      FLYWAY_LOCATIONS: filesystem:/migrations
    volumes:
      - ./src/main/resources/db/migration:/migrations:ro
    depends_on:
      postgres:
        condition: service_healthy

  app:
    depends_on:
      flyway:
        condition: service_completed_successfully  # app starts only after migration done
      postgres:
        condition: service_healthy
```

---

## Environment Variables

### Inline

```yaml
environment:
  DB_HOST: postgres
  DB_PORT: 5432
  SPRING_PROFILES_ACTIVE: local
```

### From File (`env_file`)

```yaml
env_file:
  - .env          # shared defaults
  - .env.local    # local overrides (gitignored)
```

```bash
# .env
DB_HOST=postgres
DB_PORT=5432

# .env.local  (gitignored — developer overrides)
DB_PASSWORD=my-local-secret
```

### Variable Substitution

```yaml
# Compose substitutes ${VAR} from shell environment or .env file
services:
  app:
    image: myapp:${APP_VERSION:-dev}   # default "dev" if APP_VERSION not set
    environment:
      DB_PASSWORD: ${DB_PASSWORD:?DB_PASSWORD must be set}  # error if not set
```

---

## Profiles

Profiles let you define services that only start when explicitly requested.

```yaml
services:
  app:
    image: myapp:dev
    # no profile — always starts

  kafka-ui:
    image: provectuslabs/kafka-ui
    profiles:
      - tools    # only with --profile tools

  prometheus:
    image: prom/prometheus
    profiles:
      - monitoring

  mailhog:
    image: mailhog/mailhog
    ports:
      - "8025:8025"   # web UI
      - "1025:1025"   # SMTP
    profiles:
      - tools
```

```bash
# Start without tools
docker compose up -d

# Start with tools (kafka-ui, mailhog)
docker compose --profile tools up -d

# Start with monitoring
docker compose --profile monitoring up -d

# Multiple profiles
docker compose --profile tools --profile monitoring up -d
```

---

## Essential Compose Commands

```bash
# Start all services (detached)
docker compose up -d

# Start and force rebuild images
docker compose up -d --build

# Start specific services only
docker compose up -d postgres redis

# Stop and remove containers (keeps volumes and images)
docker compose down

# Stop and remove containers + volumes (destructive — wipes DB data)
docker compose down -v

# Stop and remove containers + images
docker compose down --rmi local

# View status
docker compose ps

# Logs
docker compose logs -f              # all services, follow
docker compose logs -f app          # single service
docker compose logs --tail 50 app   # last 50 lines

# Execute command in running service container
docker compose exec app /bin/sh
docker compose exec postgres psql -U orders -d orders

# Run one-off command in new container
docker compose run --rm app java -jar app.jar --spring.batch.job.enabled=true

# Restart a service
docker compose restart app

# Scale a service (for services without fixed container_name)
docker compose up -d --scale worker=3

# Pull latest images
docker compose pull

# Validate compose file
docker compose config

# Watch for changes and rebuild (Compose Watch — newer feature)
docker compose watch
```

---

## KRaft Kafka (No Zookeeper — Kafka 3.4+)

```yaml
kafka:
  image: confluentinc/cp-kafka:7.6.0
  container_name: kafka
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: broker,controller
    KAFKA_LISTENERS: PLAINTEXT://kafka:9092,CONTROLLER://kafka:9093,PLAINTEXT_HOST://0.0.0.0:29092
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092,PLAINTEXT_HOST://localhost:29092
    KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
    KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
    KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
    KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
    KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
    CLUSTER_ID: "MkU3OEVBNTcwNTJENDM2Qk"  # base64 UUID
  volumes:
    - kafka-data:/var/lib/kafka/data
  ports:
    - "29092:29092"
  networks:
    - app-net
```

---

## Compose for Integration Tests (Testcontainers Alternative)

```yaml
# docker-compose.test.yml
services:
  postgres-test:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"   # different host port to avoid conflict with dev
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U test"]
      interval: 5s
      retries: 10

  kafka-test:
    image: confluentinc/cp-kafka:7.6.0
    # ... KRaft config ...
    ports:
      - "29093:29092"
```

```bash
# CI pipeline
docker compose -f docker-compose.test.yml up -d --wait
mvn verify -Pintegration-tests
docker compose -f docker-compose.test.yml down -v
```

---

## Compose Watch (Hot Reload)

```yaml
# compose.yml
services:
  app:
    build: .
    develop:
      watch:
        - action: rebuild          # rebuild image when Dockerfile changes
          path: Dockerfile
        - action: rebuild
          path: pom.xml
        - action: sync             # sync files without rebuild
          path: src/main/resources
          target: /app/resources
```

```bash
docker compose watch   # rebuilds/syncs on file changes
```

---

## Interview Quick-Fire

**Q: What does `depends_on: condition: service_healthy` do?**
It makes Compose wait until the dependency's healthcheck reports `healthy` before starting the dependent service. Without it, `depends_on` only waits for the container to start — not for the service inside to be ready.

**Q: How do containers in the same Compose file communicate?**
Compose creates a default bridge network for the project. All services join it and can reach each other by service name — Docker's embedded DNS resolves `postgres`, `redis`, `kafka` to their container IPs.

**Q: What's the difference between `docker compose down` and `docker compose down -v`?**
`down` stops and removes containers but keeps named volumes (database data is preserved). `down -v` also removes all named volumes — wiping all persistent data. Use `-v` only to start fresh.

**Q: How do profiles work in Compose?**
Services tagged with a `profile` only start when you pass `--profile <name>` to `docker compose up`. Services without a profile always start. Useful for optional dev tools (Kafka UI, mail catcher, monitoring) you don't want running by default.

**Q: What's the `KAFKA_ADVERTISED_LISTENERS` split for?**
Kafka must advertise different addresses for different clients. `PLAINTEXT://kafka:9092` is used by containers on the same Docker network (DNS-resolved). `PLAINTEXT_HOST://localhost:29092` is used by clients on the host machine (via published port). Without both, either your app or your local tools won't connect.

<RelatedTopics :topics="['/docker/networking-volumes', '/docker/dockerfile', '/docker/production']" />

[→ Back to Docker Overview](/docker/)
