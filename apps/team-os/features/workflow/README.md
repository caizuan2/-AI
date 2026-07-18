# AI Team OS Workflow Engine

Phase 10 adds a tenant-scoped workflow engine for Task, CRM, AI Coach, Training, Analytics, Notification, and Copilot-compatible events.

## Safety model

- Workflow Definition, Action, and Execution records are the only tables written directly by this module.
- Production actions call existing domain services. They never use Prisma to write Task, CRM, Training, Analytics, Notification, Chat, RAG, or knowledge-base tables.
- `/api/team-os/workflow/test` always uses `TEST` mode. It performs read-only permission, template, course, recipient, and report-access preflight checks and records a dry-run execution, but it does not create tasks, training assignments, CRM records, reports, or notifications.
- The API accepts only an event type and business reference ID. Company, team, user, score, risk, and metric data are loaded again on the server.
- Execution idempotency is derived from the validated business record state, so changing a client event ID cannot duplicate the same action run.
- A failed multi-action production run is not automatically retried because existing Task and Notification models do not expose downstream idempotency keys. Completed action results remain in the execution audit record.

`CREATE_FOLLOWUP` creates a customer follow-up team task through the Task service. It deliberately does not write a fake historical CRM communication record.

Task-producing actions must bind an explicit team and can only be created or executed by an actor who is directly `TEAM_OWNER` or `TEAM_MANAGER` in that team. Training courses are verified as active and tenant-owned when the workflow is created, then checked again during test or production execution.

## Event flow

```text
validated event reference
  -> server-side event hydration
  -> tenant/team permission check
  -> idempotent RUNNING execution claim
  -> rules-first AI decision
  -> allowlisted actions in order
  -> SUCCESS / FAILED / SKIPPED audit result
```

Supported events:

- `TASK_COMPLETED`
- `TASK_OVERDUE`
- `CRM_RISK_FOUND`
- `EMPLOYEE_SCORE_LOW`
- `TRAINING_FINISHED`
- `BUSINESS_METRIC_ALERT`
- `SYSTEM_TRIGGERED`

## API examples

Create a workflow:

```http
POST /api/team-os/workflow
Content-Type: application/json
```

```json
{
  "companyId": "company-id",
  "scopeTeamId": "team-id",
  "name": "任务延期提醒",
  "description": "任务延期后提醒负责人。",
  "triggerType": "TASK",
  "eventType": "TASK_OVERDUE",
  "status": "ACTIVE",
  "decision": { "enabled": true, "minConfidence": 0.8 },
  "actions": [
    {
      "actionType": "SEND_NOTIFICATION",
      "order": 1,
      "config": {
        "title": "任务已延期",
        "content": "请检查阻塞原因并更新计划。",
        "notificationType": "TASK",
        "recipient": "EVENT_USER"
      }
    }
  ]
}
```

Dry-run a workflow against a real task without changing business data:

```http
POST /api/team-os/workflow/test
Content-Type: application/json
```

```json
{
  "workflowId": "workflow-id",
  "companyId": "company-id",
  "event": {
    "eventId": "manual-test-20260713-001",
    "eventType": "TASK_OVERDUE",
    "referenceId": "task-id"
  }
}
```

Production execution uses the same request shape at `/api/team-os/workflow/execute` and requires owner or direct-manager authorization.

## EventBus boundary

`workflowEventBus.publish()` is a synchronous server entry for already validated events. It revalidates the workflow creator as an active user with current role access and applies persistent execution/report budgets before running actions. This phase does not alter the frozen Task, CRM, AI Coach, Training, or Analytics write paths to emit events automatically. In a multi-instance deployment, reliable automatic delivery requires a later transactional outbox or queue integration; the explicit execute API is the durable Phase 10 entry point.
