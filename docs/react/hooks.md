---
title: React Hooks
description: useState, useEffect, useContext, useRef, useMemo, useCallback — patterns, rules, and common pitfalls
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, hooks, useState, useEffect, useContext, useRef, useMemo, useCallback]
related:
  - /react/fundamentals
  - /react/custom-hooks
  - /react/state-management
estimatedMinutes: 35
---

# React Hooks

<DifficultyBadge level="intermediate" />

Hooks let function components use state, side effects, and context without class components. Introduced in React 16.8, they are now the only component model you need.

---

## Rules of Hooks

React enforces two rules that all hooks must follow:

1. **Call hooks only at the top level** — never inside loops, conditions, or nested functions
2. **Call hooks only from React functions** — function components or custom hooks

```tsx
// WRONG — conditional hook call
function Component({ show }: { show: boolean }) {
  if (show) {
    const [count, setCount] = useState(0); // Error! Hook inside condition
  }
}

// CORRECT — keep hook unconditional, use the value conditionally
function Component({ show }: { show: boolean }) {
  const [count, setCount] = useState(0);
  if (!show) return null;
  return <p>{count}</p>;
}
```

---

## useState

Manages local component state. Returns the current value and a setter function.

```tsx
import { useState } from "react";

// Primitive state
const [count, setCount] = useState(0);
const [name, setName] = useState("");
const [open, setOpen] = useState(false);

// Expensive initial state — pass a function (runs once only)
const [data, setData] = useState(() => loadFromLocalStorage());

// Object state — always spread to avoid losing fields
const [user, setUser] = useState({ name: "", email: "", role: "user" });
setUser(prev => ({ ...prev, email: "new@example.com" }));

// Array state
const [items, setItems] = useState<string[]>([]);
const addItem = (item: string) => setItems(prev => [...prev, item]);
const removeItem = (id: number) => setItems(prev => prev.filter((_, i) => i !== id));
```

**useReducer — better for complex state logic:**

```tsx
import { useReducer } from "react";

type Action =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "reset"; payload: number };

function reducer(state: number, action: Action): number {
  switch (action.type) {
    case "increment": return state + 1;
    case "decrement": return state - 1;
    case "reset":     return action.payload;
    default:          return state;
  }
}

function Counter() {
  const [count, dispatch] = useReducer(reducer, 0);
  return (
    <>
      <p>{count}</p>
      <button onClick={() => dispatch({ type: "increment" })}>+</button>
      <button onClick={() => dispatch({ type: "decrement" })}>-</button>
      <button onClick={() => dispatch({ type: "reset", payload: 0 })}>Reset</button>
    </>
  );
}
```

---

## useEffect

Runs side effects after render: data fetching, subscriptions, DOM manipulation, timers.

```tsx
import { useEffect, useState } from "react";

function UserProfile({ userId }: { userId: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // Effect runs after render. userId is a dependency.
    let cancelled = false;  // prevent state update on unmounted component

    async function fetchUser() {
      try {
        setLoading(true);
        const data = await api.getUser(userId);
        if (!cancelled) setUser(data);
      } catch (err) {
        if (!cancelled) setError(err as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUser();

    // Cleanup runs before the next effect or on unmount
    return () => { cancelled = true; };
  }, [userId]);  // re-run only when userId changes

  if (loading) return <Spinner />;
  if (error)   return <ErrorMessage error={error} />;
  if (!user)   return null;
  return <UserCard user={user} />;
}
```

**Dependency array guide:**

| Dependency array | Runs |
|-----------------|------|
| Omitted | After every render |
| `[]` (empty) | Once on mount only |
| `[a, b]` | On mount, and whenever `a` or `b` changes |

::: warning
Missing dependencies in the array cause stale closures — the effect reads old values. The `eslint-plugin-react-hooks` exhaustive-deps rule catches these. Always include every variable from the component scope that is used inside the effect.
:::

**Common useEffect patterns:**

```tsx
// Event listener with cleanup
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [onClose]);

// Sync state to localStorage
useEffect(() => {
  localStorage.setItem("theme", theme);
}, [theme]);

// WebSocket subscription
useEffect(() => {
  const ws = new WebSocket(`wss://api.example.com/orders/${orderId}`);
  ws.onmessage = e => setOrder(JSON.parse(e.data));
  return () => ws.close();
}, [orderId]);
```

::: tip
If you find yourself writing a lot of `useEffect` for data fetching, switch to TanStack Query or SWR. They handle loading state, caching, and stale data automatically. See [Data Fetching](/react/data-fetching).
:::

---

## useContext

Reads a value from the nearest `Context.Provider` above in the tree, avoiding prop drilling.

```tsx
import { createContext, useContext, useState } from "react";

// 1. Define the shape and create the context
interface AuthContextValue {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// 2. Provide the context at the top of the tree
function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = async (credentials: Credentials) => {
    const u = await api.login(credentials);
    setUser(u);
  };

  const logout = () => {
    api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// 3. Custom hook for safe consumption (throws if used outside provider)
function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// 4. Consume anywhere in the tree
function ProfileButton() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return <button onClick={logout}>{user.name} — Log out</button>;
}
```

::: warning
Every consumer re-renders when the context value changes. For high-frequency updates (animation state, form fields), context will cause performance problems. Use Zustand, Jotai, or split contexts instead.
:::

---

## useRef

Returns a mutable ref object whose `.current` property is initialised with the passed value. Changing `.current` does **not** trigger a re-render.

```tsx
import { useRef, useEffect } from "react";

// 1. DOM references — accessing elements imperatively
function SearchInput({ autoFocus }: { autoFocus: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  return <input ref={inputRef} type="search" placeholder="Search..." />;
}

// 2. Persisting values without triggering re-renders
function Stopwatch() {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = () => {
    intervalRef.current = setInterval(() => {
      setElapsed(e => e + 1);
    }, 1000);
  };

  const stop = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
  };

  return (
    <div>
      <p>{elapsed}s</p>
      <button onClick={start}>Start</button>
      <button onClick={stop}>Stop</button>
    </div>
  );
}

// 3. Tracking previous value
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T>();
  useEffect(() => { ref.current = value; });
  return ref.current;
}
```

---

## useMemo

Memoizes an expensive computed value, recomputing only when dependencies change.

```tsx
import { useMemo } from "react";

function OrderSummary({ orders }: { orders: Order[] }) {
  // Only recalculates when `orders` array reference changes
  const stats = useMemo(() => {
    const total = orders.reduce((sum, o) => sum + o.amount, 0);
    const paid = orders.filter(o => o.status === "PAID").length;
    const avgAmount = orders.length > 0 ? total / orders.length : 0;
    return { total, paid, avgAmount, count: orders.length };
  }, [orders]);

  return (
    <div className="summary">
      <p>Orders: {stats.count}</p>
      <p>Paid: {stats.paid}</p>
      <p>Total: £{stats.total.toFixed(2)}</p>
      <p>Average: £{stats.avgAmount.toFixed(2)}</p>
    </div>
  );
}
```

::: info
`useMemo` is an optimisation — only reach for it when profiling shows a real bottleneck. Premature use adds complexity without benefit. Small arrays and simple calculations don't need it.
:::

---

## useCallback

Memoizes a function reference. Prevents child components wrapped in `React.memo` from re-rendering when the parent re-renders.

```tsx
import { useCallback, useState } from "react";

function ParentList() {
  const [items, setItems] = useState<string[]>([]);

  // Without useCallback, a new function is created on every render,
  // causing MemoizedChild to re-render even when items haven't changed.
  const handleDelete = useCallback((id: string) => {
    setItems(prev => prev.filter(item => item !== id));
  }, []);  // stable reference — setItems is guaranteed stable

  const handleAdd = useCallback((name: string) => {
    setItems(prev => [...prev, name]);
  }, []);

  return (
    <div>
      <AddForm onAdd={handleAdd} />
      {items.map(item => (
        <MemoizedChild key={item} item={item} onDelete={handleDelete} />
      ))}
    </div>
  );
}

// Only re-renders when its own props change
const MemoizedChild = React.memo(function Child({
  item,
  onDelete,
}: {
  item: string;
  onDelete: (id: string) => void;
}) {
  return (
    <li>
      {item}
      <button onClick={() => onDelete(item)}>Remove</button>
    </li>
  );
});
```

---

## Hook Pitfalls Summary

| Pitfall | Cause | Fix |
|---------|-------|-----|
| Infinite effect loop | Object/array in dependency array is recreated each render | Memoize with `useMemo`/`useCallback`, or use primitives as deps |
| Stale closure | Effect reads variable not in dependency array | Add it to the dep array or use a ref |
| State update on unmount | Async effect resolves after component unmounts | Use a cancelled flag in the effect cleanup |
| Too many re-renders | Setting state during render | Move state updates into effects or event handlers |
| Missing cleanup | Subscribing without unsubscribing | Return a cleanup function from `useEffect` |

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
