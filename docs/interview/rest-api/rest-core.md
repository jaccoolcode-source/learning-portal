# REST API Design

**Q41 to Q43** · [← REST API Overview](./index)

---

## Q41: REST API Best Practices

> Knowing HTTP verbs is table stakes. Seniors can design an API that is intuitive, consistent, evolvable, and safe to operate in production.

**Core constraints of REST (Roy Fielding's 6):** Uniform interface, stateless, client-server, cacheable, layered system, code-on-demand (optional).

**URI design principles:**

| Rule | Good | Bad |
|------|------|-----|
| Nouns, not verbs | `GET /orders` | `GET /getOrders` |
| Plural resources | `/orders/{id}` | `/order/{id}` |
| Lowercase, hyphens | `/order-items` | `/orderItems` |
| Hierarchy for nesting | `/orders/{id}/items` | `/getOrderItems?orderId=1` |
| No trailing slash | `/orders/123` | `/orders/123/` |

**HTTP method semantics:**

| Method | Safe | Idempotent | Use |
|--------|------|-----------|-----|
| GET | ✅ | ✅ | Read |
| HEAD | ✅ | ✅ | Metadata only |
| PUT | ❌ | ✅ | Full replace |
| PATCH | ❌ | ❌ | Partial update |
| DELETE | ❌ | ✅ | Remove |
| POST | ❌ | ❌ | Create / non-idempotent action |

::: details Full model answer

**Status code guide:**

| Code | Meaning | Use |
|------|---------|-----|
| 200 OK | Success | GET, PUT, PATCH, DELETE responses with body |
| 201 Created | Resource created | POST — include `Location` header |
| 204 No Content | Success, no body | DELETE, PUT/PATCH when returning nothing |
| 400 Bad Request | Client error | Validation failure — include error details |
| 401 Unauthorized | Not authenticated | Missing/invalid token |
| 403 Forbidden | Authenticated but not allowed | Insufficient permissions |
| 404 Not Found | Resource doesn't exist | — |
| 409 Conflict | State conflict | Optimistic lock, duplicate create |
| 422 Unprocessable Entity | Semantic validation error | Business rule violation |
| 429 Too Many Requests | Rate limit exceeded | Include `Retry-After` header |
| 500 Internal Server Error | Unexpected server error | Never expose stack traces |

**Resource design examples:**
```
# Collections and items
GET    /orders              → list orders (paginated)
POST   /orders              → create order → 201 + Location: /orders/123
GET    /orders/123          → get order
PUT    /orders/123          → replace order completely
PATCH  /orders/123          → update order partially
DELETE /orders/123          → delete → 204

# Nested resources
GET    /orders/123/items    → items of order 123
POST   /orders/123/items    → add item to order

# Actions that don't fit CRUD (use verbs as sub-resources)
POST   /orders/123/cancel   → cancel order (state transition)
POST   /payments/123/refund → refund payment
```

**Headers every API should use:**
```
Content-Type: application/json
Accept: application/json
Authorization: Bearer <token>
X-Request-ID: <uuid>          ← idempotency + tracing
X-Correlation-ID: <uuid>      ← distributed tracing
ETag: "v1-abc123"             ← conditional requests / caching
Cache-Control: no-cache       ← cache directives
```

**HATEOAS (Hypermedia as the Engine of Application State):**
Responses include links to related actions, allowing clients to discover available operations without hardcoded URLs.
```json
{
  "id": 123,
  "status": "PENDING",
  "_links": {
    "self":   { "href": "/orders/123" },
    "cancel": { "href": "/orders/123/cancel", "method": "POST" },
    "items":  { "href": "/orders/123/items" }
  }
}
```
Level 3 of Richardson Maturity Model. Rarely implemented fully but worth mentioning.

**Spring Boot implementation:**
```java
@RestController
@RequestMapping("/orders")
public class OrderController {

    @PostMapping
    public ResponseEntity<OrderResponse> createOrder(@Valid @RequestBody CreateOrderRequest req) {
        Order order = orderService.create(req);
        URI location = URI.create("/orders/" + order.getId());
        return ResponseEntity.created(location).body(toResponse(order));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<OrderResponse> updateOrder(
            @PathVariable Long id,
            @RequestBody @Valid UpdateOrderRequest req) {
        return ResponseEntity.ok(toResponse(orderService.update(id, req)));
    }

    @PostMapping("/{id}/cancel")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancelOrder(@PathVariable Long id) {
        orderService.cancel(id);
    }
}
```

**Global error handler:**
```java
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public ErrorResponse handleValidation(MethodArgumentNotValidException ex) {
        List<String> errors = ex.getBindingResult().getFieldErrors()
            .stream().map(e -> e.getField() + ": " + e.getDefaultMessage())
            .toList();
        return new ErrorResponse("VALIDATION_ERROR", errors);
    }

    @ExceptionHandler(EntityNotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    public ErrorResponse handleNotFound(EntityNotFoundException ex) {
        return new ErrorResponse("NOT_FOUND", ex.getMessage());
    }
}
```

:::

> [!TIP] Golden Tip
> The most overlooked best practice: **always return a `Location` header on 201 Created** and **always include an `X-Request-ID` header** for tracing. Returning 201 without `Location` forces clients to do an extra GET just to find the resource. `X-Request-ID` (echoed from the client or generated by the server) ties together logs across services, which is invaluable when debugging production incidents. These two details signal API design maturity.

**Follow-up questions:**
- What is the difference between PUT and PATCH?
- When should you return 400 vs 422?
- What is HATEOAS and does anyone actually implement it?
- How do you handle actions that don't map to CRUD (e.g., "cancel an order")?

---

## Q42: Idempotency

> Network failures are unavoidable. Idempotency is how you make retries safe. Most candidates know the definition — seniors know how to implement it.

An operation is **idempotent** if calling it multiple times produces the same result as calling it once. Safe for retries.

| Method | Idempotent? | Why |
|--------|------------|-----|
| GET | ✅ | Read-only |
| PUT | ✅ | Sets absolute state |
| DELETE | ✅ | Already gone = same result |
| PATCH | ❌ (usually) | "increment counter by 1" is not idempotent |
| POST | ❌ (by default) | Creates a new resource each time |

**Making POST idempotent via idempotency keys:**
```
POST /payments
Idempotency-Key: a3f1b2c4-5678-90ab-cdef-111213141516
```

If the client retries with the same key, the server returns the original response — no duplicate payment.

::: details Full model answer

**Why idempotency matters:**
In distributed systems, any request can fail in three ways:
1. Client sent request, server never received it → retry is safe
2. Server processed request, response lost → retry causes duplicate!
3. Server is processing, network dropped → retry might cause duplicate

Idempotency keys let the server distinguish between a fresh request and a retry, making case 2 and 3 safe.

**Implementing idempotency in Spring Boot:**

```java
@Service
public class PaymentService {

    private final PaymentRepository paymentRepo;
    private final IdempotencyKeyRepository idempotencyRepo;

    @Transactional
    public PaymentResponse processPayment(CreatePaymentRequest req, String idempotencyKey) {
        // Check if we've already processed this key
        return idempotencyRepo.findByKey(idempotencyKey)
            .map(cached -> cached.getResponse())
            .orElseGet(() -> {
                PaymentResponse result = executePayment(req);
                idempotencyRepo.save(new IdempotencyRecord(
                    idempotencyKey,
                    result,
                    Instant.now().plus(24, HOURS)  // TTL
                ));
                return result;
            });
    }
}
```

**Idempotency record schema:**
```sql
CREATE TABLE idempotency_keys (
    key          VARCHAR(255) PRIMARY KEY,
    response     JSONB        NOT NULL,
    created_at   TIMESTAMP    NOT NULL,
    expires_at   TIMESTAMP    NOT NULL
);
CREATE INDEX idx_idempotency_expires ON idempotency_keys (expires_at);
```

**Important considerations:**
- **Scope the key to the operation** — same key for a payment should not also be valid for a refund
- **Set a TTL** (24–48 hours is typical) — don't keep idempotency records forever
- **Return the same response, not just the same side effect** — clients may be checking the response body
- **Handle in-flight requests** — if a second request arrives with the same key while the first is still processing, return 409 Conflict (or wait and return the result). Don't process twice.
- **Store the HTTP status code too** — if the original returned 422, the retry should also return 422

**In-flight deduplication (distributed lock):**
```java
// Redis distributed lock to prevent concurrent processing of same key
String lockKey = "idempotency:lock:" + idempotencyKey;
boolean locked = redisTemplate.opsForValue()
    .setIfAbsent(lockKey, "1", 30, TimeUnit.SECONDS);
if (!locked) {
    throw new ConflictException("Request with this idempotency key is already being processed");
}
try {
    return processPayment(req, idempotencyKey);
} finally {
    redisTemplate.delete(lockKey);
}
```

**Natural idempotency via resource state:**
Some operations are naturally idempotent if you design them well:
```
PUT /orders/123/status
{ "status": "CANCELLED" }
```
Setting status to CANCELLED twice is the same as doing it once — no idempotency key needed. Design state machines carefully.

**Stripe's approach (industry standard):**
Stripe requires clients to generate a UUID idempotency key per logical operation and send it as a header. Keys are stored for 24 hours. Stripe returns identical responses for duplicate requests and handles in-flight deduplication.

:::

> [!TIP] Golden Tip
> The edge case most candidates miss: **what happens if a second request with the same idempotency key arrives while the first is still being processed?** The naive implementation may process it twice (race condition). The correct answer is a distributed lock (Redis `SET NX EX`) that prevents concurrent processing of the same key — return 409 Conflict if the lock can't be acquired. Also mention Stripe's implementation as a gold standard — it shows you've studied real-world API design, not just theory.

**Follow-up questions:**
- How do you implement idempotency for a POST /payments endpoint?
- What is the difference between idempotency and safety?
- How do you handle the case where two identical requests arrive simultaneously?
- What TTL would you set on idempotency keys and why?

---

## Q43: Pagination, Versioning and Error Handling

> Three separate topics that always come up together. Know the trade-offs of each pagination style, the versioning strategies, and what a good error response looks like.

### Pagination

| Style | Mechanism | Best for | Pitfall |
|-------|-----------|----------|---------|
| **Offset** | `?page=2&size=20` | Simple, random access | Slow on large offsets; skips/duplicates on concurrent inserts |
| **Cursor** | `?after=eyJpZCI6MTIzfQ==` | Large datasets, real-time feeds | No random page access |
| **Keyset** | `?after_id=123` | Sorted by indexed column | Less flexible than cursor |

```json
// Offset pagination response
{
  "data": [...],
  "pagination": {
    "page": 2,
    "size": 20,
    "total": 342,
    "totalPages": 18
  }
}

// Cursor pagination response (preferred for large/live data)
{
  "data": [...],
  "pagination": {
    "nextCursor": "eyJpZCI6MTIzfQ==",
    "hasMore": true
  }
}
```

::: details Full model answer

**Offset pagination — the hidden problem:**
```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 20 OFFSET 1000000;
```
The database must scan and discard 1,000,000 rows before returning 20. For pages beyond ~10,000, this becomes unacceptably slow regardless of indexes.

Also: if a new order is inserted between page 1 and page 2 fetches, rows shift — page 2 may return a duplicate from page 1, or skip a row. Fine for most admin UIs, but not for real-time feeds.

**Cursor pagination:**
The cursor encodes the position in the result set (typically a base64-encoded JSON of the last item's sort key + ID). The server decodes it to build a `WHERE` clause.
```java
// Encode cursor
String cursor = Base64.getEncoder().encodeToString(
    objectMapper.writeValueAsBytes(Map.of("id", lastId, "createdAt", lastCreatedAt))
);

// Decode and use
Map<String, Object> decoded = objectMapper.readValue(Base64.getDecoder().decode(cursor), Map.class);
// WHERE created_at < :createdAt OR (created_at = :createdAt AND id < :id)
```

Cursor pagination is O(log n) with a proper index — fast even on 100M+ rows.

**Spring Data JPA pagination:**
```java
// Offset
Page<Order> page = orderRepo.findByStatus(status, PageRequest.of(0, 20, Sort.by("createdAt").descending()));

// Keyset (via Blaze-Persistence or custom query)
List<Order> orders = orderRepo.findByIdLessThanOrderByIdDesc(afterId, PageRequest.ofSize(20));
```

---

### API Versioning

| Strategy | Example | Pros | Cons |
|----------|---------|------|------|
| **URI versioning** | `/v1/orders` | Simple, cacheable | URI pollution |
| **Header versioning** | `API-Version: 1` | Clean URIs | Less visible, harder to test |
| **Content negotiation** | `Accept: application/vnd.company.v1+json` | RESTful | Complex |
| **Query parameter** | `/orders?version=1` | Easy to test | Not RESTful |

**URI versioning is the most common in practice.** Use it unless you have a strong reason not to.

```java
@RestController
@RequestMapping("/v1/orders")
public class OrderControllerV1 { ... }

@RestController
@RequestMapping("/v2/orders")
public class OrderControllerV2 { ... }
```

**Versioning strategy:**
- Version only when you make **breaking changes** (removing fields, changing field types, altering semantics)
- Non-breaking additions (new optional fields) don't require a new version
- Support at least N-1 version after deprecation — announce sunset dates via `Sunset` and `Deprecation` headers
- Use [Semantic Versioning](https://semver.org/) — major version in URI, minor tracked internally

```
Deprecation: Sat, 01 Jan 2026 00:00:00 GMT
Sunset: Sat, 01 Jul 2026 00:00:00 GMT
Link: <https://api.example.com/v2/orders>; rel="successor-version"
```

---

### Error Handling

**RFC 9457 Problem Details (standard error format):**
```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation Failed",
  "status": 400,
  "detail": "The request body contains invalid fields",
  "instance": "/orders/create/request-123",
  "errors": [
    { "field": "items", "message": "must not be empty" },
    { "field": "customerId", "message": "must be positive" }
  ]
}
```

Using the RFC 9457 standard (`application/problem+json`) means clients can handle errors generically. Spring Boot 3 supports it via `ProblemDetail`:

```java
@ExceptionHandler(OrderNotFoundException.class)
public ProblemDetail handleNotFound(OrderNotFoundException ex, HttpServletRequest req) {
    ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, ex.getMessage());
    problem.setType(URI.create("https://api.example.com/errors/not-found"));
    problem.setInstance(URI.create(req.getRequestURI()));
    return problem;
}
```

**Never expose internals in error responses:**
```json
// ❌ Bad — exposes stack trace, DB schema, internal paths
{
  "error": "org.postgresql.util.PSQLException: ERROR: relation \"orders\" does not exist\n  at org.postgresql..."
}

// ✅ Good — controlled error with client-actionable message
{
  "type": "https://api.example.com/errors/not-found",
  "title": "Order Not Found",
  "status": 404,
  "detail": "Order with ID 123 does not exist"
}
```

:::

> [!TIP] Golden Tip
> For pagination: recommend **cursor-based pagination by default** for any dataset that could grow large or is updated in real-time — explain the O(n) OFFSET problem to show you've hit it in production. For error handling: mention **RFC 9457 Problem Details** and Spring Boot 3's built-in `ProblemDetail` — using a standard format means API clients (and teams) handle errors consistently without custom parsers. Knowing the standard by name signals API design depth.

**Follow-up questions:**
- What is the performance problem with large OFFSET pagination?
- How does cursor pagination work and what are its limitations?
- What are breaking vs non-breaking API changes?
- What is RFC 9457 and how does Spring Boot 3 support it?
