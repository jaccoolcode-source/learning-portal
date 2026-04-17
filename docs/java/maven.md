---
title: Maven
description: Apache Maven — POM structure, build lifecycle, plugins, dependency scopes, multi-module projects, and common patterns
category: java-tooling
pageClass: layout-java
difficulty: intermediate
tags: [java, maven, pom, build, lifecycle, plugins, dependencies, multi-module]
estimatedMinutes: 30
---

# Maven

<DifficultyBadge level="intermediate" />

Maven is the standard Java build and dependency management tool. It uses a **Project Object Model (POM)** to define the project structure, dependencies, and build process.

---

## POM Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0
                             http://maven.apache.org/xsd/maven-4.0.0.xsd">

  <modelVersion>4.0.0</modelVersion>

  <!-- Project coordinates (GAV) -->
  <groupId>com.mycompany</groupId>
  <artifactId>order-service</artifactId>
  <version>1.0.0-SNAPSHOT</version>
  <packaging>jar</packaging>

  <name>Order Service</name>
  <description>Processes customer orders</description>

  <!-- Inherit from Spring Boot parent — manages dependency versions -->
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>

  <properties>
    <java.version>21</java.version>
    <maven.compiler.source>21</maven.compiler.source>
    <maven.compiler.target>21</maven.compiler.target>
    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
    <mapstruct.version>1.5.5.Final</mapstruct.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
      <!-- version managed by parent BOM -->
    </dependency>

    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-test</artifactId>
      <scope>test</scope>
    </dependency>

    <dependency>
      <groupId>org.projectlombok</groupId>
      <artifactId>lombok</artifactId>
      <optional>true</optional>   <!-- not transitive -->
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
        <configuration>
          <excludes>
            <exclude>
              <groupId>org.projectlombok</groupId>
              <artifactId>lombok</artifactId>
            </exclude>
          </excludes>
        </configuration>
      </plugin>
    </plugins>
  </build>
</project>
```

---

## Build Lifecycle

Maven defines three built-in lifecycles. The most important is **default**:

```
validate   → compile → test → package → verify → install → deploy
   │            │        │       │          │         │         │
 POM valid   Compile  Run unit  Create    Run IT   Copy to   Deploy to
             sources  tests     .jar      tests   ~/.m2     repo
```

**Key phases:**

| Phase | What it does |
|-------|-------------|
| `compile` | Compiles `src/main/java` → `target/classes` |
| `test` | Runs unit tests (Surefire plugin) |
| `package` | Packages compiled code into JAR/WAR |
| `verify` | Runs integration tests (Failsafe plugin) |
| `install` | Installs artifact to local `~/.m2` repository |
| `deploy` | Uploads artifact to remote repository (Nexus/Artifactory) |

```bash
mvn compile           # compile only
mvn test              # compile + run unit tests
mvn package           # compile + test + create JAR
mvn package -DskipTests    # skip tests
mvn install           # package + install to local repo
mvn clean install     # clean target/ first, then install
mvn verify            # run integration tests (Failsafe)
```

---

## Dependency Scopes

| Scope | Compile | Test | Runtime | Transitive | Use Case |
|-------|---------|------|---------|-----------|----------|
| `compile` (default) | ✅ | ✅ | ✅ | ✅ | Normal dependencies |
| `test` | ❌ | ✅ | ❌ | ❌ | JUnit, Mockito, TestContainers |
| `runtime` | ❌ | ✅ | ✅ | ✅ | JDBC drivers (compiled against API, not impl) |
| `provided` | ✅ | ✅ | ❌ | ❌ | Servlet API (provided by container) |
| `optional` | ✅ | ✅ | ✅ | ❌ | Lombok (not transitive to consumers) |
| `import` | — | — | — | — | Import a BOM (only in `dependencyManagement`) |

---

## Dependency Management and BOMs

```xml
<!-- BOM (Bill of Materials) — import a set of version-managed dependencies -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>software.amazon.awssdk</groupId>
      <artifactId>bom</artifactId>
      <version>2.23.0</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>

<dependencies>
  <!-- No version needed — managed by BOM -->
  <dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>s3</artifactId>
  </dependency>
  <dependency>
    <groupId>software.amazon.awssdk</groupId>
    <artifactId>lambda</artifactId>
  </dependency>
</dependencies>
```

---

## Dependency Resolution and Conflicts

```bash
# Show dependency tree (find version conflicts)
mvn dependency:tree

# Show dependencies with versions
mvn dependency:list

# Analyse unused/undeclared dependencies
mvn dependency:analyze

# Force specific version (nearest-wins rule)
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
  <version>2.16.0</version>  <!-- overrides transitive version -->
</dependency>
```

**Mediation rule:** Maven picks the version **nearest** to your project in the dependency tree. If two paths bring in different versions, declare the desired version directly in your POM to override.

---

## Useful Plugins

| Plugin | Goal | Use |
|--------|------|-----|
| `maven-surefire-plugin` | `test` | Run unit tests (JUnit 5) |
| `maven-failsafe-plugin` | `verify` | Run integration tests (`*IT.java`) |
| `maven-compiler-plugin` | `compile` | Configure Java version, annotation processors |
| `maven-shade-plugin` | `package` | Fat JAR (all deps bundled) |
| `spring-boot-maven-plugin` | `package` | Executable Spring Boot JAR |
| `jacoco-maven-plugin` | `verify` | Code coverage reports |
| `maven-enforcer-plugin` | `validate` | Enforce min Java/Maven version, no SNAPSHOT deps in release |

```xml
<!-- Annotation processor (e.g., Lombok + MapStruct together) -->
<plugin>
  <groupId>org.apache.maven.plugins</groupId>
  <artifactId>maven-compiler-plugin</artifactId>
  <configuration>
    <annotationProcessorPaths>
      <path>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
        <version>${lombok.version}</version>
      </path>
      <path>
        <groupId>org.mapstruct</groupId>
        <artifactId>mapstruct-processor</artifactId>
        <version>${mapstruct.version}</version>
      </path>
    </annotationProcessorPaths>
  </configuration>
</plugin>
```

---

## Multi-Module Projects

```
my-project/
├── pom.xml                  ← Parent POM (packaging=pom)
├── domain/
│   └── pom.xml              ← domain module
├── application/
│   └── pom.xml              ← depends on domain
└── infrastructure/
    └── pom.xml              ← depends on domain
```

```xml
<!-- Parent POM -->
<groupId>com.mycompany</groupId>
<artifactId>my-project</artifactId>
<version>1.0.0-SNAPSHOT</version>
<packaging>pom</packaging>

<modules>
  <module>domain</module>
  <module>application</module>
  <module>infrastructure</module>
</modules>

<!-- Centrally manage versions for all child modules -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>com.mycompany</groupId>
      <artifactId>domain</artifactId>
      <version>${project.version}</version>
    </dependency>
  </dependencies>
</dependencyManagement>
```

```xml
<!-- Child module (application/pom.xml) -->
<parent>
  <groupId>com.mycompany</groupId>
  <artifactId>my-project</artifactId>
  <version>1.0.0-SNAPSHOT</version>
</parent>

<artifactId>application</artifactId>

<dependencies>
  <dependency>
    <groupId>com.mycompany</groupId>
    <artifactId>domain</artifactId>
    <!-- version from parent dependencyManagement -->
  </dependency>
</dependencies>
```

```bash
# Build all modules from parent directory
mvn clean install

# Build only changed modules and their dependents (Maven 3.x reactor)
mvn clean install -pl application -am   # -am = also build dependencies
```

---

## Profiles

```xml
<profiles>
  <profile>
    <id>prod</id>
    <activation>
      <property><name>env</name><value>prod</value></property>
    </activation>
    <properties>
      <log.level>WARN</log.level>
    </properties>
    <dependencies>
      <dependency>
        <groupId>io.micrometer</groupId>
        <artifactId>micrometer-registry-datadog</artifactId>
      </dependency>
    </dependencies>
  </profile>
</profiles>
```

```bash
mvn package -Pprod          # activate by profile id
mvn package -Denv=prod      # activate by property
```

---

## Interview Quick-Fire

**Q: What is the difference between `install` and `deploy`?**
`install` copies the artifact to the local `~/.m2` repository for use by other local projects. `deploy` uploads to a remote repository (Nexus, Artifactory) for sharing with the team.

**Q: How does Maven resolve version conflicts in transitive dependencies?**
It uses the **nearest-wins** rule: the version closest to the root project in the dependency tree wins. To force a specific version, declare it directly in your POM's `<dependencies>` section.

**Q: What is the difference between `dependencyManagement` and `dependencies`?**
`dependencyManagement` declares versions and scope centrally without adding the dependency. Child modules must still declare `<dependency>` in their own `<dependencies>` but omit the version — they inherit it. `<dependencies>` actually adds the dependency to the classpath.

<RelatedTopics :topics="['/spring/', '/java-core/']" />

[→ Back to Java Tooling](/java/)
