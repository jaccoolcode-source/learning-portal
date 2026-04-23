# Terraform / CI/CD / Maven

**Q57 to Q59** · [← DevOps Overview](./index)

---

## Q57: Terraform & Infrastructure as Code

> IaC is expected knowledge for senior backend developers. Know what Terraform solves, how state works, and the production pitfalls.

Terraform is a **declarative Infrastructure as Code (IaC)** tool. You describe the desired state of your infrastructure in HCL (HashiCorp Configuration Language); Terraform figures out what to create, update, or destroy to reach that state.

**Core workflow:**
```bash
terraform init      # download providers, initialise backend
terraform plan      # show what will change (dry run)
terraform apply     # apply changes
terraform destroy   # tear down all managed resources
```

::: details Full model answer

**Why IaC over clicking in the AWS console:**
- **Reproducibility** — same code → same infrastructure every time
- **Version control** — infrastructure changes are reviewed in PRs like code
- **Drift detection** — `terraform plan` shows if real infra diverged from code
- **Automation** — deploy infrastructure as part of CI/CD pipelines

**Key concepts:**

**Providers:** Plugins that interface with cloud APIs (AWS, GCP, Azure, Kubernetes).
```hcl
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}
```

**Resources:** Infrastructure objects to manage.
```hcl
resource "aws_ecs_service" "order_service" {
  name            = "order-service"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.order_service.arn
  desired_count   = var.service_desired_count

  load_balancer {
    target_group_arn = aws_lb_target_group.order_service.arn
    container_name   = "order-service"
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.http]
}
```

**Variables and outputs:**
```hcl
variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Must be dev, staging, or prod."
  }
}

output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "ALB DNS name to configure DNS"
}
```

**State — the most important concept:**
Terraform stores the current state of managed resources in a **state file** (`terraform.tfstate`). It uses this to compute diffs between desired and actual state.

**Remote state (mandatory for teams):**
```hcl
terraform {
  backend "s3" {
    bucket         = "mycompany-terraform-state"
    key            = "services/order-service/terraform.tfstate"
    region         = "eu-west-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"  # prevent concurrent applies
  }
}
```

Never commit `terraform.tfstate` to git — it contains sensitive values (passwords, private keys). Store in S3 + DynamoDB locking.

**State pitfalls:**
- **State drift:** Someone manually changed a resource in the console → `terraform plan` shows unexpected diffs. Fix: `terraform refresh` or import the manual change.
- **Concurrent applies:** Two people run `apply` simultaneously → state corruption. Fix: DynamoDB state locking.
- **`terraform destroy` in prod:** Destroys everything. Use workspace separation (`dev`/`staging`/`prod`) and restrict destroy in CI.

**Modules — reusable infrastructure components:**
```hcl
module "order_service" {
  source = "./modules/ecs-service"

  service_name   = "order-service"
  container_port = 8080
  desired_count  = 3
  environment    = var.environment
  vpc_id         = module.vpc.vpc_id
}
```

**Workspaces vs separate state files:**
- Workspaces: multiple states in one backend, shared module code. Good for ephemeral environments.
- Separate directories/backends per environment: stricter isolation. Better for prod/non-prod separation.

**Terraform vs AWS CDK vs CloudFormation:**
| | Terraform | CDK | CloudFormation |
|--|-----------|-----|---------------|
| Language | HCL | Java/TypeScript/Python | YAML/JSON |
| Multi-cloud | ✅ | AWS only | AWS only |
| State management | Self-managed | CloudFormation stacks | AWS-managed |
| Maturity | Very mature | Growing | Mature (but verbose) |
| Best for | Multi-cloud, existing Terraform teams | AWS-native, prefer real languages | AWS-only, CloudFormation teams |

:::

> [!TIP] Golden Tip
> Lead with **remote state + DynamoDB locking** — it's the first thing that breaks in a team setting without it. State corruption from concurrent applies is a real production incident. Also: **`terraform plan` output should be reviewed in PRs** like code — treating infrastructure changes as unreviewed automation is how outages happen. Mentioning this workflow (plan in CI, apply after PR approval) shows you've worked with Terraform in a team, not just locally.

**Follow-up questions:**
- What is Terraform state and why must it be stored remotely?
- What happens if two engineers run `terraform apply` at the same time?
- What is the difference between `terraform plan` and `terraform apply`?
- When would you choose Terraform over AWS CDK?

---

## Q58: CI/CD Pipelines

> Every senior developer is expected to understand the full delivery pipeline. Know the stages, what runs where, and how to keep pipelines fast and safe.

**CI (Continuous Integration):** Every push triggers automated build + test. Detect integration failures early.

**CD (Continuous Delivery):** Every green main branch build produces a deployable artifact. Deployment to production is triggered manually.

**CD (Continuous Deployment):** Every green build is automatically deployed to production. No manual gate.

::: details Full model answer

**Typical Java/Spring Boot pipeline stages:**

```
Commit → CI Pipeline
  1. Checkout
  2. Build (mvn package / gradle build)
  3. Unit tests
  4. Integration tests
  5. Static analysis (SonarQube / Checkstyle)
  6. Security scan (Snyk / OWASP Dependency-Check)
  7. Build Docker image
  8. Push to ECR / Docker Hub
  9. Deploy to staging
  10. Smoke tests / E2E tests
  11. Deploy to production (manual gate or auto)
```

**GitLab CI example (.gitlab-ci.yml):**
```yaml
stages:
  - build
  - test
  - publish
  - deploy

variables:
  MAVEN_OPTS: "-Dmaven.repo.local=$CI_PROJECT_DIR/.m2"

cache:
  paths:
    - .m2/

build:
  stage: build
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn package -DskipTests
  artifacts:
    paths:
      - target/*.jar

unit-test:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  script:
    - mvn test
  artifacts:
    reports:
      junit: target/surefire-reports/TEST-*.xml

integration-test:
  stage: test
  image: maven:3.9-eclipse-temurin-21
  services:
    - postgres:15
  variables:
    POSTGRES_DB: testdb
    POSTGRES_USER: test
    POSTGRES_PASSWORD: test
    SPRING_DATASOURCE_URL: jdbc:postgresql://postgres/testdb
  script:
    - mvn verify -Pfailsafe

docker-build:
  stage: publish
  image: docker:24
  services:
    - docker:dind
  script:
    - docker build -t $ECR_REGISTRY/order-service:$CI_COMMIT_SHA .
    - docker push $ECR_REGISTRY/order-service:$CI_COMMIT_SHA

deploy-staging:
  stage: deploy
  script:
    - aws ecs update-service --cluster staging --service order-service
        --force-new-deployment
  environment:
    name: staging
  only:
    - main

deploy-prod:
  stage: deploy
  script:
    - aws ecs update-service --cluster prod --service order-service
        --force-new-deployment
  environment:
    name: production
  when: manual      # manual gate for production
  only:
    - main
```

**GitHub Actions equivalent:**
```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: maven

      - name: Build and test
        run: mvn verify

      - name: Build Docker image
        run: |
          docker build -t order-service:${{ github.sha }} .
          docker tag order-service:${{ github.sha }} \
            ${{ secrets.ECR_REGISTRY }}/order-service:${{ github.sha }}

      - name: Push to ECR
        uses: aws-actions/amazon-ecr-login@v2
        # ...
```

**Deployment strategies:**

| Strategy | Downtime | Risk | Rollback |
|----------|---------|------|---------|
| **Recreate** | Yes | High | Redeploy old version | 
| **Rolling** | No | Medium | Slow — redeploy old | 
| **Blue/Green** | No | Low | Instant — switch LB | 
| **Canary** | No | Very Low | Instant — route 0% to new | 

**Blue/Green with ECS:**
- Deploy new version to "green" target group
- Run smoke tests against green
- Switch ALB listener rule to route 100% traffic to green
- Keep blue running for instant rollback
- Terminate blue after confidence period

**Canary deployment:**
Gradually shift traffic: 5% → 25% → 50% → 100%. Monitor error rate and latency at each step. AWS CodeDeploy and Argo Rollouts automate this.

**Key pipeline principles:**
- **Fast feedback** — unit tests should complete in &lt;2 minutes; full pipeline &lt;15 minutes
- **Fail fast** — run cheapest/fastest checks first (compile, unit tests) before expensive ones (integration, E2E)
- **Immutable artifacts** — build once, deploy the same artifact to all environments (no rebuilding per environment)
- **Environment parity** — staging must mirror production configuration
- **Secrets** — never hardcode secrets; use CI/CD secret variables (GitLab CI variables, GitHub Secrets, AWS Secrets Manager)

:::

> [!TIP] Golden Tip
> Emphasise **immutable artifacts** — build once, tag with the commit SHA, promote the same image through environments. Rebuilding the image per environment is a common mistake that introduces subtle differences between staging and production. The image that passed tests in staging is the exact image that runs in production. Combined with **blue/green deployment**, this gives you zero-downtime deploys with instant rollback — the gold standard for production delivery.

**Follow-up questions:**
- What is the difference between Continuous Delivery and Continuous Deployment?
- What is an immutable artifact and why is it important?
- What is blue/green deployment and how does it enable instant rollback?
- How do you handle database migrations in a CI/CD pipeline?

---

## Q59: Maven & Build Tools

> Build tools are daily tools — know dependency management, lifecycle, and the Gradle vs Maven trade-off.

Maven is a **build lifecycle + dependency management** tool for Java projects. It enforces convention-over-configuration: standard directory structure, standard lifecycle phases.

**Standard directory layout:**
```
project/
├── pom.xml
└── src/
    ├── main/
    │   ├── java/          ← application code
    │   └── resources/     ← application.yml, templates
    └── test/
        ├── java/          ← test code
        └── resources/     ← test-specific config
```

**Lifecycle phases (in order):**
```
validate → compile → test → package → verify → install → deploy
```

Most common commands:
```bash
mvn clean package          # compile + test + package (JAR/WAR)
mvn clean verify           # includes integration tests
mvn clean package -DskipTests  # skip tests (use sparingly)
mvn dependency:tree        # show full dependency tree
mvn dependency:analyze     # find unused/undeclared dependencies
```

::: details Full model answer

**POM structure:**
```xml
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.example</groupId>
  <artifactId>order-service</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>jar</packaging>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.3.0</version>
  </parent>

  <properties>
    <java.version>21</java.version>
    <mapstruct.version>1.5.5.Final</mapstruct.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <!-- version managed by spring-boot-starter-parent BOM -->
    </dependency>

    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>   <!-- only on test classpath -->
    </dependency>
  </dependencies>
</project>
```

**Dependency scopes:**
| Scope | Compile | Test | Runtime | Transitive |
|-------|---------|------|---------|-----------|
| `compile` (default) | ✅ | ✅ | ✅ | ✅ |
| `test` | ❌ | ✅ | ❌ | ❌ |
| `runtime` | ❌ | ✅ | ✅ | ✅ |
| `provided` | ✅ | ✅ | ❌ | ❌ |
| `optional` | ✅ | ✅ | ✅ | ❌ |

**BOM (Bill of Materials) — version alignment:**
```xml
<!-- Import a BOM to align dependency versions without specifying each -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.cloud</groupId>
      <artifactId>spring-cloud-dependencies</artifactId>
      <version>2023.0.1</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

**Multi-module projects:**
```
parent-pom/
├── pom.xml              ← parent: packaging=pom, defines common deps
├── order-service/
│   └── pom.xml          ← child: inherits parent
├── payment-service/
│   └── pom.xml
└── shared-domain/
    └── pom.xml          ← shared library used by other modules
```

Build all modules in dependency order: `mvn clean install` from parent.

**Dependency conflict resolution:**
Maven uses **nearest definition wins** — the version closest to the root of the dependency tree wins. Use `<dependencyManagement>` to explicitly pin versions and avoid surprise upgrades from transitive deps.

```bash
# Find conflicting versions
mvn dependency:tree -Dincludes=com.fasterxml.jackson.core:jackson-databind
```

**Maven Wrapper (`mvnw`):**
Pins the Maven version per project. Anyone building the project uses the exact same Maven version without installing it globally.
```bash
./mvnw clean package    # uses the pinned Maven version from .mvn/wrapper/
```

**Maven vs Gradle:**

| | Maven | Gradle |
|--|-------|--------|
| **Config** | XML (verbose) | Groovy/Kotlin DSL (concise) |
| **Performance** | Slower (no incremental build) | Faster (incremental, build cache) |
| **Flexibility** | Convention-based | Highly customisable |
| **Learning curve** | Low (standard lifecycle) | Higher |
| **IDE support** | Excellent | Excellent |
| **Spring Boot** | First-class support | First-class support |
| **Android** | Rarely used | Standard |

Gradle's build cache can cut CI times by 50–80% for large multi-module projects by skipping modules with unchanged inputs.

**SNAPSHOT vs RELEASE versions:**
- `1.0.0-SNAPSHOT` — mutable; Maven always downloads the latest snapshot from the repository
- `1.0.0` — immutable; once deployed to a release repository, never changed

Never use SNAPSHOT dependencies in production builds — the build is not reproducible (tomorrow's snapshot may be different).

:::

> [!TIP] Golden Tip
> The dependency conflict question comes up often — know that Maven's **nearest definition wins** rule can silently downgrade a transitive dependency. The fix is explicit `<dependencyManagement>` entries. For CI performance, the biggest win in large Maven projects is **caching the `.m2` repository** between builds — downloading 500 MB of dependencies on every CI run is the #1 cause of slow pipelines. In GitLab CI, mount `.m2` as a cache artifact; in GitHub Actions, use `actions/cache` with the Maven cache path.

**Follow-up questions:**
- What is the difference between `compile` and `provided` scope?
- How does Maven resolve a dependency version conflict?
- What is a BOM and why is it useful?
- What is the Maven Wrapper and why should every project use it?
