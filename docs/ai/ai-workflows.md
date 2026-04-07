# AI Workflows & Automatyzacja

Narzędzia do budowania wizualnych przepływów pracy (workflow) z integracją AI pozwalają łączyć modele językowe, API, bazy danych i aplikacje bez pisania kodu od zera. Są mostem między "surowym" LLM a gotową, produkcyjną automatyzacją.

---

## Czym jest AI Workflow?

AI Workflow to graf zadań, w którym:
- **Triggery** uruchamiają przepływ (webhook, harmonogram, zdarzenie w systemie)
- **Węzły** (nodes) wykonują operacje: wywołanie LLM, zapytanie do bazy, HTTP request, transformacja danych
- **Połączenia** przekazują dane między węzłami
- **LLM** jest jednym z węzłów — może klasyfikować, generować, podsumowywać, decydować

```
[Trigger: Nowy e-mail]
        ↓
[Wyodrębnij treść]
        ↓
[GPT-4: Klasyfikuj intencję]
        ↓
   ┌────┴────┐
[Reklamacja] [Pytanie]
     ↓           ↓
[Utwórz ticket] [Odpowiedz automatycznie]
```

---

## n8n — Open-Source Workflow Automation

**n8n** (wymawiane: "n-eight-n") to najpopularniejsze open-source narzędzie do automatyzacji z wbudowaną obsługą AI.

### Kluczowe cechy

| Cecha | Opis |
|-------|------|
| Licencja | Fair-code (Sustainable Use License) — self-hosting darmowy |
| Deployment | Docker, npm, n8n Cloud |
| Węzły AI | LLM Chain, AI Agent, Memory, Vector Store, Tools |
| Integracje | 400+ natywnych integracji (Slack, Gmail, GitHub, PostgreSQL…) |
| Kod | Możliwość pisania węzłów w JavaScript/Python |
| Webhook | Wbudowane webhooks i HTTP Request nodes |

### Instalacja (Docker)

```bash
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

Lub z docker-compose:

```yaml
# docker-compose.yml
version: '3.8'
services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=admin
      - N8N_BASIC_AUTH_PASSWORD=secret
      - N8N_ENCRYPTION_KEY=your-encryption-key
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=n8n
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=n8n
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  n8n_data:
  postgres_data:
```

### Architektura n8n

```
┌─────────────────────────────────────────────┐
│                   n8n Editor                 │
│  (visual canvas — drag & drop nodes)         │
└────────────────────┬────────────────────────┘
                     │
        ┌────────────▼────────────┐
        │      Workflow Engine     │
        │  - Execution queue       │
        │  - Credential vault      │
        │  - Error handling        │
        └────────────┬────────────┘
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
[HTTP/Webhook]  [LLM Nodes]    [DB/Storage]
  Triggers       AI Actions      Postgres
  Cron            OpenAI          Redis
  Events          Anthropic       S3
                  Ollama          Files
```

### AI Nodes w n8n

#### Basic LLM Chain

Najprostszy węzeł — wysyła prompt do LLM i zwraca odpowiedź:

```json
{
  "node": "Basic LLM Chain",
  "parameters": {
    "model": "gpt-4o",
    "messages": [
      {
        "role": "system",
        "content": "Jesteś pomocnym asystentem. Odpowiadaj po polsku."
      },
      {
        "role": "user",
        "content": "={{ $json.userMessage }}"
      }
    ],
    "temperature": 0.7,
    "maxTokens": 1000
  }
}
```

#### AI Agent Node

Agent z dostępem do narzędzi (tool calling):

```json
{
  "node": "AI Agent",
  "parameters": {
    "agent": "conversationalAgent",
    "model": "gpt-4o",
    "systemMessage": "Jesteś asystentem HR. Masz dostęp do bazy pracowników.",
    "tools": [
      "n8n-nodes-langchain.toolWorkflow",
      "n8n-nodes-langchain.toolHttpRequest"
    ],
    "memory": "bufferMemory"
  }
}
```

#### Vector Store (RAG)

```
[Dokument PDF]
      ↓
[Document Loader]
      ↓
[Text Splitter: 500 tokenów, overlap 50]
      ↓
[Embeddings: text-embedding-3-small]
      ↓
[Pinecone / pgvector / Qdrant — upsert]
```

Zapytanie do Vector Store:

```
[Pytanie użytkownika]
      ↓
[Embeddings: text-embedding-3-small]
      ↓
[Vector Store: similarity_search top_k=5]
      ↓
[Połącz wyniki w kontekst]
      ↓
[LLM: "Na podstawie: {kontekst}\nOdpowiedz na: {pytanie}"]
```

### Przykładowe Przepływy

#### Automatyczne podsumowanie e-maili

```
[Gmail Trigger: nowy e-mail]
         ↓
[IF: od VIP klienta?]
    ↙         ↘
[Tak]         [Nie → skip]
  ↓
[Wyodrębnij: nadawca, temat, treść]
  ↓
[GPT-4o: Podsumuj w 3 punktach + priorytet]
  ↓
[Slack: Wyślij do #vip-klienci]
  ↓
[Zapisz do Sheets: data, nadawca, priorytet, podsumowanie]
```

#### Chatbot z bazą wiedzy (RAG)

```
[Webhook POST /chat]
        ↓
[Wyodrębnij: sessionId, message]
        ↓
[Postgres: Pobierz historię rozmowy (last 10)]
        ↓
[Pinecone: Szukaj podobnych fragmentów docs]
        ↓
[AI Agent: GPT-4o + kontekst RAG + historia]
        ↓
[Postgres: Zapisz nową wiadomość]
        ↓
[Webhook Response: { answer, sources }]
```

#### Monitoring i alerty

```
[Cron: co 5 minut]
        ↓
[HTTP Request: GET /api/metrics]
        ↓
[IF: error_rate > 5%?]
        ↓ (tak)
[GPT-4o: "Przeanalizuj te metryki: {dane}. Podaj możliwą przyczynę i rekomendacje"]
        ↓
[PagerDuty: Utwórz incident]
        ↓
[Slack: #ops-alert z analizą AI]
```

---

## Alternatywy dla n8n

### Porównanie narzędzi

| Narzędzie | Typ | Open Source | Self-host | AI-native | Cena |
|-----------|-----|-------------|-----------|-----------|------|
| **n8n** | General automation | Częściowo | Tak | Tak (nodes) | Darmowy self-host |
| **Zapier** | General automation | Nie | Nie | Tak (AI by Zapier) | $19.99+/mies |
| **Make (Integromat)** | General automation | Nie | Nie | Tak | Darmowy tier |
| **Activepieces** | General automation | Tak | Tak | Tak | Darmowy self-host |
| **Pipedream** | Developer-first | Nie | Nie | Tak | Darmowy tier |
| **Flowise** | AI-native | Tak | Tak | Tak (LLM-first) | Darmowy self-host |
| **LangFlow** | AI-native | Tak | Tak | Tak (LLM-first) | Darmowy self-host |
| **Dify** | AI-native | Tak | Tak | Tak (App platform) | Darmowy self-host |
| **Rivet** | AI-native | Tak | Tak (local) | Tak (visual prompts) | Darmowy |
| **ComfyUI** | Image AI | Tak | Tak | Tak (Stable Diffusion) | Darmowy |

---

### Zapier

Najbardziej popularny komercyjny konkurent. Zap = trigger + actions.

**Plusy:**
- 6000+ integracji
- Bardzo łatwy w obsłudze
- AI by Zapier — wbudowany ChatGPT
- Dobre wsparcie i dokumentacja

**Minusy:**
- Drogi przy dużym wolumenie
- Brak self-hostingu
- Dane przechodzą przez serwery Zapier
- Ograniczony dla developerów (brak zaawansowanego kodu)

**Kiedy wybrać:** Małe firmy, marketingowcy, procesy biznesowe, szybkie MVP.

---

### Make (dawniej Integromat)

Wizualnie bardziej zaawansowany niż Zapier, z lepszym modelowaniem danych.

**Plusy:**
- Darmowy tier (1000 operacji/miesiąc)
- Scenariusze z pętlami, filtrami, iteratorami
- 1500+ integracji
- Wbudowane transformacje danych (JSON, XML, CSV)

**Minusy:**
- Brak self-hostingu
- Stroma krzywa uczenia
- Ograniczona obsługa AI (głównie przez HTTP do OpenAI)

**Kiedy wybrać:** Złożone ETL, transformacje danych, integracje ERP/CRM.

---

### Activepieces

Najbliższy open-source odpowiednik Zapiera.

```bash
# Self-hosting z Docker
git clone https://github.com/activepieces/activepieces.git
cd activepieces
docker compose up -d
```

**Plusy:**
- W pełni open-source (MIT)
- UI podobny do Zapiera
- Aktywny rozwój, rosnąca liczba integracji
- Można dodawać własne "pieces" w TypeScript

**Minusy:**
- Mniej integracji niż n8n
- Młodszy projekt (mniejsza społeczność)

**Kiedy wybrać:** Chcesz open-source'owego Zapiera, compliance wymaga self-hostingu.

---

### Pipedream

Platforma dla developerów — workflows jako kod (Node.js/Python).

```javascript
// Przykład kroku w Pipedream (Node.js)
export default defineComponent({
  async run({ steps, $ }) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "user", content: steps.trigger.event.body.message }
      ]
    });

    return response.choices[0].message.content;
  }
});
```

**Plusy:**
- Workflows jako kod — wersjonowanie w Git
- Darmowy tier (10k kroków/dzień)
- Pełna moc Node.js/Python w każdym kroku
- Wbudowane OAuth dla 1000+ serwisów

**Minusy:**
- Brak self-hostingu
- Głównie JavaScript/Python (mniej visual)

**Kiedy wybrać:** Deweloperzy, CI/CD integracje, prototypowanie API workflows.

---

### Flowise

**AI-first** platforma do budowania chain'ów LLM. Oparta na LangChain.

```bash
npm install -g flowise
npx flowise start
# lub Docker:
docker run -d -p 3000:3000 flowiseai/flowise
```

**Kluczowe koncepty Flowise:**

```
Flowise Chatflow:
┌─────────────────────────────────────┐
│  ChatOpenAI (model)                  │
│  ├── BufferMemory (historia)         │
│  ├── Pinecone (vector store)         │
│  └── ConversationChain               │
│       └── SystemMessage              │
└─────────────────────────────────────┘
```

**Plusy:**
- Open-source, self-host
- Wizualne budowanie LangChain pipelines
- Eksport przez REST API — łatwa integracja
- Wbudowany Chatbot UI
- Marketplace gotowych szablonów

**Minusy:**
- Skupiony tylko na AI (brak ogólnych integracji)
- Zależny od LangChain (breaking changes)
- Mniej elastyczny dla non-AI kroków

**Kiedy wybrać:** Prototypowanie RAG chatbotów, team bez doświadczenia w kodzie LLM.

---

### LangFlow

Wizualny builder dla LangChain, podobny do Flowise, rozwijany przez DataStax.

```bash
pip install langflow
langflow run
# lub
uv run langflow run --host 0.0.0.0
```

**Różnica vs Flowise:**
- LangFlow = Python-first (Flowise = Node.js-first)
- Lepsze wsparcie dla modeli Hugging Face i lokalnych
- DataStax AstraDB jako natywny Vector Store
- Bardziej rozbudowany w modele niż Flowise

**Typowy flow w LangFlow:**

```
[File Loader] → [RecursiveCharacterTextSplitter]
                              ↓
                    [OpenAIEmbeddings]
                              ↓
                    [ChromaDB (store)]
                              ↓
[User Input] → [Retriever] → [ChatOpenAI] → [Output]
```

---

### Dify

Kompletna platforma do budowania aplikacji AI — wykracza poza samo workflow.

```bash
git clone https://github.com/langgenius/dify.git
cd dify/docker
docker compose up -d
```

**Możliwości Dify:**

| Funkcja | Opis |
|---------|------|
| Chatbot | Konfigurowalne chaty z pamięcią |
| Agent | Tool-use z wizualną konfiguracją |
| Workflow | Graf z LLM, logic, tools |
| Knowledge Base | RAG z własną bazą wiedzy |
| Prompt IDE | Testowanie i wersjonowanie promptów |
| API | Automatyczna ekspozycja jako REST API |
| Analytics | Monitorowanie konwersacji i kosztów |

**Plusy:**
- Najbardziej kompletna platforma AI
- Prompt Engineering IDE
- Monitorowanie tokenów i kosztów
- Obsługa 100+ modeli (OpenAI, Anthropic, Ollama, HuggingFace)
- Wbudowane datasety RAG z różnymi chunking strategies

**Minusy:**
- Złożona konfiguracja
- Duże wymagania zasobowe
- Mniejsza społeczność niż n8n

**Kiedy wybrać:** Firmy budujące wiele aplikacji AI, team product + engineering, A/B testing promptów.

---

### Rivet

Visual AI Programming Environment — skupiony na debugowaniu i testowaniu promptów.

**Unikalne cechy:**
- Debugger z wizualizacją przepływu tokenów
- Wersjonowanie promptów (Git-compatible YAML)
- Tryb "remote debugging" — podłączenie do produkcji
- Multi-model testing (ten sam flow, różne modele)

```yaml
# Przykład Rivet node w YAML (format projektowy)
- id: openai-chat-1
  type: openai-chat-model
  data:
    model: gpt-4o
    systemPrompt: "Jesteś ekspertem od Javy. Odpowiadaj zwięźle."
    temperature: 0.3
```

**Kiedy wybrać:** Prompt engineers, A/B testing modeli, debugowanie złożonych chain'ów.

---

### ComfyUI

Wyspecjalizowany w generowaniu obrazów (Stable Diffusion, Flux, SDXL).

```
[CheckpointLoaderSimple]
         ↓
[CLIPTextEncode: prompt]
[CLIPTextEncode: negative]
         ↓
[KSampler: steps=20, cfg=7]
         ↓
[VAEDecode]
         ↓
[SaveImage]
```

**Kiedy wybrać:** Generowanie obrazów, video AI, inpainting, upscaling.

---

## Drzewo Decyzyjne

```
Jaki masz cel?
│
├── Automatyzacja procesów biznesowych (e-mail, CRM, Sheets...)
│   ├── Chcesz self-host + open-source?  → n8n lub Activepieces
│   ├── Szybkość setup > koszt?          → Zapier
│   └── Złożone transformacje danych?    → Make (Integromat)
│
├── Budowanie aplikacji/chatbotów AI
│   ├── RAG chatbot (szybki prototyp)?   → Flowise lub LangFlow
│   ├── Kompletna platforma AI?          → Dify
│   ├── Debugowanie promptów?            → Rivet
│   └── Chcesz pisać kod + integracje?  → n8n (AI nodes) lub Pipedream
│
├── Generowanie obrazów AI
│   └── Stable Diffusion workflows?     → ComfyUI
│
└── Developer-first, workflows jako kod
    └── Node.js/Python, CI/CD?          → Pipedream
```

---

## n8n vs Flowise vs Dify — Szczegółowe Porównanie

| Kryterium | n8n | Flowise | Dify |
|-----------|-----|---------|------|
| **Przypadek użycia** | Ogólna automatyzacja + AI | AI chains/chatbots | Platforma AI apps |
| **Integracje** | 400+ (e-mail, DB, API...) | Tylko AI/LLM | Tylko AI + HTTP |
| **AI Nodes** | Wbudowane (LangChain) | LangChain-native | Własny engine |
| **Self-host** | Tak (Docker) | Tak (Docker/npm) | Tak (Docker) |
| **RAG** | Przez węzły vector store | Wbudowane | Wbudowane + UI |
| **Monitoring** | Podstawowy | Brak | Rozbudowany |
| **Kod** | JavaScript/Python nodes | Minimalny | Minimalny |
| **Krzywa uczenia** | Średnia | Niska | Średnia |
| **Prod-readiness** | Wysoka | Średnia | Wysoka |

---

## Integracja n8n z własnym backendem Java/Spring

### Webhook Trigger z Spring Boot

```java
// Spring Boot — endpoint odbierający wywołania z n8n
@RestController
@RequestMapping("/api/ai")
public class N8nWebhookController {

    @PostMapping("/process-document")
    public ResponseEntity<ProcessResult> processDocument(
            @RequestBody DocumentPayload payload,
            @RequestHeader("X-N8N-Signature") String signature) {

        // Weryfikacja podpisu webhookowego
        validateSignature(payload, signature);

        // Przetworzenie dokumentu
        ProcessResult result = documentService.process(payload);
        return ResponseEntity.ok(result);
    }
}

public record DocumentPayload(String documentId, String content, String action) {}
public record ProcessResult(String summary, List<String> tags, double confidence) {}
```

### Wywołanie n8n Workflow z Java

```java
@Service
public class N8nWorkflowService {

    private final RestTemplate restTemplate;

    @Value("${n8n.webhook.url}")
    private String n8nWebhookUrl;

    @Value("${n8n.api.key}")
    private String apiKey;

    public WorkflowResult triggerWorkflow(String workflowId, Map<String, Object> data) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("X-N8N-API-KEY", apiKey);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(data, headers);

        return restTemplate.postForObject(
            n8nWebhookUrl + "/webhook/" + workflowId,
            request,
            WorkflowResult.class
        );
    }
}
```

### Konfiguracja (application.yml)

```yaml
n8n:
  webhook:
    url: http://localhost:5678
  api:
    key: ${N8N_API_KEY}
  workflows:
    document-summary: abc123-webhook-id
    email-classification: def456-webhook-id
    customer-support: ghi789-webhook-id
```

---

## Bezpieczeństwo i Best Practices

### Secrets Management w n8n

```bash
# Zmienne środowiskowe — NIE trzymaj kluczy w workflow
N8N_ENCRYPTION_KEY=your-32-char-key
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://user:pass@host/db
```

W n8n UI: Credentials → Store → referencja przez <code v-pre>{{ $credentials.openAiApi.apiKey }}</code>

### Walidacja Webhooków

```javascript
// Węzeł Code w n8n — weryfikacja HMAC
const crypto = require('crypto');

const signature = $input.first().headers['x-webhook-signature'];
const body = JSON.stringify($input.first().body);
const secret = $env.WEBHOOK_SECRET;

const expected = crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');

if (signature !== `sha256=${expected}`) {
  throw new Error('Invalid webhook signature');
}

return $input.all();
```

### Ograniczenie Dostępu

```yaml
# docker-compose — produkcyjna konfiguracja
environment:
  - N8N_BASIC_AUTH_ACTIVE=true
  - N8N_HOST=n8n.yourdomain.com
  - N8N_PROTOCOL=https
  - N8N_PORT=443
  - WEBHOOK_URL=https://n8n.yourdomain.com/
  # Ogranicz do konkretnych IP przez reverse proxy (nginx/Traefik)
```

---

## Obserwabilność i Monitoring

### Logging w n8n

Każde wykonanie workflowu jest logowane w:
- **Execution History** — UI: `/executions` — ostatnie 100 uruchomień
- **PostgreSQL** — tabela `execution_entity` — pełna historia

```sql
-- Analiza błędnych wykonań
SELECT
  w.name as workflow_name,
  e.status,
  e.started_at,
  e.finished_at,
  e.data::json -> 'resultData' -> 'error' ->> 'message' as error_msg
FROM execution_entity e
JOIN workflow_entity w ON e.workflow_id = w.id
WHERE e.status = 'error'
  AND e.started_at > NOW() - INTERVAL '24 hours'
ORDER BY e.started_at DESC;
```

### Metryki z Prometheus

```yaml
# n8n wspiera /metrics endpoint (n8n >= 0.233)
environment:
  - N8N_METRICS=true
  - N8N_METRICS_PREFIX=n8n_
```

```
# Kluczowe metryki:
n8n_workflow_executions_total{status="success"} 1234
n8n_workflow_executions_total{status="error"} 12
n8n_workflow_execution_duration_seconds{...} histogram
```

---

## Kiedy NIE używać narzędzi workflow?

::: warning Nie do wszystkiego
Narzędzia workflow (n8n, Flowise itd.) NIE są odpowiednie gdy:

- **Krytyczna latencja < 50ms** — overhead HTTP/nod jest zbyt duży
- **Bardzo złożona logika biznesowa** — kod jest czytelniejszy
- **Wysokie obciążenie (>1000 req/s)** — lepiej bezpośrednie wywołania API
- **Potrzebujesz transakcji ACID** — workflow tools nie gwarantują atomowości
:::

::: tip Złota zasada
Używaj narzędzi workflow do **orkiestracji** (kto-co-kiedy), a kod aplikacji do **logiki biznesowej** (jak).
:::

---

## Zasoby

- [n8n Docs](https://docs.n8n.io) — oficjalna dokumentacja
- [n8n Community Nodes](https://www.npmjs.com/search?q=n8n-nodes) — pakiety npm
- [Flowise GitHub](https://github.com/FlowiseAI/Flowise) — repozytorium
- [Dify GitHub](https://github.com/langgenius/dify) — repozytorium
- [Activepieces GitHub](https://github.com/activepieces/activepieces) — repozytorium
- [LangFlow Docs](https://docs.langflow.org) — dokumentacja
