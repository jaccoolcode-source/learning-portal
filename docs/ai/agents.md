# AI Agents

An AI agent is an LLM placed in a loop: it **perceives** context, **decides** on an action, **executes** a tool, **observes** the result, and repeats until done. This unlocks multi-step automation that a single prompt call cannot achieve.

---

## The Agent Loop

```
┌────────────────────────────────────────────┐
│                                            │
│   ┌────────────┐                           │
│   │  PERCEIVE  │  ← System prompt + history│
│   └─────┬──────┘    + tool definitions    │
│         │                                  │
│         ▼                                  │
│   ┌────────────┐                           │
│   │   DECIDE   │  ← LLM reasons, picks     │
│   └─────┬──────┘    action or final answer│
│         │                                  │
│    [tool call?]                            │
│    yes ─┤─ no → return final answer        │
│         │                                  │
│         ▼                                  │
│   ┌────────────┐                           │
│   │    ACT     │  ← Execute tool function  │
│   └─────┬──────┘                           │
│         │                                  │
│         ▼                                  │
│   ┌────────────┐                           │
│   │  OBSERVE   │  ← Append tool result     │
│   └─────┬──────┘    to conversation       │
│         │                                  │
│         └──────────────────────────────────┘
│                     (loop)                 │
└────────────────────────────────────────────┘
```

---

## ReAct Pattern

**ReAct** (Reason + Act) structures the agent loop as interleaved thought/action/observation traces. This improves reasoning quality and makes agent behaviour interpretable.

```
System: You are a research assistant with access to web_search and summarise tools.
        Use Thought/Action/Observation format.

User: What are the new features in Spring Boot 3.3?

Thought: I need to search for Spring Boot 3.3 release notes.
Action: web_search("Spring Boot 3.3 new features release notes")
Observation: Spring Boot 3.3 includes CDS support, improved Docker image creation,
             Testcontainers at development time, and new @Fallback annotation...

Thought: I have enough information to summarise the key features.
Action: summarise("Spring Boot 3.3 includes: CDS support for faster startup...")
Observation: Summary: Spring Boot 3.3 improves startup time via CDS, enhances
             container support, and adds @Fallback for bean resolution.

Thought: I have a complete, summarised answer.
Answer: Spring Boot 3.3 introduces three major improvements: (1) CDS support
        for faster JVM startup times, (2) enhanced Docker/Testcontainers integration
        for development, and (3) the new @Fallback annotation for bean resolution.
```

---

## Tool / Function Calling

Tools are the interface between the LLM and the external world. The model emits a structured JSON object describing which function to call with which arguments.

### Tool Definition (OpenAI format)

```json
{
  "tools": [{
    "type": "function",
    "function": {
      "name": "search_java_docs",
      "description": "Search the Java API documentation for a class or method",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {
            "type": "string",
            "description": "The class name or method to search for"
          },
          "version": {
            "type": "string",
            "enum": ["17", "21"],
            "description": "Java version to search in"
          }
        },
        "required": ["query"]
      }
    }
  }]
}
```

### Tool Call Response

When the model decides to use a tool, it returns:

```json
{
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "search_java_docs",
          "arguments": "{\"query\": \"CompletableFuture\", \"version\": \"21\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

You then execute the function, append the result as a `tool` message, and call the API again.

---

## Spring AI: @Tool Annotation

Spring AI makes tool definition declarative with the `@Tool` annotation.

### Defining Tools

```java
@Component
public class JavaDocTools {

    @Tool(description = "Search the Java API documentation for a class or method")
    public String searchJavaDocs(
            @ToolParam(description = "Class or method name to search for") String query,
            @ToolParam(description = "Java version: 17 or 21", required = false) String version) {

        String javaVersion = version != null ? version : "21";
        // Implementation: call javadoc API or search index
        return javaDocSearchService.search(query, javaVersion);
    }

    @Tool(description = "Get the current date and time in ISO-8601 format")
    public String getCurrentDateTime() {
        return LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME);
    }

    @Tool(description = "Execute a simple Java expression and return the result")
    public String evaluateExpression(
            @ToolParam(description = "Valid Java expression to evaluate") String expression) {
        // Use a safe evaluator (e.g., mvel, javaparser)
        return safeEvaluator.evaluate(expression);
    }
}
```

### Wiring Tools into ChatClient

```java
@Service
public class JavaAssistantAgent {

    private final ChatClient chatClient;

    public JavaAssistantAgent(ChatClient.Builder builder,
                               JavaDocTools javaDocTools) {
        this.chatClient = builder
            .defaultSystem("""
                You are a Java expert assistant. Use the available tools to look up
                accurate documentation and evaluate expressions when needed.
                Always cite the source of information from tool results.
                """)
            .defaultTools(javaDocTools)  // registers all @Tool methods
            .build();
    }

    public String chat(String userMessage) {
        return chatClient.prompt()
            .user(userMessage)
            .call()
            .content();
    }
}
```

### Per-Request Tools

```java
public String researchTopic(String topic, WebSearchTool webSearch) {
    return chatClient.prompt()
        .user("Research this topic and provide a comprehensive summary: " + topic)
        .tools(webSearch)   // add tools for just this call
        .call()
        .content();
}
```

---

## Memory Types

| Type | Where Stored | Scope | Use Case |
|------|-------------|-------|---------|
| **In-context (window)** | LLM context | Single session | Conversation history |
| **Summary memory** | Context (compressed) | Session | Long conversations |
| **External (vector)** | Vector DB | Persistent | User profiles, past sessions |
| **External (relational)** | SQL DB | Persistent | Structured facts, preferences |
| **Working memory** | Context (structured) | Task | Agent scratchpad / state |

### In-Context Memory with Spring AI

```java
@Service
public class ConversationalAgent {

    private final ChatClient chatClient;

    // Per-session message history
    private final Map<String, List<Message>> sessions = new ConcurrentHashMap<>();

    public ConversationalAgent(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }

    public String chat(String sessionId, String userMessage) {
        List<Message> history = sessions.computeIfAbsent(
            sessionId, k -> new ArrayList<>()
        );

        // Add user message to history
        history.add(new UserMessage(userMessage));

        String response = chatClient.prompt()
            .messages(history)
            .call()
            .content();

        // Add assistant response to history
        history.add(new AssistantMessage(response));

        // Trim history to prevent context overflow (keep last 20 messages)
        if (history.size() > 20) {
            history.subList(0, history.size() - 20).clear();
        }

        return response;
    }
}
```

### External Memory (Vector-based)

```java
@Service
public class MemoryEnrichedAgent {

    private final ChatClient chatClient;
    private final VectorStore memoryStore;

    public String chat(String userId, String userMessage) {
        // 1. Retrieve relevant memories for this user
        List<Document> memories = memoryStore.similaritySearch(
            SearchRequest.query(userMessage)
                .withFilterExpression("user_id == '" + userId + "'")
                .withTopK(3)
        );

        String memoryContext = memories.stream()
            .map(Document::getContent)
            .collect(Collectors.joining("\n"));

        // 2. Answer with memory context
        String response = chatClient.prompt()
            .system("You are a personalised assistant. Relevant past context:\n" + memoryContext)
            .user(userMessage)
            .call()
            .content();

        // 3. Store this interaction as a new memory
        Document memory = new Document(
            "User " + userId + " asked: " + userMessage + "\nAnswer: " + response,
            Map.of("user_id", userId, "timestamp", Instant.now().toString())
        );
        memoryStore.add(List.of(memory));

        return response;
    }
}
```

---

## Multi-Agent Patterns

### Orchestrator-Worker

```
┌─────────────────────┐
│   Orchestrator LLM  │  Plans tasks, assigns to workers
└──────────┬──────────┘
           │
    ┌──────┼──────┐
    ▼      ▼      ▼
 Worker  Worker  Worker    Each specialised for one task
 (Search)(Write)(Review)
```

```java
@Service
public class ResearchOrchestrator {

    private final ChatClient orchestrator;
    private final SearchAgent searchAgent;
    private final SummaryAgent summaryAgent;
    private final WriterAgent writerAgent;

    public String research(String topic) {
        // Step 1: Orchestrator creates a plan
        String plan = orchestrator.prompt()
            .user("Create a 3-step research plan for: " + topic)
            .call().content();

        // Step 2: Execute each step with specialist agents
        String searchResults = searchAgent.search(topic);
        String summary = summaryAgent.summarise(searchResults);
        String report = writerAgent.writeReport(topic, summary);

        return report;
    }
}
```

---

## Spring AI Advisors vs LangChain4j

| Feature | Spring AI Advisors | LangChain4j |
|---------|-------------------|-------------|
| **Language** | Java / Spring Boot | Java (standalone) |
| **Tool definition** | `@Tool` annotation | `@Tool` annotation (similar) |
| **Memory** | Via Advisors, custom | `ChatMemory` interface |
| **RAG** | `QuestionAnswerAdvisor` | `ContentRetriever` |
| **Agent loop** | Manual or `AiServices` | `AiServices` interface |
| **Observability** | Micrometer integration | Manual |
| **Spring integration** | Native | Requires wiring |
| **Model support** | OpenAI, Anthropic, Ollama, Azure, GCP | OpenAI, Anthropic, Ollama, many more |

**When to choose:**
- **Spring AI** — you're in a Spring Boot ecosystem and want native integration
- **LangChain4j** — you need a broader model ecosystem or framework-agnostic code

---

## Example Project: Research Agent

A complete research agent that uses three tools: web search, page scraping, and report writing.

### Tools

```java
@Component
public class ResearchTools {

    private final WebSearchClient searchClient;
    private final HttpClient httpClient;

    @Tool(description = "Search the web for information on a topic. Returns top 5 results with titles and snippets.")
    public String webSearch(
            @ToolParam(description = "Search query") String query) {
        List<SearchResult> results = searchClient.search(query, 5);
        return results.stream()
            .map(r -> "Title: " + r.title() + "\nURL: " + r.url() + "\nSnippet: " + r.snippet())
            .collect(Collectors.joining("\n\n"));
    }

    @Tool(description = "Fetch and extract the main text content from a web page URL.")
    public String fetchPageContent(
            @ToolParam(description = "Full URL of the page to fetch") String url) {
        try {
            String html = httpClient.get(url);
            return extractTextFromHtml(html); // Use Jsoup or similar
        } catch (Exception e) {
            return "Error fetching page: " + e.getMessage();
        }
    }

    @Tool(description = "Save the research report to a file.")
    public String saveReport(
            @ToolParam(description = "Report content in markdown format") String content,
            @ToolParam(description = "Filename without extension") String filename) {
        Path filePath = Path.of("reports", filename + ".md");
        try {
            Files.writeString(filePath, content);
            return "Report saved to " + filePath;
        } catch (IOException e) {
            return "Error saving report: " + e.getMessage();
        }
    }
}
```

### Agent Configuration

```java
@Service
public class ResearchAgent {

    private final ChatClient chatClient;

    public ResearchAgent(ChatClient.Builder builder, ResearchTools tools) {
        this.chatClient = builder
            .defaultSystem("""
                You are a research agent. When given a topic:
                1. Search the web for relevant information
                2. Fetch and read 2-3 of the most relevant pages
                3. Synthesise the information into a structured markdown report
                4. Save the report using the saveReport tool

                Be thorough, cite sources, and clearly distinguish facts from analysis.
                Use the ReAct format: Thought → Action → Observation → repeat.
                """)
            .defaultTools(tools)
            .defaultOptions(OpenAiChatOptions.builder()
                .withModel("gpt-4o")
                .withTemperature(0.3)
                .withMaxTokens(4096)
                .build())
            .build();
    }

    public String research(String topic) {
        return chatClient.prompt()
            .user("Research the following topic and produce a comprehensive report: " + topic)
            .call()
            .content();
    }
}
```

### Usage

```java
@RestController
@RequestMapping("/api/research")
public class ResearchController {

    private final ResearchAgent agent;

    @PostMapping
    public ResponseEntity<String> research(@RequestBody ResearchRequest request) {
        String report = agent.research(request.topic());
        return ResponseEntity.ok(report);
    }
}
```

---

## Quiz

→ [Test your AI Agents knowledge](/quizzes/mixed-review)
