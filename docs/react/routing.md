---
title: React Router v6
description: Client-side routing with React Router v6 — nested routes, data loaders, navigation, and protected routes
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, routing, react-router, navigation, nested-routes, loaders]
related:
  - /react/fundamentals
  - /react/hooks
  - /react/data-fetching
estimatedMinutes: 25
---

# React Router v6

<DifficultyBadge level="intermediate" />

React Router v6 is the standard client-side routing library for React. It enables navigation between views without a full page reload, supports nested layouts, and (since v6.4) provides data loading directly in route definitions.

---

## Setup

```bash
npm install react-router-dom
```

```tsx
// main.tsx
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { RootLayout } from "./layouts/RootLayout";
import { OrdersPage, ordersLoader } from "./pages/OrdersPage";
import { OrderDetailPage, orderLoader } from "./pages/OrderDetailPage";
import { LoginPage } from "./pages/LoginPage";
import { ErrorPage } from "./pages/ErrorPage";

const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <ErrorPage />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: "orders",
        element: <OrdersPage />,
        loader: ordersLoader,
        children: [
          { path: ":orderId", element: <OrderDetailPage />, loader: orderLoader },
        ],
      },
      { path: "login", element: <LoginPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}
```

---

## Nested Layouts with Outlet

`<Outlet />` renders the matched child route inside a parent layout.

```tsx
// RootLayout.tsx — persistent shell (nav + footer)
import { Outlet, NavLink } from "react-router-dom";

export function RootLayout() {
  return (
    <div className="app">
      <nav>
        <NavLink to="/" end className={({ isActive }) => isActive ? "active" : ""}>
          Home
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => isActive ? "active" : ""}>
          Orders
        </NavLink>
      </nav>

      <main>
        <Outlet />  {/* child route renders here */}
      </main>

      <footer>© 2024</footer>
    </div>
  );
}

// OrdersLayout.tsx — nested layout for the orders section
export function OrdersLayout() {
  return (
    <div className="orders-layout">
      <aside>
        <OrderFilters />
      </aside>
      <section>
        <Outlet />  {/* /orders or /orders/:orderId renders here */}
      </section>
    </div>
  );
}
```

---

## Data Loaders (v6.4+)

Loaders fetch data before the route renders, eliminating loading spinners inside components.

```tsx
// pages/OrdersPage.tsx
import { useLoaderData } from "react-router-dom";

// Loader runs before the component mounts
export async function ordersLoader() {
  const orders = await api.getOrders();
  return { orders };  // returned data is available via useLoaderData()
}

export function OrdersPage() {
  const { orders } = useLoaderData() as { orders: Order[] };

  return (
    <ul>
      {orders.map(order => (
        <li key={order.id}>
          <Link to={`/orders/${order.id}`}>{order.id}</Link>
        </li>
      ))}
    </ul>
  );
}

// pages/OrderDetailPage.tsx
import { useLoaderData, useParams } from "react-router-dom";
import type { LoaderFunctionArgs } from "react-router-dom";

export async function orderLoader({ params }: LoaderFunctionArgs) {
  const order = await api.getOrder(params.orderId!);
  if (!order) throw new Response("Not Found", { status: 404 });
  return { order };
}

export function OrderDetailPage() {
  const { order } = useLoaderData() as { order: Order };
  return <OrderDetail order={order} />;
}
```

---

## Navigation

```tsx
import { useNavigate, useParams, useSearchParams, Link, NavLink } from "react-router-dom";

// Declarative navigation
<Link to="/orders">Orders</Link>
<Link to={`/orders/${id}`}>Order {id}</Link>
<Link to="/login" replace>Login</Link>  {/* replace instead of push */}

// NavLink — applies active class automatically
<NavLink
  to="/dashboard"
  className={({ isActive, isPending }) =>
    isActive ? "nav-link active" : isPending ? "nav-link loading" : "nav-link"
  }
>
  Dashboard
</NavLink>

// Programmatic navigation
function OrderForm() {
  const navigate = useNavigate();

  const handleSubmit = async (data: OrderInput) => {
    const order = await api.createOrder(data);
    navigate(`/orders/${order.id}`);      // forward navigation
    navigate(-1);                          // go back
    navigate("/login", { replace: true }); // replace history entry
  };
}

// Path params
function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  return <p>Viewing order: {orderId}</p>;
}

// Query / search params
function OrderList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status  = searchParams.get("status") ?? "all";
  const page    = Number(searchParams.get("page") ?? "1");

  const filterByStatus = (s: string) => {
    setSearchParams(prev => {
      prev.set("status", s);
      prev.set("page", "1");
      return prev;
    });
  };

  return (
    <>
      <button onClick={() => filterByStatus("PAID")}>Paid only</button>
      <p>Showing page {page}, status: {status}</p>
    </>
  );
}
```

---

## Protected Routes

```tsx
// components/RequireAuth.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface RequireAuthProps {
  children: React.ReactNode;
  roles?: string[];
}

export function RequireAuth({ children, roles }: RequireAuthProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) {
    // Redirect to login, preserve the attempted URL for redirect-back
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && !roles.some(r => user.roles.includes(r))) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
}

// In the router — wrap protected sections
{
  path: "admin",
  element: (
    <RequireAuth roles={["admin"]}>
      <AdminLayout />
    </RequireAuth>
  ),
  children: [
    { path: "users",   element: <UsersPage /> },
    { path: "reports", element: <ReportsPage /> },
  ],
}

// Login page — redirect back after login
function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from?.pathname ?? "/";

  const { login } = useAuth();

  const handleLogin = async (credentials: Credentials) => {
    await login(credentials);
    navigate(from, { replace: true });  // go back to where they came from
  };
}
```

---

## Actions and Form Mutations (v6.4+)

Route actions handle form submissions server-side style.

```tsx
import { Form, useActionData, redirect } from "react-router-dom";
import type { ActionFunctionArgs } from "react-router-dom";

export async function createOrderAction({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const data = Object.fromEntries(formData) as OrderInput;

  try {
    const order = await api.createOrder(data);
    return redirect(`/orders/${order.id}`);
  } catch (error) {
    return { errors: { form: "Failed to create order" } };
  }
}

export function CreateOrderPage() {
  const actionData = useActionData() as { errors?: Record<string, string> } | undefined;

  return (
    <Form method="post">
      <input name="customerId" placeholder="Customer ID" required />
      <input name="amount" type="number" placeholder="Amount" required />
      {actionData?.errors?.form && (
        <p className="error">{actionData.errors.form}</p>
      )}
      <button type="submit">Create Order</button>
    </Form>
  );
}

// Register the action in the router definition
{ path: "orders/new", element: <CreateOrderPage />, action: createOrderAction }
```

---

## Error Handling

```tsx
// pages/ErrorPage.tsx
import { useRouteError, isRouteErrorResponse, Link } from "react-router-dom";

export function ErrorPage() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    return (
      <div className="error-page">
        <h1>{error.status} {error.statusText}</h1>
        {error.status === 404 && <p>This page does not exist.</p>}
        {error.status === 403 && <p>You do not have access to this page.</p>}
        <Link to="/">Go home</Link>
      </div>
    );
  }

  return (
    <div className="error-page">
      <h1>Unexpected Error</h1>
      <p>{(error as Error).message}</p>
    </div>
  );
}
```

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
