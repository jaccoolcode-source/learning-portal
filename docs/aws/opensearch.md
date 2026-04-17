---
title: AWS OpenSearch
description: Amazon OpenSearch Service — indexing, full-text search, queries, aggregations, DynamoDB integration, and vs Elasticsearch
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, opensearch, elasticsearch, search, indexing, aggregations, full-text]
estimatedMinutes: 25
---

# AWS OpenSearch

<DifficultyBadge level="intermediate" />

Amazon OpenSearch Service is a managed search and analytics engine (fork of Elasticsearch 7.10). Use it for full-text search, log analytics, and real-time dashboards.

---

## Architecture

```
Cluster
  └── Node (master / data / ingest / coordinating)
        └── Index (logical namespace for documents)
              └── Shard (primary + replica shards)
                    └── Document (JSON record)
```

| Concept | Description |
|---------|-------------|
| **Index** | Collection of documents with similar structure (like a DB table). |
| **Document** | JSON object stored in an index (like a row). |
| **Shard** | Index split into shards for parallelism and scale. |
| **Mapping** | Schema definition: field types, analyzers. |
| **Analyzer** | Tokenizes text for full-text search (standard, English, custom). |

---

## Indexing Documents

```java
// AWS OpenSearch Java client or the REST API directly
RestHighLevelClient client = new RestHighLevelClient(
    RestClient.builder(new HttpHost("my-domain.eu-west-1.es.amazonaws.com", 443, "https"))
);

// Index a document (upsert by ID)
IndexRequest request = new IndexRequest("products")
    .id("prod-123")
    .source(Map.of(
        "name",        "Java Learning Portal",
        "description", "Comprehensive guide to Java, Spring, and microservices",
        "category",    "Education",
        "price",       29.99,
        "tags",        List.of("java", "spring", "microservices"),
        "createdAt",   "2024-01-15T10:00:00Z"
    ));

IndexResponse response = client.index(request, RequestOptions.DEFAULT);
```

```bash
# REST API equivalent
curl -X PUT "https://my-domain.eu-west-1.es.amazonaws.com/products/_doc/prod-123" \
  -H "Content-Type: application/json" \
  -d '{"name":"Java Learning Portal","price":29.99}'
```

---

## Searching

```json
// Full-text search with filters and scoring
GET /products/_search
{
  "query": {
    "bool": {
      "must": [
        {
          "multi_match": {
            "query": "java microservices",
            "fields": ["name^3", "description", "tags"],
            "type": "best_fields",
            "fuzziness": "AUTO"
          }
        }
      ],
      "filter": [
        { "term": { "category": "Education" } },
        { "range": { "price": { "lte": 50 } } }
      ]
    }
  },
  "sort": [
    { "_score": "desc" },
    { "createdAt": "desc" }
  ],
  "from": 0,
  "size": 10,
  "_source": ["name", "price", "category"]
}
```

### Query Types

| Query | When to Use |
|-------|------------|
| `match` | Full-text search on analyzed text |
| `term` | Exact match (keyword, number, boolean) |
| `terms` | Exact match against a list |
| `range` | Numeric or date range |
| `multi_match` | Full-text across multiple fields |
| `bool` | Combine queries (must/should/must_not/filter) |
| `match_phrase` | Exact phrase match |
| `fuzzy` | Typo-tolerant matching |

---

## Aggregations

```json
// Count products by category + average price per category
GET /products/_search
{
  "size": 0,
  "aggs": {
    "by_category": {
      "terms": { "field": "category", "size": 10 },
      "aggs": {
        "avg_price": { "avg": { "field": "price" } },
        "price_histogram": {
          "histogram": { "field": "price", "interval": 10 }
        }
      }
    }
  }
}
```

---

## Index Mapping

Define field types explicitly to control how data is indexed and searched.

```json
PUT /products
{
  "mappings": {
    "properties": {
      "name": {
        "type": "text",
        "analyzer": "english",
        "fields": {
          "keyword": { "type": "keyword" }  // both analyzed and exact-match
        }
      },
      "description": { "type": "text", "analyzer": "english" },
      "category":    { "type": "keyword" },   // exact match only
      "price":       { "type": "double" },
      "tags":        { "type": "keyword" },
      "createdAt":   { "type": "date" },
      "vector":      { "type": "knn_vector", "dimension": 1536 }  // for semantic search
    }
  }
}
```

---

## DynamoDB → OpenSearch Sync Pattern

```
DynamoDB Table
    │ (DynamoDB Stream)
    ▼
Lambda (stream processor)
    └── OpenSearch index  (sync inserts/updates/deletes)
```

```java
// Lambda processes DynamoDB stream events and syncs to OpenSearch
public void handleRequest(DynamodbEvent event, Context context) {
    for (DynamodbEvent.DynamodbStreamRecord record : event.getRecords()) {
        switch (record.getEventName()) {
            case "INSERT", "MODIFY" -> indexDocument(record.getDynamodb().getNewImage());
            case "REMOVE"           -> deleteDocument(record.getDynamodb().getKeys());
        }
    }
}
```

This pattern keeps DynamoDB as the source of truth (fast writes, transactional) and OpenSearch as the search layer (complex queries, full-text).

---

## OpenSearch vs ElasticSearch

Amazon OpenSearch is a fork of **Elasticsearch 7.10** (before Elastic changed the license in 2021). APIs are largely compatible up to ES 7.10. Use the OpenSearch client for AWS deployments.

| | OpenSearch | Elasticsearch |
|--|------------|---------------|
| **License** | Apache 2.0 | Elastic License 2.0 (proprietary) |
| **AWS managed** | Yes (native) | No (self-managed on EC2) |
| **ML features** | OpenSearch ML, k-NN | Elastic ML (proprietary) |
| **API compatibility** | ES ≤7.10 compatible | Latest |

---

## Interview Quick-Fire

**Q: When would you use OpenSearch instead of DynamoDB?**
DynamoDB excels at key-value and simple range queries. OpenSearch excels at full-text search, complex filters, aggregations, and faceted navigation. A common pattern: write to DynamoDB, replicate to OpenSearch for search.

**Q: What is an inverted index?**
The core data structure for full-text search. It maps each unique token (word) to the list of documents containing it, plus position information. This enables O(1) lookup for "which documents contain 'java'?" regardless of dataset size.

**Q: What's the difference between `filter` and `must` in a bool query?**
`must` affects relevance scoring and must match. `filter` must match but doesn't affect score — it's cached and faster. Use `filter` for exact matches and ranges, `must` for full-text queries where scoring matters.

<RelatedTopics :topics="['/aws/dynamodb', '/aws/lambda', '/aws/']" />

[→ Back to AWS Overview](/aws/)
