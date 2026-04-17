import { defineConfig } from 'vitepress'
import { principlesSidebar } from './sidebars/principles.js'
import { javaCoreSidebar } from './sidebars/java-core.js'
import { modernJavaSidebar } from './sidebars/modern-java.js'
import { collectionsSidebar } from './sidebars/collections.js'
import { javaMemorySidebar } from './sidebars/java-memory.js'
import { designPatternsSidebar } from './sidebars/design-patterns.js'
import { springSidebar } from './sidebars/spring.js'
import { architectureSidebar } from './sidebars/architecture.js'
import { securitySidebar } from './sidebars/security.js'
import { gcpSidebar } from './sidebars/gcp.js'
import { messagingSidebar } from './sidebars/messaging.js'
import { dockerSidebar } from './sidebars/docker.js'
import { kubernetesSidebar } from './sidebars/kubernetes.js'
import { cicdSidebar } from './sidebars/cicd.js'
import { testingSidebar } from './sidebars/testing.js'
import { concurrencySidebar } from './sidebars/concurrency.js'
import { databasesSidebar } from './sidebars/databases.js'
import { systemDesignSidebar } from './sidebars/system-design.js'
import { performanceSidebar } from './sidebars/performance.js'
import { aiSidebar } from './sidebars/ai.js'
import { observabilitySidebar } from './sidebars/observability.js'
import { awsSidebar } from './sidebars/aws.js'
import { iacSidebar } from './sidebars/iac.js'
import { javaSidebar } from './sidebars/java.js'
import { javascriptSidebar } from './sidebars/javascript.js'
import { networkingSidebar } from './sidebars/networking.js'
import { kotlinSidebar } from './sidebars/kotlin.js'
import { tasksSidebar } from './sidebars/tasks.js'

export default defineConfig({
  title: 'Java Learning Portal',
  description: 'A comprehensive guide to Java, Spring, Design Patterns, and Software Architecture',
  ignoreDeadLinks: [/localhost/],
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3b82f6' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Java Learning Portal',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Learning Paths', link: '/learning-paths' },
      {
        text: 'Java',
        items: [
          { text: 'Java Core', link: '/java-core/' },
          { text: 'Modern Java (8–21)', link: '/modern-java/' },
          { text: 'Collections', link: '/collections/' },
          { text: 'JVM & Memory', link: '/java-memory/' },
          { text: 'Concurrency', link: '/concurrency/' },
          { text: 'Maven', link: '/java/maven' },
          { text: 'Kotlin', link: '/kotlin/' },
        ],
      },
      {
        text: 'Principles & Patterns',
        items: [
          { text: 'OOP & SOLID', link: '/principles/' },
          { text: 'Design Patterns', link: '/design-patterns/' },
        ],
      },
      {
        text: 'Ecosystem',
        items: [
          { text: 'Spring Framework', link: '/spring/' },
          { text: 'Databases', link: '/databases/' },
          { text: 'Architecture', link: '/architecture/' },
          { text: 'Security', link: '/security/' },
          { text: 'Google Cloud (GCP)', link: '/gcp/' },
          { text: 'Messaging (Kafka / RabbitMQ)', link: '/messaging/' },
          { text: 'Docker', link: '/docker/' },
          { text: 'Kubernetes', link: '/kubernetes/' },
          { text: 'CI/CD', link: '/cicd/' },
          { text: 'Testing', link: '/testing/' },
          { text: 'System Design', link: '/system-design/' },
          { text: 'Performance', link: '/performance/' },
          { text: 'Observability', link: '/observability/' },
          { text: 'AWS', link: '/aws/' },
          { text: 'IaC (Terraform / CloudFormation)', link: '/iac/' },
          { text: 'TypeScript', link: '/javascript/typescript' },
          { text: 'Networking', link: '/networking/' },
        ],
      },
      {
        text: 'AI & LLMs',
        items: [
          { text: 'Overview', link: '/ai/' },
          { text: 'LLM Fundamentals', link: '/ai/llm-fundamentals' },
          { text: 'Prompt Engineering', link: '/ai/prompt-engineering' },
          { text: 'RAG & Vector Search', link: '/ai/rag' },
          { text: 'AI Agents', link: '/ai/agents' },
          { text: 'MCP Protocol', link: '/ai/mcp' },
          { text: 'Agent Frameworks', link: '/ai/agent-frameworks' },
          { text: 'Thinking Models', link: '/ai/thinking-models' },
          { text: 'AI Workflows (n8n i inne)', link: '/ai/ai-workflows' },
          { text: 'Local LLMs (Ollama)',       link: '/ai/local-llms-setup' },
          { text: 'Claude API',                link: '/ai/claude-api' },
          { text: 'Claude Code',               link: '/ai/claude-code-features' },
          { text: 'RAG Hands-On (n8n)',        link: '/ai/n8n-rag-hands-on' },
          { text: 'Kafka & Event Streaming',   link: '/ai/kafka' },
          { text: 'Home Storage App',          link: '/ai/home-storage-project' },
        ],
      },
      { text: 'Tasks', link: '/tasks/' },
      {
        text: 'Quizzes',
        items: [
          { text: 'SOLID Quiz', link: '/quizzes/solid-quiz' },
          { text: 'Collections Quiz', link: '/quizzes/collections-quiz' },
          { text: 'Design Patterns Quiz', link: '/quizzes/design-patterns-quiz' },
          { text: 'Spring Quiz', link: '/quizzes/spring-quiz' },
          { text: 'Java Memory Quiz', link: '/quizzes/java-memory-quiz' },
          { text: 'Mixed Review', link: '/quizzes/mixed-review' },
          { text: 'Concurrency Quiz', link: '/quizzes/concurrency-quiz' },
          { text: 'Architecture Quiz', link: '/quizzes/architecture-quiz' },
          { text: 'Databases Quiz', link: '/quizzes/databases-quiz' },
          { text: 'Security Quiz', link: '/quizzes/security-quiz' },
          { text: 'Testing Quiz', link: '/quizzes/testing-quiz' },
          { text: 'Docker & Kubernetes Quiz', link: '/quizzes/docker-kubernetes-quiz' },
          { text: 'AI & LLMs Quiz', link: '/quizzes/ai-quiz' },
          { text: 'System Design Quiz', link: '/quizzes/system-design-quiz' },
          { text: 'Java Core Quiz', link: '/quizzes/java-core-quiz' },
          { text: 'Modern Java Quiz', link: '/quizzes/modern-java-quiz' },
        ],
      },
    ],

    sidebar: {
      '/principles/': principlesSidebar,
      '/java-core/': javaCoreSidebar,
      '/modern-java/': modernJavaSidebar,
      '/collections/': collectionsSidebar,
      '/java-memory/': javaMemorySidebar,
      '/design-patterns/': designPatternsSidebar,
      '/spring/': springSidebar,
      '/architecture/': architectureSidebar,
      '/security/': securitySidebar,
      '/gcp/': gcpSidebar,
      '/messaging/': messagingSidebar,
      '/docker/': dockerSidebar,
      '/kubernetes/': kubernetesSidebar,
      '/cicd/': cicdSidebar,
      '/testing/': testingSidebar,
      '/concurrency/': concurrencySidebar,
      '/databases/': databasesSidebar,
      '/system-design/': systemDesignSidebar,
      '/performance/': performanceSidebar,
      '/ai/': aiSidebar,
      '/observability/': observabilitySidebar,
      '/aws/': awsSidebar,
      '/iac/': iacSidebar,
      '/java/': javaSidebar,
      '/javascript/': javascriptSidebar,
      '/networking/': networkingSidebar,
      '/kotlin/': kotlinSidebar,
      '/tasks/': tasksSidebar,
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/jaccoolcode-source/learning-portal' },
    ],

    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
      label: 'On this page',
    },

    footer: {
      message: 'Built with VitePress',
      copyright: '© jaccoolcode-source',
    },

    editLink: {
      pattern: 'https://github.com/jaccoolcode-source/learning-portal/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },
  },

  markdown: {
    theme: {
      light: 'github-light',
      dark: 'github-dark',
    },
    lineNumbers: true,
    container: {
      tipLabel: 'Tip',
      warningLabel: 'Warning',
      dangerLabel: 'Danger',
      infoLabel: 'Info',
      detailsLabel: 'Details',
    },
  },
})
