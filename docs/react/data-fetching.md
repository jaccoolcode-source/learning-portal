---
title: Data Fetching
description: TanStack Query (React Query), SWR, and Axios — server state management, caching, loading states, and mutation patterns
category: react
pageClass: layout-react
difficulty: intermediate
tags: [react, data-fetching, tanstack-query, react-query, swr, axios, caching]
related:
  - /react/hooks
  - /react/custom-hooks
  - /react/state-management
estimatedMinutes: 30
---

# Data Fetching

<DifficultyBadge level="intermediate" />

Server data is not the same as client state. It has a remote source, can go stale, needs caching, and multiple components may need the same data simultaneously. TanStack Query and SWR manage this complexity so you don't have to.

---

## The Problem with useEffect Fetching

Writing fetch logic in `useEffect` is error-prone:

```tsx
// All of this boilerplate for every data fetch:
const [data, setData]       = useState(null);
const [loading, setLoading] = useState(true);
const [error, setError]     = useState(null);
const [stale, setStale]     = useState(false);

useEffect(() => {
  let cancelled = false;
  setLoading(true);
  api.getOrders()
    .then(d => { if (!cancelled) setData(d); })
    .catch(e => { if (!cancelled) setError(e); })
    .finally(() => { if (!cancelled) setLoading(false); });
  return () => { cancelled = true; };
}, []);
```

Missing from this pattern: caching, deduplication, background refetch, retry, pagination, optimistic updates. TanStack Query provides all of these out of the box.

---

## TanStack Query (React Query)

The most capable server-state library for React. Handles caching, background updates, deduplication, and mutations.

```bash
npm install @tanstack/react-query
```

**Setup:**

```tsx
// main.tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,        // data is fresh for 1 minute
      gcTime: 5 * 60_000,       // cache kept for 5 minutes after all observers unmount
      retry: 2,                  // retry failed queries twice
      refetchOnWindowFocus: true, // refetch when tab regains focus
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppRoutes />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

---

### useQuery — Reading Data

```tsx
import { useQuery } from "@tanstack/react-query";

// Define query keys as constants to avoid typos
export const queryKeys = {
  orders: {
    all:    () => ["orders"] as const,
    list:   (filters: OrderFilters) => ["orders", "list", filters] as const,
    detail: (id: string) => ["orders", "detail", id] as const,
  },
  users: {
    all:    () => ["users"] as const,
    detail: (id: string) => ["users", "detail", id] as const,
  },
};

// Fetching a list
function OrderList({ filters }: { filters: OrderFilters }) {
  const {
    data: orders,
    isLoading,
    isError,
    error,
    isFetching,   // true when background refetch is happening
  } = useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn:  () => api.getOrders(filters),
    staleTime: 30_000,  // override default for this specific query
  });

  if (isLoading) return <Spinner />;
  if (isError)   return <ErrorBanner message={(error as Error).message} />;

  return (
    <ul>
      {isFetching && <li className="refreshing">Refreshing…</li>}
      {orders?.map(order => <OrderItem key={order.id} order={order} />)}
    </ul>
  );
}

// Fetching a detail
function OrderDetail({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = useQuery({
    queryKey: queryKeys.orders.detail(orderId),
    queryFn:  () => api.getOrder(orderId),
    enabled:  !!orderId,  // don't fetch if no ID
  });

  if (isLoading) return <Spinner />;
  return <OrderCard order={order!} />;
}
```

---

### useMutation — Writing Data

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

function CreateOrderForm() {
  const queryClient = useQueryClient();

  const createOrder = useMutation({
    mutationFn: (data: CreateOrderInput) => api.createOrder(data),
    onSuccess: newOrder => {
      // Invalidate the list so it refetches with the new item
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all() });
      // Or set the detail cache directly (no refetch needed)
      queryClient.setQueryData(queryKeys.orders.detail(newOrder.id), newOrder);
    },
    onError: error => {
      toast.error((error as Error).message);
    },
  });

  return (
    <form onSubmit={e => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      createOrder.mutate({ customerId: String(data.get("customerId")), amount: Number(data.get("amount")) });
    }}>
      <input name="customerId" required />
      <input name="amount" type="number" required />
      <button type="submit" disabled={createOrder.isPending}>
        {createOrder.isPending ? "Creating…" : "Create Order"}
      </button>
      {createOrder.isError && <p className="error">{(createOrder.error as Error).message}</p>}
    </form>
  );
}
```

**Optimistic updates:**

```tsx
const updateOrderStatus = useMutation({
  mutationFn: ({ id, status }: { id: string; status: string }) =>
    api.updateOrder(id, { status }),

  onMutate: async ({ id, status }) => {
    await queryClient.cancelQueries({ queryKey: queryKeys.orders.detail(id) });
    const previous = queryClient.getQueryData(queryKeys.orders.detail(id));

    // Apply optimistic update immediately
    queryClient.setQueryData(queryKeys.orders.detail(id), (old: Order) => ({
      ...old,
      status,
    }));

    return { previous };  // returned as context
  },

  onError: (err, { id }, context) => {
    // Roll back on error
    queryClient.setQueryData(queryKeys.orders.detail(id), context?.previous);
  },

  onSettled: (data, err, { id }) => {
    // Always refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(id) });
  },
});
```

---

### Pagination and Infinite Scroll

```tsx
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";

// Standard pagination
function PaginatedOrders() {
  const [page, setPage] = useState(1);
  const { data, isPlaceholderData } = useQuery({
    queryKey: ["orders", "paginated", page],
    queryFn:  () => api.getOrders({ page, limit: 20 }),
    placeholderData: keepPreviousData,  // keep showing old data while next page loads
  });

  return (
    <>
      <OrderList orders={data?.items ?? []} />
      <button
        disabled={isPlaceholderData || !data?.hasNextPage}
        onClick={() => setPage(p => p + 1)}
      >
        Next
      </button>
    </>
  );
}

// Infinite scroll
function InfiniteOrderList() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey:           ["orders", "infinite"],
    queryFn:            ({ pageParam }) => api.getOrders({ cursor: pageParam, limit: 20 }),
    initialPageParam:   null as string | null,
    getNextPageParam:   lastPage => lastPage.nextCursor ?? null,
  });

  const allOrders = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <>
      {allOrders.map(o => <OrderItem key={o.id} order={o} />)}
      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? "Loading…" : hasNextPage ? "Load more" : "All loaded"}
      </button>
    </>
  );
}
```

---

## SWR

Smaller alternative by Vercel. Same concept (stale-while-revalidate), simpler API, fewer features.

```bash
npm install swr
```

```tsx
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

// Global fetcher (usually set via SWRConfig)
const fetcher = (url: string) => fetch(url).then(r => r.json());

// Reading
function OrderDetail({ orderId }: { orderId: string }) {
  const { data: order, error, isLoading } = useSWR<Order>(
    `/api/orders/${orderId}`,
    fetcher,
    { refreshInterval: 30_000 }  // poll every 30s
  );

  if (isLoading) return <Spinner />;
  if (error)     return <p>Error: {error.message}</p>;
  return <OrderCard order={order!} />;
}

// Mutations
function CancelButton({ orderId }: { orderId: string }) {
  const { trigger, isMutating } = useSWRMutation(
    `/api/orders/${orderId}`,
    (url, { arg }: { arg: { status: string } }) =>
      fetch(url, { method: "PATCH", body: JSON.stringify(arg) }).then(r => r.json())
  );

  return (
    <button
      onClick={() => trigger({ status: "CANCELLED" })}
      disabled={isMutating}
    >
      Cancel order
    </button>
  );
}
```

---

## Axios

HTTP client that adds request/response interceptors, automatic JSON parsing, and request cancellation.

```bash
npm install axios
```

```tsx
import axios from "axios";

// Create a typed API client instance
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// Request interceptor — attach auth token
apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor — handle 401 globally
apiClient.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// Typed API layer — use this with TanStack Query queryFn
export const ordersApi = {
  getAll:  (filters?: OrderFilters) => apiClient.get<Order[]>("/orders", { params: filters }).then(r => r.data),
  getById: (id: string)             => apiClient.get<Order>(`/orders/${id}`).then(r => r.data),
  create:  (data: CreateOrderInput) => apiClient.post<Order>("/orders", data).then(r => r.data),
  update:  (id: string, data: Partial<Order>) => apiClient.patch<Order>(`/orders/${id}`, data).then(r => r.data),
  delete:  (id: string)             => apiClient.delete(`/orders/${id}`),
};

// Usage with TanStack Query
const { data } = useQuery({
  queryKey: queryKeys.orders.all(),
  queryFn:  () => ordersApi.getAll(),
});
```

---

## Library Comparison

| | TanStack Query | SWR | Plain useEffect + Axios |
|--|---------------|-----|------------------------|
| **Caching** | Full (stale-while-revalidate) | Full | Manual |
| **Deduplication** | Yes | Yes | No |
| **Background refetch** | Yes | Yes | No |
| **Mutations** | `useMutation` with optimistic updates | `useSWRMutation` | Manual |
| **Pagination** | `keepPreviousData`, `useInfiniteQuery` | `useSWRInfinite` | Manual |
| **DevTools** | Yes | No | No |
| **Bundle size** | ~13 kB | ~4 kB | — |
| **Best for** | Most apps, complex mutation flows | Simpler apps, Next.js/Vercel | Learning; avoid in production |

---

## Quiz

→ [Test your knowledge](/quizzes/mixed-review)
