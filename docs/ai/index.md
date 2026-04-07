# AI & LLMs for Developers

This section covers the fundamentals of large language models, practical prompt engineering, retrieval-augmented generation (RAG), AI agents, and the Model Context Protocol — plus hands-on tutorials using **Claude Code**, **Ollama** (free local LLMs), **n8n**, and **pgVector**. Everything runs on your laptop via Docker Desktop — no cloud account required for the core exercises.

## Why Developers Need This

- **LLMs are infrastructure** — like databases or message queues, they're becoming a standard component in production systems.
- **RAG** solves the knowledge cutoff problem and grounds responses in your own data.
- **Agents** automate multi-step workflows by letting models call tools and iterate.
- **MCP** is an open standard for connecting AI models to external tools and data sources.
- **Claude Code** is an agentic CLI that reads your codebase, runs commands, and spawns subagents — understanding its hooks, skills, and MCP integrations makes you dramatically more productive.
- **Local LLMs via Ollama** let you develop AI features with zero API cost and full privacy — essential for iterating quickly without burning through credits.

---

## Section Map

| Page | What You'll Learn | Level |
|------|-------------------|-------|
| [LLM Fundamentals](/ai/llm-fundamentals) | Transformers, tokens, context windows, embeddings, model families | Beginner |
| [Prompt Engineering](/ai/prompt-engineering) | Roles, zero/few-shot, CoT, JSON mode, injection hardening | Beginner |
| [RAG & Vector Search](/ai/rag) | RAG pipeline, chunking, pgvector, hybrid search, evaluation | Intermediate |
| [AI Agents](/ai/agents) | ReAct loop, tool calling, memory types, multi-agent patterns | Intermediate |
| [MCP Protocol](/ai/mcp) | M×N problem, host/client/server, Tools/Resources/Prompts, stdio/SSE | Intermediate |
| [Agent Frameworks](/ai/agent-frameworks) | OpenAI Agents SDK, Agno, LangChain+LangGraph — comparison, decision tree | Intermediate |
| [Thinking Models](/ai/thinking-models) | Claude, o1–o4-mini, Gemini 2.5, DeepSeek-R1 — extended reasoning mode | Intermediate |
| [AI Workflows (n8n)](/ai/ai-workflows) | n8n, Flowise, Dify, LangFlow — visual AI automation | Beginner |
| [Local LLMs (Ollama)](/ai/local-llms-setup) | Docker setup, model management, REST API, GPU acceleration | Beginner |
| [Claude API](/ai/claude-api) | Messages API, streaming, vision, tool use, extended thinking | Intermediate |
| [Claude Code](/ai/claude-code-features) | Skills, Subagents, Hooks, MCP integration, CLAUDE.md | Intermediate |
| [RAG Hands-On (n8n)](/ai/n8n-rag-hands-on) | Build RAG from scratch: n8n + pgVector + Ollama + webhook | Intermediate |
| [Home Storage App](/ai/home-storage-project) | Full capstone: Docker → pgVector → n8n vision ingestion → GUI | Advanced |

---

## Learning Tracks

::: info Track 1 — AI Theory Foundation
Build your mental model of how AI systems work.

**LLM Fundamentals** → **Prompt Engineering** → **RAG & Vector Search** → **AI Agents** → **MCP Protocol** → **Agent Frameworks** → **Thinking Models** → **AI Workflows**
:::

::: info Track 2 — Practical Tools & Claude (start here or in parallel with Track 1)
Build and integrate AI locally — no cloud required for the core exercises.

**Local LLMs (Ollama)** → **Claude API** → **Claude Code** → **RAG Hands-On (n8n)** → **Kafka & Event Streaming**
:::

::: tip Track 3 — Capstone Project (requires Track 2)
Apply everything in one real application — a home inventory system with vision AI.

**Home Storage App** — Docker stack → pgVector schema → n8n vision ingestion → semantic search → HTML GUI
:::

---

## Key Concepts Glossary

| Term | Definition |
|------|-----------|
| **LLM** | Large Language Model — a neural network trained on text to predict/generate language |
| **Token** | Subword unit of text; ~4 chars / ~0.75 words in English. Pricing is per-token. |
| **Context window** | Maximum tokens (input + output) a model can process in one call |
| **Embedding** | Dense numerical vector representing semantic meaning of text |
| **RAG** | Retrieval-Augmented Generation — augment prompts with retrieved relevant context |
| **Vector DB** | Database optimised for similarity search over embedding vectors |
| **Agent** | LLM in a loop: perceives context, decides actions, executes tools, observes results |
| **Tool calling** | Structured mechanism for LLMs to invoke external functions |
| **MCP** | Model Context Protocol — open standard for AI↔tool integration |
| **AI Workflow** | Visual graph of tasks connecting triggers, LLMs, APIs, and databases — without code |
| **n8n** | Open-source automation platform with built-in AI nodes (self-hostable) |
| **Ollama** | Local LLM runtime exposing an OpenAI-compatible REST API; runs models on CPU or GPU |
| **GGUF** | Binary format for quantized LLM weights; used by Ollama and llama.cpp |
| **Claude Code** | Anthropic's agentic terminal CLI; reads/edits files, runs commands, spawns subagents |
| **Skill** | Custom slash command in Claude Code defined as a Markdown file in `.claude/commands/` |
| **Hook** | Shell command triggered by Claude Code events (PreToolUse, PostToolUse, Stop) |
| **Subagent** | Claude instance spawned by an orchestrator to handle an isolated subtask in parallel |
| **pgVector** | PostgreSQL extension adding a `vector` data type and ANN index operators (`<=>`) |
| **llava** | Multimodal LLM capable of processing both text and images; used for vision tasks |
| **Prompt injection** | Attack where untrusted input overrides intended instructions |
| **Temperature** | Sampling randomness parameter (0 = deterministic, 2 = very random) |
| **Hallucination** | Model generates plausible-sounding but factually incorrect content |

---

## Prerequisites

- **Docker Desktop** installed and running (Windows, macOS, or Linux)
- **8 GB RAM** free (16 GB recommended if running the `llava:7b` vision model)
- An API key for at least one LLM provider (Anthropic, OpenAI) — optional; Ollama is free and local
- Claude Code CLI — optional; needed for the Claude Code track (`npm install -g @anthropic-ai/claude-code`)

::: details Java / Spring AI track
Some pages include Spring AI Java examples. For those you also need Java 17+ and Spring Boot 3.x. Add the Spring AI BOM to your `pom.xml`:
```xml
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.ai</groupId>
      <artifactId>spring-ai-bom</artifactId>
      <version>1.0.0</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```
:::
