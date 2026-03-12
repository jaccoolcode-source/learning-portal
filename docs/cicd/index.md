---
title: CI/CD Concepts & Strategies
description: CI/CD fundamentals — continuous integration, delivery and deployment, pipeline stages, branching strategies, trunk-based development, semantic versioning, and deployment patterns
category: cicd
pageClass: layout-cicd
difficulty: intermediate
tags: [cicd, continuous-integration, continuous-deployment, pipeline, trunk-based, semver, blue-green, canary]
related:
  - /cicd/github-actions
  - /docker/production
  - /kubernetes/production
estimatedMinutes: 20
---

# CI/CD Concepts & Strategies

<DifficultyBadge level="intermediate" />

CI/CD is the practice of automating the path from a code change to running software. Done well, it compresses feedback loops, prevents integration hell, and makes deployment a non-event.

---

## CI vs CD vs CD

| Term | Full Name | What It Automates |
|------|-----------|-------------------|
| **CI** | Continuous Integration | Build + test on every commit; fast feedback that code integrates |
| **CD** | Continuous Delivery | Produce a release-ready artefact automatically; deployment is manual trigger |
| **CD** | Continuous Deployment | Every green build is automatically deployed to production |

```
Commit → Build → Test → [Delivery: artefact ready] → [Deployment: auto to prod]
         ──────── CI ─────────────────────────────────────────────────────────
                                                      ─── Delivery ──────────
                                                                   ─ Deploy ─
```

Most teams practice **Continuous Delivery** — automated up to a staging environment, manual approval gate before production.

---

## Pipeline Stages

A typical Java/Spring Boot pipeline:

```
┌────────────┐   ┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐
│  Source     │──▶│  Build     │──▶│  Test        │──▶│  Package &   │──▶│  Deploy    │
│  (commit)  │   │  (compile) │   │  (unit, IT,  │   │  Publish     │   │  (staging/ │
│            │   │            │   │   SAST, lint) │   │  (image push)│   │   prod)    │
└────────────┘   └────────────┘   └──────────────┘   └──────────────┘   └────────────┘
     ~0s              ~30s              ~2–5 min             ~1 min           ~2 min
```

### Stage Responsibilities

| Stage | What Happens |
|-------|-------------|
| **Compile** | `mvn compile` / `./gradlew classes` — catch syntax errors fast |
| **Unit tests** | Fast, isolated, no I/O — must stay under 2 min total |
| **Code quality** | Checkstyle, SpotBugs, SonarQube gate, OWASP dependency check |
| **Integration tests** | Testcontainers or Compose — real DB, broker, cache |
| **SAST** | Static analysis for security vulnerabilities (SpotBugs Find Security Bugs, CodeQL) |
| **Build image** | Dockerfile multi-stage build or Spring Boot Buildpacks |
| **Image scan** | Trivy / Docker Scout — fail on HIGH/CRITICAL CVEs |
| **Push image** | Tagged with git SHA to registry (Artifact Registry, ECR, GHCR) |
| **Deploy staging** | `kubectl apply` / `helm upgrade` / Cloud Run deploy |
| **Smoke tests** | Quick end-to-end tests against staging |
| **Manual gate** | Human approval before production |
| **Deploy production** | Rolling update, blue/green, or canary |
| **Post-deploy verification** | Synthetic monitoring, alert baseline check |

---

## Branching Strategies

### Trunk-Based Development (Recommended)

All developers commit to `main` (the trunk) frequently — at least daily. Short-lived feature branches (< 2 days) merged via PR.

```
main: ──●──●──●──●──●──●──●──●──●──▶
         │      │
    feature/x  feature/y  (< 2 days, then merged)
```

**Pros:** No merge hell, always deployable, fast CI, encourages small incremental changes.
**Cons:** Requires feature flags for in-progress work, discipline to keep trunk green.

### GitFlow (heavier, less recommended for modern teams)

```
main ────────────────────────────────────────────────────────●─▶  (release tags)
                                                            /
develop ──●──●──●──────────────────────────────────────●──/
              \               \                       /
          feature/x        feature/y              release/1.2
```

**Pros:** Clear separation of release, hotfix, feature work.
**Cons:** Long-lived branches, frequent merge conflicts, delayed integration.

### GitHub Flow (simple)

```
main ─────────●────────────────────────●──────────▶
               \                      /
            feature-branch  ──────── PR → merge
```

Feature branch → PR → CI → review → merge to main → auto-deploy. Simple and works well with trunk-based thinking.

---

## Semantic Versioning

```
MAJOR.MINOR.PATCH[-prerelease][+build]

1.2.3
1.2.3-rc.1
1.2.3-SNAPSHOT   (Maven convention)
```

| Bump | When | Example |
|------|------|---------|
| `PATCH` | Backwards-compatible bug fix | `1.2.3 → 1.2.4` |
| `MINOR` | Backwards-compatible new feature | `1.2.3 → 1.3.0` |
| `MAJOR` | Breaking change | `1.2.3 → 2.0.0` |

### Conventional Commits

Structured commit messages that enable automated versioning and changelog generation.

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

```bash
# Examples
feat: add order cancellation endpoint
fix(payment): handle null currency code
feat!: remove deprecated v1 API          # ! = breaking change → MAJOR bump
docs: update README with Docker setup
chore(deps): bump spring-boot to 3.3.0
test: add integration tests for checkout flow
refactor: extract PaymentValidator class
ci: add Trivy image scanning step
```

| Type | SemVer bump | Description |
|------|------------|-------------|
| `feat` | MINOR | New feature |
| `fix` | PATCH | Bug fix |
| `feat!` / `BREAKING CHANGE:` | MAJOR | Breaking change |
| `docs`, `chore`, `ci`, `refactor`, `test`, `style` | None | No version bump |

Tools that automate versioning from conventional commits: **semantic-release**, **Release Please** (Google), **standard-version**.

---

## Deployment Strategies

### Recreate

Stop all old instances, then start new ones. Simple but causes downtime.

```
v1 v1 v1  →  [downtime]  →  v2 v2 v2
```

Use only for: non-critical workloads, data migrations that can't run in parallel.

### Rolling Update (Kubernetes default)

Gradually replace old Pods with new ones. Some of each version run simultaneously.

```
v1 v1 v1  →  v1 v1 v2  →  v1 v2 v2  →  v2 v2 v2
```

Requires: backwards-compatible API changes, idempotent DB migrations.

### Blue/Green

Two identical environments (blue = current, green = new). Switch traffic instantly by updating the load balancer.

```
          ┌──── blue (v1) ────┐  ← current traffic
LB ───────┤
          └──── green (v2) ───┘  ← deploy + test here

After verification:
          ┌──── blue (v1) ────┐  ← idle (instant rollback)
LB ───────┤
          └──── green (v2) ───┘  ← now live
```

**Pros:** Instant rollback (flip back to blue), no mixed versions serving traffic.
**Cons:** Double infrastructure cost during deploy, DB schema must support both versions simultaneously.

### Canary

Route a small percentage of traffic to the new version. Increase gradually as confidence grows.

```
         ┌──── v1 ────────────┐  ← 90% traffic
LB ──────┤
         └──── v2 (canary) ───┘  ← 10% traffic

Monitor error rates, latency... then gradually: 25% → 50% → 100%
```

**Pros:** Real traffic validation, early problem detection, minimal blast radius.
**Cons:** Complex routing setup, requires observability to detect regressions.

### Feature Flags

Deploy code to production but keep features disabled. Enable per user, percentage, or group.

```java
// LaunchDarkly / Unleash / custom flag
if (featureFlags.isEnabled("new-checkout-flow", user)) {
    return newCheckoutService.checkout(cart);
} else {
    return legacyCheckoutService.checkout(cart);
}
```

Enables: dark launches, A/B testing, kill switches, gradual rollouts independent of deployments.

### Deployment Strategy Comparison

| Strategy | Downtime | Rollback Speed | Complexity | Use Case |
|----------|----------|----------------|-----------|----------|
| Recreate | Yes | Redeploy (slow) | Low | Dev/test |
| Rolling | No | Redeploy (slow) | Low | Default production |
| Blue/Green | No | Instant | Medium | High-stakes releases |
| Canary | No | Instant (flip) | High | Large traffic, risk reduction |
| Feature flags | No | Toggle flag | Medium | Trunk-based, A/B testing |

---

## The Deployment Pipeline Contract

Every team should agree on:

| Question | Example Answer |
|----------|---------------|
| What triggers a deploy to staging? | Merge to `main` |
| What triggers a deploy to production? | Manual approval after staging is green |
| How long can the pipeline take? | < 10 minutes for feedback |
| What must pass before merging a PR? | Unit tests + Checkstyle + OWASP scan |
| What does a failed deploy do? | Auto-rollback + alert |
| How do you roll back? | `kubectl rollout undo` or flip LB (blue/green) |

---

## Interview Quick-Fire

**Q: What's the difference between Continuous Delivery and Continuous Deployment?**
Continuous Delivery produces a release-ready artefact automatically — deployment is a manual decision. Continuous Deployment goes one step further and deploys every green build to production automatically, with no human gate.

**Q: Why is trunk-based development preferred over GitFlow?**
Shorter-lived branches mean less merge conflict, earlier integration, and the main branch is always close to releasable. GitFlow's long-lived `develop` and `release` branches delay integration and create "big bang" merge pain.

**Q: What problem do feature flags solve?**
They decouple deployment from release. Code ships to production but stays inactive. Features can be enabled per user/group, rolled back by toggling a flag (milliseconds) rather than redeploying, and tested with real traffic before full rollout.

**Q: When would you choose blue/green over a rolling update?**
When you need instant rollback (flip the load balancer back), when old and new versions can't coexist (schema change, breaking API), or when you want zero traffic on both versions during final verification. Rolling update is simpler and cheaper; blue/green is safer for high-stakes releases.

<RelatedTopics :topics="['/cicd/github-actions', '/cicd/gitlab-ci', '/cicd/jenkins', '/docker/production', '/kubernetes/production']" />
