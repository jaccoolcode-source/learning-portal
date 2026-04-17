---
title: AWS Step Functions
description: AWS Step Functions — state machines, Standard vs Express workflows, states, error handling, and orchestration patterns
category: aws
pageClass: layout-aws
difficulty: intermediate
tags: [aws, step-functions, state-machine, workflow, orchestration, saga, lambda]
estimatedMinutes: 25
---

# AWS Step Functions

<DifficultyBadge level="intermediate" />

Step Functions is a serverless workflow orchestrator. It coordinates Lambda functions, AWS services, and HTTP endpoints into reliable multi-step workflows using state machines defined in Amazon States Language (ASL).

---

## Workflow Types

| Feature | Standard | Express |
|---------|----------|---------|
| **Max duration** | 1 year | 5 minutes |
| **Execution model** | Exactly-once | At-least-once |
| **Pricing** | Per state transition | Per execution + duration |
| **History** | Full execution history in console | CloudWatch Logs only |
| **Use case** | Long-running business processes | High-volume, short workflows |

---

## State Types

| State | Description |
|-------|-------------|
| `Task` | Invoke Lambda, ECS, SQS, DynamoDB, HTTP endpoint, or another service |
| `Choice` | Conditional branching (if/else) |
| `Wait` | Pause for a duration or until a timestamp |
| `Parallel` | Execute branches concurrently |
| `Map` | Iterate over an array (like forEach with concurrency control) |
| `Pass` | Pass input to output (useful for transformations) |
| `Succeed` | End successfully |
| `Fail` | End with an error |

---

## State Machine Definition (ASL)

```json
{
  "Comment": "Order processing workflow",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:123:function:validate-order",
      "Next": "ProcessPayment",
      "Catch": [
        {
          "ErrorEquals": ["ValidationException"],
          "Next": "NotifyInvalidOrder",
          "ResultPath": "$.error"
        }
      ],
      "Retry": [
        {
          "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
          "IntervalSeconds": 2,
          "MaxAttempts": 3,
          "BackoffRate": 2
        }
      ]
    },

    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:123:function:process-payment",
      "Next": "ShipOrder",
      "TimeoutSeconds": 30
    },

    "ShipOrder": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sqs:sendMessage",
      "Parameters": {
        "QueueUrl": "https://sqs.eu-west-1.amazonaws.com/123/shipping-queue",
        "MessageBody.$": "States.JsonToString($.order)"
      },
      "Next": "NotifyCustomer"
    },

    "NotifyCustomer": {
      "Type": "Task",
      "Resource": "arn:aws:states:::sns:publish",
      "Parameters": {
        "TopicArn": "arn:aws:sns:eu-west-1:123:order-notifications",
        "Message.$": "States.Format('Order {} confirmed!', $.orderId)"
      },
      "End": true
    },

    "NotifyInvalidOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:eu-west-1:123:function:notify-invalid",
      "End": true
    }
  }
}
```

---

## Choice State (Branching)

```json
"CheckOrderValue": {
  "Type": "Choice",
  "Choices": [
    {
      "Variable": "$.order.amount",
      "NumericGreaterThan": 1000,
      "Next": "RequireManagerApproval"
    },
    {
      "And": [
        { "Variable": "$.order.status", "StringEquals": "PRIORITY" },
        { "Variable": "$.customer.tier", "StringEquals": "GOLD" }
      ],
      "Next": "ExpressProcessing"
    }
  ],
  "Default": "StandardProcessing"
}
```

---

## Parallel State

```json
"ProcessInParallel": {
  "Type": "Parallel",
  "Branches": [
    {
      "StartAt": "SendEmailReceipt",
      "States": {
        "SendEmailReceipt": {
          "Type": "Task",
          "Resource": "arn:aws:lambda:...:send-email",
          "End": true
        }
      }
    },
    {
      "StartAt": "UpdateInventory",
      "States": {
        "UpdateInventory": {
          "Type": "Task",
          "Resource": "arn:aws:lambda:...:update-inventory",
          "End": true
        }
      }
    }
  ],
  "Next": "OrderComplete"
}
```

---

## Map State (Batch Processing)

```json
"ProcessOrderItems": {
  "Type": "Map",
  "ItemsPath": "$.order.items",
  "MaxConcurrency": 5,
  "Iterator": {
    "StartAt": "ProcessItem",
    "States": {
      "ProcessItem": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:...:process-item",
        "End": true
      }
    }
  },
  "Next": "AllItemsProcessed"
}
```

---

## Wait for Callback (Human Approval / Async)

```json
"WaitForManagerApproval": {
  "Type": "Task",
  "Resource": "arn:aws:states:::lambda:invoke.waitForTaskToken",
  "Parameters": {
    "FunctionName": "send-approval-email",
    "Payload": {
      "taskToken.$": "$$.Task.Token",
      "orderId.$": "$.orderId",
      "amount.$": "$.order.amount"
    }
  },
  "HeartbeatSeconds": 86400,
  "Next": "ApprovalDecision"
}
```

```java
// Lambda sends approval email with taskToken embedded in approve/reject links
// Manager clicks link → calls:
stepFunctionsClient.sendTaskSuccess(SendTaskSuccessRequest.builder()
    .taskToken(taskToken)
    .output("{\"approved\": true, \"approvedBy\": \"manager@company.com\"}")
    .build());
```

---

## Saga Pattern

Step Functions is ideal for implementing the Saga pattern — each step includes a compensating transaction in the Catch block.

```
ValidateOrder → ChargePayment → ReserveInventory → ShipOrder
        ↑              ↑                ↑
     (nothing)    RefundPayment   ReleaseInventory  (if ShipOrder fails)
```

---

## Interview Quick-Fire

**Q: What's the difference between Standard and Express workflows?**
Standard: exactly-once execution, up to 1 year duration, full execution history — for business processes. Express: at-least-once, up to 5 minutes, CloudWatch logs only — for high-volume, short-lived tasks like data transformation pipelines.

**Q: How does the callback pattern (waitForTaskToken) work?**
The state machine pauses and sends a task token to an external system (email, SQS). The workflow resumes only when that system calls `SendTaskSuccess` or `SendTaskFailure` with the token. Used for human approval flows and async integrations.

**Q: When would you use Step Functions over a simple Lambda chain?**
When you need: retry with backoff, parallel execution, human approval, long-running workflows (>15 min Lambda limit), visual audit trail, error handling at each step, or time-based waiting. Chained Lambdas lose execution history and don't handle partial failures gracefully.

<RelatedTopics :topics="['/aws/lambda', '/aws/eventbridge', '/aws/sqs']" />

[→ Back to AWS Overview](/aws/)
