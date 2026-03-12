---
title: GraphQL
description: GraphQL vs REST, schema definition, queries, mutations, subscriptions, N+1 problem, DataLoader, and Spring for GraphQL
category: architecture
pageClass: layout-architecture
difficulty: intermediate
tags: [graphql, schema, queries, mutations, subscriptions, dataloader, spring-graphql]
related:
  - /architecture/rest-web
  - /architecture/microservices
  - /spring/spring-data
estimatedMinutes: 25
---

# GraphQL

<DifficultyBadge level="intermediate" />

GraphQL is a query language and runtime for APIs that lets clients request exactly the fields they need — no more, no less. Developed by Facebook (2012), open-sourced 2015.

---

## GraphQL vs REST

| | REST | GraphQL |
|--|------|---------|
| **Endpoint** | One per resource (`/products`, `/users`) | Single endpoint (`/graphql`) |
| **Fetching** | Server-defined shape | Client-defined shape |
| **Over-fetching** | Common — full resource always returned | Eliminated — request only needed fields |
| **Under-fetching** | Multiple round-trips for related data | Single request for nested data |
| **Versioning** | URL or header (`/v2/`, `Accept-Version`) | Schema evolution — add fields, deprecate old |
| **Type safety** | OpenAPI (optional) | Built-in schema (`.graphql` / SDL) |
| **Caching** | HTTP caching (GET, ETags) | More complex — POST by default, need persisted queries |
| **Best for** | Public APIs, simple CRUD, CDN-cached content | Complex UIs, multiple clients (web/mobile), BFF pattern |

**When to choose GraphQL:**
- Mobile + web clients need different field sets from the same API
- Multiple teams consuming the same backend (BFF pattern)
- Deep object graphs with many related entities
- Rapidly evolving API without versioning overhead

**When to stick with REST:**
- Public APIs (browser caching, CDN support, simpler auth)
- Simple CRUD with uniform clients
- Team unfamiliar with GraphQL ecosystem

---

## Schema Definition Language (SDL)

GraphQL is schema-first. The schema is a contract between client and server.

```graphql
# schema.graphqls

type Query {
    product(id: ID!): Product
    products(category: String, page: Int = 0, size: Int = 20): ProductPage!
    user(id: ID!): User
}

type Mutation {
    createProduct(input: CreateProductInput!): Product!
    updateProduct(id: ID!, input: UpdateProductInput!): Product!
    deleteProduct(id: ID!): Boolean!
}

type Subscription {
    orderStatusChanged(orderId: ID!): OrderStatus!
}

type Product {
    id: ID!
    name: String!
    price: Float!
    stock: Int!
    category: String
    reviews: [Review!]!        # nested — causes N+1 if naively fetched
    createdAt: String!
}

type Review {
    id: ID!
    rating: Int!
    comment: String
    author: User!
}

type User {
    id: ID!
    name: String!
    email: String!
    orders: [Order!]!
}

type ProductPage {
    content: [Product!]!
    totalElements: Int!
    totalPages: Int!
}

input CreateProductInput {
    name: String!
    price: Float!
    stock: Int!
    category: String
}

input UpdateProductInput {
    name: String
    price: Float
    stock: Int
}
```

**SDL conventions:**
- `!` = non-null (required)
- `[Type!]!` = non-null list of non-null items
- `input` types are for mutations (write operations)
- `Query` = reads, `Mutation` = writes, `Subscription` = real-time

---

## Queries

```graphql
# Request only the fields you need
query GetProduct {
    product(id: "42") {
        id
        name
        price
        reviews {
            rating
            comment
        }
    }
}

# Variables (parameterised — preferred over string interpolation)
query GetProductsByCategory($category: String!, $size: Int) {
    products(category: $category, size: $size) {
        content {
            id
            name
            price
        }
        totalElements
    }
}
# Variables sent separately:
# { "category": "electronics", "size": 10 }

# Aliases — request same field twice with different args
query CompareProducts {
    cheap: products(category: "electronics") {
        content { id name price }
    }
    premium: products(category: "premium") {
        content { id name price }
    }
}

# Fragments — reuse field selections
fragment ProductFields on Product {
    id
    name
    price
    stock
}

query GetProducts {
    products {
        content {
            ...ProductFields
        }
    }
}
```

---

## Mutations

```graphql
mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
        id
        name
        price
        createdAt
    }
}
# Variables: { "input": { "name": "Widget Pro", "price": 29.99, "stock": 100 } }

mutation UpdateStock($id: ID!, $stock: Int!) {
    updateProduct(id: $id, input: { stock: $stock }) {
        id
        stock
    }
}
```

---

## Subscriptions (Real-Time)

```graphql
# Client subscribes over WebSocket
subscription TrackOrder($orderId: ID!) {
    orderStatusChanged(orderId: $orderId) {
        status
        updatedAt
        estimatedDelivery
    }
}
```

---

## Spring for GraphQL

Spring Boot 3+ has first-class GraphQL support via `spring-graphql`.

### Setup

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-graphql</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
    <!-- or spring-boot-starter-webflux for subscriptions -->
</dependency>
```

```yaml
# application.yml
spring:
  graphql:
    schema:
      locations: classpath:graphql/     # *.graphqls files here
    graphiql:
      enabled: true                     # GraphiQL IDE at /graphiql (dev only)
    path: /graphql
```

### Controllers (Annotated)

```java
@Controller
public class ProductController {

    private final ProductService productService;

    // ── Queries ───────────────────────────────────────────────────────────
    @QueryMapping                              // maps to Query.product in schema
    public Product product(@Argument Long id) {
        return productService.findById(id)
            .orElseThrow(() -> new GraphQLException("Product not found: " + id));
    }

    @QueryMapping
    public ProductPage products(
            @Argument String category,
            @Argument int page,
            @Argument int size) {
        return productService.findByCategory(category, page, size);
    }

    // ── Mutations ─────────────────────────────────────────────────────────
    @MutationMapping
    public Product createProduct(@Argument CreateProductInput input) {
        return productService.create(input);
    }

    @MutationMapping
    public Product updateProduct(@Argument Long id, @Argument UpdateProductInput input) {
        return productService.update(id, input);
    }

    // ── Subscriptions ─────────────────────────────────────────────────────
    @SubscriptionMapping
    public Flux<OrderStatus> orderStatusChanged(@Argument Long orderId) {
        return orderService.statusStream(orderId);   // returns reactive stream
    }
}
```

---

## The N+1 Problem

The classic GraphQL performance trap: fetching a list of products, then firing one DB query per product to fetch its reviews.

```
Query: products → 20 products
  → 1 query for 20 products
  → 20 queries for reviews (one per product)
  → 20 queries for review authors
  = 41 queries for one GraphQL request  ← N+1
```

### DataLoader — Batch Loading Solution

DataLoader batches individual loads into one bulk query per request:

```java
// 1. Register a BatchLoaderRegistry
@Configuration
public class DataLoaderConfig {

    @Bean
    public RuntimeWiringConfigurer runtimeWiringConfigurer(ReviewRepository reviewRepo) {
        return wiringBuilder -> wiringBuilder
            .type(TypeRuntimeWiring.newTypeWiring("Product")
                .dataFetcher("reviews", env -> {
                    DataLoader<Long, List<Review>> loader =
                        env.getDataLoader("reviews");
                    return loader.load(env.<Product>getSource().getId());
                }));
    }

    @Bean
    public BatchLoaderRegistry batchLoaderRegistry(ReviewRepository reviewRepo) {
        BatchLoaderRegistry registry = new DefaultBatchLoaderRegistry();
        registry.forTypePair(Long.class, Review.class)
            .withName("reviews")
            .registerMappedBatchLoader((ids, env) ->
                Mono.fromCallable(() ->
                    reviewRepo.findByProductIdIn(ids)  // ONE query for all IDs
                        .stream()
                        .collect(Collectors.groupingBy(Review::getProductId))
                )
            );
        return registry;
    }
}
```

```java
// Spring GraphQL — @SchemaMapping with DataLoader
@Controller
public class ProductReviewController {

    @SchemaMapping(typeName = "Product", field = "reviews")
    public CompletableFuture<List<Review>> reviews(
            Product product,
            DataLoader<Long, List<Review>> reviewsLoader) {
        return reviewsLoader.load(product.getId());
        // DataLoader collects all IDs, fires ONE batch query
    }
}
```

**Result:** 20 products + 1 batch review query + 1 batch author query = 3 queries total instead of 41.

---

## Error Handling

```java
// GraphQL errors are returned in the response body, not HTTP 4xx/5xx
// HTTP status is always 200 (unless the request itself is malformed)

@ControllerAdvice
public class GraphQLExceptionHandler implements DataFetcherExceptionResolverAdapter {

    @Override
    protected GraphQLError resolveToSingleError(Throwable ex, DataFetchingEnvironment env) {
        if (ex instanceof ProductNotFoundException e) {
            return GraphqlErrorBuilder.newError(env)
                .errorType(ErrorType.NOT_FOUND)
                .message(e.getMessage())
                .build();
        }
        if (ex instanceof ValidationException e) {
            return GraphqlErrorBuilder.newError(env)
                .errorType(ErrorType.BAD_REQUEST)
                .message(e.getMessage())
                .build();
        }
        return null;  // unhandled → framework wraps as INTERNAL_ERROR
    }
}
```

```json
// Error response shape
{
  "data": { "product": null },
  "errors": [
    {
      "message": "Product not found: 999",
      "locations": [{ "line": 2, "column": 5 }],
      "path": ["product"],
      "extensions": { "classification": "NOT_FOUND" }
    }
  ]
}
```

---

## Introspection & Schema Exploration

```graphql
# Clients can query the schema itself
query IntrospectSchema {
    __schema {
        types { name kind }
        queryType { name }
        mutationType { name }
    }
}

# Inspect a specific type
query InspectProduct {
    __type(name: "Product") {
        fields {
            name
            type { name kind }
            isDeprecated
            deprecationReason
        }
    }
}
```

**Disable introspection in production** to avoid exposing schema to attackers:

```yaml
spring:
  graphql:
    schema:
      introspection:
        enabled: false   # disable in production
```

---

## Security Concerns

```java
// 1. Query depth limiting — prevent deeply nested malicious queries
@Bean
public Instrumentation depthLimitingInstrumentation() {
    return new DepthLimitingInstrumentation(10);  // max 10 levels deep
}

// 2. Query complexity limiting — prevent expensive queries
@Bean
public Instrumentation complexityLimitingInstrumentation() {
    return new SimpleInstrumentation() {
        // Assign cost per field, reject queries exceeding budget
    };
}
```

```yaml
# 3. Disable introspection in production (see above)
# 4. Rate limit /graphql endpoint the same as any REST endpoint
# 5. Authenticate via Authorization header — same as REST
```

---

## Interview Quick-Fire

**Q: What is the N+1 problem in GraphQL and how do you solve it?**
When a query returns a list (e.g., 20 products) and each item has a nested field (e.g., reviews), a naive resolver fires one DB query per item — 20 extra queries for 20 products. DataLoader solves this by batching: it collects all product IDs requested during a single GraphQL execution, then fires one bulk query (`WHERE product_id IN (...)`) and distributes results back. Spring GraphQL has native DataLoader support via `BatchLoaderRegistry`.

**Q: When would you choose GraphQL over REST?**
GraphQL excels when: multiple clients (web/mobile) need different field subsets from the same data, object graphs are deep and interrelated (products → reviews → authors), or the API evolves rapidly and versioning is painful. REST is better for: public APIs where HTTP caching and CDN support matter, simple CRUD endpoints, teams unfamiliar with GraphQL's tooling and schema management.

**Q: How does GraphQL handle errors differently from REST?**
GraphQL always returns HTTP 200 (unless the request itself is malformed). Errors are returned in the `errors` array alongside partial data — a query can return some fields successfully and report errors on others. This is unlike REST where the HTTP status code signals success/failure at the response level.

<RelatedTopics :topics="['/architecture/rest-web', '/architecture/microservices', '/spring/spring-data']" />

[→ Back to Architecture Overview](/architecture/)
