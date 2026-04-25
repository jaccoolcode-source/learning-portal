---
title: React
description: Comprehensive React guide — fundamentals, hooks, state management, routing, data fetching, forms, styling, testing, and performance
category: react
pageClass: layout-react
difficulty: beginner
tags: [react, javascript, typescript, frontend, hooks, state-management]
estimatedMinutes: 10
---

# React

React is a JavaScript library for building user interfaces through declarative, component-based architecture. It is the most widely used frontend library in the industry and the foundation of frameworks like Next.js and Remix.

---

## Why React?

- **Component model** — UI is composed of small, reusable functions that each manage their own state
- **Declarative** — describe what the UI should look like; React reconciles the DOM efficiently
- **Massive ecosystem** — unmatched library support for routing, state, data fetching, forms, and testing
- **Transferable skills** — React Native reuses the same mental model for iOS and Android
- **Industry standard** — the majority of frontend job listings require React or equivalent experience

---

## Section Map

| Page | What You'll Learn |
|------|------------------|
| [Fundamentals](/react/fundamentals) | JSX, components, props, state, events, conditional rendering, lists |
| [Hooks](/react/hooks) | useState, useEffect, useContext, useRef, useMemo, useCallback — patterns and pitfalls |
| [Custom Hooks](/react/custom-hooks) | Extracting logic into reusable, testable hooks |
| [State Management](/react/state-management) | Context API, Redux Toolkit, Zustand, Jotai — when to use each |
| [Routing](/react/routing) | React Router v6 — nested routes, loaders, navigation guards |
| [Data Fetching](/react/data-fetching) | TanStack Query, SWR, Axios — caching, loading, and error patterns |
| [Forms](/react/forms) | React Hook Form + Zod — validation, field arrays, server errors |
| [Styling](/react/styling) | CSS Modules, Tailwind CSS, styled-components, shadcn/ui |
| [Testing](/react/testing) | Vitest + React Testing Library — unit and integration tests |
| [Performance](/react/performance) | memo, lazy, Suspense, code splitting, profiling |

---

## Ecosystem Map

```
React Core
├── Routing        → React Router v6 / TanStack Router
├── State          → Context API / Redux Toolkit / Zustand / Jotai
├── Data Fetching  → TanStack Query (React Query) / SWR / Axios
├── Forms          → React Hook Form + Zod
├── Styling        → Tailwind CSS / CSS Modules / styled-components / shadcn/ui
├── Testing        → Vitest + React Testing Library
├── Build Tool     → Vite (preferred) / Create React App (legacy)
└── Frameworks     → Next.js (SSR/SSG) / Remix / Astro
```

---

## Key Concepts Glossary

| Term | Definition |
|------|-----------|
| **Component** | A function that accepts props and returns JSX |
| **JSX** | HTML-like syntax compiled to `React.createElement()` calls |
| **Props** | Read-only inputs passed from parent to child component |
| **State** | Mutable data owned by a component; changes trigger a re-render |
| **Hook** | A function starting with `use` that adds state or lifecycle to function components |
| **Virtual DOM** | React's in-memory tree; diffed against the real DOM for efficient updates |
| **Re-render** | React calling the component function again to compute updated output |
| **Side effect** | Anything outside the render cycle: API calls, subscriptions, timers, DOM mutations |
| **Reconciliation** | React's algorithm for determining the minimal DOM changes needed |

---

## Learning Path

```
Fundamentals  →  Hooks  →  Custom Hooks
                    ↓
      State Management  →  Routing  →  Data Fetching
                    ↓
      Forms  →  Styling  →  Testing  →  Performance
```

## Prerequisites

- JavaScript ES6+: arrow functions, destructuring, spread/rest, modules, Promises, async/await
- HTML and CSS fundamentals
- TypeScript basics recommended — all examples in this section use TypeScript
