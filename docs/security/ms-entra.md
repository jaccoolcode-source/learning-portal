---
title: Microsoft Entra (Azure AD)
description: Microsoft Entra ID — app registrations, OAuth2/OIDC flows, managed identities, enterprise SSO, and Spring Boot integration
category: security
pageClass: layout-security
difficulty: intermediate
tags: [azure, entra, azure-ad, oauth2, oidc, sso, jwt, managed-identity, spring-security]
estimatedMinutes: 30
---

# Microsoft Entra (Azure AD)

<DifficultyBadge level="intermediate" />

Microsoft Entra ID (formerly Azure Active Directory) is Microsoft's cloud identity platform. It provides authentication, authorization, and identity management for Microsoft services, enterprise apps, and custom applications.

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Tenant** | An isolated instance of Entra ID for an organisation. Has a unique tenant ID. |
| **App Registration** | Registers your app in Entra — gets a client ID and configures OAuth2/OIDC settings. |
| **Service Principal** | The identity of an app within a specific tenant. App registration = global; service principal = per-tenant instance. |
| **Managed Identity** | Auto-managed service identity for Azure resources — no secrets to rotate. |
| **Enterprise Application** | Tenant-level configuration for an app registration (access control, SAML, provisioning). |
| **Scope** | Permission an app requests (e.g., `User.Read`, `api://my-app/orders.read`). |

---

## Authentication Flows

### Authorization Code Flow (Web Apps)

```
Browser
  │  1. Redirect to Entra login with client_id, scope, redirect_uri, state
  ▼
Entra ID Login
  │  2. User authenticates + consents
  ▼
Browser redirect back with ?code=...
  │  3. Backend exchanges code for tokens (server-to-server, never exposes secret)
  ▼
Entra Token Endpoint
  │  4. Returns access_token + id_token + refresh_token
  ▼
Backend stores tokens, sets session
```

### Client Credentials Flow (Service-to-Service)

```
Service A
  │  POST /oauth2/v2.0/token
  │  client_id, client_secret (or cert), grant_type=client_credentials, scope
  ▼
Entra Token Endpoint
  │  Returns access_token (JWT)
  ▼
Service A calls Service B API with Bearer token
```

```bash
# Get token for service-to-service call
curl -X POST "https://login.microsoftonline.com/{tenant-id}/oauth2/v2.0/token" \
  -d "grant_type=client_credentials" \
  -d "client_id={client-id}" \
  -d "client_secret={client-secret}" \
  -d "scope=api://{target-app-id}/.default"
```

---

## App Registration

```
Azure Portal → Microsoft Entra ID → App Registrations → New Registration

Fields:
  Name:              my-order-service
  Supported account types: Accounts in this org only (single-tenant)
  Redirect URI:      https://myapp.com/auth/callback  (web)

After registration:
  Application (client) ID:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  Directory (tenant) ID:    yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy

Generate a client secret or upload a certificate (Certificates & Secrets)
```

### Expose an API (custom scopes)

```
App Registration → Expose an API
  Application ID URI: api://my-order-service
  Scopes:
    orders.read   — "Read orders"
    orders.write  — "Create and update orders"
```

### API Permissions (what your app calls)

```
App Registration → API Permissions
  Microsoft Graph: User.Read (delegated)
  My Order Service: orders.read (application — for service accounts)
```

---

## JWT Token Claims

```json
// Decoded access token from Entra ID
{
  "iss": "https://login.microsoftonline.com/{tenant-id}/v2.0",
  "aud": "api://my-order-service",
  "sub": "user-object-id",
  "oid": "user-object-id",
  "tid": "tenant-id",
  "name": "Alice Smith",
  "preferred_username": "alice@mycompany.com",
  "roles": ["OrderAdmin", "OrderViewer"],
  "scp": "orders.read orders.write",
  "appid": "calling-app-client-id",
  "exp": 1705316400,
  "iat": 1705312800
}
```

| Claim | Description |
|-------|-------------|
| `aud` | Audience — must match your app's Application ID URI |
| `iss` | Issuer — your tenant's token endpoint |
| `oid` | Object ID — stable user identifier across apps |
| `roles` | App roles assigned to the user (configured in app manifest) |
| `scp` | Scopes (for delegated access) |
| `appid` | Client ID of the calling app (for app-to-app) |

---

## Spring Boot Integration

```xml
<!-- pom.xml -->
<dependency>
  <groupId>com.azure.spring</groupId>
  <artifactId>spring-cloud-azure-starter-active-directory</artifactId>
</dependency>
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-oauth2-resource-server</artifactId>
</dependency>
```

```yaml
# application.yml
spring:
  cloud:
    azure:
      active-directory:
        enabled: true
        credential:
          client-id: ${AZURE_CLIENT_ID}
          client-secret: ${AZURE_CLIENT_SECRET}
        profile:
          tenant-id: ${AZURE_TENANT_ID}
        app-id-uri: api://my-order-service

  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://login.microsoftonline.com/${AZURE_TENANT_ID}/v2.0
```

```java
@Configuration
@EnableWebSecurity
@EnableMethodSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/actuator/health").permitAll()
                .requestMatchers(HttpMethod.GET, "/orders/**").hasAnyAuthority("SCOPE_orders.read", "APPROLE_OrderViewer")
                .requestMatchers(HttpMethod.POST, "/orders/**").hasAnyAuthority("SCOPE_orders.write", "APPROLE_OrderAdmin")
                .anyRequest().authenticated()
            )
            .oauth2ResourceServer(oauth2 -> oauth2
                .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthConverter()))
            )
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            .build();
    }

    @Bean
    public JwtAuthenticationConverter jwtAuthConverter() {
        JwtGrantedAuthoritiesConverter converter = new JwtGrantedAuthoritiesConverter();
        converter.setAuthoritiesClaimName("roles");       // map "roles" claim to Spring authorities
        converter.setAuthorityPrefix("APPROLE_");

        JwtAuthenticationConverter jwtConverter = new JwtAuthenticationConverter();
        jwtConverter.setJwtGrantedAuthoritiesConverter(converter);
        return jwtConverter;
    }
}

// Method-level security
@RestController
public class OrderController {

    @GetMapping("/orders/{id}")
    @PreAuthorize("hasAuthority('APPROLE_OrderViewer')")
    public Order getOrder(@PathVariable String id) { ... }

    @PostMapping("/orders")
    @PreAuthorize("hasAuthority('APPROLE_OrderAdmin')")
    public Order createOrder(@RequestBody Order order) { ... }
}
```

---

## Managed Identity (Azure Resources)

Managed Identity eliminates credential management for Azure resources (App Service, AKS pods, VMs, Functions).

```java
// No credentials in code — Azure provides them automatically
TokenCredential credential = new DefaultAzureCredentialBuilder().build();

// Use for Key Vault, Service Bus, Storage, etc.
SecretClient keyVaultClient = new SecretClientBuilder()
    .vaultUrl("https://my-vault.vault.azure.net")
    .credential(credential)   // uses Managed Identity automatically
    .buildClient();

String secret = keyVaultClient.getSecret("db-password").getValue();
```

**Types:**
- **System-assigned** — tied to a single resource, deleted when resource is deleted
- **User-assigned** — standalone resource, assignable to multiple services

---

## Enterprise SSO with SAML

For legacy apps that don't support OIDC, Entra supports SAML 2.0 SSO.

```
User → App → Entra SAML endpoint
               ↓ SAML Assertion (XML, signed)
             App validates signature, extracts claims, creates session
```

Modern apps should prefer OIDC over SAML — simpler token format (JWT vs XML), easier to implement, works well with SPAs and mobile.

---

## Interview Quick-Fire

**Q: What is the difference between App Registration and Enterprise Application?**
An App Registration is the global definition of your application (client ID, redirect URIs, API scopes). An Enterprise Application is the per-tenant instance — it controls who can sign in, what roles are assigned, and whether consent has been granted. Registering an app in your tenant creates both automatically.

**Q: What is the Client Credentials flow and when is it used?**
A machine-to-machine OAuth2 flow where a service authenticates using its own client ID + secret (or certificate) to get a token for calling another API. Used for background jobs, microservices, and daemon processes where there is no user.

**Q: What is a Managed Identity and why is it preferred over client secrets?**
Managed Identity is an automatically managed service principal for Azure resources. The platform handles credential rotation — no secrets stored in env vars, Key Vault, or config files. DefaultAzureCredential picks it up automatically in Azure environments.

<RelatedTopics :topics="['/security/auth-protocols', '/security/', '/spring/spring-security']" />

[→ Back to Security Overview](/security/)
