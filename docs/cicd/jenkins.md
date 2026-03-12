---
title: Jenkins
description: Jenkins reference — declarative and scripted Pipelines, Jenkinsfile syntax, agents, stages, steps, shared libraries, multibranch pipelines, credentials, and a complete Spring Boot pipeline
category: cicd
pageClass: layout-cicd
difficulty: intermediate
tags: [jenkins, cicd, pipeline, jenkinsfile, declarative, groovy, shared-library, multibranch]
related:
  - /cicd/
  - /cicd/github-actions
  - /cicd/gitlab-ci
  - /docker/production
estimatedMinutes: 25
---

# Jenkins

<DifficultyBadge level="intermediate" />

Jenkins is the most widely deployed open-source CI/CD server. It's highly extensible via plugins and dominates enterprise environments. Pipelines are defined as code in a `Jenkinsfile` (Groovy DSL), checked into the repository alongside the application.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Jenkins Controller (master)                            │
│  ├── Pipeline engine (Groovy)                           │
│  ├── Plugin manager                                     │
│  ├── Credentials store                                  │
│  └── Web UI / REST API / Blue Ocean                     │
└────────────────────────┬────────────────────────────────┘
                         │ JNLP / SSH
          ┌──────────────┴──────────────┐
     ┌────┴────┐                  ┌────┴────┐
     │ Agent 1 │                  │ Agent 2 │
     │ Linux   │                  │ Windows │
     └─────────┘                  └─────────┘
```

| Component | Role |
|-----------|------|
| **Controller** | Orchestrates pipelines; stores state; serves UI; should NOT run builds |
| **Agent** | Executes build steps; connected via SSH or JNLP |
| **Executor** | A slot on an agent for running one build at a time |
| **Workspace** | Directory on the agent where source code is checked out |
| **Plugin** | Extends Jenkins — Git, Maven, Docker, Kubernetes, etc. |

---

## Pipeline Types

### Declarative Pipeline (recommended)

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                sh 'mvn package'
            }
        }
    }
}
```

Declarative pipelines are structured, validated by Jenkins, and easier to read. They enforce a well-defined schema.

### Scripted Pipeline (Groovy DSL)

```groovy
node {
    stage('Build') {
        sh 'mvn package'
    }
}
```

Scripted pipelines are full Groovy — maximum flexibility but no schema validation. Prefer Declarative; use Scripted for advanced programmatic control (dynamic stage generation, complex loops).

---

## Declarative Pipeline Syntax

### Top-Level Structure

```groovy
pipeline {
    agent { ... }         // where to run
    environment { ... }   // env vars
    options { ... }       // pipeline options
    parameters { ... }    // user-input parameters
    triggers { ... }      // automatic triggers
    tools { ... }         // auto-installed tools
    stages { ... }        // the actual work
    post { ... }          // always/success/failure/unstable hooks
}
```

### Agent

```groovy
// Run on any available agent
agent any

// Run on agent with a label
agent { label 'linux && docker' }

// Run in a Docker container
agent {
    docker {
        image 'maven:3.9-eclipse-temurin-21'
        args '-v $HOME/.m2:/root/.m2'    // mount Maven cache
    }
}

// Run in a Kubernetes Pod
agent {
    kubernetes {
        yaml '''
          apiVersion: v1
          kind: Pod
          spec:
            containers:
            - name: maven
              image: maven:3.9-eclipse-temurin-21
              command: [sleep, 99d]
            - name: docker
              image: docker:24
              command: [sleep, 99d]
        '''
        defaultContainer 'maven'
    }
}

// No global agent — each stage defines its own
agent none
```

### Stages and Steps

```groovy
stages {
    stage('Compile') {
        steps {
            sh 'mvn compile checkstyle:check'
        }
    }

    stage('Test') {
        steps {
            sh 'mvn test'
        }
        post {
            always {
                junit 'target/surefire-reports/*.xml'    // publish test results
                jacoco execPattern: 'target/jacoco.exec' // coverage
            }
        }
    }

    stage('Package') {
        steps {
            sh 'mvn package -DskipTests'
            archiveArtifacts artifacts: 'target/*.jar', fingerprint: true
        }
    }
}
```

### Parallel Stages

```groovy
stage('Test') {
    parallel {
        stage('Unit Tests') {
            agent { label 'linux' }
            steps {
                sh 'mvn test'
            }
        }
        stage('Integration Tests') {
            agent { label 'linux' }
            steps {
                sh 'mvn verify -P integration'
            }
        }
        stage('Checkstyle') {
            agent { label 'linux' }
            steps {
                sh 'mvn checkstyle:check'
            }
        }
    }
}
```

### Environment Variables

```groovy
environment {
    MAVEN_OPTS = '-Xmx512m -Dmaven.repo.local=/var/jenkins_home/.m2'
    IMAGE_TAG  = "${env.GIT_COMMIT[0..7]}"
    // Credential binding
    DOCKER_CREDS = credentials('docker-hub-credentials')   // sets DOCKER_CREDS_USR + DOCKER_CREDS_PSW
    GCP_SA_KEY   = credentials('gcp-service-account-json') // file credential → path
}
```

### Parameters

```groovy
parameters {
    string(name: 'TARGET_ENV', defaultValue: 'staging', description: 'Deployment target')
    booleanParam(name: 'SKIP_TESTS', defaultValue: false, description: 'Skip test stages')
    choice(name: 'LOG_LEVEL', choices: ['INFO', 'DEBUG', 'WARN'], description: 'Log level')
    password(name: 'SECRET_TOKEN', defaultValue: '', description: 'API token')
}

stages {
    stage('Deploy') {
        steps {
            sh "./deploy.sh ${params.TARGET_ENV}"
        }
    }
}
```

### Options

```groovy
options {
    timeout(time: 30, unit: 'MINUTES')    // abort if pipeline exceeds 30 min
    buildDiscarder(logRotator(numToKeepStr: '10'))  // keep last 10 builds
    disableConcurrentBuilds()             // only one build at a time
    skipStagesAfterUnstable()             // don't run stages after first unstable
    timestamps()                          // prepend timestamps to log output
    retry(3)                              // retry entire pipeline on failure (use sparingly)
}
```

### Triggers

```groovy
triggers {
    // Poll SCM every 5 minutes (H for hash-based jitter)
    pollSCM('H/5 * * * *')

    // Cron (nightly build)
    cron('H 2 * * 1-5')          // Mon–Fri at 2am (with jitter)

    // Trigger from upstream job
    upstream(upstreamProjects: 'my-lib', threshold: hudson.model.Result.SUCCESS)
}
```

Prefer webhook triggers (GitHub/GitLab webhooks → Jenkins) over polling for lower latency.

### Post Section

```groovy
post {
    always {
        cleanWs()    // clean workspace after every build
    }
    success {
        slackSend channel: '#ci', message: "✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} passed"
    }
    failure {
        slackSend channel: '#ci', message: "❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} FAILED - ${env.BUILD_URL}"
        emailext body: 'Build failed!', subject: "FAILED: ${env.JOB_NAME}", to: 'team@mycompany.com'
    }
    unstable {
        echo 'Tests unstable — check report'
    }
    changed {
        echo 'Pipeline status changed from last run'
    }
}
```

### When (Conditional Stages)

```groovy
stage('Deploy Production') {
    when {
        branch 'main'                         // only on main
        // anyOf { branch 'main'; tag '...' }
        // allOf { branch 'main'; not { buildingTag() } }
        // expression { return params.TARGET_ENV == 'production' }
        // environment name: 'DEPLOY', value: 'true'
    }
    steps {
        sh './deploy.sh production'
    }
}
```

### Input (Manual Approval Gate)

```groovy
stage('Approve Production Deploy') {
    steps {
        input(
            message: 'Deploy to production?',
            ok: 'Yes, deploy',
            submitter: 'ops-team,jane.doe',   // Jenkins users/groups who can approve
            parameters: [
                choice(name: 'CONFIRM', choices: ['yes', 'no'], description: 'Confirm')
            ]
        )
    }
}
```

---

## Credentials

Jenkins stores secrets in an encrypted credential store. Access via `credentials()` binding or the `withCredentials` step.

```groovy
// In environment block
environment {
    // Username/Password → $VAR_USR and $VAR_PSW
    DOCKER_CREDS = credentials('docker-hub-creds')

    // Secret text → $SECRET
    API_KEY = credentials('my-api-key')

    // Secret file → path to temp file
    KUBECONFIG_FILE = credentials('kubeconfig')
}

// In steps (withCredentials block)
steps {
    withCredentials([
        usernamePassword(
            credentialsId: 'docker-hub-creds',
            usernameVariable: 'DOCKER_USER',
            passwordVariable: 'DOCKER_PASS'
        )
    ]) {
        sh 'docker login -u $DOCKER_USER -p $DOCKER_PASS'
    }

    withCredentials([file(credentialsId: 'gcp-sa-key', variable: 'GCP_KEY_FILE')]) {
        sh 'gcloud auth activate-service-account --key-file=$GCP_KEY_FILE'
    }
}
```

**Credential Types:**
- `Secret text` — API tokens, passwords
- `Username + Password` — Docker Hub, registry auth
- `SSH Username with private key` — Git SSH auth, server access
- `Secret file` — kubeconfig, GCP service account JSON
- `Certificate` — PKI certificates

---

## Multibranch Pipeline

A **Multibranch Pipeline** project automatically discovers branches (and PRs/MRs) in a repository and creates a pipeline for each one from the `Jenkinsfile` in that branch.

```
Jenkins → New Item → Multibranch Pipeline
  → Branch Source: GitHub / GitLab / Bitbucket
  → Discover Branches: All branches
  → Discover Pull Requests: From origin
  → Build Strategies: Only branches with Jenkinsfile
```

The branch appears as a sub-job under the multibranch project. PRs get their own pipeline run — Jenkins comments back with build status via the SCM webhook.

```groovy
// Jenkinsfile — branch-aware behaviour
pipeline {
    agent any
    stages {
        stage('Build') {
            steps { sh 'mvn package' }
        }
        stage('Deploy Staging') {
            when { branch 'main' }
            steps { sh './deploy.sh staging' }
        }
        stage('Deploy Production') {
            when { branch 'main' }
            steps {
                input 'Deploy to production?'
                sh './deploy.sh production'
            }
        }
    }
}
```

---

## Shared Libraries

Shared libraries let teams package reusable pipeline code (steps, utilities, templates) in a separate Git repo and use them across all Jenkinsfiles.

### Library Structure

```
my-shared-library/
├── vars/                    # global variables / top-level steps
│   ├── buildMavenApp.groovy
│   ├── deployToGke.groovy
│   └── notifySlack.groovy
├── src/                     # Groovy classes (importable)
│   └── org/mycompany/
│       ├── Docker.groovy
│       └── Kubernetes.groovy
└── resources/               # non-Groovy files (scripts, templates)
    └── scripts/
        └── smoke-test.sh
```

### vars/ — Global Steps

```groovy
// vars/buildMavenApp.groovy
def call(Map config = [:]) {
    def javaVersion = config.get('javaVersion', '21')
    def goals       = config.get('goals', 'package -DskipTests')

    withMaven(maven: "Maven 3.9", jdk: "JDK ${javaVersion}") {
        sh "mvn ${goals}"
    }
}
```

```groovy
// vars/notifySlack.groovy
def call(String message, String channel = '#ci', String color = 'good') {
    slackSend(channel: channel, color: color, message: message)
}
```

### Using the Shared Library

```groovy
// Configured globally in Jenkins → Manage Jenkins → System → Global Pipeline Libraries
// OR declared inline:
@Library('my-shared-library@main') _

pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                buildMavenApp(javaVersion: '21', goals: 'package')
            }
        }
    }
    post {
        failure {
            notifySlack("❌ ${env.JOB_NAME} failed", '#alerts', 'danger')
        }
    }
}
```

### src/ — Groovy Classes

```groovy
// src/org/mycompany/Docker.groovy
package org.mycompany

class Docker implements Serializable {
    def steps

    Docker(steps) { this.steps = steps }

    def build(String image) {
        steps.sh "docker build -t ${image} ."
    }

    def push(String image) {
        steps.sh "docker push ${image}"
    }
}
```

```groovy
// Jenkinsfile usage
@Library('my-shared-library@main') _
import org.mycompany.Docker

pipeline {
    agent any
    stages {
        stage('Build Image') {
            steps {
                script {
                    def docker = new Docker(this)
                    docker.build("myapp:${env.GIT_COMMIT}")
                    docker.push("myapp:${env.GIT_COMMIT}")
                }
            }
        }
    }
}
```

---

## Docker Builds in Jenkins

```groovy
pipeline {
    agent any
    environment {
        REGISTRY = 'registry.mycompany.com'
        IMAGE    = "${REGISTRY}/order-service:${env.GIT_COMMIT[0..7]}"
        DOCKER_CREDS = credentials('registry-credentials')
    }
    stages {
        stage('Build & Push Image') {
            steps {
                sh """
                    docker login -u $DOCKER_CREDS_USR -p $DOCKER_CREDS_PSW $REGISTRY
                    docker build -t $IMAGE .
                    docker push $IMAGE
                """
            }
        }
    }
    post {
        always {
            sh 'docker logout $REGISTRY'
        }
    }
}
```

### Docker Pipeline Plugin

```groovy
pipeline {
    agent any
    stages {
        stage('Build') {
            steps {
                script {
                    // Build and push using Docker Pipeline plugin
                    docker.withRegistry('https://registry.mycompany.com', 'registry-credentials') {
                        def appImage = docker.build("order-service:${env.GIT_COMMIT[0..7]}")
                        appImage.push()
                        appImage.push('latest')
                    }
                }
            }
        }
        stage('Test in Container') {
            steps {
                script {
                    docker.image('maven:3.9-eclipse-temurin-21').inside('-v $HOME/.m2:/root/.m2') {
                        sh 'mvn test'
                    }
                }
            }
        }
    }
}
```

---

## Kubernetes Agent (Dynamic Pods)

With the **Kubernetes plugin**, each build runs in an ephemeral Kubernetes Pod — no idle agents, instant scale-out.

```groovy
pipeline {
    agent {
        kubernetes {
            yaml '''
              apiVersion: v1
              kind: Pod
              metadata:
                labels:
                  app: jenkins-agent
              spec:
                serviceAccountName: jenkins-agent-sa
                containers:
                - name: maven
                  image: maven:3.9-eclipse-temurin-21
                  command: [sleep, 99d]
                  resources:
                    requests: { cpu: 500m, memory: 512Mi }
                    limits:   { cpu: 2,    memory: 2Gi }
                  volumeMounts:
                  - name: m2-cache
                    mountPath: /root/.m2
                - name: kaniko
                  image: gcr.io/kaniko-project/executor:v1.21.0-debug
                  command: [sleep, 99d]
                volumes:
                - name: m2-cache
                  persistentVolumeClaim:
                    claimName: maven-cache-pvc
            '''
            defaultContainer 'maven'
        }
    }

    stages {
        stage('Build') {
            steps {
                sh 'mvn package -DskipTests'
            }
        }
        stage('Build Image') {
            steps {
                container('kaniko') {
                    sh '/kaniko/executor --context . --destination myregistry/myapp:latest'
                }
            }
        }
    }
}
```

---

## Complete Spring Boot → GKE Jenkinsfile

```groovy
@Library('my-shared-library@main') _

pipeline {
    agent {
        kubernetes {
            yaml '''
              apiVersion: v1
              kind: Pod
              spec:
                containers:
                - name: maven
                  image: maven:3.9-eclipse-temurin-21
                  command: [sleep, 99d]
                - name: kaniko
                  image: gcr.io/kaniko-project/executor:v1.21.0-debug
                  command: [sleep, 99d]
                - name: gcloud
                  image: google/cloud-sdk:alpine
                  command: [sleep, 99d]
            '''
            defaultContainer 'maven'
        }
    }

    environment {
        IMAGE         = "europe-west1-docker.pkg.dev/my-project/my-repo/order-service:${env.GIT_COMMIT[0..7]}"
        GCP_SA_KEY    = credentials('gcp-service-account-json')
        GKE_CLUSTER   = 'my-cluster'
        GKE_ZONE      = 'europe-west1'
        GKE_PROJECT   = 'my-project'
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
        disableConcurrentBuilds()
        timestamps()
    }

    stages {
        stage('Compile & Lint') {
            steps {
                sh 'mvn compile checkstyle:check -q'
            }
        }

        stage('Test') {
            parallel {
                stage('Unit Tests') {
                    steps {
                        sh 'mvn test -q'
                    }
                    post {
                        always {
                            junit 'target/surefire-reports/*.xml'
                        }
                    }
                }
                stage('OWASP Check') {
                    steps {
                        sh 'mvn dependency-check:check -q'
                    }
                    post {
                        always {
                            publishHTML(target: [
                                reportDir: 'target',
                                reportFiles: 'dependency-check-report.html',
                                reportName: 'OWASP Report'
                            ])
                        }
                    }
                }
            }
        }

        stage('Package') {
            steps {
                sh 'mvn package -DskipTests -q'
                archiveArtifacts artifacts: 'target/*.jar', fingerprint: true
            }
        }

        stage('Build & Push Image') {
            when { anyOf { branch 'main'; buildingTag() } }
            steps {
                container('kaniko') {
                    sh """
                        /kaniko/executor \
                          --context /home/jenkins/agent/workspace/${env.JOB_NAME} \
                          --dockerfile Dockerfile \
                          --destination ${IMAGE} \
                          --cache=true
                    """
                }
            }
        }

        stage('Image Scan') {
            when { anyOf { branch 'main'; buildingTag() } }
            steps {
                container('gcloud') {
                    sh 'apk add --no-cache curl'
                    sh """
                        curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin
                        trivy image --exit-code 1 --severity HIGH,CRITICAL ${IMAGE}
                    """
                }
            }
        }

        stage('Deploy Staging') {
            when { branch 'main' }
            steps {
                container('gcloud') {
                    sh """
                        gcloud auth activate-service-account --key-file=$GCP_SA_KEY
                        gcloud container clusters get-credentials $GKE_CLUSTER \
                          --zone $GKE_ZONE --project $GKE_PROJECT
                        kubectl set image deployment/order-service app=${IMAGE} -n staging
                        kubectl rollout status deployment/order-service -n staging --timeout=5m
                    """
                }
            }
        }

        stage('Smoke Tests') {
            when { branch 'main' }
            steps {
                sh 'curl -f https://staging.myapp.com/actuator/health'
            }
        }

        stage('Approve Production') {
            when { branch 'main' }
            steps {
                input(
                    message: "Deploy ${IMAGE} to production?",
                    ok: 'Deploy',
                    submitter: 'ops-team'
                )
            }
        }

        stage('Deploy Production') {
            when { branch 'main' }
            steps {
                container('gcloud') {
                    sh """
                        gcloud auth activate-service-account --key-file=$GCP_SA_KEY
                        gcloud container clusters get-credentials $GKE_CLUSTER \
                          --zone $GKE_ZONE --project $GKE_PROJECT
                        kubectl set image deployment/order-service app=${IMAGE} -n production
                        kubectl rollout status deployment/order-service -n production --timeout=10m
                    """
                }
            }
        }
    }

    post {
        always {
            cleanWs()
        }
        success {
            notifySlack("✅ ${env.JOB_NAME} #${env.BUILD_NUMBER} deployed to production")
        }
        failure {
            notifySlack("❌ ${env.JOB_NAME} #${env.BUILD_NUMBER} FAILED — ${env.BUILD_URL}", '#alerts', 'danger')
        }
    }
}
```

---

## Key Plugins

| Plugin | Purpose |
|--------|---------|
| **Pipeline** | Core declarative/scripted pipeline support |
| **Git** | SCM integration |
| **GitHub / GitLab** | Webhook triggers, PR status, multibranch |
| **Kubernetes** | Dynamic Pod-based agents |
| **Docker Pipeline** | `docker.build()`, `docker.withRegistry()` |
| **Maven Integration** | `withMaven()` step, auto-publish test results |
| **JUnit** | Publish test result reports |
| **Jacoco** | Code coverage reports |
| **OWASP Dependency-Check** | Dependency vulnerability scanning |
| **SonarQube Scanner** | Code quality gate integration |
| **Credentials Binding** | `withCredentials()` step |
| **Slack Notification** | `slackSend()` step |
| **Email Extension** | Rich HTML email notifications |
| **Blue Ocean** | Modern pipeline visualisation UI |
| **Timestamper** | Prepend timestamps to logs |
| **Workspace Cleanup** | `cleanWs()` step |

---

## Groovy Scripted Pipeline (Advanced)

```groovy
// Scripted pipeline — full Groovy flexibility
def buildLabel = "build-${UUID.randomUUID().toString()[0..7]}"
def image

node('linux') {
    checkout scm

    stage('Build') {
        withEnv(['MAVEN_OPTS=-Xmx512m']) {
            sh 'mvn package -DskipTests'
        }
    }

    stage('Build Image') {
        image = docker.build("myapp:${env.GIT_COMMIT[0..7]}")
    }

    if (env.BRANCH_NAME == 'main') {
        stage('Push') {
            docker.withRegistry('https://my-registry.com', 'registry-creds') {
                image.push()
                image.push('latest')
            }
        }

        // Dynamic stage generation
        def environments = ['staging', 'production']
        for (def env in environments) {
            def deployEnv = env   // closure capture — must assign to local var
            stage("Deploy ${deployEnv}") {
                if (deployEnv == 'production') {
                    input "Deploy to ${deployEnv}?"
                }
                sh "./deploy.sh ${deployEnv}"
            }
        }
    }
}
```

---

## Jenkins vs GitHub Actions vs GitLab CI

| Feature | Jenkins | GitHub Actions | GitLab CI |
|---------|---------|----------------|-----------|
| Language | Groovy DSL | YAML | YAML |
| Hosted option | Self-host only | GitHub-hosted runners | GitLab shared runners |
| Plugin ecosystem | Very large (1800+) | Marketplace actions | Built-in templates |
| Kubernetes agents | Kubernetes plugin | Not native | Native K8s executor |
| Secrets | Credential store | Encrypted secrets | CI/CD Variables |
| Shared logic | Shared Libraries | Reusable workflows | `include:` + `extends:` |
| UI | Classic + Blue Ocean | GitHub UI | GitLab UI |
| Learning curve | High | Low | Medium |
| Maintenance | High (self-hosted) | Low | Medium |
| Enterprise | Yes (CloudBees) | GitHub Enterprise | GitLab EE |

---

## Interview Quick-Fire

**Q: What is the difference between Declarative and Scripted pipelines?**
Declarative pipelines have a strict, validated schema (`pipeline { ... }`) — easier to read and write, IDE support, enforces best practices. Scripted pipelines are raw Groovy (`node { ... }`) — maximally flexible but harder to maintain. Prefer Declarative; use Scripted only when you need full programmatic control (e.g., dynamic stage generation).

**Q: What is a Shared Library and why would you use one?**
A Shared Library is a separate Git repository containing reusable Groovy code (steps, utilities, templates) imported via `@Library(...)`. Teams use it to avoid duplicating pipeline logic across dozens of Jenkinsfiles — centralise updates, enforce standards, and provide typed abstractions over common tasks (build, deploy, notify).

**Q: What is a Multibranch Pipeline?**
A Jenkins project type that automatically discovers branches and Pull Requests in a repository and creates a separate pipeline for each, using the `Jenkinsfile` in that branch. This enables per-branch CI without manually creating jobs.

**Q: How do you prevent secrets from appearing in Jenkins logs?**
Store secrets in the Jenkins Credential store (never hardcode in Jenkinsfile). Use `credentials()` binding or `withCredentials()` — Jenkins automatically masks the values in logs. Mark secrets appropriately by type (Secret text, Username+Password, etc.). Avoid `echo`-ing variables that hold secrets.

**Q: How would you scale Jenkins for a large engineering team?**
Use the **Kubernetes plugin** for dynamic, ephemeral Pod-based agents — no idle agents, auto-scales with demand. Separate the controller from build workloads (controller should not run builds). Use Shared Libraries to standardise pipelines. Use Multibranch Pipelines with folder organisation. Consider CloudBees Jenkins for enterprise support, RBAC, and HA controllers.

<RelatedTopics :topics="['/cicd/', '/cicd/github-actions', '/cicd/gitlab-ci', '/docker/production', '/kubernetes/production']" />

[→ Back to CI/CD Overview](/cicd/)
