# Agent Frameworks — OpenAI Agents SDK, Agno, LangChain

Frameworki agentowe abstrahują pętlę LLM → narzędzie → obserwacja i dostarczają gotowe elementy: pamięć, orkiestrację wieloagentową, integracje z providerami. Poniżej omówienie trzech najpopularniejszych frameworków (Python), ze wskazówkami dla Java developerów.

::: info Dla Java developerów
Wszystkie trzy frameworki są **wyłącznie Python**. W projektach Java/Spring użyj **Spring AI** lub **LangChain4j** — omówionych w [AI Agents](/ai/agents). Ta strona daje ci wiedzę koncepcyjną, by rozumieć ekosystem i rozmowy z backendowcami/data scientists.
:::

---

## OpenAI Agents SDK

Oficjalny Python SDK od OpenAI do budowania aplikacji agentowych. Wydany w 2025 roku, zastępuje eksperymentalną bibliotekę Swarm. Projektowany z filozofią **minimum boilerplate** — agent gotowy w ~5 linijkach.

### Kluczowe koncepty

| Koncept | Opis |
|---------|------|
| **Agent** | LLM + instrukcje + narzędzia + opcjonalne handoffy |
| **Runner** | Wykonuje pętlę agenta (`Runner.run()` sync lub async) |
| **Tool** | Funkcja Python z dekoratorem `@function_tool` — schemat inferowany automatycznie |
| **Handoff** | Agent przekazuje kontrolę innemu agentowi — główny prymityw multi-agent |
| **Guardrails** | Pipeline walidacji wejść/wyjść, może przerwać run |
| **Context** | Typowany obiekt przechodzący przez cały run bez zanieczyszczania rozmowy LLM |

### Przykład

```python
from agents import Agent, Runner, function_tool

@function_tool
def get_weather(city: str) -> str:
    """Get current weather for a city."""
    return f"Weather in {city}: 22°C, sunny"

agent = Agent(
    name="Weather Assistant",
    instructions="You help users check weather.",
    tools=[get_weather],
)

result = Runner.run_sync(agent, "What's the weather in Warsaw?")
print(result.final_output)
```

### Multi-agent przez Handoffs

```python
billing_agent = Agent(name="Billing", instructions="Handle billing questions.")
support_agent = Agent(name="Support", instructions="Handle support questions.")

triage_agent = Agent(
    name="Triage",
    instructions="Route to the right department.",
    handoffs=[billing_agent, support_agent],  # handoff jest first-class, nie tool
)
```

### Zalety i wady

| Zalety | Wady |
|--------|------|
| Najniższy próg wejścia ze wszystkich frameworków | Tylko Python |
| Oficjalny produkt OpenAI — kompatybilność gwarantowana | OpenAI-first; inne providery "pluggable", nie first-class |
| Handoffs first-class (czystsze niż delegacja przez toolcall) | Brak wbudowanej pamięci i vector store |
| Wbudowane tracing w dashboardzie OpenAI | Brak wsparcia dla grafów / DAG workflow |
| Streaming, Realtime API, voice pipeline | Nowe (2025) — API jeszcze stabilizowane |

---

## Agno (dawniej Phidata)

Framework z filozofią **batteries included** — dostarczony z dziesiątkami gotowych toolkitów, wbudowaną pamięcią trójpoziomową, bazami wiedzy i wsparciem dla 20+ providerów LLM. Przemianowany z Phidata na Agno na początku 2025.

### Kluczowe koncepty

| Koncept | Opis |
|---------|------|
| **Agent** | Centralny obiekt: model + tools + memory + knowledge + instructions + team |
| **Team** | Grupa agentów współpracujących (routing, koordynacja, równoległość) |
| **Toolkit** | Gotowa kolekcja narzędzi (DuckDuckGo, YFinance, GitHub, SQL, Slack…) |
| **Knowledge** | Abstrakcja nad vector storami (PDF, URL, CSV, JSON) |
| **Memory** | Trójpoziomowa: sesja → podsumowanie → długoterminowa (DB) |
| **Storage** | Persystuje historię runów do PostgreSQL, SQLite lub S3 |

### Przykład

```python
from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.yfinance import YFinanceTools

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    tools=[DuckDuckGoTools(), YFinanceTools()],
    instructions="You are a financial research assistant.",
    show_tool_calls=True,
    markdown=True,
)

agent.print_response("Analyze the latest news about Apple stock.")
```

### Wbudowana pamięć długoterminowa

```python
from agno.memory.db.postgres import PostgresMemoryDb
from agno.storage.postgres import PostgresStorage

agent = Agent(
    model=OpenAIChat(id="gpt-4o"),
    memory=AgentMemory(
        db=PostgresMemoryDb(table_name="agent_memory", db_url=db_url),
        create_user_memories=True,        # per-user long-term memory
        create_session_summary=True,      # automatic conversation summary
    ),
    storage=PostgresStorage(table_name="agent_sessions", db_url=db_url),
)
```

### Gotowe Toolkity (wybór)

```
DuckDuckGoTools   — web search
YFinanceTools     — stock data, company info
GithubTools       — repos, PRs, issues
SQLTools          — database queries
SlackTools        — Slack messages
EmailTools        — send emails
PythonTools       — execute Python code
ShellTools        — run shell commands
```

### Zalety i wady

| Zalety | Wady |
|--------|------|
| 100+ gotowych toolkitów — najszybszy start dla typowych use case'ów | Duża powierzchnia API do nauczenia się |
| Prawdziwy multi-provider (20+ LLMów z jednakowym API) | Mniejsza społeczność niż LangChain |
| Najlepsza wbudowana pamięć (3-tier: sesja + summary + long-term) | Rename Phidata→Agno spowodował chaos w starych tutorialach |
| Wbudowana baza wiedzy (PDF, URL, CSV w 5 linijkach) | Agno Cloud (monitoring) to płatny SaaS |
| Agent UI do lokalnego testowania | Złożone interakcje team↔team trudne do debugowania |
| Natywna obsługa multi-modal (obraz, audio, video) | Tylko Python |

---

## LangChain (+LangGraph)

Najbardziej rozpowszechniony framework Python (i JavaScript/TypeScript) do budowania aplikacji LLM. Startował jako biblioteka chain-of-prompts w 2022, dziś to pełny ekosystem. **LangGraph** (oddzielna paczka) obsługuje złożone, stanowe workflow w formie grafów.

### Kluczowe koncepty

| Koncept | Opis |
|---------|------|
| **LCEL** | LangChain Expression Language — operator `\|` do komponowania łańcuchów |
| **Chain** | Sekwencja operacji: prompt → model → output parser |
| **Runnable** | Uniwersalny interfejs — wszystko można zecompose przez `\|` |
| **Retriever** | Abstrakcja nad vector storami do RAG |
| **LangGraph** | Silnik grafów: węzły = kroki agenta, krawędzie = warunkowe przejścia |
| **LangSmith** | Platforma SaaS: observability, tracing, evaluation, datasety |

### LCEL — prosta chain

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatOpenAI(model="gpt-4o")

chain = (
    ChatPromptTemplate.from_template("Explain {topic} in simple terms.")
    | llm
    | StrOutputParser()
)

result = chain.invoke({"topic": "garbage collection in Java"})
```

### LangGraph — agent z cyklem

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

def should_continue(state):
    if state["messages"][-1].tool_calls:
        return "tools"
    return END

builder = StateGraph(AgentState)
builder.add_node("agent", call_model)
builder.add_node("tools", ToolNode(tools))
builder.add_conditional_edges("agent", should_continue)
builder.add_edge("tools", "agent")  # cycle: tools → agent → tools → ...

graph = builder.compile()
```

### Human-in-the-loop (unikalne dla LangGraph)

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# Agent zatrzymuje się i czeka na zatwierdzenie przez człowieka
graph = builder.compile(
    checkpointer=SqliteSaver.from_conn_string(":memory:"),
    interrupt_before=["tools"],   # pauza przed wykonaniem narzędzia
)

# Człowiek zatwierdza lub modyfikuje
graph.update_state(config, {"approved": True})
graph.stream(None, config)  # kontynuuj od miejsca pauzy
```

### Zalety i wady

| Zalety | Wady |
|--------|------|
| Największa społeczność — najwięcej tutoriali, przykładów, integracji | Stroma krzywa uczenia: Chains, LCEL, LangGraph to oddzielne koncepty |
| 500+ integracji (modele, vector stores, document loadery) | Historycznie notoryczne zmiany API — reputation "abstraction bloat" |
| LangGraph — najlepszy do złożonych, warunkowych, stanowych workflow | LangGraph wymaga myślenia w kategoriach grafów |
| LangSmith — najlepsza platforma observability/evaluation dla LLM | LangSmith to płatny SaaS |
| Human-in-the-loop z checkpointingiem | Overkill dla prostych zadań |
| Python **i** JavaScript/TypeScript | Skomplikowane dependency: langchain + langchain-community + langchain-core + langgraph |

---

## Porównanie frameworków

| Wymiar | OpenAI Agents SDK | Agno | LangChain + LangGraph |
|--------|:-----------------:|:----:|:---------------------:|
| **Język** | Python | Python | Python + JS/TS |
| **Łatwość użycia** | Doskonała | Dobra | Umiarkowana–Trudna |
| **Krzywa uczenia** | Niska | Średnia | Wysoka |
| **Multi-agent** | Handoffs (first-class) | Teams (route/coord/parallel) | LangGraph (najpotężniejszy) |
| **Pamięć / stan** | Brak (zrób sam) | Wbudowana 3-tier | Wiele strategii; LangGraph persistence |
| **Integracje toolów** | ~10 wbudowanych | 100+ gotowych toolkitów | 500+ przez langchain-community |
| **Providerzy LLM** | OpenAI-first, inne pluggable | 20+ równorzędnych | 50+ |
| **Baza wiedzy / RAG** | Brak wbudowanej | Wbudowana (PDF, URL, CSV) | Najlepsza (document loadery) |
| **Structured output** | Tak (Pydantic) | Tak (Pydantic) | Tak (LCEL + Pydantic) |
| **Streaming** | Tak | Tak | Tak (LCEL) |
| **Observability** | Dashboard OpenAI (auto) | Agno Cloud (SaaS) | LangSmith (najlepsza, płatna) |
| **Złożone workflow** | Ograniczone (linear/handoff) | Średnie (team patterns) | Doskonałe (LangGraph grafy/cykle) |
| **Human-in-the-loop** | Ograniczone | Ograniczone | Tak (LangGraph interrupts) |
| **Dojrzałość prod.** | Średnia (nowe 2025) | Średnia | Wysoka (od 2022) |
| **Wielkość społeczności** | Rosnąca (marka OpenAI) | Mała, rosnąca | Największa |
| **Multi-modal** | Tak (przez OpenAI) | Tak (natywny) | Tak (przez integracje) |
| **Voice pipeline** | Tak (Realtime API) | Częściowy | Ograniczony |

---

## Drzewo decyzyjne

```
Prosty agent, tylko modele OpenAI?
  → OpenAI Agents SDK

Potrzebujesz długoterminowej pamięci per-user
LUB 100+ gotowych toolów
LUB wsparcia dla wielu providerów?
  → Agno

Potrzebujesz złożonych warunkowych workflow
(cykle, gałęzie, human-in-the-loop)?
  → LangGraph (ekosystem LangChain)

Masz istniejącą bazę kodu LangChain
LUB potrzebujesz JS/TS?
  → LangChain

Projekt Java / Spring Boot?
  → Spring AI + LangChain4j
    (patrz strona AI Agents)
```

---

## Ekosystem narzędzi pomocniczych

| Narzędzie | Do czego służy | Framework |
|-----------|---------------|-----------|
| **LangSmith** | Tracing, eval, datasety, monitorowanie prod | LangChain |
| **LangFuse** | Open-source alternatywa dla LangSmith | Wszystkie |
| **OpenAI Trace** | Built-in tracing w dashboardzie OpenAI | OpenAI SDK |
| **Agno Cloud** | Deployment + monitoring agentów | Agno |
| **Agno Agent UI** | Lokalne UI do testowania agentów | Agno |
| **Phoenix (Arize)** | Observability + evaluation open-source | Wszystkie |
| **Weights & Biases** | ML tracking + LLM eval | Wszystkie |

---

::: tip Nauka frameworków
Najlepsze podejście: zacznij od **OpenAI Agents SDK** żeby pojąć pętlę agentową (perceive → decide → act). Następnie przejdź do **LangGraph** dla złożonych workflow — zrozumienie grafów agentowych to fundament całej dziedziny. Agno warto poznać, gdy potrzebujesz szybkiego prototypowania z gotowymi toolkitami.
:::

---

*Strony powiązane: [AI Agents](/ai/agents) — Spring AI / LangChain4j dla Java | [Thinking Models](/ai/thinking-models) — modele z rozumowaniem*