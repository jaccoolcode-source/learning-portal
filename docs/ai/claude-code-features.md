# Claude Code: Complete Feature Reference

<DifficultyBadge level="intermediate" />

Claude Code is Anthropic's official CLI for agentic software engineering. Unlike the API (where you send messages and get responses), Claude Code operates directly on your codebase — reading files, running commands, making edits, and coordinating multiple agents.

---

## What is Claude Code?

Claude Code runs in your terminal as an **autonomous coding agent**. It can:

- Read and edit files in your project
- Run shell commands (tests, builds, git)
- Browse the web or call MCP servers
- Spawn parallel subagents for large tasks
- Remember context across sessions via `CLAUDE.md`

```
Your terminal
     ↓
Claude Code CLI  ←→  Claude AI model (API)
     ↓
Filesystem / Shell / MCP servers / Git
```

**When to use Claude Code vs the API:**

| Task | Use |
|------|-----|
| Build a feature, fix a bug | Claude Code |
| Integrate AI into your own app | Claude API |
| Automate a codebase-wide refactor | Claude Code |
| Process user data in production | Claude API |

**Installation:**

```bash
npm install -g @anthropic-ai/claude-code
claude                 # start interactive session
claude "fix the failing tests"   # one-shot task
```

---

## CLAUDE.md — Project Memory

`CLAUDE.md` is a Markdown file that Claude Code reads at the start of every session. It provides persistent context — your project's conventions, tech stack, and rules — so you don't repeat yourself every conversation.

**Locations (loaded in order):**
1. `~/.claude/CLAUDE.md` — global instructions for all projects
2. `<project-root>/CLAUDE.md` — project-specific instructions
3. Subdirectory `CLAUDE.md` files (loaded when working in that directory)

**Example `CLAUDE.md` for this tutorial project:**

```markdown
# Home Storage Tutorial Project

## Tech Stack
- n8n (workflow automation, port 5678)
- PostgreSQL 16 + pgVector (port 5432, db: ragdb)
- Ollama (local LLMs, port 11434)
- Embeddings: nomic-embed-text (768 dimensions)
- Chat model: llama3.2:3b

## Conventions
- All SQL uses snake_case table and column names
- Vector columns are always `embedding vector(768)` — never 1536
- n8n workflow exports go in `workflows/` directory

## Forbidden Commands
- Never run `docker compose down -v` (destroys data volumes)
- Never drop the `items` table without explicit confirmation
- Never commit .env files

## Docker
- Stack starts with `docker compose up -d` from the project root
- Container names: tutorial-postgres, tutorial-ollama, tutorial-n8n
```

::: tip Keep it concise
CLAUDE.md is loaded into every session's context. Under 500 lines is ideal — focus on things Claude can't infer from the code itself. The "Forbidden Commands" pattern is the most valuable thing to add.
:::

Edit it live with `/memory` from inside any Claude Code session.

---

## Plan Mode & Long-Horizon Tasks

Plan mode is a **read-only research phase** — Claude explores and proposes before touching anything. It's the safest way to start a complex task.

### The workflow

```
1. Enter plan mode
   /plan
   → Claude switches to read-only: no edits, no Bash writes

2. Give Claude the task
   "Plan how to add location filtering to the /find-item endpoint"
   → Claude reads code, identifies files, proposes an approach

3. Review the plan
   → The plan is written to a markdown file you can read and edit

4. Approve (exit plan mode)
   → Claude begins implementing, using the plan as its guide

5. Hooks auto-run tests after each edit
   → Claude sees test output and fixes failures automatically
```

### What plan mode restricts

In plan mode Claude can only use read-only tools: `Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`. It **cannot** edit files, run Bash commands, or make any changes.

### CLI flags

```bash
claude --plan         # start session directly in plan mode
```

### Worktrees — isolated branches per task

When spawning subagents for large tasks, use `isolation: "worktree"` to give each agent its own git branch:

```
Main agent (orchestrator)
    ├── Subagent A [worktree: branch-a] → modifies auth module
    └── Subagent B [worktree: branch-b] → modifies API layer
```

Each worktree is a temporary copy of the repo on a new branch. If the subagent makes no changes, the worktree is cleaned up automatically. If it does make changes, the branch path is returned so you can review and merge.

### Tips for long-horizon tasks

- Add a **"Current Work"** section to `CLAUDE.md` describing the feature in progress
- Break large tasks into phases — plan each phase separately
- Use subagents for parallel research (see [Subagents](#subagents))
- Use `/compact` to summarize long conversations before continuing

---

## Skills (Slash Commands)

Skills are custom slash commands that automate repetitive tasks. They're Markdown files stored in `.claude/commands/` (project-scoped) or `~/.claude/commands/` (global).

### File structure

```
.claude/
└── commands/
    ├── generate-test.md      # /generate-test
    ├── explain-workflow.md   # /explain-workflow
    └── commit.md             # /commit

~/.claude/
└── commands/
    └── docker-logs.md        # /docker-logs (available in all projects)
```

Type `/` at the prompt to see all available skills. Claude Code auto-discovers every `.md` file in both locations.

### Anatomy of a skill

A skill file is plain Markdown — natural language instructions with optional `$ARGUMENTS` placeholder:

````markdown
Do X to the file at $ARGUMENTS.

1. First step
2. Second step — if condition A, do Y; otherwise do Z
3. Run the result and fix any errors
````

`$ARGUMENTS` is replaced with everything you type after the slash command name:

```
/generate-test src/storage/ItemRepository.js
```

### Skill examples

**Example 1: `/generate-test`** — basic unit test generator

```
.claude/commands/generate-test.md
```

````markdown
Generate a unit test for the file at $ARGUMENTS.

1. Read the file and identify all public functions/methods
2. Create a test file at the same path with a `.test` suffix
3. Write one test case per function covering:
   - The happy path
   - An edge case (empty input, null, zero)
4. Use the testing framework already present in the project
5. Run the tests and fix any failures before finishing
````

**Example 2: `/explain-workflow`** — summarize an n8n export

```
.claude/commands/explain-workflow.md
```

````markdown
Read the n8n workflow JSON at $ARGUMENTS and explain what it does.

1. Parse the JSON and identify all nodes
2. Trace the trigger → processing → output path
3. List any external services or credentials referenced
4. Write a plain-English summary of what the workflow does and when it runs
5. Flag any potential failure points (missing error handling, hardcoded values)
````

Usage:
```
/explain-workflow workflows/rag-chatbot.json
```

**Example 3: `/commit`** — conventional commit with auto-message

```
.claude/commands/commit.md
```

````markdown
Create a git commit for the current staged changes.

1. Run `git diff --staged` to see what's staged
2. If nothing is staged, run `git status` and ask me what to stage
3. Write a commit message following Conventional Commits format:
   - feat: new feature
   - fix: bug fix
   - docs: documentation only
   - refactor: no behavior change
   - chore: tooling/config
4. Keep the subject line under 72 characters
5. Create the commit — do NOT push
````

**Example 4: `/docker-logs`** — tail container logs (global skill)

```
~/.claude/commands/docker-logs.md
```

````markdown
Tail the last 50 lines of logs from the Docker container named $ARGUMENTS.

Run: docker logs --tail 50 $ARGUMENTS

If the container is not running, list all containers with `docker ps -a`
and tell me which ones are stopped.
````

Usage:
```
/docker-logs tutorial-n8n
```

### Skill prompt patterns

| Pattern | When to use |
|---------|-------------|
| Numbered steps | Multi-step tasks where order matters |
| Conditional branches | "If X, do Y; otherwise do Z" |
| Self-verification | "Run the result and fix any errors" |
| Format constraints | "Keep subject line under 72 chars" |

::: tip Make skills self-correcting
End skills with an instruction like "Run the result and fix any errors" — this turns a one-shot command into a feedback loop where Claude iterates until the output is correct.
:::

---

## Subagents

Subagents allow Claude Code to parallelize work. The main Claude instance acts as an **orchestrator** and spawns specialized **worker agents** for independent subtasks.

```
Orchestrator (Claude Code)
    ├── Subagent A: "Read all files in src/ and build a dependency graph"
    ├── Subagent B: "Check test coverage for each module"
    └── Subagent C: "List all API endpoints defined in routes/"
```

Each subagent:
- Gets its own context and instructions
- Can read files, run commands, call tools
- Returns a result to the orchestrator
- Does **not** share state with other subagents

**When subagents are useful:**
- Large codebases where parallel research speeds things up
- Tasks with clearly independent subtasks (generate tests for 10 files simultaneously)
- Research tasks — gather info from multiple sources at once

::: warning Cost note
Each subagent is a separate API call. Spawning 5 agents costs roughly 5× the token usage of a single call. Use subagents for genuinely parallelizable work, not out of habit.
:::

---

## Hooks

Hooks are shell commands that run automatically in response to Claude Code events. Configure them in `.claude/settings.json`.

### Event types

| Event | When it fires | Useful for |
|-------|--------------|-----------|
| `PreToolUse` | Before Claude runs any tool | Blocking dangerous commands, logging |
| `PostToolUse` | After a tool completes | Auto-format, run tests, notify |
| `Stop` | When Claude finishes a response | Desktop notifications, logging session end |
| `Notification` | When Claude sends a user notification | Custom alert routing |

### Environment variables in hooks

Hooks receive context about the tool call as environment variables:

| Variable | Available in | Contains |
|----------|-------------|---------|
| `CLAUDE_TOOL_NAME` | Pre + Post | Tool name: `Bash`, `Edit`, `Write` |
| `CLAUDE_TOOL_INPUT_COMMAND` | PreToolUse (Bash) | The shell command about to run |
| `CLAUDE_TOOL_INPUT_FILE_PATH` | PreToolUse (Edit/Write) | File path being modified |
| `CLAUDE_TOOL_OUTPUT` | PostToolUse | Tool's output (stdout) |

### The feedback loop

When a `PostToolUse` hook writes to **stdout**, that output is injected back into Claude's context as a tool result. This enables automatic fix cycles:

```
Claude edits a file
    → PostToolUse hook runs: npm test
    → Tests fail → hook prints failure to stdout
    → Claude sees the failure and fixes the code
    → Hook runs again → tests pass
```

### Hook recipes

**Recipe 1: Audit log — every Bash command**

```json
// .claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo \"[$(date)] $CLAUDE_TOOL_INPUT_COMMAND\" >> ~/.claude/bash-audit.log"
          }
        ]
      }
    ]
  }
}
```

**Recipe 2: Block dangerous commands**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CLAUDE_TOOL_INPUT_COMMAND\" | grep -qE 'rm -rf|docker compose down -v|DROP TABLE'; then echo 'BLOCKED: dangerous command' >&2; exit 1; fi"
          }
        ]
      }
    ]
  }
}
```

When a hook exits with a non-zero code, Claude sees the stderr and is told the action was blocked.

**Recipe 3: Auto-run tests after file edits**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "hooks": [
          {
            "type": "command",
            "command": "npm test --passWithNoTests 2>&1 | tail -10"
          }
        ]
      }
    ]
  }
}
```

**Recipe 4: Auto-format after Write**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write",
        "hooks": [
          {
            "type": "command",
            "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\" 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

**Recipe 5: Desktop notification on Stop**

```json
{
  "hooks": {
    "Stop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "notify-send 'Claude Code' 'Task complete' 2>/dev/null || osascript -e 'display notification \"Task complete\" with title \"Claude Code\"' 2>/dev/null || true"
          }
        ]
      }
    ]
  }
}
```

### Matcher patterns

| Matcher | Matches |
|---------|---------|
| `"Bash"` | Only Bash tool calls |
| `"Edit"` | Only Edit tool calls |
| `"*"` | All tool calls |

::: tip Hook output feeds back to Claude
If a `PostToolUse` hook prints to stdout, Claude sees that output and can react — useful for automatically fixing a failing test after an edit.
:::

---

## MCP Servers

MCP (Model Context Protocol) lets Claude Code connect to external tools and data sources. See [MCP Protocol](/ai/mcp) for the full specification.

**Add MCP servers in `.claude/settings.json`:**

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": {
        "POSTGRES_CONNECTION_STRING": "postgresql://raguser:ragpassword@localhost:5432/ragdb"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/home/user/projects"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..."
      }
    }
  }
}
```

Once configured, Claude Code can query your database, read files outside the working directory, browse GitHub repos, and call any other MCP-compatible tool.

**Popular MCP servers:**

| Server | Purpose |
|--------|---------|
| `@modelcontextprotocol/server-postgres` | Query PostgreSQL — list tables, run SELECT, describe schema |
| `@modelcontextprotocol/server-filesystem` | Read/write files in additional directories |
| `@modelcontextprotocol/server-github` | Browse repos, read issues and PRs |
| `@modelcontextprotocol/server-puppeteer` | Browser automation and scraping |
| `@modelcontextprotocol/server-slack` | Read channels, send messages |

---

## IDE Integration

Claude Code works inside VS Code and JetBrains IDEs — the same model and same project context, without leaving your editor.

### VS Code extension

Install from the VS Code marketplace: search **"Claude Code"** or install via CLI:

```bash
code --install-extension anthropic.claude-code
```

**What it adds:**
- **Inline chat** (`Ctrl+Shift+C` / `Cmd+Shift+C`) — ask Claude about the selected code
- **Status bar** — shows Claude Code connection status and active session
- **File context** — open files are automatically included in Claude's context
- **Diff view** — proposed edits appear as a diff before you accept

**Keyboard shortcuts (VS Code):**

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open Claude Code chat |
| `Ctrl+Enter` | Submit prompt |
| `Escape` | Cancel current response |

### JetBrains extension

Available for IntelliJ IDEA, PyCharm, WebStorm, and others. Install from **Settings → Plugins → Marketplace** — search "Claude Code".

**Differences from VS Code:**
- Claude Code appears as a **tool window** (dockable panel)
- Project context is automatically loaded from the module structure
- Works with JetBrains' built-in VCS — propose changes show in the "Changes" tab

### When to use IDE vs CLI

| Situation | Use |
|-----------|-----|
| Quick question about selected code | IDE (inline chat) |
| Multi-file refactor | CLI (full agent loop with hooks) |
| Understanding unfamiliar code | IDE (file is already open) |
| Subagent orchestration | CLI only |
| Running tests in a feedback loop | CLI (hooks auto-run tests) |
| Reviewing a diff before accepting | Both |

### CLAUDE.md as the bridge

Whether you use the IDE or the CLI, both read the same `CLAUDE.md` file. Write project conventions there once — they apply to every session regardless of interface.

---

## Permission Modes

Claude Code asks for permission before taking potentially destructive actions. You control how permissive it is:

| Mode | What it does |
|------|-------------|
| `default` | Asks before Bash commands and file edits |
| `acceptEdits` | Auto-approves file edits, still asks for Bash |
| `plan` | Read-only — no writes or commands at all |
| `bypassPermissions` | Approves everything automatically |

**In the CLI:**

```bash
# Start in plan mode (safe exploration, no changes)
claude --plan

# Auto-approve all edits (still asks for Bash)
claude --accept-edits

# Auto-approve everything — use with caution
claude --dangerously-bypass-permissions
```

::: warning --dangerously-bypass-permissions
This flag skips all confirmation prompts. Only use it for well-understood, reversible tasks in a controlled environment. Never use it in CI or cron jobs without careful review.
:::

---

## Memory & Context Management

### Adding files to context

```
# In the Claude Code prompt:
Read #src/storage/ItemRepository.js and tell me what it does.

# Or with @ reference:
@src/storage/ItemRepository.js — add error handling for null items
```

The `#` prefix reads a file into the context window. The `@` prefix references it inline.

### The /memory command

Type `/memory` to open and edit `~/.claude/CLAUDE.md` directly from within a session. This is how you save a convention mid-conversation without stopping work.

### /compact — save context window space

```
/compact
```

This summarizes and compresses the conversation history, freeing context window space for large tasks. Use it when a long session starts slowing down.

### Context strategies for large codebases

| Strategy | How |
|----------|-----|
| Stay focused | Keep CLAUDE.md under 500 lines — conventions, not code |
| Compress history | `/compact` before deep-diving into a new module |
| Fresh sessions | Start a new session for unrelated tasks |
| Parallel research | Use subagents to explore multiple areas at once |

---

## Practical Workflow

Here's how all the features work together on a real task — adding a "location filter" to a storage query API.

```
1. Update CLAUDE.md
   → Add "Current Work: location filter on /find-item endpoint"
   → This keeps Claude oriented across sessions

2. Enter plan mode
   claude --plan
   → "Plan how to add location filtering to /find-item"
   → Claude reads routes, schema, tests — proposes approach and file list

3. Approve the plan, exit plan mode
   → Claude starts implementing

4. PostToolUse hook fires after each Edit
   → "npm test --passWithNoTests | tail -10"
   → Tests fail → Claude sees output → fixes the code
   → Tests pass → moves to next file

5. Use /commit skill when done
   → Claude stages changes, writes a conventional commit message, commits

6. Review with git diff before pushing
   → Push manually (Claude never pushes without being asked)
```

**The key insight:** each feature amplifies the others — `CLAUDE.md` gives context, plan mode prevents accidents, hooks close the test→fix loop, skills reduce repetition, and subagents parallelize research. You don't need to use all of them on every task, but knowing they exist lets you reach for the right tool.

<RelatedTopics :topics="['/ai/mcp', '/ai/claude-api', '/ai/agents', '/ai/n8n-rag-hands-on']" />
