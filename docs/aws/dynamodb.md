---
title: AWS DynamoDB
description: Amazon DynamoDB — data model, partition/sort keys, GSI/LSI, capacity modes, streams, and access patterns
category: aws
pageClass: layout-aws
difficulty: advanced
tags: [aws, dynamodb, nosql, partition-key, gsi, streams, capacity, single-table]
estimatedMinutes: 35
---

# AWS DynamoDB

<DifficultyBadge level="advanced" />

DynamoDB is a fully managed, serverless NoSQL database delivering single-digit millisecond latency at any scale. It trades flexibility of querying for predictable performance.

---

## Data Model

```
Table
  └── Item (a document — map of attributes)
        ├── Partition Key (PK)  — required, determines partition
        ├── Sort Key (SK)       — optional, enables range queries within a partition
        └── Attributes          — any additional attributes (schema-less)
```

**Key rule:** Every item must have the primary key (PK, or PK+SK). All other attributes are optional and can vary per item.

```json
// Item example (PK=USER#123, SK=PROFILE)
{
  "PK": "USER#123",
  "SK": "PROFILE",
  "name": "Alice Smith",
  "email": "alice@example.com",
  "createdAt": "2024-01-15T10:00:00Z"
}

// Order item in same table (single-table design)
{
  "PK": "USER#123",
  "SK": "ORDER#2024-01-15#ord-789",
  "amount": 99.99,
  "status": "DELIVERED"
}
```

---

## Capacity Modes

| Mode | Pricing | Best For |
|------|---------|----------|
| **On-Demand** | Pay per request (RCU/WCU) | Unpredictable traffic, new tables |
| **Provisioned** | Reserve RCU/WCU in advance | Predictable traffic, cost optimization |
| **Provisioned + Auto Scaling** | Auto-scales within min/max | Gradual ramps, cost-efficient |

**RCU (Read Capacity Unit):** 1 strongly consistent read of ≤4KB, or 2 eventually consistent reads.
**WCU (Write Capacity Unit):** 1 write of ≤1KB.

---

## Operations

```java
DynamoDbClient client = DynamoDbClient.create();

// PutItem (upsert)
client.putItem(PutItemRequest.builder()
    .tableName("Users")
    .item(Map.of(
        "PK", AttributeValue.fromS("USER#123"),
        "SK", AttributeValue.fromS("PROFILE"),
        "name", AttributeValue.fromS("Alice"),
        "age",  AttributeValue.fromN("30")
    ))
    .conditionExpression("attribute_not_exists(PK)")  // prevent overwrite
    .build());

// GetItem (by primary key — O(1), cheapest)
GetItemResponse response = client.getItem(GetItemRequest.builder()
    .tableName("Users")
    .key(Map.of(
        "PK", AttributeValue.fromS("USER#123"),
        "SK", AttributeValue.fromS("PROFILE")
    ))
    .consistentRead(true)   // strongly consistent
    .build());

// UpdateItem (partial update)
client.updateItem(UpdateItemRequest.builder()
    .tableName("Users")
    .key(Map.of("PK", AttributeValue.fromS("USER#123"), "SK", AttributeValue.fromS("PROFILE")))
    .updateExpression("SET #st = :status, updatedAt = :now")
    .expressionAttributeNames(Map.of("#st", "status"))
    .expressionAttributeValues(Map.of(
        ":status", AttributeValue.fromS("ACTIVE"),
        ":now",    AttributeValue.fromS(Instant.now().toString())
    ))
    .build());
```

---

## Query vs Scan

```java
// Query — efficient, uses partition key index
QueryResponse orders = client.query(QueryRequest.builder()
    .tableName("Users")
    .keyConditionExpression("PK = :pk AND begins_with(SK, :prefix)")
    .filterExpression("#st = :status")
    .expressionAttributeNames(Map.of("#st", "status"))
    .expressionAttributeValues(Map.of(
        ":pk",     AttributeValue.fromS("USER#123"),
        ":prefix", AttributeValue.fromS("ORDER#"),
        ":status", AttributeValue.fromS("DELIVERED")
    ))
    .build());

// Scan — reads every item in the table (expensive, avoid in hot paths)
// Use for: migrations, analytics, one-off admin tasks
```

::: warning Scan is expensive
A Scan reads every item and consumes RCUs proportional to table size. A 100GB table scan reads ~25 million RCUs. Always prefer Query or use GSI.
:::

---

## Global Secondary Index (GSI)

GSIs let you query on attributes other than the primary key. They're eventually consistent copies of the table with a different key schema.

```json
// Table: Orders
// PK = USER#123, SK = ORDER#ord-789
// GSI: statusIndex — GSI_PK = status, GSI_SK = createdAt

// Query all PENDING orders across all users (not possible with base table key)
{
  "IndexName": "statusIndex",
  "KeyConditionExpression": "GSI_PK = :status",
  "ExpressionAttributeValues": { ":status": { "S": "PENDING" } }
}
```

```java
QueryResponse pending = client.query(QueryRequest.builder()
    .tableName("Orders")
    .indexName("statusIndex")
    .keyConditionExpression("GSI_PK = :status AND GSI_SK BETWEEN :from AND :to")
    .expressionAttributeValues(Map.of(
        ":status", AttributeValue.fromS("PENDING"),
        ":from",   AttributeValue.fromS("2024-01-01"),
        ":to",     AttributeValue.fromS("2024-01-31")
    ))
    .build());
```

---

## Single-Table Design

DynamoDB encourages storing multiple entity types in one table, using composite keys and GSIs to support different access patterns.

```
PK              SK                  Type        Attributes
USER#123        PROFILE             User        name, email
USER#123        ORDER#2024#ord-789  Order       amount, status
USER#123        ORDER#2024#ord-790  Order       amount, status
PRODUCT#abc     DETAILS             Product     name, price
ORDER#ord-789   ITEM#1              OrderItem   quantity, productId
```

**Benefits:** Single request to get a user + their orders. Fewer tables to manage. Lower cost per read.
**Tradeoff:** Complex design upfront, harder to evolve access patterns.

---

## DynamoDB Streams

Streams capture a time-ordered log of all item changes (insert/update/delete), retained for 24 hours.

```
DynamoDB Table
    │ (item change)
    ▼
DynamoDB Stream ──▶ Lambda (event source mapping) ──▶ process change
                                                   ──▶ replicate to OpenSearch
                                                   ──▶ publish to EventBridge
```

```java
// Lambda receives stream records
public void handleRequest(DynamodbEvent event, Context context) {
    for (DynamodbEvent.DynamodbStreamRecord record : event.getRecords()) {
        String eventName = record.getEventName(); // INSERT, MODIFY, REMOVE

        if ("INSERT".equals(eventName)) {
            Map<String, AttributeValue> newImage = record.getDynamodb().getNewImage();
            // process new item
        }
    }
}
```

---

## Interview Quick-Fire

**Q: What is a partition key and why does its choice matter?**
The partition key determines which physical partition stores the item. A poor partition key (low cardinality, hot key like "status=ACTIVE") creates hot partitions — one partition handles all traffic while others sit idle, throttling your entire table.

**Q: What's the difference between a GSI and LSI?**
LSI (Local Secondary Index) shares the same partition key but has a different sort key — must be defined at table creation, limited to 10GB per partition. GSI has a completely different key schema, can be added after creation, and is an eventually consistent copy with separate capacity.

**Q: Why use single-table design?**
DynamoDB charges per request. Fetching related entities (user + orders) from one table costs 1 Query. Multiple tables require multiple requests. Single-table design minimises latency and cost but requires careful upfront design.

<RelatedTopics :topics="['/aws/', '/aws/lambda', '/aws/opensearch']" />

[→ Back to AWS Overview](/aws/)
