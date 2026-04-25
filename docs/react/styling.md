---
title: Styling in React
description: CSS Modules, Tailwind CSS, styled-components, and shadcn/ui — approaches, tradeoffs, and when to use each
category: react
pageClass: layout-react
difficulty: beginner
tags: [react, styling, css-modules, tailwind, styled-components, shadcn-ui, css-in-js]
related:
  - /react/fundamentals
  - /react/performance
estimatedMinutes: 20
---

# Styling in React

<DifficultyBadge level="beginner" />

React has no built-in styling solution — you choose the approach. Each has tradeoffs around performance, DX, co-location, and type safety.

---

## CSS Modules

Locally scoped CSS by file. Styles don't leak across components. Zero runtime cost.

```
src/
├── components/
│   ├── Button.tsx
│   └── Button.module.css
```

```css
/* Button.module.css */
.button {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 0.2s;
}

.primary   { background-color: #2563eb; color: white; }
.secondary { background-color: #e5e7eb; color: #1f2937; }
.danger    { background-color: #dc2626; color: white; }

.button:disabled { opacity: 0.5; cursor: not-allowed; }
.button:hover:not(:disabled) { filter: brightness(0.9); }
```

```tsx
import styles from "./Button.module.css";
import clsx from "clsx";  // npm install clsx

interface ButtonProps {
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}

function Button({ variant = "primary", disabled, onClick, children }: ButtonProps) {
  return (
    <button
      className={clsx(styles.button, styles[variant], { [styles.disabled]: disabled })}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
```

::: tip
`clsx` (or its faster cousin `tailwind-merge` for Tailwind) is the standard way to conditionally join class names. Avoid string concatenation.
:::

---

## Tailwind CSS

Utility-first CSS framework. Write styles directly as class names. No separate CSS files for most components.

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

```tsx
// No CSS file needed — all styles are class names
function Button({ variant = "primary", disabled, children }: ButtonProps) {
  const base = "px-4 py-2 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary:   "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-200 text-gray-800 hover:bg-gray-300",
    danger:    "bg-red-600 text-white hover:bg-red-700",
  };

  return (
    <button className={`${base} ${variants[variant]}`} disabled={disabled}>
      {children}
    </button>
  );
}

// Card component
function OrderCard({ order }: { order: Order }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Order #{order.id}</h2>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          order.status === "PAID"
            ? "bg-green-100 text-green-700"
            : "bg-yellow-100 text-yellow-700"
        }`}>
          {order.status}
        </span>
      </div>
      <p className="text-gray-600">£{order.amount.toFixed(2)}</p>
    </div>
  );
}
```

**`cn()` helper — merge Tailwind classes safely:**

```tsx
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";  // npm install tailwind-merge

// This is the standard pattern used by shadcn/ui
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Usage
<button className={cn("px-4 py-2 bg-blue-600", disabled && "opacity-50")}>
```

---

## styled-components (CSS-in-JS)

Co-locate styles with JavaScript. Full access to props and themes. Runtime CSS generation.

```bash
npm install styled-components
npm install -D @types/styled-components
```

```tsx
import styled, { ThemeProvider, css } from "styled-components";

// Typed theme
const theme = {
  colors: {
    primary: "#2563eb",
    danger:  "#dc2626",
    text:    "#1f2937",
  },
  spacing: { sm: "0.5rem", md: "1rem", lg: "1.5rem" },
  radii:   { sm: "4px", md: "8px" },
};

type Theme = typeof theme;

// Styled component with props
interface StyledButtonProps {
  $variant?: "primary" | "danger";  // $ prefix prevents DOM prop warnings
}

const StyledButton = styled.button<StyledButtonProps>`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  border: none;
  border-radius: ${({ theme }) => theme.radii.sm};
  font-weight: 600;
  cursor: pointer;
  color: white;
  transition: filter 0.2s;

  ${({ $variant = "primary", theme }) => css`
    background-color: ${$variant === "danger" ? theme.colors.danger : theme.colors.primary};
  `}

  &:disabled { opacity: 0.5; cursor: not-allowed; }
  &:hover:not(:disabled) { filter: brightness(0.9); }
`;

// Usage with ThemeProvider
function App() {
  return (
    <ThemeProvider theme={theme}>
      <StyledButton $variant="primary" onClick={() => {}}>Save</StyledButton>
      <StyledButton $variant="danger">Delete</StyledButton>
    </ThemeProvider>
  );
}

// Extend an existing styled component
const LargeButton = styled(StyledButton)`
  padding: ${({ theme }) => `${theme.spacing.md} ${theme.spacing.lg}`};
  font-size: 1.1rem;
`;
```

::: warning
CSS-in-JS with a runtime (styled-components, Emotion) adds a JavaScript payload and generates styles at runtime. This can hurt performance on low-end devices and complicates server-side rendering. Consider Linaria or vanilla-extract for zero-runtime alternatives.
:::

---

## shadcn/ui

Not a library — it is a collection of copy-paste components built on Radix UI primitives and styled with Tailwind. You own the code, can edit it freely, and it ships no runtime overhead.

```bash
npx shadcn@latest init
npx shadcn@latest add button
npx shadcn@latest add input dialog card
```

```tsx
// shadcn components live in your project — fully editable
// components/ui/button.tsx (generated by shadcn/ui)
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";  // CVA for variant handling

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:     "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:     "border border-input bg-background hover:bg-accent",
        ghost:       "hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-9 rounded-md px-3",
        lg:      "h-11 rounded-md px-8",
        icon:    "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

// Usage — same API as any other button
<Button variant="destructive" size="sm" onClick={handleDelete}>Delete</Button>

// Dialog from shadcn/ui
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

<Dialog>
  <DialogTrigger asChild>
    <Button>Create Order</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>New Order</DialogTitle>
    </DialogHeader>
    <CreateOrderForm />
  </DialogContent>
</Dialog>
```

---

## Comparison

| | CSS Modules | Tailwind CSS | styled-components | shadcn/ui |
|--|------------|-------------|------------------|-----------|
| **Runtime cost** | None | None | Runtime CSS gen | None |
| **Co-location** | Separate file | Inline classes | Same file | Separate component |
| **Type safety** | Class name strings | Class name strings | Full (props) | Full (CVA variants) |
| **Theming** | CSS variables | Config + vars | ThemeProvider | CSS variables |
| **SSR support** | Yes | Yes | Needs setup | Yes |
| **Iteration speed** | Medium | Fast | Fast | Very fast (pre-built) |
| **Customisability** | High | High | High | Full (you own the code) |
| **Best for** | Component libraries | Most apps | Design systems | Rapid prototyping |

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
