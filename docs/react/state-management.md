---
title: State Management
description: Context API, Redux Toolkit, Zustand, and Jotai — when to use each and how to structure global state in React
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, state-management, redux, zustand, jotai, context-api]
related:
  - /react/hooks
  - /react/custom-hooks
  - /react/data-fetching
estimatedMinutes: 30
---

# State Management

<DifficultyBadge level="intermediate" />

Not all state is equal. Local UI state belongs in `useState`. Data from a server belongs in a cache (TanStack Query). Everything else — auth, theme, cart, notifications — is global state. Choosing the right solution avoids re-render problems and keeps code maintainable.

---

## Decision Tree

```
Is the state only used in one component or its children?
  → useState / useReducer

Is the state actually server data (API responses)?
  → TanStack Query or SWR (not a state library)

Is it global UI state shared by unrelated components?
  Does it update rarely? (theme, auth, locale)
    → Context API
  Does it update frequently, or has many consumers?
    → Zustand or Jotai
  Is it a large existing codebase with DevTools / time-travel needs?
    → Redux Toolkit
```

---

## Context API

Built into React. Best for state that changes infrequently and has a moderate number of consumers.

```tsx
import { createContext, useContext, useState, useCallback } from "react";

// 1. Define context type
interface ThemeContextValue {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

// 2. Create context with a null default (enforced by the custom hook)
const ThemeContext = createContext<ThemeContextValue | null>(null);

// 3. Provider component owns the state
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const toggleTheme = useCallback(() => setTheme(t => (t === "light" ? "dark" : "light")), []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// 4. Custom hook for safe access
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

// 5. Consume anywhere
function ThemeButton() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Mode: {theme}</button>;
}

// 6. Wrap the app
function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppRoutes />
      </Router>
    </ThemeProvider>
  );
}
```

::: warning
Every component that consumes a context re-renders when any value in the context changes. If you store multiple unrelated values in one context (user + theme + notifications), changing any one of them re-renders all consumers. Split contexts by update frequency.
:::

**Context performance fix — split by responsibility:**

```tsx
// WRONG — one big context causes all consumers to re-render together
const AppContext = createContext({ user, theme, cart, notifications });

// CORRECT — one context per concern
const UserContext   = createContext<UserContextValue | null>(null);
const ThemeContext  = createContext<ThemeContextValue | null>(null);
const CartContext   = createContext<CartContextValue | null>(null);
```

---

## Zustand

Minimal, performant global state store with an unopinionated API. No provider required.

```bash
npm install zustand
```

```tsx
import { create } from "zustand";
import { persist } from "zustand/middleware";

// Define the store shape and actions together
interface CartStore {
  items: CartItem[];
  total: number;
  addItem: (product: Product, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

// create() returns a hook
export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      total: 0,

      addItem: (product, quantity) => {
        set(state => {
          const existing = state.items.find(i => i.productId === product.id);
          const items = existing
            ? state.items.map(i =>
                i.productId === product.id
                  ? { ...i, quantity: i.quantity + quantity }
                  : i
              )
            : [...state.items, { productId: product.id, name: product.name, price: product.price, quantity }];
          return { items, total: items.reduce((s, i) => s + i.price * i.quantity, 0) };
        });
      },

      removeItem: productId => {
        set(state => {
          const items = state.items.filter(i => i.productId !== productId);
          return { items, total: items.reduce((s, i) => s + i.price * i.quantity, 0) };
        });
      },

      clearCart: () => set({ items: [], total: 0 }),
    }),
    { name: "cart-storage" }  // persists to localStorage
  )
);

// Usage — subscribe to only what you need (prevents re-renders from unrelated changes)
function CartBadge() {
  const itemCount = useCartStore(state => state.items.length);
  return <span className="badge">{itemCount}</span>;
}

function CartTotal() {
  const total = useCartStore(state => state.total);
  return <span>£{total.toFixed(2)}</span>;
}

function AddToCartButton({ product }: { product: Product }) {
  const addItem = useCartStore(state => state.addItem);
  return <button onClick={() => addItem(product, 1)}>Add to cart</button>;
}
```

::: tip
Zustand's selector pattern (`useCartStore(state => state.total)`) is key to performance. Components only re-render when the selected slice changes, not the whole store.
:::

---

## Redux Toolkit (RTK)

The official, modern way to write Redux. Required only for large apps that need DevTools, time-travel debugging, or have complex async flows.

```bash
npm install @reduxjs/toolkit react-redux
```

```tsx
// store/ordersSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from "@reduxjs/toolkit";

interface OrdersState {
  items: Order[];
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
}

// Async action with built-in loading/error state
export const fetchOrders = createAsyncThunk("orders/fetchAll", async () => {
  const response = await api.getOrders();
  return response.data as Order[];
});

const ordersSlice = createSlice({
  name: "orders",
  initialState: { items: [], status: "idle", error: null } as OrdersState,
  reducers: {
    addOrder(state, action: PayloadAction<Order>) {
      state.items.push(action.payload);  // immer allows direct mutation
    },
    removeOrder(state, action: PayloadAction<string>) {
      state.items = state.items.filter(o => o.id !== action.payload);
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchOrders.pending,   state => { state.status = "loading"; })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchOrders.rejected,  (state, action) => {
        state.status = "failed";
        state.error = action.error.message ?? "Failed to load";
      });
  },
});

export const { addOrder, removeOrder } = ordersSlice.actions;
export default ordersSlice.reducer;

// store/index.ts
import { configureStore } from "@reduxjs/toolkit";
import ordersReducer from "./ordersSlice";

export const store = configureStore({
  reducer: { orders: ordersReducer },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// hooks/redux.ts — typed hooks (use instead of raw useSelector/useDispatch)
import { useDispatch, useSelector, TypedUseSelectorHook } from "react-redux";
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Component usage
function OrderList() {
  const dispatch = useAppDispatch();
  const { items, status } = useAppSelector(state => state.orders);

  useEffect(() => { dispatch(fetchOrders()); }, [dispatch]);

  if (status === "loading") return <Spinner />;
  return <ul>{items.map(o => <li key={o.id}>{o.id}</li>)}</ul>;
}

// Wrap app in Provider
import { Provider } from "react-redux";
function App() {
  return <Provider store={store}><AppRoutes /></Provider>;
}
```

---

## Jotai

Atomic state model — each atom is independent. Minimal API, great for fine-grained derived state.

```bash
npm install jotai
```

```tsx
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";

// Primitive atoms
const countAtom     = atom(0);
const userAtom      = atom<User | null>(null);

// Derived atom (read-only, computed)
const doubleAtom = atom(get => get(countAtom) * 2);

// Async atom
const userProfileAtom = atom(async get => {
  const user = get(userAtom);
  if (!user) return null;
  return fetch(`/api/users/${user.id}`).then(r => r.json());
});

// Writeable derived atom
const filteredOrdersAtom = atom(
  get => get(ordersAtom).filter(o => o.status === get(filterAtom)),
  (get, set, status: OrderStatus) => set(filterAtom, status)
);

// Components
function Counter() {
  const [count, setCount] = useAtom(countAtom);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

function DoubleDisplay() {
  const double = useAtomValue(doubleAtom);  // read-only
  return <p>Double: {double}</p>;
}

function ResetButton() {
  const setCount = useSetAtom(countAtom);  // write-only — no re-render on read
  return <button onClick={() => setCount(0)}>Reset</button>;
}
```

---

## Comparison

| | Context API | Zustand | Redux Toolkit | Jotai |
|--|------------|---------|--------------|-------|
| **Bundle size** | 0 (built-in) | ~1 kB | ~10 kB | ~3 kB |
| **Boilerplate** | Medium | Low | High | Very low |
| **DevTools** | React DevTools | Middleware | Redux DevTools | Jotai DevTools |
| **Performance** | Re-renders all consumers | Selector-based | Selector-based | Atom-based |
| **Async support** | Manual | Middleware | `createAsyncThunk` | Async atoms |
| **Best for** | Infrequent global state | Most apps | Large teams / enterprise | Fine-grained atoms |
| **Learning curve** | Low | Low | Medium | Low |

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
