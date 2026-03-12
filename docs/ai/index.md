# AI & LLMs for Developers

Modern software engineers increasingly need to understand and work with AI systems. This section covers the fundamentals of large language models, practical prompt engineering, retrieval-augmented generation, AI agents, and the Model Context Protocol — with hands-on Spring AI Java examples throughout.

## Why Developers Need This

- **LLMs are infrastructure** — like databases or message queues, they're becoming a standard component in production systems.
- **Spring AI** brings first-class LLM integration to the Java/Spring ecosystem.
- **RAG** solves the knowledge cutoff problem and grounds responses in your own data.
- **Agents** automate multi-step workflows by letting models call tools and iterate.
- **MCP** is an open standard for connecting AI models to external tools and data sources.

---

## Section Map

| Page | What You'll Learn |
|------|-------------------|
| [LLM Fundamentals](/ai/llm-fundamentals) | Transformers, tokens, context windows, embeddings, model families, API structure |
| [Prompt Engineering](/ai/prompt-engineering) | Roles, zero/few-shot, CoT, JSON mode, Spring AI `PromptTemplate`, injection hardening |
| [RAG & Vector Search](/ai/rag) | RAG pipeline, chunking, pgvector, Spring AI `PgVectorStore`, hybrid search, evaluation |
| [AI Agents](/ai/agents) | ReAct loop, tool calling, Spring AI `@Tool`, memory types, multi-agent patterns |
| [MCP Protocol](/ai/mcp) | M×N problem, host/client/server, Tools/Resources/Prompts, stdio/SSE, Spring AI MCP server |

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
| **Spring AI** | Spring module providing abstractions for LLM providers, embeddings, vector stores |
| **Prompt injection** | Attack where untrusted input overrides intended instructions |
| **Temperature** | Sampling randomness parameter (0 = deterministic, 2 = very random) |
| **Hallucination** | Model generates plausible-sounding but factually incorrect content |

---

## Learning Path

```
LLM Fundamentals  →  Prompt Engineering  →  RAG & Vector Search
                                                      ↓
                                              AI Agents  →  MCP Protocol
```

For Spring AI projects, you'll typically use all five areas together:
1. Understand **fundamentals** to reason about model behaviour and costs
2. Write effective **prompts** using templates
3. Build **RAG pipelines** to ground responses in domain knowledge
4. Extend with **agents** and tools for multi-step automation
5. Expose capabilities via **MCP** for IDE/host integration

---

## Prerequisites

- Java 17+ and Spring Boot 3.x familiarity
- Docker (for pgvector examples)
- An API key for at least one LLM provider (OpenAI, Anthropic, or local Ollama)

::: tip Spring AI Version
Examples use **Spring AI 1.0.x** (GA). Add the BOM to your `pom.xml`:
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
