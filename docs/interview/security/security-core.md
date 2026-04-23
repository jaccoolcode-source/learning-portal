# TypeScript & Security

**Q60 to Q61** · [← Security Overview](./index)

---

## Q60: TypeScript for Java Developers

> Many backend Java developers work in full-stack teams. TypeScript is close enough to Java that you can be productive quickly — but the differences trip people up.

TypeScript is a **statically typed superset of JavaScript**. It compiles to plain JavaScript. For Java developers, the mental model maps well — but the type system is structural (not nominal), and null handling works differently.

**Java → TypeScript mental map:**

| Java | TypeScript |
|------|-----------|
| `class` | `class` (same syntax) |
| `interface` | `interface` |
| `enum` | `enum` (or `const` union type) |
| `Optional<T>` | `T \| undefined` or `T \| null` |
| `List<T>` | `T[]` or `Array<T>` |
| `Map<K, V>` | `Map<K, V>` or `Record<K, V>` |
| `void` | `void` |
| `Object` | `object` or `unknown` |
| Generics `<T>` | Generics `<T>` (same syntax) |
| Lambda `x -> x + 1` | Arrow function `x => x + 1` |

::: details Full model answer

**Structural vs Nominal typing:**
Java uses nominal typing — two types are compatible only if they explicitly share an inheritance relationship.

TypeScript uses structural typing — two types are compatible if they have the same shape (same properties/methods).

```typescript
interface Point { x: number; y: number; }
interface Coordinate { x: number; y: number; }

// In Java, Point and Coordinate are different types.
// In TypeScript — they are compatible because same structure.
function print(p: Point) { console.log(p.x, p.y); }
const c: Coordinate = { x: 1, y: 2 };
print(c);  // ✅ works — same shape
```

**Null safety — TypeScript's `strictNullChecks`:**
```typescript
// With strictNullChecks: true (always enable this)
let name: string = null;        // ❌ compile error
let name: string | null = null; // ✅ explicit null

// Null coalescing (like Java Optional.orElse)
const display = user.name ?? "Anonymous";

// Optional chaining (like Java Optional.map)
const city = user?.address?.city;  // undefined if any is null
```

**Key TypeScript concepts for Java developers:**

**Union types** (no Java equivalent — more powerful than overloading):
```typescript
type Result = Success | Failure;
type Id = string | number;

function process(input: string | number) {
    if (typeof input === "string") {
        return input.toUpperCase();
    }
    return input * 2;
}
```

**Type narrowing:**
```typescript
function handleError(error: unknown) {
    if (error instanceof Error) {
        console.log(error.message);  // TypeScript knows it's an Error here
    }
}
```

**Generics (same idea as Java, slightly different constraints):**
```typescript
function first<T>(arr: T[]): T | undefined {
    return arr[0];
}

// Generic interface
interface Repository<T, ID> {
    findById(id: ID): Promise<T | undefined>;
    save(entity: T): Promise<T>;
}
```

**`async/await` (Java's CompletableFuture equivalent):**
```typescript
// TypeScript async/await
async function fetchOrder(id: string): Promise<Order> {
    const response = await fetch(`/api/orders/${id}`);
    if (!response.ok) throw new Error("Order not found");
    return response.json() as Promise<Order>;
}

// Error handling
try {
    const order = await fetchOrder("123");
} catch (error) {
    console.error(error);
}
```

**`interface` vs `type` alias:**
```typescript
// interface — extendable, better for public APIs
interface User {
    id: string;
    name: string;
}
interface AdminUser extends User {
    permissions: string[];
}

// type alias — more flexible, supports unions/intersections
type ApiResponse<T> = { data: T; status: number } | { error: string; status: number };
```

**Common pitfalls for Java developers:**
- `===` vs `==` — always use `===` (strict equality, no type coercion)
- `this` context — arrow functions capture `this` lexically; regular functions don't
- Prototype chain — `class` in TypeScript is syntactic sugar over prototypes
- `undefined` vs `null` — TypeScript has both; prefer `undefined` for missing values
- `any` type — effectively turns off type checking; use `unknown` instead

**tsconfig.json — recommended settings:**
```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "noImplicitAny": true,
    "target": "ES2022",
    "module": "NodeNext",
    "outDir": "./dist"
  }
}
```

:::

> [!TIP] Golden Tip
> The most important insight for a Java developer: TypeScript's **structural typing** means you often don't need explicit `implements` — if your object has the right shape, it satisfies the interface. This feels strange coming from Java but enables very flexible patterns. The second gotcha: **`any` is the enemy** — it silently disables type checking and spreads through the codebase. Always prefer `unknown` (forces you to narrow the type before using it) over `any`.

**Follow-up questions:**
- What is the difference between structural and nominal typing?
- What is the difference between `interface` and `type` in TypeScript?
- How does TypeScript handle null and undefined differently from Java?
- What is the `unknown` type and when would you use it instead of `any`?

---

## Q61: MS Entra, OAuth2 & JWT

> Authentication and authorisation come up in almost every senior interview. Know the OAuth2 flows, how JWT works, and how to integrate with Microsoft Entra (formerly Azure AD).

**OAuth2 roles:**
| Role | Description |
|------|-------------|
| **Resource Owner** | The user |
| **Client** | The application requesting access |
| **Authorization Server** | Issues tokens (MS Entra, Keycloak, Okta) |
| **Resource Server** | The API that validates tokens and serves resources |

**OAuth2 grant types (flows):**

| Flow | Use case |
|------|---------|
| **Authorization Code + PKCE** | User-facing web/mobile apps (recommended) |
| **Client Credentials** | Machine-to-machine (service accounts, backend APIs) |
| **Device Code** | CLI tools, smart TVs |
| ~~Implicit~~ | Deprecated — use Auth Code + PKCE |
| ~~Resource Owner Password~~ | Deprecated — never send user credentials to client |

::: details Full model answer

**Authorization Code + PKCE flow:**
```
1. User clicks "Login"
2. App generates code_verifier (random) + code_challenge (SHA256 of verifier)
3. App redirects to: /authorize?
     response_type=code
     &client_id=...
     &redirect_uri=https://app/callback
     &scope=openid profile email
     &code_challenge=...
     &code_challenge_method=S256

4. User authenticates at MS Entra
5. Entra redirects to: https://app/callback?code=AUTH_CODE

6. App exchanges code:
   POST /token
   code=AUTH_CODE
   code_verifier=...  ← proves the app that started the flow is the same one finishing it
   client_id=...
   grant_type=authorization_code

7. Entra returns: access_token + id_token + refresh_token
```

PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks — critical for public clients (mobile apps, SPAs) that can't keep a client secret.

**Client Credentials flow (service-to-service):**
```
Service A → POST /token
            client_id=service-a
            client_secret=...
            grant_type=client_credentials
            scope=api://order-service/.default

            ← access_token (no user context)

Service A → GET /orders
            Authorization: Bearer <access_token>
            ← Order Service validates token
```

**JWT (JSON Web Token) structure:**
```
header.payload.signature
```

```json
// Header
{ "alg": "RS256", "typ": "JWT", "kid": "key-id-123" }

// Payload
{
  "iss": "https://login.microsoftonline.com/tenant-id/v2.0",
  "sub": "user-object-id",
  "aud": "api://order-service",
  "exp": 1716825600,
  "iat": 1716822000,
  "roles": ["Order.Read", "Order.Write"],
  "scp": "openid profile",
  "name": "Jan Kowalski",
  "preferred_username": "jan@example.com"
}

// Signature: RS256(base64(header) + "." + base64(payload), private_key)
```

**JWT validation (what the Resource Server MUST check):**
1. **Signature** — verify using the public key from the issuer's JWKS endpoint
2. **`exp`** — token is not expired
3. **`iss`** — issuer matches expected (`https://login.microsoftonline.com/{tenant}`)
4. **`aud`** — audience matches YOUR API's app URI (`api://your-app-id`)
5. **`nbf`** (if present) — token is not used before its valid time

**Never trust a JWT without validating the signature.** The payload is base64-encoded, not encrypted — anyone can read it. The signature is what makes it trustworthy.

**Spring Boot + MS Entra configuration:**
```yaml
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://login.microsoftonline.com/{tenant-id}/v2.0
          # Spring auto-fetches JWKS from issuer's well-known endpoint
```

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
            );
        return http.build();
    }

    private JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter converter = new JwtGrantedAuthoritiesConverter();
        converter.setAuthoritiesClaimName("roles");  // MS Entra app roles
        converter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter jwtConverter = new JwtAuthenticationConverter();
        jwtConverter.setJwtGrantedAuthoritiesConverter(converter);
        return jwtConverter;
    }
}

// Method-level security
@RestController
public class OrderController {

    @GetMapping("/orders")
    @PreAuthorize("hasRole('Order.Read')")
    public List<OrderDto> getOrders() { ... }

    @PostMapping("/orders")
    @PreAuthorize("hasRole('Order.Write')")
    public OrderDto createOrder(@RequestBody CreateOrderRequest req) { ... }
}
```

**MS Entra specific concepts:**
- **App Registration** — registers your application in Entra
- **App Roles** — coarse-grained permissions (e.g., `Order.Read`, `Order.Write`) assigned to users/groups
- **Scopes** — fine-grained delegated permissions (user grants the app permission to act on their behalf)
- **Managed Identity** — allows Azure resources (App Service, AKS) to authenticate to other Azure services without credentials
- **MSAL (Microsoft Authentication Library)** — client library for acquiring tokens

**Token types:**
| Token | Purpose | Lifetime |
|-------|---------|---------|
| **Access Token** | Calls APIs — included in `Authorization` header | ~1 hour |
| **Refresh Token** | Gets new access tokens silently | Days/weeks |
| **ID Token** | Identifies the user (OpenID Connect) — claims about the person | ~1 hour |

**Refresh token rotation:**
When a refresh token is used to get a new access token, the old refresh token is revoked and a new one is issued. If a stolen refresh token is used, the original token also becomes invalid — triggering a re-login.

:::

> [!TIP] Golden Tip
> The most important validation step candidates forget: **always validate the `aud` (audience) claim**. Without it, an access token issued for Service A can be replayed against Service B (confused deputy attack). Spring Security's resource server validates `aud` automatically when you set `issuer-uri` — but if you validate JWTs manually, this is the check that's almost always missing. Also: **never log JWT payloads** — they contain PII (name, email, group membership). Log the `sub` (subject ID) only.

**Follow-up questions:**
- What is the difference between Authorization Code + PKCE and Client Credentials flow?
- What claims must you validate when receiving a JWT?
- What is the confused deputy problem in OAuth2?
- What is a Managed Identity in Azure and why is it preferred over client secrets?
