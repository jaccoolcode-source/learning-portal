# Capstone: Home Storage Organizer

<DifficultyBadge level="advanced" />

Put everything together into a real application. The Home Storage Organizer lets you track items across floors, rooms, and storage units. You can add items with photos, and query in plain language: **"Where are my ski boots?"** — the system finds them using semantic vector search.

This page assumes you have completed the [n8n RAG Hands-On](/ai/n8n-rag-hands-on) tutorial and have the Docker stack running.

---

## Project Overview

| Feature | How it works |
|---------|-------------|
| Add item with photo | Upload photo → llava:7b describes it → stored with location |
| Auto-describe items | Vision model extracts searchable description from image |
| Find item | Natural language query → vector search → LLM answer |
| Location hierarchy | Floor → Room → Storage unit (cupboard / shelf) |
| GUI | Simple HTML form — no framework needed |

**Example flow:**

1. You take a photo of a shelf with ski boots on it
2. Upload via the GUI: Name=Ski boots, Location=Basement/Shelf B3, + photo
3. llava:7b describes: "Black ski boots, size markings visible, stored on a wooden shelf"
4. Description is embedded and stored in pgVector
5. Later: "where are my ski boots?" → vector search finds the item → "Your ski boots are in the Basement on Shelf B3"

---

## Architecture

```
Browser (HTML form)
      ↓ POST /add-item (multipart)
  n8n Ingestion Workflow
      ├── Save image to disk
      ├── llava:7b — describe image for inventory
      ├── nomic-embed-text — embed the description
      └── Postgres INSERT → items table
                    ↓
              pgVector store

Browser (query form)
      ↓ POST /find-item {"query": "where are my ski boots?"}
  n8n Query Workflow
      ├── nomic-embed-text — embed query
      ├── Postgres — vector similarity search
      ├── Code — build context prompt
      └── llama3.2:3b — generate natural language answer
                    ↓
              HTTP response
```

| Component | Technology | Port |
|-----------|-----------|------|
| Ingestion API | n8n webhook | 5678 |
| Query API | n8n webhook | 5678 |
| Image recognition | Ollama llava:7b | 11434 |
| Embeddings | Ollama nomic-embed-text | 11434 |
| Vector store | PostgreSQL + pgVector | 5432 |
| Chat LLM | Ollama llama3.2:3b | 11434 |
| GUI | Static HTML file | (open locally) |

---

## Database Schema

Run this in psql (`docker exec -it tutorial-postgres psql -U raguser -d ragdb`):

```sql
-- Enable pgVector if not already done
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS items (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    floor       TEXT,
    room        TEXT,
    storage     TEXT,                      -- shelf label, cupboard name, drawer, etc.
    description TEXT,                       -- LLM-generated from image
    image_path  TEXT,                       -- path inside Docker volume
    embedding   vector(768),               -- semantic embedding of description
    created_at  TIMESTAMP DEFAULT NOW(),
    updated_at  TIMESTAMP DEFAULT NOW()
);

-- Search index
CREATE INDEX IF NOT EXISTS items_embedding_idx
    ON items USING hnsw (embedding vector_cosine_ops);

-- Full-text search index for keyword fallback
CREATE INDEX IF NOT EXISTS items_name_fts_idx
    ON items USING gin(to_tsvector('english', name || ' ' || COALESCE(description, '')));
```

Location hierarchy uses three separate columns (`floor`, `room`, `storage`) so you can filter queries — e.g., "what's in the basement?" without semantic search.

---

## Step 1: Pull the Vision Model

::: info llava:7b is large (~4.7 GB)
Download it before you need it. The pull takes a few minutes depending on your connection.
:::

```bash
docker exec tutorial-ollama ollama pull llava:7b
```

Test the vision model with a quick image check:

```bash
# Download a test image
curl -o /tmp/test.jpg https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Dog_Breeds.jpg/320px-Dog_Breeds.jpg

# Encode and ask llava
IMAGE_B64=$(base64 -w 0 /tmp/test.jpg)
curl -s http://localhost:11434/api/chat -d "{
  \"model\": \"llava:7b\",
  \"messages\": [{
    \"role\": \"user\",
    \"content\": \"Describe what you see for a home inventory system.\",
    \"images\": [\"$IMAGE_B64\"]
  }],
  \"stream\": false
}" | jq .message.content
```

::: tip Test vision quality first
Run a few test images through llava before building the full workflow. Some images (dark, blurry, cluttered shelves) give poor descriptions. Good lighting makes a significant difference.
:::

---

## Step 2: Ingestion Workflow

Create a new workflow in n8n called **"Item Ingestion"**.

### Node 1: Webhook (receive item + photo)
- Method: POST
- Path: `add-item`
- Binary Property: `photo` (accept file upload)
- Response Mode: Last Node

### Node 2: Write Binary File (save image)
- Type: **Write Binary File**
- File Name: `/home/node/.n8n/uploads/{{ $json.body.name }}-{{ Date.now() }}.jpg`
- Input Binary Field: `photo`

This saves the uploaded photo to n8n's data volume.

### Node 3: Code Node (prepare vision request)

```javascript
const name     = $('Webhook').first().json.body.name;
const floor    = $('Webhook').first().json.body.floor || '';
const room     = $('Webhook').first().json.body.room || '';
const storage  = $('Webhook').first().json.body.storage || '';
const filePath = $('Write Binary File').first().json.filePath;

// Read the saved image as base64
const fs   = require('fs');
const data = fs.readFileSync(filePath);
const b64  = data.toString('base64');

return [{
  json: { name, floor, room, storage, filePath, imageBase64: b64 }
}];
```

### Node 4: HTTP Request (llava vision)
- Type: **HTTP Request**
- Method: POST
- URL: `http://ollama:11434/api/chat`
- Body (JSON):

```json
{
  "model": "llava:7b",
  "messages": [{
    "role": "user",
    "content": "Describe this item concisely for a home inventory system. Focus on: what the item is, color, size, any visible labels or markings. One paragraph, no more than 3 sentences.",
    "images": ["{{ $json.imageBase64 }}"]
  }],
  "stream": false
}
```

- Response: extract `message.content` — this is the LLM-generated description.

### Node 5: Ollama Embeddings
- Model: `nomic-embed-text`
- Embed the description from Node 4:
  `{{ $('HTTP Request').first().json.message.content }}`

### Node 6: Postgres INSERT
```sql
INSERT INTO items (name, floor, room, storage, description, image_path, embedding)
VALUES (
  '{{ $('Code').first().json.name }}',
  '{{ $('Code').first().json.floor }}',
  '{{ $('Code').first().json.room }}',
  '{{ $('Code').first().json.storage }}',
  '{{ $('HTTP Request').first().json.message.content }}',
  '{{ $('Code').first().json.filePath }}',
  '{{ $json.embedding }}'::vector
)
RETURNING id, name;
```

### Node 7: Respond to Webhook
```json
{
  "success": true,
  "id": "{{ $json.id }}",
  "name": "{{ $json.name }}",
  "description": "{{ $('HTTP Request').first().json.message.content }}"
}
```

**Activate** the workflow.

---

## Step 3: Query Workflow

Create a new workflow called **"Item Query"**.

### Node 1: Webhook
- Method: POST
- Path: `find-item`
- Response Mode: Last Node

### Node 2: Ollama Embeddings
- Embed: `{{ $json.body.query }}`
- Model: `nomic-embed-text`

### Node 3: Postgres (semantic search with optional location filter)
```sql
SELECT
    name,
    floor,
    room,
    storage,
    description,
    1 - (embedding <=> '{{ $json.embedding }}'::vector) AS similarity
FROM items
WHERE
    (
      '{{ $('Webhook').first().json.body.floor || '' }}' = ''
      OR floor ILIKE '%{{ $('Webhook').first().json.body.floor || '' }}%'
    )
ORDER BY embedding <=> '{{ $json.embedding }}'::vector
LIMIT 5;
```

This allows an optional `floor` filter — send `{"query": "ski boots", "floor": "basement"}` to restrict results to one floor.

### Node 4: Code Node (build prompt)
```javascript
const query   = $('Webhook').first().json.body.query;
const results = $input.all();

if (results.length === 0) {
  return [{ json: { prompt: `The user asked: "${query}". No items found in inventory. Reply that you couldn't find any matching items.`, query } }];
}

const itemList = results.map((r, i) => {
  const loc = [r.json.floor, r.json.room, r.json.storage].filter(Boolean).join(' → ');
  return `${i + 1}. ${r.json.name} (${loc}): ${r.json.description}`;
}).join('\n');

return [{
  json: {
    prompt: `You are a home inventory assistant. Answer the user's question based on these inventory records.
Be specific about location. If multiple items match, list them all.

Inventory records:
${itemList}

User question: ${query}
Answer:`,
    query
  }
}];
```

### Node 5: Basic LLM Chain + Ollama Chat Model
- Root node: **Basic LLM Chain** — prompt: `{{ $json.prompt }}`
- Sub-node: **Ollama Chat Model** (llama3.2:3b)

### Node 6: Respond to Webhook
```json
{
  "answer": "{{ $json.text }}",
  "items_found": "{{ $('Postgres').all().length }}"
}
```

**Activate** the workflow.

---

## Step 4: The GUI

Save this as `index.html` anywhere on your machine and open it in a browser:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Home Storage Organizer</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 40px auto; padding: 0 20px; }
    input, select, textarea { width: 100%; padding: 8px; margin: 4px 0 12px; box-sizing: border-box; }
    button { background: #4f46e5; color: white; border: none; padding: 10px 20px; cursor: pointer; border-radius: 4px; }
    button:hover { background: #4338ca; }
    .result { background: #f0fdf4; border: 1px solid #86efac; padding: 12px; border-radius: 4px; margin-top: 12px; }
    .error  { background: #fef2f2; border: 1px solid #fca5a5; padding: 12px; border-radius: 4px; margin-top: 12px; }
    h2 { border-top: 2px solid #e5e7eb; padding-top: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <h1>Home Storage Organizer</h1>

  <h2>Add Item</h2>
  <form id="addForm">
    <label>Item Name</label>
    <input type="text" name="name" placeholder="Ski boots" required>

    <label>Floor</label>
    <select name="floor">
      <option value="">-- Select floor --</option>
      <option>Ground floor</option>
      <option>First floor</option>
      <option>Basement</option>
      <option>Attic</option>
      <option>Garage</option>
    </select>

    <label>Room</label>
    <input type="text" name="room" placeholder="Living room, bedroom, storage room...">

    <label>Storage (shelf / cupboard / drawer)</label>
    <input type="text" name="storage" placeholder="Shelf A2, Blue box, Top drawer...">

    <label>Photo</label>
    <input type="file" name="photo" accept="image/*" required>

    <button type="submit">Add Item</button>
  </form>
  <div id="addResult"></div>

  <h2>Find Item</h2>
  <form id="queryForm">
    <label>What are you looking for?</label>
    <input type="text" name="query" placeholder="Where are my ski boots?" required>

    <label>Floor filter (optional)</label>
    <select name="floor">
      <option value="">All floors</option>
      <option>Ground floor</option>
      <option>First floor</option>
      <option>Basement</option>
      <option>Attic</option>
      <option>Garage</option>
    </select>

    <button type="submit">Search</button>
  </form>
  <div id="queryResult"></div>

  <script>
    const N8N = 'http://localhost:5678/webhook';

    document.getElementById('addForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(e.target);
      const resultEl = document.getElementById('addResult');
      resultEl.innerHTML = '<p>Adding item and analyzing photo...</p>';
      try {
        const res = await fetch(`${N8N}/add-item`, { method: 'POST', body: data });
        const json = await res.json();
        if (json.success) {
          resultEl.innerHTML = `<div class="result">
            <strong>Added!</strong> ${json.name}<br>
            <em>Description: ${json.description}</em>
          </div>`;
          e.target.reset();
        } else {
          throw new Error(JSON.stringify(json));
        }
      } catch (err) {
        resultEl.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });

    document.getElementById('queryForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = e.target.query.value;
      const floor = e.target.floor.value;
      const resultEl = document.getElementById('queryResult');
      resultEl.innerHTML = '<p>Searching...</p>';
      try {
        const res = await fetch(`${N8N}/find-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, floor })
        });
        const json = await res.json();
        resultEl.innerHTML = `<div class="result">
          <strong>Answer:</strong> ${json.answer}<br>
          <small>${json.items_found} matching item(s) found in inventory</small>
        </div>`;
      } catch (err) {
        resultEl.innerHTML = `<div class="error">Error: ${err.message}</div>`;
      }
    });
  </script>
</body>
</html>
```

---

## Step 5: End-to-End Test

### Add 3 items

1. Open `index.html` in your browser
2. Add **Ski boots** → Basement → Shelf B3 → [photo of boots]
3. Add **Red USB-C cable** → Home office → Desk drawer → [photo of cable]
4. Add **Winter jacket** → Hallway → Wall hook → [photo of jacket]

Wait for each response — llava analysis takes ~15–30 seconds on CPU.

### Query them

```bash
# Using curl
curl -s -X POST http://localhost:5678/webhook/find-item \
  -H "Content-Type: application/json" \
  -d '{"query": "where did I put my winter sports equipment?"}' | jq .answer

curl -s -X POST http://localhost:5678/webhook/find-item \
  -H "Content-Type: application/json" \
  -d '{"query": "I need to charge my phone, where is a cable?"}' | jq .answer

curl -s -X POST http://localhost:5678/webhook/find-item \
  -H "Content-Type: application/json" \
  -d '{"query": "what clothing do I have stored?"}' | jq .answer
```

Notice that "winter sports equipment" finds ski boots even though you never used those exact words — that's semantic search at work.

---

## Next Steps

This is a working foundation. Here are directions to take it further:

### Immediate improvements
- **Better vision quality**: Replace llava:7b with Claude API for production-quality image analysis (see [Claude API Vision](/ai/claude-api#vision))
- **Multi-image support**: Allow multiple photos per item
- **Edit/delete items**: Add UPDATE and DELETE workflows

### Bigger features
- **Barcode scanning**: Add a barcode reader in the GUI, look up product names automatically
- **Voice input**: Integrate OpenAI Whisper (or a local Whisper via Ollama) for "Hey, where are my keys?" queries
- **React frontend**: Replace the plain HTML with a proper React app with image previews and floor plans
- **Notifications**: n8n can send Telegram/email alerts when items haven't been found for weeks

### The dedicated project repo
This tutorial scratches the surface. The full application — with proper authentication, a React frontend, floor plan visualization, and CI/CD — deserves its own repository. Use this tutorial as your specification and requirements document to start building it.

<RelatedTopics :topics="['/ai/n8n-rag-hands-on', '/ai/local-llms-setup', '/ai/claude-api', '/ai/rag']" />
