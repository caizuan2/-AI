# AI Team OS Enterprise Copilot

Phase 9 adds three read-only operating assistants on top of the existing Team OS data services:

- Employee Assistant reads only the signed-in user's team-task submissions, owned CRM customers, training assignments, and latest coach report.
- Manager Assistant reads only teams where the signed-in user is an active `TEAM_MANAGER`.
- Owner Assistant reads one explicitly selected company where the signed-in user is the company owner.

The assistants never update Task, CRM, AI Coach, Training, Analytics, Knowledge Base, Chat, or RAG records. Writes are limited to the three Copilot models and optional in-app notifications created from high-priority insights.

## Routes

- `/team-os/copilot/employee`
- `/team-os/copilot/manager`
- `/team-os/copilot/owner`
- `/team-os/copilot/insights`

## API examples

Read an assistant dashboard:

```http
GET /api/team-os/copilot/employee?companyId=company-id
```

Ask the assistant a question. The role and company are revalidated against the server session and cannot expand the caller's scope:

```json
{
  "assistantRole": "EMPLOYEE_ASSISTANT",
  "companyId": "company-id",
  "message": "今天最需要优先处理什么？"
}
```

Refresh persisted insights and send idempotent high-priority in-app notifications:

```json
{
  "assistantRole": "MANAGER_ASSISTANT",
  "companyId": "company-id"
}
```

`GET /api/team-os/copilot/insights` is read-only. Insight generation and notification delivery happen only through the explicit `POST` request.

## AI behavior

The provider layer uses the existing server-side Qwen, DeepSeek, or OpenAI gateway. It sends a bounded, structured summary without internal IDs or secrets. If no provider is configured or a provider fails, the assistant returns deterministic rule-engine guidance so the feature remains usable without exposing API keys to the browser.
