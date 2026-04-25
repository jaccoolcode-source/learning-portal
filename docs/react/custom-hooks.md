---
title: Custom Hooks
description: Extracting reusable, testable logic into custom hooks — patterns, composition, and best practices
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, hooks, custom-hooks, reusability, abstraction]
related:
  - /react/hooks
  - /react/data-fetching
  - /react/state-management
estimatedMinutes: 20
---

# Custom Hooks

<DifficultyBadge level="intermediate" />

Custom hooks extract stateful logic from components into reusable functions. A custom hook is any function that starts with `use` and calls other hooks. They are the primary way to share logic between components without changing their tree structure.

---

## Why Custom Hooks?

Without custom hooks, shared logic must live in a component or be duplicated across components. With them:

- Logic is testable in isolation
- Components become thin and declarative
- The same logic works across unrelated components
- No wrapper component pollution (unlike render props or HOCs)

```tsx
// Before — logic mixed into the component
function UserProfile({ id }: { id: string }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchUser(id).then(setUser).catch(setError).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner />;
  if (error)   return <ErrorBanner error={error} />;
  return <UserCard user={user!} />;
}

// After — component is clean; logic is reusable
function UserProfile({ id }: { id: string }) {
  const { data: user, loading, error } = useUser(id);
  if (loading) return <Spinner />;
  if (error)   return <ErrorBanner error={error} />;
  return <UserCard user={user!} />;
}
```

---

## Building a Data-Fetching Hook

```tsx
import { useState, useEffect } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useFetch<T>(url: string): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<T>;
      })
      .then(json => { if (!cancelled) setData(json); })
      .catch(err => { if (!cancelled) setError(err); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [url, tick]);

  const refetch = () => setTick(t => t + 1);

  return { data, loading, error, refetch };
}

// Usage
function OrderPage({ orderId }: { orderId: string }) {
  const { data, loading, error, refetch } = useFetch<Order>(`/api/orders/${orderId}`);

  if (loading) return <Spinner />;
  if (error)   return <button onClick={refetch}>Retry</button>;
  return <OrderDetail order={data!} />;
}
```

::: tip
For production data-fetching, use TanStack Query or SWR instead. They provide caching, background refetching, and request deduplication that a hand-rolled hook cannot.
:::

---

## Local Storage Hook

```tsx
function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch {
      console.warn(`Failed to save ${key} to localStorage`);
    }
  };

  return [storedValue, setValue] as const;
}

// Usage
function ThemeToggle() {
  const [theme, setTheme] = useLocalStorage<"light" | "dark">("theme", "light");

  return (
    <button onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}>
      Current: {theme}
    </button>
  );
}
```

---

## Window / Media Query Hook

```tsx
import { useState, useEffect } from "react";

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    setMatches(media.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return size;
}

// Usage
function ResponsiveLayout() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const { width } = useWindowSize();

  return isMobile ? <MobileNav /> : <DesktopNav />;
}
```

---

## Debounce Hook

```tsx
import { useState, useEffect } from "react";

function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

// Usage — search input that doesn't fire on every keystroke
function ProductSearch() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);

  const { data: results } = useFetch<Product[]>(
    debouncedQuery ? `/api/products?q=${debouncedQuery}` : ""
  );

  return (
    <>
      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…" />
      <ProductList products={results ?? []} />
    </>
  );
}
```

---

## Toggle and Boolean Hooks

```tsx
function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue(v => !v), []);
  const setTrue  = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);
  return { value, toggle, setTrue, setFalse };
}

function useDisclosure() {
  return useToggle(false);
}

// Usage
function Modal() {
  const { value: isOpen, setTrue: open, setFalse: close } = useDisclosure();
  return (
    <>
      <button onClick={open}>Open modal</button>
      {isOpen && <ModalDialog onClose={close} />}
    </>
  );
}
```

---

## Click Outside Hook

```tsx
import { useRef, useEffect } from "react";

function useClickOutside<T extends HTMLElement>(callback: () => void) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        callback();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [callback]);

  return ref;
}

// Usage
function Dropdown({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

  return (
    <div ref={ref} className="dropdown">
      <button onClick={() => setOpen(o => !o)}>{label}</button>
      {open && <ul className="dropdown-menu">...</ul>}
    </div>
  );
}
```

---

## Async Action Hook

```tsx
interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  execute: (...args: unknown[]) => Promise<void>;
}

function useAsync<T>(asyncFn: (...args: unknown[]) => Promise<T>): AsyncState<T> {
  const [data, setData]       = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<Error | null>(null);

  const execute = useCallback(async (...args: unknown[]) => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn(...args);
      setData(result);
    } catch (err) {
      setError(err as Error);
    } finally {
      setLoading(false);
    }
  }, [asyncFn]);

  return { data, loading, error, execute };
}

// Usage
function DeleteButton({ orderId }: { orderId: string }) {
  const { loading, error, execute } = useAsync(() => api.deleteOrder(orderId));
  return (
    <>
      <button onClick={execute} disabled={loading}>
        {loading ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="error">{error.message}</p>}
    </>
  );
}
```

---

## Best Practices

| Rule | Reason |
|------|--------|
| Always prefix with `use` | React's linter enforces hook rules only for functions starting with `use` |
| Return an object for multiple values | Named properties are self-documenting and extensible |
| Return a tuple for two values | Mirrors `useState` — allows renaming at the call site |
| Document the API surface | The hook signature is its contract — name parameters clearly |
| Keep hooks focused | One concern per hook; compose multiple hooks in components |
| Test hooks with `renderHook` | Import from `@testing-library/react` |

```tsx
// Good — named return for clarity
const { user, loading, error } = useCurrentUser();

// Good — tuple for two values (allows renaming)
const [theme, setTheme] = useLocalStorage("theme", "light");

// Avoid — positional tuple with 3+ values (hard to remember order)
const [a, b, c, d] = useSomething();
```

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
