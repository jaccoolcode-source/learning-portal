# Hands-On RAG: n8n + pgVector + Ollama

<DifficultyBadge level="intermediate" />

Build a working RAG (Retrieval-Augmented Generation) chatbot from scratch using only open-source, locally-running tools. By the end of this tutorial you'll have a webhook endpoint that answers questions from your own documents — no cloud services required.

**Prerequisites:** Docker stack running from the [Local LLMs setup](/ai/local-llms-setup). Check with:
```bash
docker compose ps  # all three services should be healthy
```

---

## What We're Building

```
HTTP POST /rag-query
{"question": "What is the return policy?"}
         ↓
    n8n webhook
         ↓
  Ollama: embed question        nomic-embed-text → vector[768]
         ↓
  Postgres pgVector: search     SELECT ... ORDER BY embedding <=> $1 LIMIT 5
         ↓
  n8n Code node: build prompt   "Answer using this context: [chunks]"
         ↓
  Ollama: generate answer       llama3.2:3b
         ↓
HTTP response: {"answer": "..."}
```

Two workflows:
1. **Ingestion** — load documents into the vector store
2. **Query** — answer questions using retrieved context

---

## Step 1: Set Up the Database

Connect to Postgres and create the schema:

```bash
docker exec -it tutorial-postgres psql -U raguser -d ragdb
```

Inside the psql shell:

```sql
-- Enable pgVector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Table for storing document chunks + their embeddings
CREATE TABLE IF NOT EXISTS document_chunks (
    id          SERIAL PRIMARY KEY,
    source      TEXT NOT NULL,          -- filename or URL
    chunk_index INTEGER NOT NULL,       -- position within the source
    content     TEXT NOT NULL,          -- raw text of the chunk
    embedding   vector(768) NOT NULL,   -- nomic-embed-text = 768 dims
    created_at  TIMESTAMP DEFAULT NOW()
);

-- HNSW index for fast approximate nearest-neighbor search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops);
```

Exit psql with `\q`.

::: warning Dimension must match the embedding model
`nomic-embed-text` outputs **768-dimensional** vectors. If you switch to a different embedding model later (e.g., OpenAI's `text-embedding-3-small` = 1536 dims), you must recreate the table and re-embed all documents. Never mix models in the same table.
:::

---

## Step 2: Configure n8n Credentials

Open n8n at **http://localhost:5678** (admin / changeme).

### Add Ollama credential

1. **Settings → Credentials → Add Credential**
2. Search: **Ollama**
3. Set **Base URL**: `http://ollama:11434`
4. Save & Test → "Connection successful"

### Add PostgreSQL credential

1. **Add Credential → Postgres**
2. Fill in:
   - Host: `postgres`
   - Port: `5432`
   - Database: `ragdb`
   - User: `raguser`
   - Password: `ragpassword`
3. Save & Test → "Connection successful"

::: info Why `postgres` not `localhost`?
n8n and Postgres are on the same Docker network. Inside Docker, you use the service name `postgres` as the hostname, not `localhost`.
:::

---

## Step 3: Build the Ingestion Workflow

This workflow takes a text document and stores it as searchable chunks.

**Create a new workflow** in n8n (+ New Workflow).

### Node 1: Manual Trigger
- Type: **Manual Trigger**
- No configuration needed — used to run the workflow on demand

### Node 2: HTTP Request (fetch sample document)
- Type: **HTTP Request**
- Method: GET
- URL: `https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/README.md`
  (Any plain text URL works — swap in your own content)
- Response Format: Text

### Node 3: Code Node (chunk the text)
- Type: **Code**
- Mode: Run Once for All Items
- Paste this JavaScript:

```javascript
const text = $input.first().json.data;   // raw text from HTTP Request
const chunkSize = 500;
const overlap   = 50;
const source    = "anthropic-cookbook-readme";

const chunks = [];
let i = 0;
while (i < text.length) {
  chunks.push({
    source,
    chunk_index: chunks.length,
    content: text.slice(i, i + chunkSize).trim()
  });
  i += chunkSize - overlap;
}

return chunks.map(chunk => ({ json: chunk }));
```

This splits the document into overlapping 500-character chunks. Overlap prevents losing context at chunk boundaries.

### Node 4: Ollama Embeddings
- Type: **Embeddings Ollama** (under AI → Embeddings)
- Credential: the Ollama credential you created
- Model: `nomic-embed-text`

Connect Node 3 output to Node 4. The embeddings node receives the `content` field and adds an `embedding` array to each item.

### Node 5: Postgres (INSERT)
- Type: **Postgres**
- Operation: Execute Query
- Credential: your Postgres credential
- Query:

```sql
INSERT INTO document_chunks (source, chunk_index, content, embedding)
VALUES (
  '{{ $json.source }}',
  {{ $json.chunk_index }},
  '{{ $json.content }}',
  '{{ $json.embedding }}'::vector
);
```

**Save and run** the workflow. After it completes:

```bash
docker exec -it tutorial-postgres psql -U raguser -d ragdb \
  -c "SELECT COUNT(*), source FROM document_chunks GROUP BY source;"
```

You should see rows with your source name.

---

## Step 4: Build the Query Workflow

Create another new workflow.

### Node 1: Webhook
- Type: **Webhook**
- Method: POST
- Path: `rag-query`
- Response Mode: Last Node

Note the webhook URL shown: `http://localhost:5678/webhook/rag-query`

### Node 2: Ollama Embeddings (embed the question)
- Type: **Embeddings Ollama**
- Model: `nomic-embed-text`
- Input field: `{{ $json.body.question }}`

### Node 3: Postgres (vector similarity search)
- Type: **Postgres**
- Operation: Execute Query
- Query:

```sql
SELECT content, source,
       1 - (embedding <=> '{{ $json.embedding }}'::vector) AS similarity
FROM document_chunks
ORDER BY embedding <=> '{{ $json.embedding }}'::vector
LIMIT 5;
```

This returns the 5 most semantically similar chunks to your question.

### Node 4: Code Node (build prompt)
- Type: **Code**
- Mode: Run Once for All Items

```javascript
const question = $('Webhook').first().json.body.question;
const chunks   = $input.all().map(item => item.json.content);
const context  = chunks.join('\n\n---\n\n');

return [{
  json: {
    prompt: `Answer the following question based ONLY on the provided context.
If the context does not contain enough information, say "I don't know."

Context:
${context}

Question: ${question}

Answer:`,
    question
  }
}];
```

### Node 5: Ollama Chat Model
- Type: **Ollama Chat Model** (sub-node under AI)
- Model: `llama3.2:3b`
- Use within a **Basic LLM Chain** root node:
  - Add a **Basic LLM Chain** node
  - Connect it to Node 4
  - Set prompt field: `{{ $json.prompt }}`
  - Sub-node: attach the Ollama Chat Model node

### Node 6: Respond to Webhook
- Type: **Respond to Webhook**
- Response Body:

```json
{
  "answer": "{{ $json.text }}",
  "question": "{{ $('Code').first().json.question }}"
}
```

**Activate** the workflow (toggle at top right).

---

## Step 5: Test It

```bash
curl -s -X POST http://localhost:5678/webhook/rag-query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the Anthropic Cookbook?"}' | jq .
```

Expected response:
```json
{
  "answer": "The Anthropic Cookbook is a collection of code recipes and examples for working with Claude...",
  "question": "What is the Anthropic Cookbook?"
}
```

**Troubleshooting:**

| Problem | Fix |
|---------|-----|
| "Connection refused" on webhook | Check workflow is Activated (not just Saved) |
| Empty answer | Run ingestion workflow first — no chunks = no context |
| Slow response | Normal on CPU. `llama3.2:3b` takes 10–30s on CPU |
| Wrong answer | Try ingesting more/better content; increase `LIMIT 5` to `LIMIT 10` |

---

## Step 6: Add Conversation Memory

Make the chatbot remember previous messages in a session.

**Add a `conversations` table:**

```sql
CREATE TABLE IF NOT EXISTS conversations (
    id         SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    role       TEXT NOT NULL,  -- 'user' or 'assistant'
    content    TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON conversations (session_id, created_at DESC);
```

**Update the query workflow:**

After the Webhook node, add a **Postgres** node to fetch history:

```sql
SELECT role, content
FROM conversations
WHERE session_id = '{{ $json.body.session_id }}'
ORDER BY created_at DESC
LIMIT 10;
```

Update the Code node to prepend history to the prompt:

```javascript
const question  = $('Webhook').first().json.body.question;
const sessionId = $('Webhook').first().json.body.session_id || 'default';
const history   = $('Fetch History').all()
  .reverse()
  .map(m => `${m.json.role}: ${m.json.content}`)
  .join('\n');
const chunks    = $('Postgres1').all().map(item => item.json.content);
const context   = chunks.join('\n\n---\n\n');

return [{
  json: {
    prompt: `${history ? 'Previous conversation:\n' + history + '\n\n' : ''}
Context:
${context}

Current question: ${question}
Answer:`,
    question,
    session_id: sessionId
  }
}];
```

After the LLM responds, add two Postgres INSERT nodes to save both turns:

```sql
-- Save user message
INSERT INTO conversations (session_id, role, content)
VALUES ('{{ $json.session_id }}', 'user', '{{ $json.question }}');

-- Save assistant message
INSERT INTO conversations (session_id, role, content)
VALUES ('{{ $json.session_id }}', 'assistant', '{{ $json.answer }}');
```

Test with a session:
```bash
curl -s -X POST http://localhost:5678/webhook/rag-query \
  -H "Content-Type: application/json" \
  -d '{"question": "What is Claude?", "session_id": "test-session-1"}' | jq .answer

curl -s -X POST http://localhost:5678/webhook/rag-query \
  -H "Content-Type: application/json" \
  -d '{"question": "What did I just ask about?", "session_id": "test-session-1"}' | jq .answer
```

The second question should reference the first.

---

## Improving Retrieval Quality

### Tune similarity threshold

Filter out low-quality matches by adding a `WHERE` clause:

```sql
WHERE 1 - (embedding <=> '...'::vector) > 0.7
```

A similarity score of 0.7+ means the chunk is closely related. Below 0.5 is usually noise.

### Use n8n's native pgVector node

n8n 1.x includes a built-in **Postgres PGVector Store** node under AI → Vector Stores. It handles the embedding, upsert, and similarity search automatically — no raw SQL needed. Check your n8n version:

```bash
docker exec tutorial-n8n n8n --version
```

::: tip Export your workflows
Use n8n's **Export Workflow** (kebab menu → Download) to save workflows as JSON. Store them in the `workflows/` directory of your `claude-tutorial` repo — they become reproducible infrastructure.
:::

<RelatedTopics :topics="['/ai/rag', '/ai/local-llms-setup', '/ai/home-storage-project', '/ai/ai-workflows']" />
