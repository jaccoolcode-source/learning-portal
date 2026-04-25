---
title: React Performance
description: memo, useMemo, useCallback, lazy, Suspense, code splitting, and profiling — eliminating unnecessary re-renders and improving load time
category: react
pageClass: layout-react
difficulty: advanced
tags: [react, performance, memo, lazy, suspense, code-splitting, profiling, optimization]
related:
  - /react/hooks
  - /react/custom-hooks
  - /react/state-management
estimatedMinutes: 25
---

# React Performance

<DifficultyBadge level="advanced" />

React is fast by default. Most apps never need manual optimisation. When you do hit a performance problem, measure first — the profiler shows exactly which components are slow and why.

---

## The Re-render Model

React re-renders a component when:

1. Its own state changes (`useState`, `useReducer`)
2. Its parent re-renders (React re-renders all children by default)
3. Its context value changes (`useContext`)

Re-renders are not inherently bad — they are cheap if the output is the same. The cost is in unnecessary renders that produce identical DOM, or renders with expensive calculations inside.

```tsx
// Every time ParentComponent re-renders, ExpensiveChild also re-renders —
// even if childData hasn't changed.
function ParentComponent() {
  const [count, setCount] = useState(0);
  return (
    <>
      <button onClick={() => setCount(c => c + 1)}>{count}</button>
      <ExpensiveChild data={childData} />  {/* re-renders on every count change */}
    </>
  );
}
```

---

## React.memo

Wraps a component and skips re-rendering if its props haven't changed (shallow equality).

```tsx
import { memo } from "react";

interface OrderRowProps {
  order: Order;
  onSelect: (id: string) => void;
}

// Only re-renders if order or onSelect reference changes
const OrderRow = memo(function OrderRow({ order, onSelect }: OrderRowProps) {
  console.log(`Rendering order ${order.id}`);
  return (
    <tr onClick={() => onSelect(order.id)}>
      <td>{order.id}</td>
      <td>£{order.amount}</td>
      <td>{order.status}</td>
    </tr>
  );
});

// PROBLEM: without useCallback, onSelect is a new function on every parent render,
// defeating memo.
function OrderTable({ orders }: { orders: Order[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // useCallback makes the function reference stable
  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  return (
    <table>
      <tbody>
        {orders.map(order => (
          <OrderRow key={order.id} order={order} onSelect={handleSelect} />
        ))}
      </tbody>
    </table>
  );
}
```

::: warning
`memo` uses shallow comparison. If you construct a new object or array literal directly in the JSX prop (e.g. `config={&#123; timeout: 5000 &#125;}`), memo won't help — the reference changes every render even if the contents are identical. Memoize the prop value with `useMemo` or define it outside the component.
:::

---

## useMemo for Expensive Computations

```tsx
function OrderDashboard({ orders }: { orders: Order[] }) {
  const [filter, setFilter] = useState<OrderStatus>("all");
  const [sortBy, setSortBy] = useState<"date" | "amount">("date");

  // Recomputes only when orders, filter, or sortBy changes
  const processedOrders = useMemo(() => {
    const filtered = filter === "all"
      ? orders
      : orders.filter(o => o.status === filter);

    return [...filtered].sort((a, b) =>
      sortBy === "amount" ? b.amount - a.amount : b.createdAt - a.createdAt
    );
  }, [orders, filter, sortBy]);

  // Separate memo — only recomputes when processedOrders changes
  const stats = useMemo(() => ({
    count:   processedOrders.length,
    total:   processedOrders.reduce((s, o) => s + o.amount, 0),
    avgPaid: processedOrders.filter(o => o.status === "PAID")
               .reduce((s, o, _, arr) => s + o.amount / arr.length, 0),
  }), [processedOrders]);

  return (
    <>
      <Stats {...stats} />
      <Filters filter={filter} onFilter={setFilter} />
      <SortControls sortBy={sortBy} onSort={setSortBy} />
      <OrderList orders={processedOrders} />
    </>
  );
}
```

---

## Code Splitting with lazy and Suspense

Split your bundle so users only download the code they need for the current route.

```tsx
import { lazy, Suspense } from "react";

// Each lazy import creates a separate chunk
const AdminDashboard  = lazy(() => import("./pages/AdminDashboard"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage"));
const ReportsPage     = lazy(() => import("./pages/ReportsPage"));

function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/"                element={<HomePage />} />         {/* eager */}
        <Route path="/orders/:id"      element={<OrderDetailPage />} />  {/* lazy */}
        <Route path="/admin/*"         element={<AdminDashboard />} />   {/* lazy */}
        <Route path="/reports"         element={<ReportsPage />} />      {/* lazy */}
      </Routes>
    </Suspense>
  );
}

// Nested Suspense — different fallbacks for different sections
function AdminDashboard() {
  const Charts    = lazy(() => import("./AdminCharts"));
  const UserTable = lazy(() => import("./UserTable"));

  return (
    <div className="admin">
      <Suspense fallback={<ChartSkeleton />}>
        <Charts />
      </Suspense>
      <Suspense fallback={<TableSkeleton />}>
        <UserTable />
      </Suspense>
    </div>
  );
}
```

---

## Suspense for Data (React 18+)

React 18 allows Suspense to handle async data loading, not just lazy imports.

```tsx
import { Suspense } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";

// Component suspends while data loads — no isLoading check needed
function OrderDetail({ orderId }: { orderId: string }) {
  const { data: order } = useSuspenseQuery({
    queryKey: ["orders", orderId],
    queryFn:  () => api.getOrder(orderId),
  });

  // Only renders when data is available
  return <OrderCard order={order} />;
}

// Wrapper handles the loading and error states
function OrderDetailPage({ orderId }: { orderId: string }) {
  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <Suspense fallback={<OrderSkeleton />}>
        <OrderDetail orderId={orderId} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

---

## Virtualisation — Long Lists

Rendering 10,000 rows brings every browser to its knees. Virtualisation renders only visible rows.

```bash
npm install @tanstack/react-virtual
```

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

function VirtualOrderList({ orders }: { orders: Order[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count:           orders.length,
    getScrollElement: () => parentRef.current,
    estimateSize:    () => 60,   // estimated row height in px
    overscan:        5,           // extra rows above/below viewport
  });

  return (
    <div ref={parentRef} style={{ height: "600px", overflow: "auto" }}>
      {/* Total height to maintain correct scroll position */}
      <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.index}
            style={{
              position:  "absolute",
              top:       0,
              left:      0,
              width:     "100%",
              height:    `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <OrderRow order={orders[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## State Colocation

Moving state down is often more effective than memoisation.

```tsx
// SLOW — parent re-renders on every keystroke, re-rendering all children
function Page() {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <>
      <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
      <ExpensiveList />       {/* re-renders on every keystroke */}
      <AnotherExpensiveList /> {/* also re-renders */}
    </>
  );
}

// FAST — search state is colocated in its own component
function SearchInput() {
  const [searchQuery, setSearchQuery] = useState("");
  return <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />;
}

function Page() {
  return (
    <>
      <SearchInput />        {/* only this re-renders on keystroke */}
      <ExpensiveList />
      <AnotherExpensiveList />
    </>
  );
}
```

---

## Profiling

**React DevTools Profiler** — record a session, see which components re-rendered and how long they took.

1. Open React DevTools → Profiler tab
2. Click Record
3. Interact with the page
4. Stop recording
5. Inspect the flame graph — wide bars = slow renders, unexpected bars = unnecessary re-renders

**Key metrics to look for:**

| Metric | What it means |
|--------|---------------|
| Render count | How many times a component rendered |
| Render reason | "Props changed", "State changed", "Context changed" |
| Render duration | Time in ms — flag anything consistently >16ms |
| Commit duration | Total time React spent updating the DOM |

**In code:**

```tsx
// Mark expensive operations for the browser performance timeline
function expensiveOperation() {
  performance.mark("start-operation");
  // ... slow code ...
  performance.mark("end-operation");
  performance.measure("My Operation", "start-operation", "end-operation");
}

// why-did-you-render — log unnecessary re-renders in development
// npm install @welldone-software/why-did-you-render
import "./wdyr";  // add before React imports in development
```

---

## Performance Checklist

| Check | Fix |
|-------|-----|
| Component re-renders when props haven't changed | Wrap in `React.memo` + use `useCallback` for function props |
| Expensive calculation on every render | Move to `useMemo` |
| New object/array literal passed as prop every render | Memoize with `useMemo` |
| Large initial bundle | `React.lazy` + `Suspense` per route |
| Long list of 100+ items | `@tanstack/react-virtual` |
| State too high in the tree | Colocate state closer to where it is used |
| All consumers re-render on context change | Split contexts or move to Zustand/Jotai |

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
