---
title: AWS CloudFormation
description: AWS CloudFormation — templates, stacks, change sets, intrinsic functions, drift detection, and CDK overview
category: iac
pageClass: layout-iac
difficulty: intermediate
tags: [aws, cloudformation, iac, templates, stacks, change-sets, cdk]
estimatedMinutes: 25
---

# AWS CloudFormation

<DifficultyBadge level="intermediate" />

CloudFormation is AWS's native IaC service. You define AWS resources in JSON or YAML templates; CloudFormation provisions and manages them as a **stack**.

---

## Template Structure

```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "Order processing service infrastructure"

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, staging, prod]
    Default: dev

  MemorySize:
    Type: Number
    Default: 512

Mappings:
  EnvironmentConfig:
    dev:
      LogLevel: DEBUG
    prod:
      LogLevel: WARN

Conditions:
  IsProd: !Equals [!Ref Environment, prod]

Resources:
  OrderQueue:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "${Environment}-orders"
      VisibilityTimeout: 30
      RedrivePolicy:
        deadLetterTargetArn: !GetAtt OrderDLQ.Arn
        maxReceiveCount: 5

  OrderDLQ:
    Type: AWS::SQS::Queue
    Properties:
      QueueName: !Sub "${Environment}-orders-dlq"
      MessageRetentionPeriod: 1209600  # 14 days

  LambdaExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: SQSPolicy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action: [sqs:ReceiveMessage, sqs:DeleteMessage, sqs:GetQueueAttributes]
                Resource: !GetAtt OrderQueue.Arn

  OrderProcessor:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub "${Environment}-order-processor"
      Runtime: java21
      Handler: com.mycompany.OrderHandler::handleRequest
      Role: !GetAtt LambdaExecutionRole.Arn
      MemorySize: !Ref MemorySize
      Timeout: 30
      Environment:
        Variables:
          ENV: !Ref Environment
          LOG_LEVEL: !FindInMap [EnvironmentConfig, !Ref Environment, LogLevel]
          QUEUE_URL: !Ref OrderQueue

  # Alarm only in prod
  ErrorAlarm:
    Type: AWS::CloudWatch::Alarm
    Condition: IsProd
    Properties:
      AlarmName: !Sub "${Environment}-order-processor-errors"
      MetricName: Errors
      Namespace: AWS/Lambda
      Dimensions:
        - Name: FunctionName
          Value: !Ref OrderProcessor
      Statistic: Sum
      Period: 300
      Threshold: 5
      ComparisonOperator: GreaterThanOrEqualToThreshold
      EvaluationPeriods: 1

Outputs:
  LambdaArn:
    Value: !GetAtt OrderProcessor.Arn
    Export:
      Name: !Sub "${Environment}-order-processor-arn"

  QueueUrl:
    Value: !Ref OrderQueue
    Export:
      Name: !Sub "${Environment}-order-queue-url"
```

---

## Intrinsic Functions

| Function | Description | Example |
|----------|-------------|---------|
| `!Ref` | Reference a parameter or resource logical ID | `!Ref Environment` |
| `!GetAtt` | Get an attribute of a resource | `!GetAtt MyBucket.Arn` |
| `!Sub` | String substitution | `!Sub "${Env}-queue"` |
| `!Join` | Join strings with delimiter | `!Join [":", [a, b, c]]` → `a:b:c` |
| `!Select` | Select item from list | `!Select [0, !GetAZs ""]` |
| `!FindInMap` | Look up value in Mappings | `!FindInMap [Map, Key1, Key2]` |
| `!If` | Conditional value | `!If [IsProd, 3, 1]` |
| `!ImportValue` | Cross-stack reference | `!ImportValue prod-vpc-id` |

---

## Stack Operations

```bash
# Create stack
aws cloudformation create-stack \
  --stack-name prod-order-service \
  --template-body file://template.yaml \
  --parameters ParameterKey=Environment,ParameterValue=prod \
  --capabilities CAPABILITY_NAMED_IAM

# Update stack
aws cloudformation update-stack \
  --stack-name prod-order-service \
  --template-body file://template.yaml \
  --parameters ParameterKey=Environment,ParameterValue=prod \
  --capabilities CAPABILITY_NAMED_IAM

# Delete stack (destroys all resources)
aws cloudformation delete-stack --stack-name prod-order-service

# Describe stack status
aws cloudformation describe-stacks --stack-name prod-order-service
```

---

## Change Sets (Safe Updates)

A change set previews what will change before applying — like `terraform plan`.

```bash
# 1. Create change set (no changes applied yet)
aws cloudformation create-change-set \
  --stack-name prod-order-service \
  --change-set-name v1-2-0 \
  --template-body file://template.yaml \
  --parameters ParameterKey=MemorySize,ParameterValue=1024

# 2. Review the change set
aws cloudformation describe-change-set \
  --stack-name prod-order-service \
  --change-set-name v1-2-0

# 3. Execute if approved
aws cloudformation execute-change-set \
  --stack-name prod-order-service \
  --change-set-name v1-2-0
```

---

## Stack Sets (Multi-Account / Multi-Region)

```bash
# Deploy same template across multiple accounts and regions
aws cloudformation create-stack-set \
  --stack-set-name security-baseline \
  --template-body file://security.yaml \
  --capabilities CAPABILITY_NAMED_IAM

aws cloudformation create-stack-instances \
  --stack-set-name security-baseline \
  --accounts 111122223333 444455556666 \
  --regions eu-west-1 us-east-1
```

---

## Drift Detection

Detects when actual resource configuration has diverged from the template (manual console changes, other tools).

```bash
aws cloudformation detect-stack-drift --stack-name prod-order-service
aws cloudformation describe-stack-resource-drifts --stack-name prod-order-service
```

---

## AWS CDK (Cloud Development Kit)

CDK is a higher-level abstraction over CloudFormation. Write infrastructure in TypeScript/Python/Java; CDK synthesises to a CloudFormation template.

```typescript
// TypeScript CDK
import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

export class OrderStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string) {
    super(scope, id);

    const dlq = new sqs.Queue(this, 'OrderDLQ');

    const queue = new sqs.Queue(this, 'OrderQueue', {
      visibilityTimeout: cdk.Duration.seconds(30),
      deadLetterQueue: { queue: dlq, maxReceiveCount: 5 },
    });

    const fn = new lambda.Function(this, 'OrderProcessor', {
      runtime: lambda.Runtime.JAVA_21,
      handler: 'com.mycompany.OrderHandler::handleRequest',
      code: lambda.Code.fromAsset('order-processor.jar'),
      memorySize: 512,
      timeout: cdk.Duration.seconds(30),
    });

    fn.addEventSource(new lambdaEventSources.SqsEventSource(queue, {
      batchSize: 10,
      reportBatchItemFailures: true,
    }));
  }
}
```

```bash
cdk synth    # generate CloudFormation template
cdk diff     # show what will change
cdk deploy   # deploy via CloudFormation
cdk destroy  # delete the stack
```

---

## CloudFormation vs Terraform

| | CloudFormation | Terraform |
|--|---------------|-----------|
| **Cloud support** | AWS only | Any cloud |
| **State management** | AWS manages it | You manage it (S3 + DynamoDB) |
| **Syntax** | JSON/YAML (verbose) | HCL (concise) |
| **Drift correction** | Manual detect + fix | `terraform apply` corrects drift |
| **Module ecosystem** | Service Catalog | Terraform Registry (huge) |
| **Best for** | Pure AWS, no multi-cloud needs | Multi-cloud or team preference |

---

## Interview Quick-Fire

**Q: What is a change set and why should you always use one for production?**
A change set previews the diff of what CloudFormation will change without applying it. In production, reviewing a change set before executing prevents unintended replacements of stateful resources (RDS, S3) that would cause data loss.

**Q: What does `CAPABILITY_NAMED_IAM` mean?**
CloudFormation requires explicit acknowledgment when a template creates or modifies IAM resources with custom names. This flag tells CloudFormation you're aware the template grants permissions — a safety guard against accidental privilege escalation.

**Q: How does CDK relate to CloudFormation?**
CDK compiles down to CloudFormation templates via `cdk synth`. At deploy time, CDK submits the generated template to CloudFormation. CDK adds type safety, reusable constructs (L2/L3), and IDE autocompletion, but ultimately CloudFormation does the actual provisioning.

<RelatedTopics :topics="['/iac/terraform', '/aws/', '/aws/iam']" />

[→ Back to IaC Overview](/iac/)
