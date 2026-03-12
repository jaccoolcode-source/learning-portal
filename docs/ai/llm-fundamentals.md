# LLM Fundamentals

Large Language Models (LLMs) are the engine behind modern AI assistants, code generators, and document processors. Understanding how they work — even at a high level — makes you a better consumer and builder of AI-powered systems.

---

## The Transformer — Intuition Without Maths

All major LLMs are based on the **Transformer** architecture (Vaswani et al., 2017). Key ideas:

- **Attention mechanism** — each token can "attend to" every other token in the context. This is how "the bank by the river" vs "the bank for money" are disambiguated.
- **Self-supervised pre-training** — models learn by predicting masked or next tokens on enormous text corpora (trillions of tokens).
- **Fine-tuning + RLHF** — raw pre-trained models are then fine-tuned for instruction following and aligned with human preferences via Reinforcement Learning from Human Feedback.

The result: a model that encodes a compressed statistical representation of language, facts, and reasoning patterns.

::: info No maths needed
You don't need to understand backpropagation or matrix multiplication to use LLMs effectively. Think of them as very capable text-completion engines with a broad world knowledge base built in.
:::

---

## Tokens

Everything you send to and receive from an LLM is measured in **tokens**, not characters.

- A token ≈ **4 characters** or **¾ of a word** in English
- Code and non-English text tend to tokenise less efficiently (more tokens per word)
- Both **input (prompt)** and **output (completion)** tokens are billed

### Token Cost Reference (approximate, 2024–2025)

| Model | Input ($/1M tokens) | Output ($/1M tokens) |
|-------|--------------------|--------------------|
| GPT-4o | $2.50 | $10.00 |
| GPT-4o mini | $0.15 | $0.60 |
| Claude 3.5 Sonnet | $3.00 | $15.00 |
| Claude 3 Haiku | $0.25 | $1.25 |
| Gemini 1.5 Pro | $1.25 | $5.00 |
| Llama 3.1 70B (self-hosted) | infra cost | infra cost |

::: tip Cost estimation
`estimated_cost = (input_tokens + output_tokens) / 1_000_000 * price_per_million`
A typical RAG query: ~500 input tokens + ~300 output tokens ≈ $0.002 on GPT-4o mini.
:::

---

## Context Window

The **context window** is the maximum number of tokens a model can process in a single API call — the sum of your prompt (system + user messages + retrieved docs) and the model's response.

| Model | Context Window |
|-------|---------------|
| GPT-4o | 128,000 tokens (~96,000 words) |
| Claude 3.5 Sonnet | 200,000 tokens (~150,000 words) |
| Gemini 1.5 Pro | 1,000,000 tokens |
| Llama 3.1 8B | 128,000 tokens |
| GPT-3.5 Turbo | 16,385 tokens |

**Practical limits:** Even with large windows, cost and latency grow with context. Models also exhibit a "lost in the middle" phenomenon — they attend better to the beginning and end of long contexts.

---

## Temperature, Top-p, and Top-k

These **sampling parameters** control how deterministic or creative the model's output is.

### Temperature

Controls the sharpness of the probability distribution over next tokens.

```
Low temp (0.0–0.3)  →  Deterministic, predictable, "safe"
Mid temp (0.5–0.8)  →  Balanced
High temp (1.0–2.0) →  Creative, variable, sometimes incoherent
```

- Use **low temperature** for code generation, data extraction, classification
- Use **mid temperature** for summaries, Q&A
- Use **high temperature** for creative writing, brainstorming

### Top-p (Nucleus Sampling)

Instead of sampling from all tokens, sample only from the smallest set of tokens whose cumulative probability ≥ p.

- `top_p = 0.9` → sample from top 90% of probability mass
- Works in combination with temperature

### Top-k

Restrict sampling to the top-k most probable tokens.

- `top_k = 40` → only consider 40 candidate tokens at each step
- Less commonly exposed in APIs than top-p

::: tip Practical default
For most production tasks: `temperature=0.2, top_p=0.9`. For code: `temperature=0`.
:::

---

## Embeddings

An **embedding** is a dense vector of floating-point numbers that represents the semantic meaning of text. Similar meanings → similar vectors → small cosine distance.

```
"dog"   → [0.21, -0.14, 0.83, ...]  (1536 dimensions for text-embedding-3-small)
"puppy" → [0.22, -0.13, 0.81, ...]  ← very close
"SQL"   → [-0.43, 0.67, -0.12, ...] ← far away
```

**Use cases:**
- Semantic search (find docs similar to a query)
- RAG pipelines (retrieve relevant chunks)
- Classification, clustering, recommendation

**Common embedding models:**

| Model | Dimensions | Notes |
|-------|-----------|-------|
| `text-embedding-3-small` (OpenAI) | 1536 | Good quality/cost balance |
| `text-embedding-3-large` (OpenAI) | 3072 | Best OpenAI quality |
| `embed-english-v3.0` (Cohere) | 1024 | Strong for English |
| `nomic-embed-text` (open) | 768 | Self-hostable via Ollama |
| `all-MiniLM-L6-v2` (HuggingFace) | 384 | Lightweight, CPU-friendly |

---

## Model Families

### GPT-4o (OpenAI)
- **Strengths:** Code, reasoning, tool use, multimodal (vision + audio)
- **Context:** 128K tokens
- **Cost tier:** Medium-high
- **Best for:** Complex reasoning, production assistants

### Claude 3.x (Anthropic)
- **Strengths:** Long documents, safety, instruction following, nuanced writing
- **Context:** Up to 200K tokens
- **Cost tier:** Medium-high (Haiku is cheap)
- **Best for:** Document analysis, careful reasoning, enterprise use

### Gemini 1.5 (Google)
- **Strengths:** Massive context (1M), multimodal, Google ecosystem integration
- **Context:** 1M tokens
- **Cost tier:** Medium
- **Best for:** Processing entire codebases, long documents

### Llama 3.x (Meta, open source)
- **Strengths:** Open weights, self-hostable, no data leaves your infra
- **Context:** 128K (8B/70B/405B sizes)
- **Cost tier:** Infra cost only
- **Best for:** Private data, cost-sensitive scale, customisation via fine-tuning

---

## Raw API Request Structure

All major LLM APIs follow a similar structure (OpenAI-compatible):

```json
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer sk-...

{
  "model": "gpt-4o",
  "temperature": 0.2,
  "max_tokens": 512,
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful Java expert. Respond concisely."
    },
    {
      "role": "user",
      "content": "Explain the difference between HashMap and TreeMap."
    }
  ]
}
```

**Response:**
```json
{
  "id": "chatcmpl-abc123",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": "HashMap provides O(1) average-case get/put using hashing..."
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 38,
    "completion_tokens": 87,
    "total_tokens": 125
  }
}
```

**Key fields:**
- `messages` — conversation history (system, user, assistant turns)
- `temperature` — sampling randomness
- `max_tokens` — hard cap on output length
- `finish_reason` — `stop` (complete), `length` (truncated), `tool_calls`

---

## Capabilities & Limits

### What LLMs Are Good At
- Text generation, summarisation, translation
- Code completion and explanation
- Question answering over provided context
- Structured data extraction (JSON, CSV from unstructured text)
- Reasoning chains for well-defined problems

### The Hallucination Problem

LLMs generate statistically plausible text — they don't retrieve facts from a database. They can **confidently state incorrect information** (hallucinations).

Mitigations:
1. **RAG** — provide source documents; ask the model to cite them
2. **Low temperature** — reduces creative deviation
3. **Verification step** — have a second call check the first
4. **Grounding prompts** — "Only answer from the provided context. If unsure, say I don't know."

### Knowledge Cutoff

Models have a training data cutoff date. They don't know about events after that date unless you provide context. This is the primary motivation for **RAG** (see the [RAG page](/ai/rag)).

### Context Window Limits

You cannot process arbitrarily long documents in one call. Solutions:
- Chunk documents → embed → retrieve relevant chunks (RAG)
- Map-reduce summarisation for very long docs

---

## Spring AI: ChatClient

Spring AI provides a unified abstraction over LLM providers.

**Dependency (`pom.xml`):**
```xml
<!-- OpenAI starter -->
<dependency>
  <groupId>org.springframework.ai</groupId>
  <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
</dependency>
```

**Configuration (`application.yml`):**
```yaml
spring:
  ai:
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o
          temperature: 0.2
```

**Basic usage:**
```java
@Service
public class AssistantService {

    private final ChatClient chatClient;

    public AssistantService(ChatClient.Builder builder) {
        this.chatClient = builder
            .defaultSystem("You are a helpful Java expert.")
            .build();
    }

    public String ask(String question) {
        return chatClient.prompt()
            .user(question)
            .call()
            .content();
    }
}
```

---

## Quiz

→ [Test your LLM Fundamentals knowledge](/quizzes/mixed-review)
