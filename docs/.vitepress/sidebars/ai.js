export const aiSidebar = [
  {
    text: 'AI & LLMs',
    items: [{ text: 'Overview', link: '/ai/' }],
  },
  {
    text: 'Core Theory',
    collapsed: false,
    items: [
      { text: 'LLM Fundamentals',    link: '/ai/llm-fundamentals' },
      { text: 'Prompt Engineering',  link: '/ai/prompt-engineering' },
      { text: 'RAG & Vector Search', link: '/ai/rag' },
      { text: 'AI Agents',           link: '/ai/agents' },
      { text: 'MCP Protocol',        link: '/ai/mcp' },
      { text: 'Agent Frameworks',    link: '/ai/agent-frameworks' },
      { text: 'Thinking Models',     link: '/ai/thinking-models' },
      { text: 'AI Workflows (n8n)',  link: '/ai/ai-workflows' },
    ],
  },
  {
    text: 'Practical & Tools',
    collapsed: false,
    items: [
      { text: 'Local LLMs (Ollama)', link: '/ai/local-llms-setup' },
      { text: 'Claude API',          link: '/ai/claude-api' },
      { text: 'Claude Code',         link: '/ai/claude-code-features' },
      { text: 'RAG Hands-On (n8n)', link: '/ai/n8n-rag-hands-on' },
      { text: 'Kafka & Event Streaming', link: '/ai/kafka' },
    ],
  },
  {
    text: 'Capstone Project',
    collapsed: false,
    items: [
      { text: 'Home Storage App', link: '/ai/home-storage-project' },
    ],
  },
]
