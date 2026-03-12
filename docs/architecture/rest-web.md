---
title: REST & Web APIs
description: REST maturity levels, HTTP semantics, idempotency, API versioning, OpenAPI, and common API design patterns
category: architecture
pageClass: layout-architecture
difficulty: intermediate
tags: [rest, http, api-design, openapi, versioning, idempotency, hateoas]
related:
  - /architecture/microservices
  - /spring/spring-boot
  - /databases/sql
estimatedMinutes: 25
---

# REST & Web APIs

<DifficultyBadge level="intermediate" />

REST (Representational State Transfer) is an architectural style for distributed hypermedia systems. Most "REST APIs" are actually just HTTP APIs — understanding the full picture makes you a better API designer.

---

## Richardson Maturity Model

Four levels of REST maturity:

| Level | Description | Example |
|-------|-------------|---------|
| 0 — POX | Single endpoint, all via POST | `POST /api {"action":"getOrder","id":1}` |
| 1 — Resources | Multiple endpoints, one per resource | `GET /orders/1` |
| 2 — HTTP Verbs | Correct HTTP methods + status codes | `DELETE /orders/1` → `204 No Content` |
| 3 — HATEOAS | Responses include links to next actions | `{"id":1, "_links":{"cancel":"/orders/1/cancel"}}` |

Most production APIs sit at **Level 2**. Level 3 (HATEOAS) is rare in practice.

---

## HTTP Methods and Semantics

```
GET     /orders        → list orders          (safe, idempotent)
GET     /orders/1      → get order 1          (safe, idempotent)
POST    /orders        → create order         (not safe, not idempotent)
PUT     /orders/1      → replace order 1      (not safe, idempotent)
PATCH   /orders/1      → partial update       (not safe, not necessarily idempotent)
DELETE  /orders/1      → delete order 1       (not safe, idempotent)
```

**Safe** — doesn't change server state (GET, HEAD, OPTIONS)
**Idempotent** — same result if called N times (GET, PUT, DELETE)

### Why Idempotency Matters

```java
// Idempotent: safe to retry on network failure
DELETE /orders/1   → 204 on first call, 404 on subsequent — still idempotent (no side effect)

// Not idempotent: retrying creates duplicates
POST /orders       → creates a new order each time
```

**Solution: idempotency key for POST**

```java
// Client sends a unique key; server deduplicates
POST /orders
Idempotency-Key: a1b2c3d4-...

@PostMapping("/orders")
public ResponseEntity<OrderDto> createOrder(
        @RequestHeader("Idempotency-Key") String idempotencyKey,
        @RequestBody CreateOrderRequest req) {

    // Check if already processed
    return idempotencyStore.find(idempotencyKey)
        .map(existing -> ResponseEntity.ok(existing))
        .orElseGet(() -> {
            OrderDto order = orderService.create(req);
            idempotencyStore.store(idempotencyKey, order);
            return ResponseEntity.status(201).body(order);
        });
}
```

---

## HTTP Status Codes

```
2xx — Success
  200 OK             — general success with body
  201 Created        — resource created (include Location header)
  204 No Content     — success, no body (DELETE, PUT with no response body)

3xx — Redirection
  301 Moved Permanently — resource has a new permanent URL
  304 Not Modified      — client cache is still valid (ETags)

4xx — Client Error
  400 Bad Request    — invalid request data (validation failure)
  401 Unauthorized   — missing/invalid authentication
  403 Forbidden      — authenticated but not authorized
  404 Not Found      — resource doesn't exist
  409 Conflict       — state conflict (e.g., concurrent modification)
  422 Unprocessable  — semantically invalid (business rule violation)
  429 Too Many Requests — rate limit exceeded

5xx — Server Error
  500 Internal Server Error — unexpected server error
  503 Service Unavailable   — server overloaded or down
```

---

## Spring REST Controller

```java
@RestController
@RequestMapping("/api/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @GetMapping
    public List<OrderDto> list(@RequestParam(defaultValue = "0") int page,
                               @RequestParam(defaultValue = "20") int size) {
        return orderService.list(PageRequest.of(page, size));
    }

    @GetMapping("/{id}")
    public ResponseEntity<OrderDto> getById(@PathVariable String id) {
        return orderService.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<OrderDto> create(@Valid @RequestBody CreateOrderRequest req,
                                           UriComponentsBuilder uriBuilder) {
        OrderDto order = orderService.create(req);
        URI location = uriBuilder.path("/api/orders/{id}").buildAndExpand(order.id()).toUri();
        return ResponseEntity.created(location).body(order);
    }

    @PatchMapping("/{id}/cancel")
    public ResponseEntity<Void> cancel(@PathVariable String id) {
        orderService.cancel(id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        orderService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
```

---

## Request Validation

```java
public record CreateOrderRequest(
    @NotBlank String customerId,
    @NotEmpty @Valid List<OrderItemRequest> items
) {}

public record OrderItemRequest(
    @NotBlank String productId,
    @Positive int quantity
) {}

// Global exception handler
@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        List<String> errors = ex.getBindingResult().getFieldErrors()
            .stream()
            .map(fe -> fe.getField() + ": " + fe.getDefaultMessage())
            .toList();
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDATION_FAILED", errors));
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(OrderNotFoundException ex) {
        return ResponseEntity.status(404).body(new ErrorResponse("NOT_FOUND", List.of(ex.getMessage())));
    }
}
```

---

## API Versioning

### URL Versioning (most common)

```
GET /api/v1/orders
GET /api/v2/orders
```

```java
@RestController
@RequestMapping("/api/v2/orders")
public class OrderControllerV2 { ... }
```

### Header Versioning

```
GET /api/orders
Accept: application/vnd.myapp.v2+json
```

### Query Parameter Versioning

```
GET /api/orders?version=2
```

**Tradeoffs:**

| Strategy | Pros | Cons |
|----------|------|------|
| URL (`/v2/`) | Visible, easy to test/cache | URL changes, not "pure" REST |
| Header | Clean URLs | Harder to test in browser |
| Query param | Easy migration | Pollutes query params |

::: tip Recommended
URL versioning is the pragmatic choice for most teams. It's explicit, cacheable, and trivial to document.
:::

---

## Pagination

```java
// Offset-based (simple, use for bounded datasets)
GET /orders?page=2&size=20

// Cursor-based (efficient for large/dynamic datasets)
GET /orders?cursor=eyJpZCI6MTAwfQ&size=20

// Response with pagination metadata
{
  "data": [...],
  "page": { "number": 2, "size": 20, "total": 150, "totalPages": 8 },
  "_links": {
    "self":  "/orders?page=2&size=20",
    "next":  "/orders?page=3&size=20",
    "prev":  "/orders?page=1&size=20"
  }
}
```

---

## Caching

### HTTP Cache Headers

```java
@GetMapping("/{id}")
public ResponseEntity<OrderDto> getById(@PathVariable String id) {
    OrderDto order = orderService.findById(id);
    return ResponseEntity.ok()
        .cacheControl(CacheControl.maxAge(60, TimeUnit.SECONDS))
        .eTag(String.valueOf(order.version()))   // conditional requests
        .body(order);
}
```

```
GET /orders/1
If-None-Match: "42"

→ 304 Not Modified  (if version hasn't changed, no body sent)
→ 200 OK + body     (if changed, new ETag in response)
```

---

## OpenAPI / Swagger

```java
// springdoc-openapi — auto-generates /v3/api-docs and /swagger-ui.html
@Operation(summary = "Place a new order")
@ApiResponses({
    @ApiResponse(responseCode = "201", description = "Order created"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "404", description = "Customer not found")
})
@PostMapping
public ResponseEntity<OrderDto> create(@Valid @RequestBody CreateOrderRequest req) { ... }
```

---

## REST Design Checklist

| Rule | Example |
|------|---------|
| Use nouns for resources | `/orders` not `/getOrders` |
| Plural resource names | `/orders/1` not `/order/1` |
| Use sub-resources for relationships | `/orders/1/items` |
| Correct HTTP verb | DELETE to delete, not `POST /orders/1/delete` |
| Correct status codes | 201 Created not 200 OK on creation |
| Return Location on 201 | `Location: /api/orders/99` |
| Validate input, return 400 with details | `{"field":"quantity","message":"must be positive"}` |
| Consistent error format | Same error schema everywhere |
| Version your API | Before breaking changes, bump the version |
| Document with OpenAPI | Generates client SDKs and interactive docs |

---

## Key Interview Points

| Question | Answer |
|----------|--------|
| Difference between PUT and PATCH? | PUT replaces the resource; PATCH updates specific fields |
| What does idempotent mean? | Calling N times = same result as calling once |
| 401 vs 403? | 401: not authenticated; 403: authenticated but not authorized |
| How to version a REST API? | URL prefix (`/v2/`), header, or query param; URL is most common |
| What is HATEOAS? | Responses include links to related actions; Level 3 REST |

---

> **Back to overview:** [Architecture →](./)

<RelatedTopics :topics="['/architecture/microservices', '/spring/spring-boot', '/spring/spring-security', '/databases/sql']" />
