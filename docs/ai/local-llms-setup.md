# Local LLMs with Ollama & Docker

<DifficultyBadge level="beginner" />

Running large language models on your own laptop gives you privacy, zero API cost, and the ability to work offline. This page covers everything you need to get Ollama running in Docker and integrated with n8n.

---

## Why Run Local?

| Factor | Local (Ollama) | Cloud (Claude / GPT-4o) |
|--------|---------------|------------------------|
| **Cost** | Free (electricity only) | Pay per token |
| **Privacy** | Data never leaves your machine | Sent to provider servers |
| **Offline** | Works without internet | Requires connectivity |
| **Latency** | CPU: slow; GPU: fast | ~200–800 ms network round trip |
| **Quality** | Good (7B–13B), not frontier | Best available |
| **Context window** | 4K–128K depending on model | Up to 200K (Claude) |
| **Setup** | Docker pull + model download | API key only |

**Rule of thumb:** Use local LLMs for development, privacy-sensitive data, and experiments. Use Claude/GPT-4o for production tasks where quality matters most.

---

## Ollama Architecture

Ollama is a lightweight runtime that manages LLM models and exposes a REST API. When you run it in Docker, the architecture looks like this:

```
Your app / n8n / curl
        ↓
  REST API :11434          ← ollama/ollama container
        ↓
  Model layers (GGUF)      ← stored in ollama_data volume
        ↓
  CPU / GPU inference
```

Key endpoints:
- `POST /api/chat` — multi-turn chat (returns full response or stream)
- `POST /api/generate` — single-prompt completion
- `POST /api/embeddings` — generate embedding vectors
- `GET /api/tags` — list downloaded models

Ollama also exposes an **OpenAI-compatible** API at `/v1/chat/completions` — this lets you use Ollama with any tool that supports OpenAI's SDK.

---

## Docker Setup

The `claude-tutorial` repo contains the full `docker-compose.yml`. To start just Ollama:

```bash
cd C:/Users/jaccu/Documents/Projects/claude-tutorial

# Start only Ollama
docker compose up -d ollama

# Or start the full stack (Postgres + Ollama + n8n)
docker compose up -d
```

Check that Ollama is running:

```bash
curl http://localhost:11434
# Returns: Ollama is running
```

::: info Persistent model storage
Models are stored in the `ollama_data` Docker volume. They survive container restarts and upgrades — you only download each model once (~minutes to hours depending on size).
:::

---

## Pulling and Managing Models

Open a shell inside the container to manage models:

```bash
# Pull a model (downloads and caches it)
docker exec tutorial-ollama ollama pull llama3.2:3b

# List downloaded models
docker exec tutorial-ollama ollama list

# Remove a model
docker exec tutorial-ollama ollama rm llama3.2:3b
```

### Model Size Reference

| Model | Size on Disk | RAM Required | Best For |
|-------|-------------|--------------|----------|
| `llama3.2:3b` | ~2 GB | 4 GB | Fast chat, general tasks |
| `llama3.1:8b` | ~4.7 GB | 8 GB | Better quality chat & reasoning |
| `mistral:7b` | ~4.1 GB | 8 GB | Instruction following, coding |
| `phi3:mini` | ~2.2 GB | 4 GB | Compact, fast, surprisingly capable |
| `nomic-embed-text` | ~274 MB | 1 GB | **Embeddings for RAG** |
| `llava:7b` | ~4.7 GB | 8 GB | **Vision — image understanding** |

::: tip Start small
For tutorial exercises, `llama3.2:3b` + `nomic-embed-text` is all you need (under 3 GB total). Pull `llava:7b` only when you reach the [Home Storage Project](/ai/home-storage-project).
:::

**Pull the tutorial essentials:**

```bash
docker exec tutorial-ollama ollama pull llama3.2:3b
docker exec tutorial-ollama ollama pull nomic-embed-text
```

---

## The Ollama REST API

### Chat completion

```bash
curl http://localhost:11434/api/chat \
  -d '{
    "model": "llama3.2:3b",
    "messages": [
      {"role": "user", "content": "What is pgVector?"}
    ],
    "stream": false
  }'
```

Response:
```json
{
  "model": "llama3.2:3b",
  "message": {
    "role": "assistant",
    "content": "pgVector is a PostgreSQL extension that adds vector data types..."
  },
  "done": true,
  "total_duration": 2143456789
}
```

### Generate embeddings

```bash
curl http://localhost:11434/api/embeddings \
  -d '{
    "model": "nomic-embed-text",
    "prompt": "Where did I put my passport?"
  }'
```

Response:
```json
{
  "embedding": [0.012, -0.034, 0.091, ...]
}
```

::: warning Embedding dimensions
`nomic-embed-text` produces **768-dimensional** vectors. OpenAI's `text-embedding-3-small` produces 1536 dimensions. Never mix models in the same vector column — you'll get meaningless similarity scores.
:::

### Streaming responses

Set `"stream": true` (the default) to receive SSE chunks:

```bash
curl http://localhost:11434/api/chat \
  -d '{"model": "llama3.2:3b", "messages": [{"role": "user", "content": "Count to 5"}]}'
```

Each line is a JSON object with a partial `message.content`. The last line has `"done": true`.

---

## Choosing the Right Model

| Use Case | Recommended Model | Why |
|----------|------------------|-----|
| General chat / Q&A | `llama3.2:3b` | Fast, low RAM, good for tutorials |
| Better reasoning | `llama3.1:8b` or `mistral:7b` | More parameters, slower |
| RAG embeddings | `nomic-embed-text` | 768-dim, small, fast |
| Image understanding | `llava:7b` | Multimodal (text + image) |
| Code generation | `codellama:7b` or `mistral:7b` | Strong instruction following |

---

## Connecting Ollama to n8n

Once the full Docker stack is running (`docker compose up -d`), configure Ollama in n8n:

1. Open n8n at **http://localhost:5678** (login: `admin` / `changeme`)
2. Go to **Settings → Credentials → New Credential**
3. Search for **Ollama**
4. Set **Base URL** to `http://ollama:11434`
   - Use the Docker service name `ollama`, not `localhost` — they're on the same Docker network

5. Click **Save & Test** — you should see "Connection successful"

Now you can use the **Ollama Chat Model** or **Ollama Embeddings** sub-nodes in any AI workflow.

::: info Docker networking
Inside Docker Compose, containers reach each other by service name. n8n uses `http://ollama:11434` (not `http://localhost:11434`) because `localhost` inside the n8n container refers to n8n itself, not Ollama.
:::

---

## GPU Acceleration (Optional)

Ollama on CPU works for the tutorial, but is slower (~2–10 tokens/sec). With a GPU you get 20–80 tokens/sec.

**Windows with NVIDIA GPU:**

1. Install [NVIDIA Container Toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html)
2. Uncomment the `deploy.resources` block in `docker-compose.yml`:
   ```yaml
   deploy:
     resources:
       reservations:
         devices:
           - driver: nvidia
             count: all
             capabilities: [gpu]
   ```
3. `docker compose up -d ollama`

Verify GPU is detected:
```bash
docker exec tutorial-ollama ollama run llama3.2:3b "say hi"
# Look for GPU memory usage in nvidia-smi
```

---

## Claude API vs Ollama — Quick Comparison

| | Ollama (local) | Claude API |
|--|---------------|-----------|
| **Quality** | Good (7B params) | Excellent (frontier) |
| **Context window** | 4K–128K | Up to 200K tokens |
| **Cost** | Free | Pay per token |
| **Vision** | llava (7B) | Claude 3.5+ (production quality) |
| **Tool use** | Limited (model-dependent) | First-class, reliable |
| **Extended thinking** | No | Claude 3.7 Sonnet+ |
| **Latency** | CPU: slow, GPU: fast | ~500ms network |
| **Privacy** | 100% local | Processed by Anthropic |

For full Claude API documentation, see [Claude API Deep Dive](/ai/claude-api).

<RelatedTopics :topics="['/ai/claude-api', '/ai/n8n-rag-hands-on', '/ai/home-storage-project']" />
