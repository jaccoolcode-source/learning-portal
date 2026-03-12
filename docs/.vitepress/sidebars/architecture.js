export const architectureSidebar = [
  {
    text: 'Architecture',
    items: [{ text: 'Overview', link: '/architecture/' }],
  },
  {
    text: 'Patterns',
    collapsed: false,
    items: [
      { text: 'Microservices', link: '/architecture/microservices' },
      { text: 'Domain-Driven Design', link: '/architecture/ddd' },
      { text: 'CQRS & Event Sourcing', link: '/architecture/cqrs-event-sourcing' },
      { text: 'REST & Web APIs', link: '/architecture/rest-web' },
      { text: 'GraphQL', link: '/architecture/graphql' },
      { text: 'Webhooks', link: '/architecture/webhooks' },
      { text: 'API Auth & Signing', link: '/architecture/api-auth' },
      { text: 'Distributed Patterns', link: '/architecture/distributed-patterns' },
    ],
  },
]
