---
title: React Fundamentals
description: JSX, components, props, state, events, conditional rendering, and lists — the building blocks of every React app
category: react
pageClass: layout-react
difficulty: beginner
tags: [react, jsx, components, props, state, events, lists]
related:
  - /react/
  - /react/hooks
  - /javascript/typescript
estimatedMinutes: 25
---

# React Fundamentals

<DifficultyBadge level="beginner" />

Every React app is built from components — functions that accept props and return JSX. Understanding the component model, state, and the render cycle is the foundation everything else builds on.

---

## JSX

JSX is syntactic sugar over `React.createElement()`. It looks like HTML but compiles to JavaScript.

```tsx
// JSX
const element = <h1 className="title">Hello, {name}!</h1>;

// What it compiles to — you never write this directly
const element = React.createElement("h1", { className: "title" }, `Hello, ${name}!`);
```

**Key JSX rules:**
- Use `className` instead of `class`, `htmlFor` instead of `for`
- Every element must be closed: `<img />`, `<br />`
- Return a single root element — wrap siblings in `<>...</>` (Fragment)
- JavaScript expressions go inside `{}`
- Comments: `{/* like this */}`

```tsx
function Greeting({ name, hour }: { name: string; hour: number }) {
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <>
      <h1 className="title">
        {greeting}, {name}!
      </h1>
      {/* Fragments avoid adding an extra DOM node */}
      <p>Today is {new Date().toLocaleDateString()}.</p>
    </>
  );
}
```

---

## Components

A component is a function that returns JSX. Names start with a capital letter so React can distinguish them from HTML tags.

```tsx
interface UserCardProps {
  name: string;
  role: string;
  avatarUrl: string;
}

function UserCard({ name, role, avatarUrl }: UserCardProps) {
  return (
    <div className="card">
      <img src={avatarUrl} alt={`${name} avatar`} />
      <h2>{name}</h2>
      <span className="role">{role}</span>
    </div>
  );
}

// Arrow function variant — identical behaviour
const UserCard = ({ name, role, avatarUrl }: UserCardProps) => (
  <div className="card">
    <img src={avatarUrl} alt={`${name} avatar`} />
    <h2>{name}</h2>
    <span className="role">{role}</span>
  </div>
);
```

::: tip
Class components are legacy. All new code should use function components with hooks. You may encounter class components in older codebases, but there is no reason to write new ones.
:::

---

## Props

Props are the inputs to a component — immutable within the component. The parent owns them.

```tsx
interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}

function Button({
  label,
  variant = "primary",
  disabled = false,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      className={`btn btn-${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children ?? label}
    </button>
  );
}

// Usage
<Button label="Save" variant="primary" onClick={() => save()} />
<Button variant="danger" onClick={() => deleteItem(id)}>
  Delete Order
</Button>
```

**Prop patterns:**

```tsx
// Spread props — forward all attributes to an underlying element
function Input({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className ?? ""}`} {...rest} />;
}

// Children — content passed via JSX nesting
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h3 className="card-title">{title}</h3>
      <div className="card-body">{children}</div>
    </div>
  );
}

// Usage
<Card title="Order #123">
  <p>Amount: £99.99</p>
  <p>Status: PAID</p>
</Card>
```

---

## State

State is mutable data owned by a component. Calling the setter function triggers a re-render with the new value.

```tsx
import { useState } from "react";

function Counter() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <p>Count: {count}</p>
      {/* Functional update — safe when next value depends on previous */}
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <button onClick={() => setCount(c => c - 1)}>-</button>
      <button onClick={() => setCount(0)}>Reset</button>
    </div>
  );
}
```

::: warning
Always use the functional update form `setCount(c => c + 1)` when the new value depends on the previous value. The inline form `setCount(count + 1)` captures a stale closure in async callbacks.
:::

**Object state — always spread to preserve other fields:**

```tsx
interface OrderForm {
  customerId: string;
  amount: number;
  notes: string;
}

function OrderEditor() {
  const [form, setForm] = useState<OrderForm>({
    customerId: "",
    amount: 0,
    notes: "",
  });

  const updateField =
    <K extends keyof OrderForm>(field: K) =>
    (value: OrderForm[K]) => {
      setForm(prev => ({ ...prev, [field]: value }));
    };

  return (
    <form>
      <input
        value={form.customerId}
        onChange={e => updateField("customerId")(e.target.value)}
        placeholder="Customer ID"
      />
      <input
        type="number"
        value={form.amount}
        onChange={e => updateField("amount")(Number(e.target.value))}
      />
      <textarea
        value={form.notes}
        onChange={e => updateField("notes")(e.target.value)}
      />
    </form>
  );
}
```

::: info
For complex state with many fields, consider `useReducer` (covered in Hooks) or a form library like React Hook Form (covered in Forms).
:::

---

## Events

React wraps native browser events in `SyntheticEvent` for cross-browser consistency. TypeScript provides specific event types for each element.

```tsx
function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();  // always prevent default on forms
    console.log({ email, password });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="email"
        value={email}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={(e: React.KeyboardEvent) => {
          if (e.key === "Escape") setPassword("");
        }}
      />
      <button type="submit">Log in</button>
    </form>
  );
}
```

**Common event types:**

| Element | Handler prop | Event type |
|---------|-------------|-----------|
| `<form>` | `onSubmit` | `React.FormEvent<HTMLFormElement>` |
| `<input>` | `onChange` | `React.ChangeEvent<HTMLInputElement>` |
| `<button>` | `onClick` | `React.MouseEvent<HTMLButtonElement>` |
| `<input>` | `onKeyDown` | `React.KeyboardEvent<HTMLInputElement>` |
| `<div>` | `onFocus` | `React.FocusEvent<HTMLDivElement>` |

---

## Conditional Rendering

```tsx
function OrderStatus({ status, order }: { status: string; order: Order | null }) {
  // Early return for guard conditions
  if (!order) return <p className="empty">No order found.</p>;

  return (
    <div className="order-status">
      {/* Ternary — two branches */}
      {status === "PAID" ? (
        <SuccessBanner message="Payment confirmed" />
      ) : (
        <PendingBanner message="Awaiting payment" />
      )}

      {/* && short-circuit — single optional branch */}
      {order.items.length > 0 && <ItemList items={order.items} />}

      {/* Render nothing for a status */}
      {status !== "DRAFT" && <SubmitButton />}
    </div>
  );
}
```

::: danger
`{count && <Component />}` renders the number `0` when count is 0. JavaScript treats `0` as falsy for the `&&` condition but React renders it as text. Always use `{count > 0 && <Component />}` or a ternary.
:::

---

## Lists

Map over an array and return JSX elements. Every element needs a stable `key` prop that uniquely identifies it among its siblings.

```tsx
interface Product {
  id: string;
  name: string;
  price: number;
  inStock: boolean;
}

function ProductList({ products }: { products: Product[] }) {
  if (products.length === 0) {
    return <p className="empty-state">No products found.</p>;
  }

  return (
    <ul className="product-list">
      {products.map(product => (
        <li
          key={product.id}
          className={`product-item ${product.inStock ? "" : "out-of-stock"}`}
        >
          <span className="name">{product.name}</span>
          <span className="price">${product.price.toFixed(2)}</span>
          {!product.inStock && <span className="badge badge-red">Out of stock</span>}
        </li>
      ))}
    </ul>
  );
}
```

::: warning
Never use array index as `key` when the list can be reordered, filtered, or items inserted. Index keys cause React to reuse the wrong DOM nodes, producing subtle UI bugs and losing input state. Use a stable unique ID from your data.
:::

---

## Component Composition

State lives at the lowest common ancestor. Props flow down; events bubble up via callback props.

```tsx
// Container — owns state, orchestrates children
function OrderDashboard() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: orders = [] } = useOrders();

  return (
    <div className="dashboard">
      <OrderList
        orders={orders}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />
      {selectedId && (
        <OrderDetail
          orderId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// Presentational — receives data, emits events via callbacks
interface OrderListProps {
  orders: Order[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function OrderList({ orders, selectedId, onSelect }: OrderListProps) {
  return (
    <ul>
      {orders.map(order => (
        <li
          key={order.id}
          className={order.id === selectedId ? "selected" : ""}
          onClick={() => onSelect(order.id)}
        >
          #{order.id} — £{order.amount}
        </li>
      ))}
    </ul>
  );
}
```

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
