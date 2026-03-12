---
title: API & Network Performance
description: HTTP/2, gRPC vs REST, response compression, Protocol Buffers vs JSON, cursor-based pagination, async APIs, and Spring Boot optimisations
category: performance
pageClass: layout-performance
difficulty: advanced
tags: [http2, grpc, protobuf, compression, pagination, async, spring-performance]
related:
  - /performance/load-testing
  - /architecture/rest-web
  - /system-design/caching
estimatedMinutes: 30
---

# API & Network Performance

<DifficultyBadge level="advanced" />

Network and serialisation overhead is often invisible in development but significant at scale. Choosing the right protocol, enabling compression, and designing efficient pagination can reduce latency and bandwidth by 50–90%.

---

## HTTP/2 vs HTTP/1.1

### HTTP/1.1 Limitations

```
HTTP/1.1: one request at a time per connection

Browser has 6 connections per domain:
  Conn 1: GET /api/products  (waiting...)
  Conn 2: GET /api/cart      (waiting...)
  Conn 3: GET /api/user      (waiting...)
  Conn 4: GET /static/app.js (blocked by HOL)
  Conn 5: idle
  Conn 6: idle

Head-of-line blocking: slow response on conn 1 blocks subsequent requests
```

### HTTP/2 Improvements

| Feature | Benefit |
|---------|---------|
| **Multiplexing** | Multiple requests over one TCP connection — no HOL blocking |
| **Header compression (HPACK)** | Reduces repeated headers (Authorization, Content-Type) by ~85% |
| **Server push** | Server proactively sends resources before client requests them |
| **Binary framing** | More efficient than text — faster parsing |
| **Stream prioritisation** | Critical resources (JS/CSS) prioritised |

```yaml
# Spring Boot — enable HTTP/2 (requires HTTPS in most cases)
server:
  http2:
    enabled: true
  ssl:
    enabled: true
    key-store: classpath:keystore.p12
    key-store-password: ${SSL_KEY_STORE_PASSWORD}
    key-store-type: PKCS12
```

### HTTP/2 for REST APIs

For server-to-server calls (microservices), HTTP/2 gives:
- Connection reuse across many parallel requests (fewer TCP handshakes)
- Header compression for auth headers sent on every request

```java
// Spring WebClient — HTTP/2 client
@Bean
public WebClient webClient() {
    HttpClient httpClient = HttpClient.create()
        .protocol(HttpProtocol.H2)                    // HTTP/2 only
        .responseTimeout(Duration.ofSeconds(5));

    return WebClient.builder()
        .clientConnector(new ReactorClientHttpConnector(httpClient))
        .baseUrl("https://inventory-service.internal")
        .build();
}
```

---

## gRPC vs REST

gRPC uses Protocol Buffers over HTTP/2. It's the standard for high-performance, type-safe inter-service communication.

### When to Choose gRPC

| Criterion | REST + JSON | gRPC + Protobuf |
|-----------|------------|-----------------|
| Performance | Baseline | 2–10× faster serialisation, smaller payloads |
| Type safety | None (JSON schema optional) | Strongly typed contracts (`.proto`) |
| Streaming | Server-Sent Events / WebSocket | Native (unary, server/client/bidirectional) |
| Browser support | Native | Requires gRPC-Web proxy |
| Tooling/ecosystem | Universal | JVM, Go, Python, Rust, etc. |
| Contract-first | Optional (OpenAPI) | Required (`.proto`) |
| Use when | Public APIs, browsers | Internal microservices, streaming, high QPS |

### Protobuf vs JSON Comparison

```
JSON payload (183 bytes):
{"id":42,"name":"Widget Pro","price":29.99,"stock":150,"category":"electronics"}

Protobuf equivalent (~35 bytes):
0a 02 57 69 64 67 65 74 20 50 72 6f ...

~5× smaller → 5× less bandwidth, faster serialisation, faster deserialization
```

### Spring gRPC Setup

```xml
<dependency>
    <groupId>io.grpc</groupId>
    <artifactId>grpc-spring-boot-starter</artifactId>
    <version>3.1.0</version>
</dependency>
```

```protobuf
// src/main/proto/product.proto
syntax = "proto3";
package product;
option java_package = "com.myapp.product.grpc";

service ProductService {
    rpc GetProduct (GetProductRequest) returns (ProductResponse);
    rpc ListProducts (ListProductsRequest) returns (stream ProductResponse);  // server streaming
    rpc UpdatePrices (stream PriceUpdate) returns (UpdateSummary);            // client streaming
}

message GetProductRequest {
    int64 id = 1;
}

message ProductResponse {
    int64 id = 1;
    string name = 2;
    double price = 3;
    int32 stock = 4;
    string category = 5;
}
```

```java
// Server implementation
@GrpcService
public class ProductGrpcService extends ProductServiceGrpc.ProductServiceImplBase {

    @Override
    public void getProduct(GetProductRequest request,
                           StreamObserver<ProductResponse> observer) {
        Product product = productRepo.findById(request.getId())
            .orElseThrow(() -> Status.NOT_FOUND
                .withDescription("Product not found: " + request.getId())
                .asRuntimeException());

        observer.onNext(ProductResponse.newBuilder()
            .setId(product.getId())
            .setName(product.getName())
            .setPrice(product.getPrice())
            .setStock(product.getStock())
            .build());
        observer.onCompleted();
    }

    // Server-side streaming — send products one by one
    @Override
    public void listProducts(ListProductsRequest request,
                             StreamObserver<ProductResponse> observer) {
        productRepo.findByCategory(request.getCategory())
            .forEach(product -> observer.onNext(toProto(product)));
        observer.onCompleted();
    }
}
```

---

## Response Compression

Compressing responses dramatically reduces bandwidth, especially for JSON APIs.

```
JSON payload: 50 KB
After gzip:   5–10 KB  (80–90% reduction)
After Brotli: 4–8 KB   (slightly better than gzip)

Compression CPU cost: ~1–5ms per response
Network saving: 40–90ms for 50 KB over typical connection
Net gain: significant for large payloads
```

### Spring Boot Compression

```yaml
server:
  compression:
    enabled: true
    mime-types:
      - application/json
      - application/xml
      - text/html
      - text/plain
    min-response-size: 1024    # only compress responses > 1 KB (small responses: overhead > saving)
```

### Nginx Compression (Preferred for Production)

Offload compression to the reverse proxy — saves app server CPU:

```nginx
# nginx.conf
gzip on;
gzip_comp_level 5;          # 1–9 (higher = smaller + slower; 5 is balanced)
gzip_min_length 1024;
gzip_types
    application/json
    application/javascript
    text/css
    text/plain;

# Brotli (better compression, modern browsers)
brotli on;
brotli_comp_level 4;
brotli_types application/json text/css application/javascript;
```

### Compression for Specific Endpoints

```java
// Disable compression for already-compressed data (images, videos, Protobuf)
@GetMapping(value = "/api/reports/{id}", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
public ResponseEntity<byte[]> downloadReport(@PathVariable Long id) {
    byte[] data = reportService.generatePdf(id);
    return ResponseEntity.ok()
        .header("Content-Encoding", "identity")  // no compression
        .header("Content-Length", String.valueOf(data.length))
        .body(data);
}
```

---

## Pagination

Returning all results in one response doesn't scale. Pagination is mandatory for any endpoint that can return a large number of items.

### Offset Pagination (Simple, but Flawed)

```java
// GET /api/products?page=0&size=20
@GetMapping("/api/products")
public Page<ProductDto> getProducts(
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size) {
    return productRepo.findAll(PageRequest.of(page, size, Sort.by("id")))
        .map(productMapper::toDto);
}
```

**Performance problem at deep pages:**
```sql
-- Page 1,000 with size 20:
SELECT * FROM products ORDER BY id LIMIT 20 OFFSET 20000;
-- DB must scan and discard 20,000 rows before returning 20 → O(n) cost
```

### Cursor-Based Pagination ← recommended for large datasets

```java
// GET /api/products?cursor=42&size=20
// cursor = last seen id from previous page

@GetMapping("/api/products")
public CursorPage<ProductDto> getProducts(
        @RequestParam(required = false) Long cursor,
        @RequestParam(defaultValue = "20") int size) {

    List<Product> products = cursor == null
        ? productRepo.findFirstN(size + 1)          // first page
        : productRepo.findAfterCursor(cursor, size + 1);  // subsequent pages

    boolean hasMore = products.size() > size;
    if (hasMore) products = products.subList(0, size);

    Long nextCursor = hasMore ? products.getLast().getId() : null;

    return new CursorPage<>(
        products.stream().map(productMapper::toDto).toList(),
        nextCursor,
        hasMore
    );
}
```

```java
@Query("SELECT p FROM Product p WHERE p.id > :cursor ORDER BY p.id LIMIT :limit")
List<Product> findAfterCursor(@Param("cursor") Long cursor, @Param("limit") int limit);
```

```
// SQL: O(log n) with index on id — no full table scan
SELECT * FROM products WHERE id > 20000 ORDER BY id LIMIT 21;
```

### Offset vs Cursor Comparison

| | Offset Pagination | Cursor Pagination |
|--|------------------|------------------|
| Performance | O(offset) — degrades at deep pages | O(log n) — consistent |
| Random access | Yes (`?page=100`) | No (must follow cursor) |
| Real-time consistency | Pages shift when items inserted/deleted | Stable — no item skips/duplicates |
| Implementation | Simple (Spring Data `Pageable`) | More complex |
| Use when | Small datasets, admin UIs | APIs, infinite scroll, large datasets |

---

## Reducing Response Payload Size

### Field Projection (Sparse Fieldsets)

```java
// Client requests only the fields it needs
// GET /api/products?fields=id,name,price

@GetMapping("/api/products")
public List<Map<String, Object>> getProducts(
        @RequestParam(required = false) String fields) {

    List<Product> products = productRepo.findAll();

    if (fields == null) {
        return products.stream()
            .map(p -> Map.of("id", p.getId(), "name", p.getName(),
                             "price", p.getPrice(), "stock", p.getStock()))
            .toList();
    }

    Set<String> requestedFields = Set.of(fields.split(","));
    return products.stream()
        .map(p -> buildProjection(p, requestedFields))
        .toList();
}
```

### ETags & Conditional Requests

```java
// Return ETag — client can cache and send If-None-Match
@GetMapping("/api/products/{id}")
public ResponseEntity<ProductDto> getProduct(@PathVariable Long id,
                                             WebRequest request) {
    Product product = productRepo.findById(id).orElseThrow();
    String etag = "\"" + product.getVersion() + "\"";

    if (request.checkNotModified(etag)) {
        return ResponseEntity.status(304).build();  // 304 Not Modified — no body
    }

    return ResponseEntity.ok()
        .eTag(etag)
        .body(productMapper.toDto(product));
}
```

The browser/client sends `If-None-Match: "42"` on subsequent requests. If unchanged, server returns 304 with no body — zero bandwidth cost.

---

## Async and Non-Blocking APIs

Blocking threads while waiting for I/O wastes resources. Async APIs handle more requests with fewer threads.

### Spring WebFlux (Reactive)

```java
// Fully non-blocking — uses Netty, not Tomcat
@RestController
public class ProductController {

    @GetMapping("/api/products/{id}")
    public Mono<ProductDto> getProduct(@PathVariable Long id) {
        return productService.findById(id)     // returns Mono<Product>
            .map(productMapper::toDto);
    }

    @GetMapping(value = "/api/products/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ProductDto> streamProducts() {
        return productService.findAll()        // returns Flux<Product>
            .map(productMapper::toDto)
            .delayElements(Duration.ofMillis(100));  // Server-Sent Events
    }
}
```

### Virtual Threads (Spring Boot 3.2 + Java 21) ← simpler alternative to WebFlux

```yaml
# application.yml
spring:
  threads:
    virtual:
      enabled: true
```

Virtual threads block cheaply — a blocking `productRepo.findById()` doesn't waste a platform thread. You get throughput close to reactive without the reactive programming model.

**Rule of thumb:** Use virtual threads for new Spring Boot projects (simpler). Use WebFlux when you need backpressure, streaming, or are building reactive pipelines.

---

## Spring Boot Startup & Memory Optimisation

### Lazy Initialisation

```yaml
spring:
  main:
    lazy-initialization: true    # beans created on first use, not at startup
    # Result: faster startup (50–70%), slightly slower first request
    # Use in: development, Lambda/serverless, short-lived containers
    # Avoid in: long-running services where first-request latency matters
```

### Exclude Unused Auto-configurations

```java
@SpringBootApplication(exclude = {
    DataSourceAutoConfiguration.class,     // if no DB
    SecurityAutoConfiguration.class,       // if not using Spring Security
    FlywayAutoConfiguration.class,
})
```

### GraalVM Native Image (Spring Boot 3 AOT)

```bash
# Compile to native binary — no JVM
mvn -Pnative native:compile

# Result:
# Startup: 50ms (vs 3–10 seconds for JVM)
# Memory: 50–200 MB (vs 300–800 MB for JVM)
# No JIT warm-up — peak performance from first request
# Cons: longer build time (minutes), reflection restrictions, no dynamic class loading
```

```yaml
# application.yml — AOT hints for reflection-heavy code
spring:
  aot:
    enabled: true
```

---

## HTTP Caching Headers

Let browsers and CDNs cache responses and avoid redundant server requests:

```java
@GetMapping("/api/products")
public ResponseEntity<List<ProductDto>> getProducts() {
    List<ProductDto> products = productService.findAll();
    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(5, TimeUnit.MINUTES)
            .cachePublic())                           // CDN can cache
        .body(products);
}

@GetMapping("/api/users/{id}/profile")
public ResponseEntity<UserProfile> getProfile(@PathVariable Long id) {
    UserProfile profile = userService.getProfile(id);
    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(1, TimeUnit.HOURS)
            .cachePrivate())                          // only user's browser caches
        .body(profile);
}

@GetMapping("/api/realtime/price/{symbol}")
public ResponseEntity<Price> getPrice(@PathVariable String symbol) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noCache())         // always revalidate
        .body(priceService.getLatest(symbol));
}
```

---

## Interview Quick-Fire

**Q: What are the key performance benefits of HTTP/2 over HTTP/1.1?**
Multiplexing: multiple requests share one TCP connection — eliminates head-of-line blocking and the 6-connection-per-domain limit. Header compression (HPACK): repeating headers like `Authorization` and `Content-Type` are sent only as deltas — ~85% reduction in header bytes. Binary framing is faster to parse than text. Together these reduce latency, especially for many small API calls like a microservices fanout.

**Q: When would you choose cursor-based pagination over offset pagination?**
Cursor-based for large datasets and real-time APIs. Offset pagination does a full index scan to skip N rows — `OFFSET 10000` on a million-row table scans and discards 10,000 rows before returning results. Cursor pagination uses `WHERE id > cursor ORDER BY id LIMIT n` — an O(log n) index seek regardless of depth. Also: cursor pagination is consistent when items are inserted or deleted between pages (no skips or duplicates), unlike offset which can miss or repeat items.

**Q: How does gRPC improve performance over REST+JSON for inter-service calls?**
Three mechanisms: (1) Protobuf serialisation is 5–10× faster than JSON and produces 3–5× smaller payloads — less CPU and bandwidth. (2) Runs over HTTP/2 — connection multiplexing means fewer TCP handshakes for concurrent calls between services. (3) Native streaming support avoids polling or long-polling patterns. Downsides: binary format is harder to debug, browser support requires gRPC-Web proxy, and the `.proto` contract requires tooling to read.

<RelatedTopics :topics="['/performance/load-testing', '/architecture/rest-web', '/system-design/caching', '/concurrency/virtual-threads']" />

[→ Back to Performance Overview](/performance/)
