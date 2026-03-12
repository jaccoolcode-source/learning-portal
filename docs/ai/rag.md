# RAG & Vector Search

Retrieval-Augmented Generation (RAG) solves the fundamental problem of LLM knowledge cutoffs and hallucinations by grounding model responses in your own documents.

---

## The Problem: Knowledge Cutoffs

LLMs are trained on static snapshots of the internet. They:
- Don't know about events after their training cutoff
- Don't know about your private/proprietary data
- Can hallucinate when asked about specifics they weren't trained on

**RAG solution:** At query time, retrieve relevant documents from your corpus and inject them into the prompt as context. The model then answers _based on those documents_.

---

## RAG Pipeline

```
                        ┌─────────────────────────────────────┐
  INDEXING PHASE        │                                     │
  (offline/batch)       │   Documents                         │
                        │       │                             │
                        │   [Chunking]                        │
                        │       │                             │
                        │   [Embedding Model]                 │
                        │       │                             │
                        │   [Vector Store] ←── store vectors  │
                        │                                     │
                        └─────────────────────────────────────┘

                        ┌─────────────────────────────────────┐
  QUERY PHASE           │                                     │
  (per request)         │   User Query                        │
                        │       │                             │
                        │   [Embedding Model]                 │
                        │       │                             │
                        │   [Vector Store] ──→ top-k chunks   │
                        │                          │          │
                        │   [Prompt Assembly]  ←───┘          │
                        │   (query + context)                 │
                        │       │                             │
                        │   [LLM]                             │
                        │       │                             │
                        │   Answer                            │
                        └─────────────────────────────────────┘
```

---

## Chunking Strategies

Splitting documents into appropriately-sized pieces is critical. Too large → context overflow. Too small → loses context.

| Strategy | How It Works | Best For |
|----------|-------------|----------|
| **Fixed-size** | Split every N characters/tokens, optional overlap | Simple, predictable; baseline approach |
| **Recursive character** | Split on `\n\n`, `\n`, `.`, ` ` etc. hierarchically | General text documents |
| **Semantic** | Split at semantic boundaries using embeddings | Complex docs where meaning spans paragraphs |
| **Sentence** | Split on sentence boundaries | QA tasks where answers fit in 1-2 sentences |
| **Markdown/code-aware** | Split on headers, functions | Structured docs like this portal |

**Typical settings:**
- Chunk size: **512–1024 tokens**
- Overlap: **10–20%** (prevents answers from spanning chunk boundaries)

---

## Embedding Models for RAG

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `text-embedding-3-small` | 1536 | Good balance; default Spring AI OpenAI choice |
| `text-embedding-3-large` | 3072 | Best quality, 2× cost |
| `nomic-embed-text` | 768 | Open, self-hostable via Ollama |
| `all-MiniLM-L6-v2` | 384 | Fast, lightweight, good for prototyping |

---

## pgvector Setup

[pgvector](https://github.com/pgvector/pgvector) is a PostgreSQL extension for storing and querying embedding vectors. It's the most practical vector DB choice for Java/Spring shops already running PostgreSQL.

### Docker Compose

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: ragdb
      POSTGRES_USER: raguser
      POSTGRES_PASSWORD: secret
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### Schema Setup

```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table
CREATE TABLE document_chunks (
    id          BIGSERIAL PRIMARY KEY,
    content     TEXT NOT NULL,
    metadata    JSONB,
    embedding   vector(1536)   -- match your embedding model dimension
);

-- HNSW index for fast approximate nearest-neighbour search
CREATE INDEX ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- Alternatively: IVFFlat index (faster build, slightly less accurate)
-- CREATE INDEX ON document_chunks
--     USING ivfflat (embedding vector_l2_ops)
--     WITH (lists = 100);
```

### Vector Similarity Queries

```sql
-- Cosine distance (most common for text embeddings)
-- Returns the 5 most similar chunks to a query embedding
SELECT content, metadata,
       1 - (embedding <=> '[0.21, -0.14, 0.83, ...]'::vector) AS similarity
FROM document_chunks
ORDER BY embedding <=> '[0.21, -0.14, 0.83, ...]'::vector
LIMIT 5;

-- Euclidean distance (<->)
SELECT content FROM document_chunks
ORDER BY embedding <-> '[0.21, -0.14, 0.83, ...]'::vector
LIMIT 5;

-- Inner product (<#>)
SELECT content FROM document_chunks
ORDER BY embedding <#> '[0.21, -0.14, 0.83, ...]'::vector
LIMIT 5;

-- With metadata filter (hybrid filtering)
SELECT content FROM document_chunks
WHERE metadata->>'source' = 'spring-docs'
ORDER BY embedding <=> '[...]'::vector
LIMIT 5;
```

**Distance operators:**

| Operator | Distance Type | Use When |
|----------|--------------|----------|
| `<=>` | Cosine | Text similarity (most common) |
| `<->` | Euclidean (L2) | When magnitude matters |
| `<#>` | Inner product | Normalised vectors (returns negative) |

---

## Spring AI RAG Implementation

### Dependencies

```xml
<dependency>
  <groupId>org.springframework.ai</groupId>
  <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.ai</groupId>
  <artifactId>spring-ai-pgvector-store-spring-boot-starter</artifactId>
</dependency>
```

### Configuration

```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      embedding:
        options:
          model: text-embedding-3-small
    vectorstore:
      pgvector:
        initialize-schema: true
        index-type: HNSW
        distance-type: COSINE_DISTANCE
        dimensions: 1536
  datasource:
    url: jdbc:postgresql://localhost:5432/ragdb
    username: raguser
    password: secret
```

### ETL Pipeline: Loading Documents

```java
@Service
public class DocumentIngestionService {

    private final VectorStore vectorStore;
    private final TokenTextSplitter textSplitter;

    public DocumentIngestionService(VectorStore vectorStore) {
        this.vectorStore = vectorStore;
        this.textSplitter = new TokenTextSplitter(
            512,   // default chunk size (tokens)
            128,   // min chunk size
            5,     // min chunk length chars
            10000, // max num chunks
            true   // keep separator
        );
    }

    public void ingestTextFile(Resource resource) {
        // 1. Load
        List<Document> rawDocs = new TextReader(resource).get();

        // 2. Chunk
        List<Document> chunks = textSplitter.apply(rawDocs);

        // 3. Enrich metadata
        chunks.forEach(doc ->
            doc.getMetadata().put("source", resource.getFilename())
        );

        // 4. Embed + Store (Spring AI handles embedding automatically)
        vectorStore.add(chunks);
    }

    public void ingestPdf(Resource pdfResource) {
        List<Document> docs = new PagePdfDocumentReader(pdfResource).get();
        List<Document> chunks = textSplitter.apply(docs);
        vectorStore.add(chunks);
    }
}
```

### ETL with Transformers Pipeline

```java
@Bean
public DocumentTransformerChain ingestionPipeline(
        VectorStore vectorStore,
        EmbeddingModel embeddingModel) {

    return new DocumentIngestionPipeline()
        .read(new PathMatchingResourcePatternResolver()
            .getResources("classpath:docs/*.md"))
        .transform(
            new TokenTextSplitter(),
            new ContentFormatTransformer(),
            new KeywordMetadataEnricher(embeddingModel, 5)  // extract keywords
        )
        .write(vectorStore);
}
```

### Query Phase: QuestionAnswerAdvisor

The simplest way to add RAG to a `ChatClient`:

```java
@Service
public class RagService {

    private final ChatClient chatClient;

    public RagService(ChatClient.Builder builder, VectorStore vectorStore) {
        this.chatClient = builder
            .defaultSystem("""
                You are a helpful assistant. Answer questions based on the provided context.
                If the context doesn't contain enough information, say so clearly.
                """)
            .defaultAdvisors(
                new QuestionAnswerAdvisor(
                    vectorStore,
                    SearchRequest.defaults()
                        .withTopK(5)                          // retrieve 5 chunks
                        .withSimilarityThreshold(0.7)        // minimum similarity score
                )
            )
            .build();
    }

    public String answer(String question) {
        return chatClient.prompt()
            .user(question)
            .call()
            .content();
    }

    // With metadata filtering
    public String answerFromSource(String question, String source) {
        return chatClient.prompt()
            .user(question)
            .advisors(advisorSpec -> advisorSpec
                .param(QuestionAnswerAdvisor.FILTER_EXPRESSION,
                    "source == '" + source + "'"))
            .call()
            .content();
    }
}
```

### Manual Retrieval + Augmentation

For more control over the pipeline:

```java
@Service
public class ManualRagService {

    private final ChatClient chatClient;
    private final VectorStore vectorStore;

    private static final String RAG_PROMPT = """
            Answer the question based on the context below.
            If you cannot find the answer in the context, say "I don't have enough information."

            Context:
            {context}

            Question: {question}
            """;

    public String answer(String question) {
        // 1. Retrieve relevant chunks
        List<Document> relevantDocs = vectorStore.similaritySearch(
            SearchRequest.query(question)
                .withTopK(5)
                .withSimilarityThreshold(0.65)
        );

        // 2. Assemble context
        String context = relevantDocs.stream()
            .map(Document::getContent)
            .collect(Collectors.joining("\n\n---\n\n"));

        // 3. Generate answer
        PromptTemplate template = new PromptTemplate(RAG_PROMPT);
        Prompt prompt = template.create(Map.of(
            "context", context,
            "question", question
        ));

        return chatClient.prompt(prompt).call().content();
    }
}
```

---

## Hybrid Search

Pure vector search can miss exact keyword matches. **Hybrid search** combines:
- **Dense retrieval** — vector similarity (semantic)
- **Sparse retrieval** — BM25/full-text search (keyword)

```sql
-- Hybrid: combine BM25 rank + cosine similarity
WITH vector_results AS (
    SELECT id, content,
           1 - (embedding <=> $1::vector) AS vector_score
    FROM document_chunks
    ORDER BY embedding <=> $1::vector
    LIMIT 20
),
text_results AS (
    SELECT id, content,
           ts_rank(to_tsvector('english', content),
                   plainto_tsquery('english', $2)) AS text_score
    FROM document_chunks
    WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $2)
    LIMIT 20
)
SELECT COALESCE(v.id, t.id) AS id,
       COALESCE(v.content, t.content) AS content,
       COALESCE(v.vector_score, 0) * 0.7 +
       COALESCE(t.text_score, 0) * 0.3 AS hybrid_score
FROM vector_results v
FULL OUTER JOIN text_results t ON v.id = t.id
ORDER BY hybrid_score DESC
LIMIT 5;
```

---

## Evaluation with RAGAS

[RAGAS](https://ragas.io/) provides metrics for evaluating RAG pipelines:

| Metric | Measures | Good Score |
|--------|---------|-----------|
| **Faithfulness** | Is the answer grounded in retrieved context? | > 0.8 |
| **Answer Relevancy** | Does the answer address the question? | > 0.8 |
| **Context Precision** | Are retrieved chunks relevant? | > 0.7 |
| **Context Recall** | Did retrieval catch all needed info? | > 0.7 |

---

## Common Failure Modes

| Failure | Symptom | Fix |
|---------|---------|-----|
| **Chunk too large** | Context overflow, irrelevant content | Reduce chunk size |
| **Chunk too small** | Answers lack context | Increase chunk size + overlap |
| **Wrong embedding model** | Poor retrieval quality | Match index/query embedding model |
| **Low similarity threshold** | Irrelevant chunks included | Raise threshold (0.7–0.8) |
| **No overlap** | Answers split across boundaries | Add 10–20% chunk overlap |
| **Index/query model mismatch** | Garbage retrieval | Always use same model for both |
| **Outdated index** | Stale answers | Implement incremental ingestion |

---

## Quiz

→ [Test your RAG knowledge](/quizzes/mixed-review)
