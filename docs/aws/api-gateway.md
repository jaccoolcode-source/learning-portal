---
title: API Gateway
description: AWS API Gateway — REST vs HTTP APIs, Lambda proxy integration, stages, authorizers, throttling, and CORS
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, api-gateway, rest-api, http-api, lambda, authorizer, throttling, cors]
estimatedMinutes: 25
---

# API Gateway

<DifficultyBadge level="intermediate" />

API Gateway is a fully managed service for creating, publishing, and securing APIs at any scale. It acts as the "front door" for Lambda functions, ECS services, or any HTTP backend.

---

## API Types

| Type | Protocol | Best For | Cost |
|------|----------|----------|------|
| **HTTP API** | HTTP/1.1, HTTP/2 | Lambda, HTTP backends, JWT auth | ~70% cheaper than REST |
| **REST API** | HTTP/1.1 | Legacy, per-method throttling, API keys, custom domains | More features, higher cost |
| **WebSocket API** | WebSocket | Real-time bidirectional (chat, live feeds) | Per message + connection |

**HTTP API is the default choice** unless you need REST-only features (request/response transformation, API keys, usage plans, caching).

---

## Architecture

```
Client
  │
  ▼
API Gateway
  ├── Route: POST /orders  ──────────────▶  Lambda (order-service)
  ├── Route: GET /orders/{id}  ──────────▶  Lambda (order-service)
  └── Route: ANY /products/{proxy+}  ────▶  ALB / ECS service
```

---

## Lambda Proxy Integration

The most common pattern — API Gateway passes the full HTTP request to Lambda and returns the Lambda response as-is.

```json
// Lambda receives this event (API Gateway v2 / HTTP API format)
{
  "version": "2.0",
  "routeKey": "POST /orders",
  "rawPath": "/orders",
  "headers": {
    "content-type": "application/json",
    "authorization": "Bearer eyJ..."
  },
  "queryStringParameters": { "dryRun": "true" },
  "body": "{\"productId\": \"abc123\", \"quantity\": 2}",
  "isBase64Encoded": false,
  "requestContext": {
    "accountId": "123456789012",
    "stage": "prod",
    "requestId": "req-id-123"
  }
}
```

```java
// Lambda handler response (proxy integration)
return APIGatewayV2HTTPResponse.builder()
    .withStatusCode(201)
    .withHeaders(Map.of("Content-Type", "application/json"))
    .withBody("{\"orderId\": \"ord-789\"}")
    .build();
```

---

## Stages and Deployments

```
API Definition (canary deployments, rollbacks)
  └── Stage: prod   (deployed snapshot + stage variables)
  └── Stage: staging
  └── Stage: dev

URL pattern: https://{api-id}.execute-api.{region}.amazonaws.com/{stage}/path
Custom domain: https://api.mycompany.com/orders  (via ACM + Route 53)
```

```bash
# Deploy to a stage
aws apigatewayv2 create-deployment \
  --api-id abc123xyz \
  --stage-name prod \
  --description "Release v1.2.3"
```

---

## Authorizers

### JWT Authorizer (HTTP API — zero-code)

```json
// Authorizer config — API Gateway validates JWT automatically
{
  "AuthorizerType": "JWT",
  "IdentitySource": "$request.header.Authorization",
  "JwtConfiguration": {
    "Issuer": "https://login.microsoftonline.com/{tenant-id}/v2.0",
    "Audience": ["api://my-app-id"]
  }
}
```

### Lambda Authorizer (custom logic)

```java
// Called before the backend — returns allow/deny policy
public APIGatewayCustomAuthorizerResponse handleRequest(
        APIGatewayCustomAuthorizerRequest request, Context context) {

    String token = request.getAuthorizationToken();
    boolean valid = validateToken(token);

    return APIGatewayCustomAuthorizerResponse.builder()
        .withPrincipalId("user|" + userId)
        .withPolicyDocument(PolicyDocument.builder()
            .withStatements(List.of(Statement.builder()
                .withEffect(valid ? Effect.ALLOW : Effect.DENY)
                .withActions(List.of("execute-api:Invoke"))
                .withResources(List.of(request.getMethodArn()))
                .build()))
            .build())
        .withContext(Map.of("userId", userId, "role", role))
        .build();
}
```

---

## Throttling

API Gateway throttles requests to protect backends. Limits are at stage and route level.

```
Account limit:    10,000 req/s  (soft limit, can be raised)
Stage default:    10,000 req/s / 5,000 burst
Per-route limit:  configurable override per route
```

When throttled, clients receive `429 Too Many Requests`.

```bash
# Set per-route throttling
aws apigatewayv2 update-stage \
  --api-id abc123 \
  --stage-name prod \
  --default-route-settings "ThrottlingBurstLimit=100,ThrottlingRateLimit=50"
```

---

## CORS

```bash
# Enable CORS for HTTP API
aws apigatewayv2 update-api \
  --api-id abc123 \
  --cors-configuration '{
    "AllowOrigins": ["https://app.mycompany.com"],
    "AllowMethods": ["GET","POST","PUT","DELETE","OPTIONS"],
    "AllowHeaders": ["Authorization","Content-Type"],
    "MaxAge": 86400
  }'
```

---

## Request Validation (REST API)

```json
// Model definition (JSON Schema)
{
  "title": "CreateOrderRequest",
  "type": "object",
  "properties": {
    "productId": { "type": "string", "minLength": 1 },
    "quantity": { "type": "integer", "minimum": 1 }
  },
  "required": ["productId", "quantity"]
}
```

With a validator attached to the method, API Gateway rejects invalid requests with `400 Bad Request` before invoking Lambda — saves cost and simplifies Lambda code.

---

## Interview Quick-Fire

**Q: When would you use HTTP API vs REST API?**
HTTP API for most new projects — it's simpler, cheaper, and supports JWT authorizers natively. Use REST API when you need request/response transformation, API keys + usage plans, or fine-grained per-method throttling.

**Q: What is Lambda proxy integration?**
API Gateway passes the full HTTP request (headers, body, path, query params) to Lambda as a JSON event. Lambda returns a JSON response with statusCode, headers, and body. API Gateway translates this back to an HTTP response.

**Q: How does a Lambda Authorizer cache work?**
The authorizer result is cached per identity source value (e.g., token) for a configurable TTL (0–3600s). Caching avoids calling the authorizer Lambda on every request — important for latency and cost.

<RelatedTopics :topics="['/aws/lambda', '/aws/iam', '/aws/']" />

[→ Back to AWS Overview](/aws/)
