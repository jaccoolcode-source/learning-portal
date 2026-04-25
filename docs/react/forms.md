---
title: Forms in React
description: React Hook Form and Zod — controlled vs uncontrolled inputs, validation, field arrays, and server error handling
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, forms, react-hook-form, zod, validation, controlled, uncontrolled]
related:
  - /react/fundamentals
  - /react/hooks
  - /react/data-fetching
estimatedMinutes: 25
---

# Forms in React

<DifficultyBadge level="intermediate" />

Forms are where most UI complexity lives — validation, async submission, server errors, and field arrays. React Hook Form eliminates re-renders on every keystroke, and Zod provides schema-based validation with type inference.

---

## Controlled vs Uncontrolled Inputs

| | Controlled | Uncontrolled |
|--|-----------|--------------|
| **State location** | React state (`useState`) | DOM (`ref`) |
| **Value access** | `value` prop | `ref.current.value` |
| **Re-render on change** | Every keystroke | Never |
| **Validation** | Inline | On submit |
| **Best for** | Real-time feedback | Simple forms, file inputs |

```tsx
// Controlled — React owns the value
function ControlledInput() {
  const [value, setValue] = useState("");
  return <input value={value} onChange={e => setValue(e.target.value)} />;
}

// Uncontrolled — DOM owns the value
function UncontrolledInput() {
  const ref = useRef<HTMLInputElement>(null);
  const handleSubmit = () => console.log(ref.current?.value);
  return <input ref={ref} defaultValue="" />;
}
```

::: info
React Hook Form uses **uncontrolled** inputs by default (`register` attaches a ref), which is why it outperforms controlled approaches for large forms. Controlled mode is available via `Controller` for third-party UI components.
:::

---

## React Hook Form + Zod Setup

```bash
npm install react-hook-form zod @hookform/resolvers
```

```tsx
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

// 1. Define schema — single source of truth for types and validation
const orderSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  amount:     z.coerce.number().min(0.01, "Amount must be positive").max(1_000_000),
  currency:   z.enum(["GBP", "EUR", "USD"]).default("GBP"),
  notes:      z.string().max(500).optional(),
  priority:   z.boolean().default(false),
});

type OrderFormData = z.infer<typeof orderSchema>;

// 2. Component
function CreateOrderForm({ onSuccess }: { onSuccess: (order: Order) => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isValid, isDirty },
    reset,
    watch,
  } = useForm<OrderFormData>({
    resolver:      zodResolver(orderSchema),
    defaultValues: { currency: "GBP", priority: false },
    mode:          "onBlur",  // validate on blur, re-validate on change after first error
  });

  const onSubmit = async (data: OrderFormData) => {
    try {
      const order = await api.createOrder(data);
      reset();
      onSuccess(order);
    } catch (err) {
      // Map server validation errors back to specific fields
      if (err instanceof ApiError && err.fieldErrors) {
        Object.entries(err.fieldErrors).forEach(([field, message]) => {
          setError(field as keyof OrderFormData, { message: String(message) });
        });
      } else {
        setError("root", { message: "Failed to create order. Please try again." });
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      {/* Root-level error */}
      {errors.root && <p className="error root-error">{errors.root.message}</p>}

      <div className="field">
        <label htmlFor="customerId">Customer</label>
        <input
          id="customerId"
          {...register("customerId")}
          className={errors.customerId ? "input input-error" : "input"}
        />
        {errors.customerId && <span className="error">{errors.customerId.message}</span>}
      </div>

      <div className="field">
        <label htmlFor="amount">Amount</label>
        <input
          id="amount"
          type="number"
          step="0.01"
          {...register("amount")}
          className={errors.amount ? "input input-error" : "input"}
        />
        {errors.amount && <span className="error">{errors.amount.message}</span>}
      </div>

      <div className="field">
        <label htmlFor="currency">Currency</label>
        <select id="currency" {...register("currency")}>
          <option value="GBP">GBP</option>
          <option value="EUR">EUR</option>
          <option value="USD">USD</option>
        </select>
      </div>

      <div className="field">
        <label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" {...register("notes")} rows={4} />
        {errors.notes && <span className="error">{errors.notes.message}</span>}
      </div>

      <div className="field field-checkbox">
        <input id="priority" type="checkbox" {...register("priority")} />
        <label htmlFor="priority">Priority order</label>
      </div>

      <button type="submit" disabled={isSubmitting || !isDirty}>
        {isSubmitting ? "Creating…" : "Create Order"}
      </button>
    </form>
  );
}
```

---

## Controller — Third-Party Components

`register` works on native HTML inputs. For custom components (date pickers, select libraries, sliders), use `Controller`.

```tsx
import { Controller } from "react-hook-form";
import DatePicker from "react-datepicker";
import Select from "react-select";

function AdvancedOrderForm() {
  const { control, handleSubmit } = useForm<FormData>({ resolver: zodResolver(schema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {/* Custom date picker */}
      <Controller
        name="deliveryDate"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <div className="field">
            <label>Delivery Date</label>
            <DatePicker
              selected={value}
              onChange={onChange}
              minDate={new Date()}
              className={error ? "input-error" : ""}
            />
            {error && <span className="error">{error.message}</span>}
          </div>
        )}
      />

      {/* react-select */}
      <Controller
        name="status"
        control={control}
        render={({ field }) => (
          <Select
            {...field}
            options={[
              { value: "PENDING", label: "Pending" },
              { value: "PAID",    label: "Paid" },
              { value: "SHIPPED", label: "Shipped" },
            ]}
          />
        )}
      />
    </form>
  );
}
```

---

## Field Arrays — Dynamic Rows

```tsx
import { useFieldArray } from "react-hook-form";

const orderWithItemsSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(
    z.object({
      productId: z.string().min(1, "Product required"),
      quantity:  z.coerce.number().int().min(1).max(999),
      unitPrice: z.coerce.number().min(0.01),
    })
  ).min(1, "At least one item is required"),
});

type FormData = z.infer<typeof orderWithItemsSchema>;

function MultiLineOrderForm() {
  const { register, control, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(orderWithItemsSchema),
    defaultValues: { items: [{ productId: "", quantity: 1, unitPrice: 0 }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "items" });

  return (
    <form onSubmit={handleSubmit(console.log)}>
      <input {...register("customerId")} placeholder="Customer ID" />

      <div className="items-section">
        <h3>Order Items</h3>
        {errors.items?.root && <p className="error">{errors.items.root.message}</p>}

        {fields.map((field, index) => (
          <div key={field.id} className="item-row">
            <input
              {...register(`items.${index}.productId`)}
              placeholder="Product ID"
            />
            {errors.items?.[index]?.productId && (
              <span className="error">{errors.items[index].productId?.message}</span>
            )}

            <input
              {...register(`items.${index}.quantity`)}
              type="number"
              min="1"
            />

            <input
              {...register(`items.${index}.unitPrice`)}
              type="number"
              step="0.01"
              min="0"
            />

            <button
              type="button"
              onClick={() => remove(index)}
              disabled={fields.length === 1}
            >
              Remove
            </button>
          </div>
        ))}

        <button
          type="button"
          onClick={() => append({ productId: "", quantity: 1, unitPrice: 0 })}
        >
          + Add item
        </button>
      </div>

      <button type="submit">Submit Order</button>
    </form>
  );
}
```

---

## Advanced Zod Schemas

```tsx
// Cross-field validation — password confirmation
const signUpSchema = z.object({
  email:           z.string().email("Invalid email"),
  password:        z.string().min(8, "At least 8 characters").regex(/[A-Z]/, "Need uppercase"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],  // attach error to this field
});

// Conditional validation
const paymentSchema = z.discriminatedUnion("method", [
  z.object({
    method:    z.literal("card"),
    cardNumber: z.string().regex(/^\d{16}$/, "16 digits"),
    cvv:       z.string().regex(/^\d{3}$/, "3 digits"),
  }),
  z.object({
    method:   z.literal("bank_transfer"),
    iban:     z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{4,}$/, "Invalid IBAN"),
    bic:      z.string().min(8).max(11),
  }),
]);

// Transform: string → Date
const dateSchema = z.string().transform(s => new Date(s));

// Partial schema for patch/update operations
type CreateOrder = z.infer<typeof orderSchema>;
type UpdateOrder = z.infer<typeof orderSchema.partial()>;
```

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
