# Modele z Trybem Myślenia (Thinking / Reasoning Mode)

Thinking mode (zwany też extended thinking, reasoning mode lub chain-of-thought inference) powoduje, że model generuje **wewnętrzną ścieżkę rozumowania** przed podaniem finalnej odpowiedzi. Efekty:

- Znacząco wyższa dokładność na trudnych problemach (matematyka, logika, programowanie, planowanie wieloetapowe)
- Wyższy koszt obliczeniowy i dłuższy czas odpowiedzi
- Tokeny rozumowania są zazwyczaj **nie zwracane** do użytkownika (wyjątki: Anthropic, DeepSeek)

---

## Jak działa tryb myślenia

```
Użytkownik pyta: "Ile trójkątów w pentagonie?"
                          │
                          ▼
            ┌─────────────────────────────┐
            │    WEWNĘTRZNE MYŚLENIE      │
            │  Policzmy systematycznie:   │
            │  - Trójkąty z 1 przekątną   │
            │  - Trójkąty z 2 przekątnymi │
            │  - Sprawdzam duplikaty...   │
            │  → wynik: 35                │
            └─────────────────────────────┘
                          │
                          ▼
              Odpowiedź: "35 trójkątów"
```

Różnica między providerami: u Anthropic cały blok `<thinking>` jest zwracany w API. U OpenAI tokeny myślenia są **konsumowalane wewnętrznie** i tylko rozliczane — nigdy nie zobaczysz co model "myślał".

---

## Anthropic Claude

### claude-3-7-sonnet-20250219

**Jedyny model Claude z extended thinking** (stan na połowę 2025).

- **Context in:** 200,000 tokenów
- **Output:** do 128,000 tokenów (największe okno wyjściowe z modeli Anthropic)
- **Thinking budget:** `budget_tokens` od 1,024 do 128,000 tokenów thinking
- **Widoczność myślenia:** Tak — pełny blok `thinking` zwracany w odpowiedzi API

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-3-7-sonnet-20250219",
    max_tokens=16000,
    thinking={
        "type": "enabled",
        "budget_tokens": 10000   # ile tokenów może "pomyśleć"
    },
    messages=[{
        "role": "user",
        "content": "Solve this step by step: if 3x + 7 = 22, what is x?"
    }]
)

for block in response.content:
    if block.type == "thinking":
        print("THINKING:", block.thinking)   # widoczne rozumowanie!
    elif block.type == "text":
        print("ANSWER:", block.text)
```

**Co wyróżnia Anthropic:** Jako jedyny główny provider zwraca pełny ślad rozumowania w odpowiedzi API. Możesz go logować, analizować i debugować. Parametr `budget_tokens` daje precyzyjną kontrolę koszt/jakość.

**Najlepszy dla:** Złożone kodowanie, analiza dokumentów, wieloetapowa matematyka, debugowanie logiki biznesowej.

---

## OpenAI — seria modeli "o"

OpenAI stosuje inne podejście: tokeny reasoning są ukryte — rozliczane, ale **nigdy nie zwracane**. Kontrola przez parametr `reasoning_effort`.

### o1 (wrzesień 2024)

```python
response = client.chat.completions.create(
    model="o1",
    messages=[{"role": "user", "content": "..."}]
    # brak parametru reasoning_effort — zawsze pełne myślenie
)
```

- Context: 128,000 tokenów / 32,768 output
- Reasoning: ukryte, zawsze włączone, nie konfigurowalne
- Mocny: AIME math, competitive programming, reasoning naukowy

### o1-mini (wrzesień 2024)

- Context: 128,000 / 65,536 output
- Lżejszy, szybszy, tańszy — zoptymalizowany pod STEM
- Słabszy na szerokiej wiedzy ogólnej

### o3 (kwiecień 2025)

```python
response = client.chat.completions.create(
    model="o3",
    reasoning_effort="high",   # "low" | "medium" | "high"
    messages=[{"role": "user", "content": "..."}]
)
```

- Context: 200,000 / 100,000 output
- Skokowy wzrost możliwości vs o1: SOTA na ARC-AGI-1, FrontierMath, SWE-bench
- `reasoning_effort=high` → bardzo wolny i drogi, ale bardzo dokładny
- Wspiera: tool use, vision, structured output, code execution

### o3-mini (styczeń 2025)

- Context: 200,000 / 100,000 output
- Efektywny kosztowo model reasoning
- `reasoning_effort` parametr jak o3
- Mocny w matematyce i kodowaniu przy niższym koszcie

### o4-mini (kwiecień 2025)

- Context: 200,000 / 100,000 output
- **Najlepszy stosunek koszt/jakość** w portfolio OpenAI (połowa 2025)
- Obsługuje image input (multimodal reasoning)
- `reasoning_effort` parametr
- Bije o3-mini na większości benchmarków przy podobnym lub niższym koszcie
- **Rekomendowany default** dla nowych projektów wymagających reasoning

**Co wyróżnia OpenAI:** Parametr `reasoning_effort` daje dial jakość/koszt bez odsłaniania wewnętrznego rozumowania. Model "konsumuje" reasoning tokens wewnętrznie.

---

## Google DeepMind — Gemini

### Gemini 2.5 Pro (marzec–czerwiec 2025)

```python
import google.generativeai as genai

model = genai.GenerativeModel("gemini-2.5-pro")

response = model.generate_content(
    "Analyze this 500-page contract for liability clauses",
    generation_config=genai.types.GenerationConfig(
        thinking_config={"thinking_budget": 8192}   # 0 = thinking off
    )
)
```

- **Context in: 1,048,576 tokenów (1M!)** / 65,536 output
- `thinkingBudget`: 0–24,576 tokenów thinking (0 = wyłączone)
- Reasoning: ukryte (nie zwracane do dewelopera)
- SOTA na reasoning benchmarkach połowa 2025
- Multi-modal: tekst, obraz, video, audio, dokumenty
- Wbudowany: Python sandbox, Google Search grounding, function calling

### Gemini 2.5 Flash (2025)

- Context: 1M tokenów (tak jak Pro)
- `thinkingBudget` identycznie jak Pro
- **Tryb hybrydowy:** thinking można włączyć/wyłączyć per request
- Niższy koszt niż 2.5 Pro, szybszy
- Świetny stosunek cena/jakość dla zastosowań produkcyjnych

**Co wyróżnia Google:** **Kontekst 1M tokenów + thinking** — unikalna kombinacja. Możesz rozumować nad całym dużym projektem, długim dokumentem prawnym, lub godzinnym zapisem spotkania w jednym wywołaniu.

---

## DeepSeek

### DeepSeek-R1 (styczeń 2025)

```python
# Przez API DeepSeek
from openai import OpenAI  # API kompatybilne z OpenAI

client = OpenAI(
    api_key="...",
    base_url="https://api.deepseek.com"
)

response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[{"role": "user", "content": "Solve: integral of x^2 dx"}]
)

# Reasoning JEST zwracane!
print(response.choices[0].message.reasoning_content)  # ślad myślenia
print(response.choices[0].message.content)            # finalna odpowiedź
```

- Context: 128,000 tokenów
- Thinking: **widoczne** — blok `<think>...</think>` w odpowiedzi
- Open-source (MIT) — możesz uruchomić lokalnie!
- Benchmarki porównywalne do o1 przy ułamku kosztu API
- Dostępny przez: DeepSeek API, Ollama, Groq, Fireworks, Together AI

### Lokalne uruchomienie przez Ollama

```bash
# Pobierz i uruchom lokalnie (wymaga ~8GB VRAM dla 7B)
ollama pull deepseek-r1:7b
ollama run deepseek-r1:7b

# Lub wersja 14B (~14GB VRAM) — znacznie mocniejsza
ollama pull deepseek-r1:14b
```

### Distilled modele R1

| Model | Parametry | VRAM | Jakość vs Full R1 |
|-------|-----------|------|-------------------|
| deepseek-r1:1.5b | 1.5B | ~2GB | Podstawowa |
| deepseek-r1:7b | 7B | ~8GB | Dobra |
| deepseek-r1:14b | 14B | ~14GB | Bardzo dobra |
| deepseek-r1:32b | 32B | ~32GB | Prawie pełna |
| deepseek-r1:70b | 70B | ~40GB | Zbliżona do pełnej |

**Co wyróżnia DeepSeek:** Jedyny główny model reasoning z **otwartymi wagami** do samodzielnego hostowania. Przejrzysty ślad `<think>`. Koszt API dramatycznie niższy od OpenAI/Anthropic. Dla Java developerów: 14B distill działa lokalnie na konsumenckim GPU.

---

## xAI Grok

### Grok 3 + Think Mode (luty 2025)

- Context: 131,072 tokenów (128K)
- **Think mode:** Grok 3 z włączonym extended chain-of-thought
- Dostępny przez: Grok API, X Premium+ subscription
- Benchmarki: konkurencyjny z GPT-4o i Claude 3.5 Sonnet na reasoning
- Ślad myślenia widoczny w interfejsie Grok (UI); dostęp przez API różny

### Grok 3 Mini (kwiecień 2025)

- Mniejszy, szybszy, z Think mode
- Opłacalny dla lżejszych zadań reasoning
- Mocny w matematyce i kodowaniu

**Co wyróżnia Grok:** Integracja z danymi real-time z X (Twitter) — rozumowanie nad aktualnymi wydarzeniami. Przełącznik "Think" w UI dostępny dla użytkowników nietechnicznych.

---

## Inne wartościowe modele reasoning

### Qwen QwQ-32B (Alibaba, marzec 2025)

- Open-source, 32B parametrów
- Context: 131,072 tokenów
- Thinking: widoczny ślad (podobny styl do DeepSeek R1)
- Porównywalny z o1-mini na benchmarkach matematycznych
- Dostępny: Hugging Face, Ollama
- Dobra opcja lokalna gdy 32B mieści się w VRAM

### Mistral Magistral (czerwiec 2025)

- Pierwszy dedykowany model reasoning od Mistral
- Magistral Small (24B, otwarte wagi) + Magistral Medium (tylko API)
- Context: 40,960 tokenów
- Reasoning: widoczny w odpowiedzi
- Wyróżnik: silny w językach wielojęzycznych, zwłaszcza francuskim

### Amazon Nova Pro z Thinking (2025)

- Natywny model AWS Bedrock z thinking mode
- Relevantny dla Java developerów na infrastrukturze AWS — natywna integracja Bedrock SDK

---

## Tabela porównawcza wszystkich modeli

| Model | Provider | Context in | Thinking widoczne | Kontrola reasoning | Open Source | Wyróżnik |
|-------|----------|:----------:|:-----------------:|:-----------------:|:-----------:|---------|
| claude-3-7-sonnet | Anthropic | 200K | **Tak (pełny blok)** | `budget_tokens` 1K–128K | Nie | Jedyny z pełnym śladem w API |
| o1 | OpenAI | 128K | Nie | Brak (zawsze pełne) | Nie | Oryginalny model reasoning |
| o1-mini | OpenAI | 128K | Nie | Brak | Nie | STEM, tańszy |
| o3 | OpenAI | 200K | Nie | `reasoning_effort` low/med/high | Nie | SOTA na najtrudniejszych benchmarkach |
| o3-mini | OpenAI | 200K | Nie | `reasoning_effort` | Nie | Efektywny kosztowo o3 |
| **o4-mini** | OpenAI | 200K | Nie | `reasoning_effort` | Nie | **Najlepszy koszt/jakość (2025)** |
| **Gemini 2.5 Pro** | Google | **1M** | Nie | `thinkingBudget` 0–24K | Nie | **Najdłuższy kontekst + thinking** |
| Gemini 2.5 Flash | Google | 1M | Nie | `thinkingBudget` | Nie | Tryb hybrydowy, ekonomiczny |
| **DeepSeek-R1** | DeepSeek | 128K | **Tak (`<think>`)** | Brak (zawsze on) | **Tak (MIT)** | **Open-source, najtańszy** |
| Grok 3 Think | xAI | 128K | Częściowo (UI) | Toggle on/off | Nie | Real-time dane z X |
| QwQ-32B | Alibaba | 128K | Tak | Brak | Tak | Dobry do lokalnego hostowania |
| Magistral Small | Mistral | 40K | Tak | Brak | Tak | Wielojęzyczny, otwarte wagi |

---

## Jak wybrać model reasoning

```
Ograniczony budżet / chcesz local hosting?
  → DeepSeek-R1 (MIT, Ollama) lub QwQ-32B

Musisz analizować bardzo długie dokumenty (>100K tokenów)?
  → Gemini 2.5 Pro lub Flash (1M kontekst)

Chcesz debugować ścieżkę reasoning w logach?
  → claude-3-7-sonnet (pełny blok thinking w API)
  → DeepSeek-R1 (widoczny <think>)

Najlepszy wynik na trudnych zadaniach, koszt nie jest problemem?
  → o3 z reasoning_effort=high
  → Gemini 2.5 Pro z pełnym thinkingBudget

Balans koszt / jakość w produkcji?
  → o4-mini z reasoning_effort=medium
  → Gemini 2.5 Flash z dynamicznym thinkingBudget

Infrastruktura AWS?
  → Amazon Nova Pro (natywny Bedrock SDK)

Projekt Java / Spring AI?
  → Spring AI obsługuje: OpenAI, Anthropic, Gemini, Ollama (DeepSeek)
    przez jednolite API ChatClient
```

---

## Kiedy NIE używać trybu myślenia

::: warning Nie wszystko wymaga reasoning mode
Tryb myślenia jest droższy i wolniejszy. Nie używaj go dla:
- Prostych zapytań FAQ / odpowiedzi na podstawowe pytania
- Klasyfikacji tekstu z krótkimi kategoriami
- Tłumaczeń i parafraz
- Generowania prostych szablonów
- Zadań gdzie czas odpowiedzi < 2s jest wymaganiem

Używaj go dla: skomplikowanej matematyki, debugowania kodu, analizy prawnej/finansowej, wieloetapowego planowania, zadań wymagających weryfikacji logicznej.
:::

---

## Przykład Spring AI z modelem reasoning

```java
// Spring AI obsługuje extended thinking przez ChatOptions
@Service
public class ReasoningService {

    private final ChatClient chatClient;

    public ReasoningService(ChatClient.Builder builder) {
        this.chatClient = builder.build();
    }

    public String solveComplexProblem(String problem) {
        // Dla Anthropic z extended thinking
        return chatClient.prompt()
            .user(problem)
            .options(AnthropicChatOptions.builder()
                .model("claude-3-7-sonnet-20250219")
                .maxTokens(16000)
                .thinkingEnabled(true)
                .thinkingBudget(8000)
                .build())
            .call()
            .content();
    }
}
```

---

*Strony powiązane: [LLM Fundamentals](/ai/llm-fundamentals) — podstawy tokenów i kontekstu | [Agent Frameworks](/ai/agent-frameworks) — OpenAI Agents SDK, Agno, LangChain*