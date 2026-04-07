# Claude API Deep Dive

<DifficultyBadge level="intermediate" />

Claude is Anthropic's family of AI models. This page covers the full API surface — from your first `curl` to advanced features like tool use, vision, and extended thinking.

---

## Why Claude?

Claude's standout strengths compared to other frontier models:

| Feature | Claude 3.5 Sonnet | Claude 3.7 Sonnet | Claude Haiku 3.5 |
|---------|------------------|------------------|-----------------|
| **Context window** | 200K tokens | 200K tokens | 200K tokens |
| **Vision** | Yes | Yes | Yes |
| **Tool use** | Yes | Yes | Yes |
| **Extended thinking** | No | Yes | No |
| **Input cost (1M tokens)** | $3 | $3 | $0.80 |
| **Output cost (1M tokens)** | $15 | $15 | $4 |
| **Best for** | General tasks | Complex reasoning | Fast, cheap tasks |

::: tip Use pinned model versions
Always pin to a specific version like `claude-3-5-sonnet-20241022`, not `claude-3-5-sonnet`. Anthropic updates the alias, which can change your application's behavior silently.
:::

---

## Authentication & First Call

### Get your API key

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Go to **API Keys** → **Create Key**
3. Store it safely — it's shown only once

::: warning Never commit API keys
Add your key to `.env` and add `.env` to `.gitignore`. Use environment variables in production, never hardcoded strings.
:::

### First call with curl

```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 256,
    "messages": [
      {"role": "user", "content": "What is RAG in one sentence?"}
    ]
  }'
```

### Python SDK

```bash
pip install anthropic
```

```python
import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from env

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=256,
    messages=[
        {"role": "user", "content": "What is RAG in one sentence?"}
    ]
)

print(message.content[0].text)
```

---

## The Messages API

The Messages API is Claude's core interface. Every interaction is a list of **messages** alternating between `user` and `assistant` roles.

### Request structure

```python
client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=1024,
    system="You are a helpful home inventory assistant.",  # ← top-level, not a message
    messages=[
        {"role": "user",      "content": "Where did I put the red USB cable?"},
        {"role": "assistant", "content": "Based on your inventory, it was last seen in the home office drawer."},
        {"role": "user",      "content": "Are you sure? I checked there."},
    ]
)
```

Key points:
- **`system`** is a top-level parameter, not a message with role `system`
- Messages must alternate user/assistant (start with `user`)
- **`max_tokens`** is required — it caps the output length

### Response structure

```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    {"type": "text", "text": "Let me check your storage records..."}
  ],
  "model": "claude-3-5-sonnet-20241022",
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 52, "output_tokens": 18}
}
```

**`stop_reason` values:**
- `end_turn` — Claude finished naturally
- `max_tokens` — hit the `max_tokens` limit (truncated)
- `tool_use` — Claude wants to call a tool (see Tool Use section)
- `stop_sequence` — hit a custom stop sequence

---

## Streaming

Streaming delivers text incrementally, improving perceived latency in chat interfaces.

```python
with client.messages.stream(
    model="claude-3-5-sonnet-20241022",
    max_tokens=512,
    messages=[{"role": "user", "content": "List 5 household storage tips."}]
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)
```

### SSE event types (low-level)

When using raw HTTP streaming, you receive Server-Sent Events:

| Event | Meaning |
|-------|---------|
| `message_start` | Response metadata (model, id) |
| `content_block_start` | New content block beginning |
| `content_block_delta` | Incremental text chunk |
| `content_block_stop` | Content block complete |
| `message_delta` | Stop reason, token counts |
| `message_stop` | Stream complete |

---

## Vision

Claude can analyze images — useful for OCR, UI screenshots, diagrams, and the [Home Storage Project](/ai/home-storage-project) where items are identified from photos.

### Image from URL

```python
message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=256,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "url",
                        "url": "https://example.com/storage-shelf.jpg"
                    }
                },
                {
                    "type": "text",
                    "text": "List all visible items on this shelf for a home inventory."
                }
            ]
        }
    ]
)
```

### Image from file (base64)

```python
import base64

with open("shelf.jpg", "rb") as f:
    image_data = base64.standard_b64encode(f.read()).decode("utf-8")

message = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=256,
    messages=[
        {
            "role": "user",
            "content": [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": "image/jpeg",
                        "data": image_data
                    }
                },
                {"type": "text", "text": "Describe this item for home inventory."}
            ]
        }
    ]
)
```

**Supported formats:** JPEG, PNG, GIF, WebP  
**Image token cost:** roughly `(width × height) / 750` tokens

---

## Tool Use (Function Calling)

Tool use lets Claude call functions you define. This is the foundation of AI agents — Claude decides *when* and *with what arguments* to invoke a tool, but your code actually executes it.

### Step 1: Define tools

```python
tools = [
    {
        "name": "find_item",
        "description": "Search the home inventory database for an item by name or description.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "The item to search for, e.g. 'red USB cable' or 'ski boots'"
                },
                "location": {
                    "type": "string",
                    "description": "Optional location filter: floor or room name"
                }
            },
            "required": ["query"]
        }
    }
]
```

### Step 2: Claude decides to call the tool

```python
response = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=256,
    tools=tools,
    messages=[{"role": "user", "content": "Where are my ski boots?"}]
)

print(response.stop_reason)  # "tool_use"
print(response.content)
# [ToolUseBlock(type='tool_use', id='toolu_01...', name='find_item',
#               input={'query': 'ski boots'})]
```

### Step 3: Execute the tool and return the result

```python
# Your code runs the actual lookup
tool_result = {"location": "Basement, shelf B3", "last_seen": "2024-12-01"}

# Continue the conversation with the tool result
response2 = client.messages.create(
    model="claude-3-5-sonnet-20241022",
    max_tokens=256,
    tools=tools,
    messages=[
        {"role": "user", "content": "Where are my ski boots?"},
        {"role": "assistant", "content": response.content},  # includes the tool_use block
        {
            "role": "user",
            "content": [
                {
                    "type": "tool_result",
                    "tool_use_id": response.content[0].id,
                    "content": str(tool_result)
                }
            ]
        }
    ]
)

print(response2.content[0].text)
# "Your ski boots are in the Basement on shelf B3."
```

The full loop: **user question → Claude decides to call tool → you execute → Claude uses result → final answer**.

---

## Extended Thinking

Extended thinking gives Claude extra "scratchpad" space to reason step-by-step before answering. Use it for complex reasoning, math, planning, or multi-constraint problems.

```python
response = client.messages.create(
    model="claude-3-7-sonnet-20250219",  # requires 3.7+
    max_tokens=8000,
    thinking={
        "type": "enabled",
        "budget_tokens": 5000  # tokens Claude can use for internal reasoning
    },
    messages=[
        {
            "role": "user",
            "content": "I have 200 items across 3 floors and 12 rooms. Design an optimal storage categorization system."
        }
    ]
)

for block in response.content:
    if block.type == "thinking":
        print("=== THINKING ===")
        print(block.thinking)  # Claude's reasoning scratchpad
    elif block.type == "text":
        print("=== ANSWER ===")
        print(block.text)
```

::: info When to use extended thinking
Extended thinking is useful for: multi-step planning, complex analysis, tasks requiring the model to consider many constraints simultaneously. It adds latency and cost (thinking tokens are billed). For straightforward Q&A, skip it.
:::

---

## Model Selection Guide

| Use Case | Model | Reason |
|----------|-------|--------|
| Classification, extraction | `claude-haiku-3-5-20241022` | Fast, cheap, accurate enough |
| General chat, coding, RAG | `claude-3-5-sonnet-20241022` | Best balance quality/cost |
| Long document analysis | `claude-3-5-sonnet-20241022` | 200K context |
| Complex reasoning, planning | `claude-3-7-sonnet-20250219` | Extended thinking support |
| Vision (production quality) | `claude-3-5-sonnet-20241022` | Better than local llava |
| High-stakes decisions | `claude-opus-4-5-20251101` | Highest quality available |

---

## Error Handling

### Retry on 529 / 429

```python
import time
import anthropic

def call_with_retry(client, **kwargs, max_retries=3):
    for attempt in range(max_retries):
        try:
            return client.messages.create(**kwargs)
        except anthropic.RateLimitError as e:
            wait = 2 ** attempt  # exponential backoff
            print(f"Rate limited. Waiting {wait}s...")
            time.sleep(wait)
        except anthropic.APIStatusError as e:
            if e.status_code == 529:  # overloaded
                time.sleep(5)
            else:
                raise
    raise RuntimeError("Max retries exceeded")
```

### Common error shapes

| Status | Type | Meaning |
|--------|------|---------|
| 400 | `invalid_request_error` | Malformed request (check your JSON) |
| 401 | `authentication_error` | Wrong or missing API key |
| 403 | `permission_error` | Model not available on your plan |
| 429 | `rate_limit_error` | Too many requests — back off |
| 529 | `overloaded_error` | High server load — retry |

---

## Claude vs Local Ollama

| | Claude API | Ollama (local) |
|--|-----------|---------------|
| **Quality** | Frontier | Good (7B–70B) |
| **Cost** | ~$3–15 / 1M tokens | Free |
| **Privacy** | Sent to Anthropic | 100% local |
| **Offline** | No | Yes |
| **Vision quality** | Excellent | Acceptable (llava) |
| **Tool use reliability** | Very high | Model-dependent |
| **Context window** | 200K | 4K–128K |
| **Extended thinking** | Yes (3.7+) | No |

For local LLM setup and Docker configuration, see [Local LLMs with Ollama](/ai/local-llms-setup).

<RelatedTopics :topics="['/ai/local-llms-setup', '/ai/claude-code-features', '/ai/agents']" />
