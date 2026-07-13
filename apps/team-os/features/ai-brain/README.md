# AI Team OS Enterprise AI Brain

Phase 11 adds a tenant- and team-scoped knowledge improvement loop without changing the existing knowledge user UI, admin ingest client, super-admin, Chat, RAG, embedding, vector database, or knowledge tables.

## Closed loop

```text
authorized business record
  -> source-specific quality gate
  -> bounded basic contact/identifier redaction
  -> PENDING KnowledgeCandidate
  -> enterprise-owner review
  -> existing protected /api/core/ingest
  -> APPROVED only after a knowledge ID is confirmed

AI answer feedback
  -> tenant/team-scoped KnowledgeFeedback
  -> repeated BAD/MISSING question mining
  -> KnowledgeOptimization suggestion
  -> human handling outside this phase

redacted CRM follow-up text
  -> repeated explicit customer-question mining
  -> FAQ completion suggestion
```

No candidate, feedback, or optimization record is a substitute for an existing knowledge-base record. Only the official knowledge service can publish a candidate.

## Source qualification

| Source | Read model | Qualification and isolation |
| --- | --- | --- |
| `CHAT` | `TaskSubmission` + `EmployeeAnalysisReport` | Submission must be `ANALYZED`, report score at least 85, optional industry score at least 80, all recorded skill scores at least 14, active submitter membership, matching team and user. Global Chat messages are not read. |
| `AI_COACH` | `EmployeeAnalysisReport` | Same score thresholds; report must belong to an active team in the selected company. |
| `CRM` | `Customer` + `CustomerFollowUp` | Customer must be in `CUSTOMER` stage with at least one follow-up. Name, phone, WeChat, owner and tags are never selected. Wording does not claim a particular script caused conversion. |
| `TRAINING` | `AITrainingEvaluation` + `TrainingCourse` + `TrainingAssignment` | Evaluation score at least 85; active company course; exactly one valid team assignment unless the authorized team is supplied. |
| `WORKFLOW` | `WorkflowExecution` | `PRODUCTION`, `SUCCESS`, decision triggered, active workflow, at least three production runs and 80% success in 30 days. Raw trigger data, errors, output IDs and recipient IDs are not selected. |

All sources must be no older than 90 days. Candidate creation is idempotent on `(companyId, sourceType, sourceId)`. A previously approved or actively publishing candidate is never overwritten by a new extraction.

The deterministic redactor covers common email, mobile/landline phone, URL, WeChat ID, ID-card, labeled name and labeled internal-ID patterns. Free-form business text can still contain unstructured personal or confidential details, so reviewers must perform a final privacy and accuracy check before approval. The system never describes regex redaction as a complete data-loss-prevention boundary.

## Knowledge adapter boundary

`knowledge-base-adapter.ts` is the only knowledge integration boundary:

- Search calls the existing `searchKnowledgeChunks()` service only after confirming `User.tenantId === companyId`.
- Publish forwards the current session to the existing protected `POST /api/core/ingest` route. It does not import `ingestKnowledgeCore`, write `KnowledgeItem`/`KnowledgeChunk`, map Team OS roles to knowledge roles, or bypass the ingest license.
- Existing optimization signals are requested from protected `GET /api/admin/knowledge/optimize`; failure does not fabricate a successful knowledge optimization result.
- Production same-origin calls require an HTTPS `APP_URL` or `NEXT_PUBLIC_APP_URL`; plain HTTP is accepted only for loopback development. Requests have a 15-second timeout, and an uncertain timed-out publish remains locked for manual reconciliation.

Team OS membership can span multiple companies, while the current knowledge account has one `tenantId`. If the selected company is not that tenant, candidates and feedback remain available inside Team OS, but knowledge search and publication return a tenant-mismatch error.

## Review and retry safety

An approval atomically claims a `PENDING` candidate as `REVIEWING` before dispatching the official ingest request.

- A proven local/configuration or upstream 4xx rejection restores `PENDING`, so the owner can fix authorization and retry.
- Network errors, redirects, upstream 5xx, or a success response without a knowledge ID leave the candidate `REVIEWING`. The result may be unknown, so automatic or UI retry is blocked until an administrator checks the knowledge base.
- Only a confirmed knowledge ID changes the candidate to `APPROVED`.
- Rejection changes a `PENDING` candidate to `REJECTED` without calling the knowledge service.

The upstream knowledge route independently requires an existing KB admin session, ingest-admin license and tenant authorization. `TEAM_OWNER` alone is intentionally insufficient.

## Permissions

- `TEAM_OWNER`: company-wide dashboard, all candidates, extraction, review/publication, feedback analysis and optimization generation.
- `TEAM_MANAGER`: candidate analysis and extraction only for directly managed teams; no company publication or optimization.
- `TRAINER`: training candidates and extraction only for directly assigned trainer teams.
- `TEAM_MEMBER`: receives only its safe context and can submit feedback to an active direct team; no candidate, feedback-analysis or optimization data.

Every read is scoped again on the server. Mixed manager/trainer access uses separate branches: manager teams can see all allowed source types, trainer-only teams can see `TRAINING` candidates only.

## APIs

- `GET /api/team-os/ai-brain/candidates?companyId=...&status=PENDING&sourceType=CRM&limit=50`
- `POST /api/team-os/ai-brain/extract`
- `GET|POST /api/team-os/ai-brain/feedback`
- `GET|POST /api/team-os/ai-brain/optimize`
- `POST /api/team-os/ai-brain/review`

Example extraction:

```json
{
  "companyId": "company-id",
  "teamId": "team-id",
  "sourceType": "TRAINING",
  "sourceId": "evaluation-id"
}
```

Example feedback:

```json
{
  "companyId": "company-id",
  "teamId": "team-id",
  "question": "客户问到政策有效期时如何回答？",
  "feedbackType": "MISSING",
  "comment": "缺少有效期和适用地区。"
}
```

Example owner review:

```json
{
  "companyId": "company-id",
  "candidateId": "candidate-id",
  "decision": "APPROVE",
  "note": "内容已复核并完成脱敏。"
}
```

Request bodies are limited to 64 KiB, unknown fields are rejected, and mutation endpoints use persistent per-user/global rate limits.

## Deployment

The migration creates only `team_os_knowledge_candidates`, `team_os_knowledge_feedback`, and `team_os_knowledge_optimizations` plus their enums, indexes, check constraints, and composite team/company foreign keys. Apply it through the normal reviewed deployment process; this implementation does not apply migrations to a live database.

Contract verification:

```powershell
npx tsx apps/team-os/features/ai-brain/tests/ai-brain-contract.test.ts
npx prisma validate
npm run lint
npm run typecheck
npm run build
```
