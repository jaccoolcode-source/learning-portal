---
title: System Design Quiz
---

<script setup>
const questions = [
  {
    question: "What is the difference between horizontal scaling and vertical scaling?",
    options: [
      "Horizontal scaling increases CPU/RAM of a single machine; vertical scaling adds more machines",
      "Horizontal scaling adds more machines to distribute load; vertical scaling increases the resources (CPU, RAM) of an existing machine",
      "They are equivalent strategies with different cost profiles",
      "Horizontal scaling is for databases; vertical scaling is for web servers"
    ],
    answer: 1,
    explanation: "Vertical scaling (scale up): add more resources to one machine — has a physical limit and single point of failure. Horizontal scaling (scale out): add more instances — theoretically unlimited, enables high availability, but requires statelessness or distributed state management. Databases are harder to scale horizontally (sharding complexity) than stateless services."
  },
  {
    question: "What does a CDN (Content Delivery Network) do?",
    options: [
      "It provides a distributed cache of DNS records for faster domain resolution",
      "It caches static assets (images, CSS, JS, videos) at geographically distributed edge nodes close to users, reducing latency and origin server load",
      "It manages database replication across data centers",
      "It routes API requests to the nearest microservice instance"
    ],
    answer: 1,
    explanation: "CDN: a geographically distributed network of edge servers that cache static content. When a user in Tokyo requests an image, it's served from a Tokyo edge node, not a US origin server — reducing latency from ~200ms to ~5ms. CDNs also absorb DDoS attacks and reduce origin bandwidth costs. Examples: Cloudflare, AWS CloudFront, Akamai."
  },
  {
    question: "What is database sharding, and what challenge does it introduce?",
    options: [
      "Sharding compresses database files; the challenge is decompression overhead",
      "Sharding horizontally partitions data across multiple DB instances based on a shard key; challenges include cross-shard queries, rebalancing when adding shards, and distributed transactions",
      "Sharding replicates data to multiple read replicas; the challenge is replication lag",
      "Sharding creates full-text indexes across the database; the challenge is index maintenance"
    ],
    answer: 1,
    explanation: "Sharding distributes rows across multiple database instances by shard key (e.g., user_id % n). Benefits: handles data volume/write throughput beyond single-node capacity. Challenges: cross-shard JOINs are expensive/impossible, choosing the right shard key is critical (hotspot = uneven load), rebalancing when adding shards requires data migration."
  },
  {
    question: "What is a load balancer and what algorithms does it use to distribute requests?",
    options: [
      "A load balancer is a type of database proxy; algorithms: primary/replica, read/write splitting",
      "A load balancer distributes incoming requests across multiple server instances; common algorithms: round-robin, least connections, IP hash, weighted round-robin",
      "A load balancer is a caching layer; algorithms: LRU, LFU, ARC",
      "A load balancer is a message broker; algorithms: FIFO, priority queue, topic-based routing"
    ],
    answer: 1,
    explanation: "Load balancer distributes traffic for availability and scalability. Round-robin: requests distributed sequentially. Least connections: routes to server with fewest active connections. IP hash: same client always hits same server (session affinity). Weighted: servers with more capacity receive more traffic. Layer 4 (TCP) vs Layer 7 (HTTP, path-based routing)."
  },
  {
    question: "What is the CAP theorem and what does choosing CP vs AP mean in practice?",
    options: [
      "CAP = Consistency, Atomicity, Performance. CP = fast reads, AP = fast writes",
      "CAP = Consistency, Availability, Partition tolerance. CP (e.g., HBase, ZooKeeper): prioritizes consistency over availability during network partitions. AP (e.g., Cassandra, DynamoDB): prioritizes availability with eventual consistency",
      "CAP only applies to relational databases; NoSQL systems are exempt",
      "CAP = Caching, Aggregation, Pagination — a REST API design pattern"
    ],
    answer: 1,
    explanation: "When a network partition occurs, CP systems return errors rather than stale data (banks, financial systems). AP systems return potentially stale data rather than errors (social feeds, shopping carts). Since partitions are inevitable in distributed systems, you choose your trade-off. Most real systems need nuanced trade-offs (PACELC theorem is more complete)."
  },
  {
    question: "What is rate limiting, and what algorithms implement it?",
    options: [
      "Rate limiting restricts the size of HTTP request bodies; implemented with Content-Length headers",
      "Rate limiting controls how many requests a client can make in a time window, preventing abuse; algorithms: token bucket (burst-friendly), leaky bucket (smooth output), fixed window counter, sliding window log",
      "Rate limiting limits the number of database connections per application",
      "Rate limiting is a DNS technique to prevent too many DNS lookups"
    ],
    answer: 1,
    explanation: "Rate limiting prevents abuse, DoS, and ensures fair usage. Token bucket: tokens accumulate at a fixed rate, each request consumes a token — allows bursts. Leaky bucket: requests processed at a fixed rate regardless of arrival bursts — smooth output. Fixed window: count per time window (has burst-at-boundary problem). Sliding window: more accurate but more memory."
  },
  {
    question: "What is the Circuit Breaker pattern and what states does it have?",
    options: [
      "A hardware failsafe in data centers; states: on, off, tripped",
      "A software pattern that monitors calls to a service; states: Closed (normal), Open (failing fast — return errors without calling), Half-Open (testing if service recovered)",
      "A database connection management pattern; states: connected, disconnected, reconnecting",
      "A rate limiting pattern; states: under-limit, at-limit, over-limit"
    ],
    answer: 1,
    explanation: "Circuit Breaker (Resilience4j, Hystrix): Closed = normal operation, tracking failure rate. If failures exceed threshold → Open: returns errors immediately without calling downstream, allowing it to recover. After a timeout → Half-Open: lets a few requests through. If they succeed → Closed. If they fail → Open again. Prevents cascade failures in microservices."
  },
  {
    question: "What is the difference between a message queue and a pub/sub system?",
    options: [
      "Message queues use TCP; pub/sub uses UDP",
      "Message queue: point-to-point — a message is consumed by exactly one consumer. Pub/sub: one message is delivered to all subscribers of a topic",
      "They are identical — pub/sub is just the marketing name for message queues",
      "Message queues are for synchronous communication; pub/sub is for asynchronous"
    ],
    answer: 1,
    explanation: "Message queue (point-to-point): producer sends to queue, one consumer receives and acknowledges. Used for task distribution (work queues). Pub/sub: producer publishes to topic, ALL subscribers receive a copy. Used for event broadcasting (order placed → notify inventory, shipping, notifications separately). Kafka supports both patterns."
  },
  {
    question: "What is eventual consistency and how does it differ from strong consistency?",
    options: [
      "Eventual consistency guarantees that reads always return the latest write; strong consistency allows temporary staleness",
      "Strong consistency: after a write completes, all subsequent reads return that value. Eventual consistency: after a write, reads may temporarily return stale values but will eventually converge to the latest",
      "They are the same concept with different marketing names",
      "Eventual consistency is only relevant for distributed file systems; strong consistency is for databases"
    ],
    answer: 1,
    explanation: "Strong consistency (linearizability): reads always reflect the latest write — simpler to reason about but limits availability/performance. Eventual consistency: replicas may diverge temporarily but converge given no new updates. Amazon S3 object updates, Cassandra (tunable consistency), DNS propagation are eventually consistent. Use strong for finances; eventual for social feeds."
  },
  {
    question: "What is a reverse proxy and how does it differ from a forward proxy?",
    options: [
      "A reverse proxy sits in front of clients; a forward proxy sits in front of servers",
      "A reverse proxy sits in front of backend servers, forwarding client requests to them (load balancing, SSL termination, caching). A forward proxy sits in front of clients, forwarding their requests to the internet on their behalf",
      "They are the same — proxy direction is determined by configuration",
      "Reverse proxy is for HTTP only; forward proxy handles all protocols"
    ],
    answer: 1,
    explanation: "Reverse proxy (Nginx, HAProxy, API Gateway): clients don't know which server handles their request. Provides: load balancing, SSL termination, caching, rate limiting, authentication. Forward proxy: used by clients to access the internet (corporate firewall, VPN). The client knows it's using a proxy; the server may not know the real client IP."
  },
  {
    question: "What is consistent hashing and why is it used in distributed systems?",
    options: [
      "A hashing algorithm that always produces the same hash for the same input",
      "A technique for distributing data across nodes where adding or removing a node only remaps a small fraction of keys, minimizing data movement during cluster scaling",
      "A method for ensuring hash collisions never occur in hash tables",
      "A database sharding strategy that uses the hash of the primary key modulo the number of shards"
    ],
    answer: 1,
    explanation: "Naive sharding (key % n): adding/removing a node remaps ~all keys. Consistent hashing: nodes and keys are placed on a virtual ring. Each key is handled by the nearest node clockwise. Adding a node: only the keys between the new node and its predecessor move. Removing: only that node's keys move to the next. Used in: Dynamo, Cassandra, Redis Cluster, CDN routing."
  },
  {
    question: "What is the two-phase commit (2PC) protocol and what is its main weakness?",
    options: [
      "2PC is a database backup protocol; weakness: it only creates one backup copy",
      "2PC coordinates distributed transactions: Phase 1 (prepare) all participants vote yes/no; Phase 2 (commit) coordinator tells all to commit or abort. Weakness: blocking protocol — if coordinator crashes after prepare, participants are blocked waiting indefinitely",
      "2PC is a TLS handshake variant; weakness: it doesn't support Perfect Forward Secrecy",
      "2PC commits data in two write operations for durability; weakness: doubles write latency"
    ],
    answer: 1,
    explanation: "2PC ensures distributed ACID transactions: Phase 1: coordinator asks 'can you commit?' — participants write to WAL and vote yes/no. Phase 2: if all yes → commit; any no → abort. Main weakness: blocking — if coordinator crashes after collecting 'yes' votes but before sending commit, participants hold locks indefinitely. Alternative: Saga pattern (eventual consistency without 2PC)."
  }
]
</script>

# System Design Quiz

Test your knowledge of horizontal scaling, CDNs, sharding, load balancing, CAP theorem, rate limiting, and distributed system patterns.

<Quiz :questions="questions" />

---

Need a refresher? Review the [System Design study pages](/system-design/).
