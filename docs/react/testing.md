---
title: Testing React Apps
description: Vitest and React Testing Library — unit tests, integration tests, mocking, and testing patterns for React components and hooks
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, testing, vitest, react-testing-library, jest, unit-testing, integration-testing]
related:
  - /react/custom-hooks
  - /react/data-fetching
  - /react/forms
estimatedMinutes: 30
---

# Testing React Apps

<DifficultyBadge level="intermediate" />

Testing React components means testing behaviour from the user's perspective — what they see, what they can click, and what happens. React Testing Library enforces this model by discouraging implementation details and encouraging accessibility-first queries.

---

## Setup — Vitest + React Testing Library

```bash
npm install -D vitest @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals:     true,
    setupFiles:  "./src/test/setup.ts",
  },
});

// src/test/setup.ts
import "@testing-library/jest-dom";  // extends expect with .toBeInTheDocument(), etc.
```

---

## Core Concepts

React Testing Library has three key ideas:

1. **Query by what users see** — text, label, role — not implementation details like class names or component names
2. **`userEvent` over `fireEvent`** — simulates real browser interactions (focus, keyboard, pointer)
3. **Avoid testing state directly** — test the rendered output and user interactions

**Query priority (most preferred to least):**

| Priority | Query | When to use |
|----------|-------|-------------|
| 1 | `getByRole` | Buttons, inputs, headings — semantically meaningful |
| 2 | `getByLabelText` | Form inputs associated with a label |
| 3 | `getByPlaceholderText` | Inputs where no label exists |
| 4 | `getByText` | Non-interactive text content |
| 5 | `getByTestId` | Last resort when semantic query is impossible |

---

## Component Tests

```tsx
// components/Button.test.tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  it("renders with the correct label", () => {
    render(<Button onClick={() => {}}>Save Order</Button>);
    expect(screen.getByRole("button", { name: /save order/i })).toBeInTheDocument();
  });

  it("calls onClick when clicked", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick}>Click Me</Button>);
    await user.click(screen.getByRole("button", { name: /click me/i }));

    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("is disabled when disabled prop is true", async () => {
    const handleClick = vi.fn();
    const user = userEvent.setup();

    render(<Button onClick={handleClick} disabled>Submit</Button>);
    const button = screen.getByRole("button", { name: /submit/i });

    expect(button).toBeDisabled();
    await user.click(button);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
```

---

## Form Tests

```tsx
// components/LoginForm.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  const user = userEvent.setup();

  it("shows validation errors for empty submission", async () => {
    render(<LoginForm onLogin={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(screen.getByText(/password is required/i)).toBeInTheDocument();
  });

  it("calls onLogin with email and password on valid submission", async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    render(<LoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "secret123");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith({ email: "user@example.com", password: "secret123" });
    });
  });

  it("shows a server error when login fails", async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error("Invalid credentials"));
    render(<LoginForm onLogin={onLogin} />);

    await user.type(screen.getByLabelText(/email/i), "user@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpass");
    await user.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeInTheDocument();
  });
});
```

---

## Async Tests

```tsx
// components/OrderList.test.tsx
import { render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import { OrderList } from "./OrderList";
import * as api from "../api/orders";

vi.mock("../api/orders");  // auto-mock the module

const mockOrders: Order[] = [
  { id: "1", amount: 100, status: "PAID" },
  { id: "2", amount: 200, status: "PENDING" },
];

describe("OrderList", () => {
  it("shows loading spinner then renders orders", async () => {
    vi.mocked(api.getOrders).mockResolvedValue(mockOrders);
    render(<OrderList />);

    expect(screen.getByRole("status")).toBeInTheDocument();  // spinner has role="status"

    await waitForElementToBeRemoved(() => screen.queryByRole("status"));

    expect(screen.getByText(/order #1/i)).toBeInTheDocument();
    expect(screen.getByText(/order #2/i)).toBeInTheDocument();
  });

  it("shows error message when fetch fails", async () => {
    vi.mocked(api.getOrders).mockRejectedValue(new Error("Network error"));
    render(<OrderList />);

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });
});
```

---

## Testing with TanStack Query

Wrap the component in a `QueryClientProvider` with a fresh `QueryClient` per test.

```tsx
// test/utils.tsx — custom render with providers
import { render, type RenderOptions } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },  // don't retry in tests — fail fast
      mutations: { retry: false },
    },
  });
}

function AllProviders({ children }: { children: React.ReactNode }) {
  const queryClient = createTestQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const customRender = (ui: React.ReactElement, options?: RenderOptions) =>
  render(ui, { wrapper: AllProviders, ...options });

export * from "@testing-library/react";
export { customRender as render };

// Usage in tests — same API as standard render
import { render, screen } from "../test/utils";

it("loads and displays orders", async () => {
  vi.mocked(api.getOrders).mockResolvedValue(mockOrders);
  render(<OrderList />);
  expect(await screen.findByText(/order #1/i)).toBeInTheDocument();
});
```

---

## Testing Custom Hooks

Use `renderHook` from `@testing-library/react`.

```tsx
// hooks/useCounter.test.ts
import { renderHook, act } from "@testing-library/react";
import { useCounter } from "./useCounter";

describe("useCounter", () => {
  it("initialises with the provided value", () => {
    const { result } = renderHook(() => useCounter(10));
    expect(result.current.count).toBe(10);
  });

  it("increments the count", () => {
    const { result } = renderHook(() => useCounter(0));
    act(() => { result.current.increment(); });
    expect(result.current.count).toBe(1);
  });

  it("does not go below 0 when decrement is called", () => {
    const { result } = renderHook(() => useCounter(0));
    act(() => { result.current.decrement(); });
    expect(result.current.count).toBe(0);
  });
});
```

---

## Mocking

```tsx
// Mock an entire module
vi.mock("../api/orders", () => ({
  getOrders: vi.fn(),
  createOrder: vi.fn(),
}));

// Mock specific implementation per test
vi.mocked(api.getOrders).mockResolvedValueOnce([]);
vi.mocked(api.getOrders).mockRejectedValueOnce(new Error("fail"));

// Mock React Router hooks
vi.mock("react-router-dom", async () => ({
  ...(await vi.importActual("react-router-dom")),
  useNavigate: () => vi.fn(),
  useParams:   () => ({ orderId: "123" }),
}));

// Mock dates
vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

// Spy on a method without replacing it
const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
// ... run test ...
consoleSpy.mockRestore();
```

---

## Test Structure Best Practices

```tsx
// Prefer: describe block + it with full sentence
describe("CreateOrderForm", () => {
  it("submits successfully when all required fields are filled", async () => {});
  it("shows validation error when amount is negative", async () => {});
  it("shows server error message when API rejects", async () => {});
});

// Common setup
describe("OrderList with context", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createTestQueryClient();
    vi.clearAllMocks();  // reset mock call counts between tests
  });

  afterEach(() => {
    queryClient.clear();
  });
});
```

| Pattern | Rule |
|---------|------|
| **What to test** | User-visible behaviour, not implementation |
| **Query preference** | `getByRole` > `getByLabelText` > `getByText` > `getByTestId` |
| **Async** | Use `findBy*` (returns a promise) instead of `getBy*` + `await` |
| **Avoid** | Testing state values, internal function calls, snapshot tests |
| **One assertion per it** | One logical behaviour per test — easier to diagnose failures |

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
