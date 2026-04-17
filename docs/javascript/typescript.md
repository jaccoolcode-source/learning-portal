---
title: TypeScript
description: TypeScript — type system, interfaces, generics, utility types, decorators, tsconfig, and patterns for Java developers
category: javascript
pageClass: layout-javascript
difficulty: intermediate
tags: [typescript, javascript, types, generics, interfaces, decorators, tsconfig]
estimatedMinutes: 35
---

# TypeScript

<DifficultyBadge level="intermediate" />

TypeScript is a statically typed superset of JavaScript. It compiles to JavaScript and adds a powerful type system that catches errors at compile time.

---

## Why TypeScript (for Java Developers)

| Java | TypeScript |
|------|-----------|
| `String name` | `name: string` |
| `List<Order>` | `Order[]` or `Array<Order>` |
| `Optional<T>` | `T \| undefined` or `T \| null` |
| `interface OrderService` | `interface OrderService` |
| `<T extends Comparable<T>>` | `<T extends Comparable>` |
| Checked exceptions | No checked exceptions |
| Compiled to bytecode (JVM) | Compiled to JavaScript (runtime) |

---

## Basic Types

```typescript
// Primitives
let name: string = "Alice";
let age: number = 30;
let active: boolean = true;

// Arrays
let ids: number[] = [1, 2, 3];
let tags: Array<string> = ["java", "spring"];

// Tuple (fixed-length, mixed-type array)
let entry: [string, number] = ["alice", 42];

// Union types
let id: string | number = "abc123";
id = 42;  // also valid

// Literal types
type Direction = "north" | "south" | "east" | "west";
let dir: Direction = "north";

// any (escape hatch — avoid)
let data: any = fetchUnknownData();

// unknown (safer than any — must narrow before use)
let input: unknown = getInput();
if (typeof input === "string") {
    console.log(input.toUpperCase());  // safe after narrowing
}

// never (function that never returns)
function fail(msg: string): never {
    throw new Error(msg);
}
```

---

## Interfaces and Types

```typescript
// Interface (extendable, mergeable)
interface Order {
    id: string;
    customerId: string;
    amount: number;
    status: "PENDING" | "PAID" | "SHIPPED" | "DELIVERED";
    createdAt: Date;
    notes?: string;  // optional field
    readonly orderId: string;  // immutable after creation
}

// Type alias (can represent unions, primitives, etc.)
type OrderId = string;
type OrderStatus = "PENDING" | "PAID" | "SHIPPED" | "DELIVERED";

// Extending interfaces
interface PriorityOrder extends Order {
    priority: "HIGH" | "URGENT";
    slaHours: number;
}

// Intersection types
type OrderWithCustomer = Order & { customerName: string; customerEmail: string };

// Index signature (map-like)
interface StringMap {
    [key: string]: string;
}
```

---

## Classes

```typescript
abstract class BaseEntity {
    readonly id: string;
    protected createdAt: Date;

    constructor(id: string) {
        this.id = id;
        this.createdAt = new Date();
    }

    abstract validate(): boolean;
}

class Order extends BaseEntity implements Printable {
    private _status: OrderStatus = "PENDING";

    constructor(
        id: string,
        public readonly customerId: string,  // shorthand property assignment
        public amount: number
    ) {
        super(id);
    }

    get status(): OrderStatus {
        return this._status;
    }

    set status(value: OrderStatus) {
        if (value === "PENDING") throw new Error("Cannot reset to PENDING");
        this._status = value;
    }

    validate(): boolean {
        return this.amount > 0 && !!this.customerId;
    }

    print(): string {
        return `Order ${this.id}: £${this.amount} [${this._status}]`;
    }
}
```

---

## Generics

```typescript
// Generic function
function first<T>(arr: T[]): T | undefined {
    return arr[0];
}

const firstNumber = first([1, 2, 3]);     // T inferred as number
const firstString = first(["a", "b"]);   // T inferred as string

// Generic with constraints
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
    return obj[key];
}

const order: Order = { id: "1", customerId: "c1", amount: 99.99, status: "PENDING" };
const amount = getProperty(order, "amount");  // type: number
// getProperty(order, "invalid");             // compile error

// Generic class
class Repository<T extends BaseEntity> {
    private items: Map<string, T> = new Map();

    save(entity: T): void {
        this.items.set(entity.id, entity);
    }

    findById(id: string): T | undefined {
        return this.items.get(id);
    }

    findAll(): T[] {
        return Array.from(this.items.values());
    }
}

const orderRepo = new Repository<Order>();
orderRepo.save(new Order("1", "c1", 99));
```

---

## Utility Types

```typescript
interface User {
    id: string;
    name: string;
    email: string;
    password: string;
    role: "admin" | "user";
}

type PartialUser = Partial<User>;              // all fields optional
type RequiredUser = Required<PartialUser>;    // all fields required
type ReadonlyUser = Readonly<User>;           // all fields readonly
type UserPreview = Pick<User, "id" | "name">; // only id and name
type PublicUser = Omit<User, "password">;     // everything except password
type UserRecord = Record<string, User>;       // { [key: string]: User }

// Conditional types
type NonNullable<T> = T extends null | undefined ? never : T;
type ReturnType<T extends (...args: any) => any> = T extends (...args: any) => infer R ? R : never;

// Template literal types
type EventName = "order" | "payment" | "shipment";
type EventCreated = `${EventName}:created`;
// → "order:created" | "payment:created" | "shipment:created"
```

---

## Type Guards and Narrowing

```typescript
// typeof guard
function formatId(id: string | number): string {
    if (typeof id === "number") {
        return id.toFixed(0);
    }
    return id.toUpperCase();
}

// instanceof guard
function processOrder(order: Order | PriorityOrder): void {
    if (order instanceof PriorityOrder) {
        console.log(`SLA: ${order.slaHours}h`);
    }
}

// Custom type guard (user-defined predicate)
function isPriorityOrder(order: Order): order is PriorityOrder {
    return "priority" in order && "slaHours" in order;
}

// Discriminated unions (most robust pattern)
type PaymentEvent =
    | { type: "CHARGED"; amount: number; transactionId: string }
    | { type: "REFUNDED"; amount: number; reason: string }
    | { type: "FAILED"; errorCode: string };

function handlePayment(event: PaymentEvent): void {
    switch (event.type) {
        case "CHARGED":
            console.log(`Charged £${event.amount}, tx: ${event.transactionId}`);
            break;
        case "REFUNDED":
            console.log(`Refunded £${event.amount}: ${event.reason}`);
            break;
        case "FAILED":
            console.log(`Failed: ${event.errorCode}`);
            break;
    }
}
```

---

## Async/Await

```typescript
interface ApiResponse<T> {
    data: T;
    status: number;
}

async function fetchOrder(id: string): Promise<Order> {
    const response = await fetch(`/api/orders/${id}`);
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json() as Promise<Order>;
}

// Promise.all — parallel fetching
async function fetchMultiple(ids: string[]): Promise<Order[]> {
    return Promise.all(ids.map(fetchOrder));
}

// Error handling
async function safeLoad(id: string): Promise<Order | null> {
    try {
        return await fetchOrder(id);
    } catch (error) {
        if (error instanceof Error) {
            console.error(error.message);
        }
        return null;
    }
}
```

---

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",           // output JS version
    "module": "ESNext",           // module system
    "lib": ["ES2022", "DOM"],     // built-in type definitions
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,               // enables all strict checks
    "strictNullChecks": true,     // null/undefined are not assignable to other types
    "noImplicitAny": true,        // error on implicit 'any'
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "exactOptionalPropertyTypes": true,
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "declaration": true,          // generate .d.ts files
    "sourceMap": true             // for debugging
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Interview Quick-Fire

**Q: What's the difference between `interface` and `type` in TypeScript?**
Both define shapes, but: interfaces are extendable (can be extended with `extends`, can be merged by reopening), while types can represent unions, intersections, and primitives. Use `interface` for object shapes that might be extended; `type` for unions and complex derived types.

**Q: What is a discriminated union?**
A union of types where each member has a common literal-type field (the discriminant). TypeScript narrows the type in switch/if blocks based on the discriminant — giving exhaustive, type-safe handling of variants. Equivalent to Java sealed classes.

**Q: What does `strict: true` enable?**
It enables: `strictNullChecks` (null/undefined not assignable), `noImplicitAny` (no implicit any), `strictFunctionTypes`, `strictPropertyInitialization`, `alwaysStrict`. This is the recommended baseline — it catches the most common JS bugs at compile time.

<RelatedTopics :topics="['/javascript/', '/ai/claude-api']" />

[→ Back to JavaScript & TypeScript](/javascript/)
