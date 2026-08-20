import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AdminIngestRequestError } from "../lib/enterprise/admin-ingest-request-error";
import { buildAdminIngestFailurePresentation } from "../lib/enterprise/admin-ingest-failure-presentation";
import {
  ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_CODE,
  ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_MESSAGE,
  hasAdminIngestWechatTailRoleEvidenceInsufficient
} from "../lib/enterprise/ingest-attachment-evidence";
import { shouldRestoreAdminIngestEvidencePreflightRequest } from "../lib/enterprise/ingest-request-controller";
import { replaceIngestRetryOutcome } from "../lib/enterprise/ingest-retry-state";
import { getStateDomain, isRealIngestFailure } from "../lib/enterprise/ingest-ui-state";

function assertSourceOrder(source: string, before: string, after: string, message: string) {
  const beforeIndex = source.indexOf(before);
  const afterIndex = source.indexOf(after, beforeIndex + before.length);

  assert.ok(beforeIndex >= 0, `Missing source marker: ${before}`);
  assert.ok(afterIndex > beforeIndex, message);
}

const evidence = "【微信对话截图识别稿】\n客户(左侧)：还好\n【当前回合角色核验】证据不足";
assert.equal(hasAdminIngestWechatTailRoleEvidenceInsufficient([{
  extractedText: evidence,
  parseStatus: "partial"
}]), true);
assert.equal(hasAdminIngestWechatTailRoleEvidenceInsufficient([{
  extractedText: "",
  parseStatus: "metadata_only",
  currentTurnState: "evidence_insufficient"
}]), true, "Explicit tail-role state must survive an empty metadata-only parse body.");
assert.equal(hasAdminIngestWechatTailRoleEvidenceInsufficient([{
  extractedText: "客户(左侧)：还好",
  parseStatus: "parsed"
}]), false);

const terminalError = new AdminIngestRequestError(
  ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_MESSAGE,
  {
    status: 422,
    errorCode: ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_CODE,
    retryable: false,
    provider: "deepseek-pro",
    requestedProvider: "deepseek-pro",
    actualProvider: null,
    fallbackUsed: false,
    requestId: "same-request"
  }
);
const presentation = buildAdminIngestFailurePresentation(terminalError, "DeepSeek-V4-Pro");

assert.equal(presentation.message, ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_MESSAGE);
assert.equal(presentation.retryable, false);
assert.equal(getStateDomain(terminalError), "ingest");
assert.equal(isRealIngestFailure({
  reason: terminalError.message,
  stateDomain: getStateDomain(terminalError),
  requestId: "same-request",
  activeRequestId: "same-request",
  status: 422,
  errorCode: ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_CODE,
  retryable: false
}), true);

const ownershipBase = {
  activeRequestId: "same-request",
  requestId: "same-request",
  cancelled: false,
  conversationId: "conversation-a",
  requestConversationId: "conversation-a",
  selectedProvider: "deepseek-pro",
  requestProvider: "deepseek-pro",
  evidenceInsufficient: true
};
assert.equal(shouldRestoreAdminIngestEvidencePreflightRequest(ownershipBase), true);
assert.equal(shouldRestoreAdminIngestEvidencePreflightRequest({
  ...ownershipBase,
  activeRequestId: "newer-request"
}), false, "A replaced request must never be restored.");
assert.equal(shouldRestoreAdminIngestEvidencePreflightRequest({
  ...ownershipBase,
  cancelled: true
}), false, "A cancelled request must never be restored.");
assert.equal(shouldRestoreAdminIngestEvidencePreflightRequest({
  ...ownershipBase,
  requestConversationId: "conversation-b"
}), false, "A different conversation must never be restored.");
assert.equal(shouldRestoreAdminIngestEvidencePreflightRequest({
  ...ownershipBase,
  selectedProvider: "doubao-pro"
}), false, "A different provider must never be restored.");

type TestHistoryMessage = {
  id: string;
  role: string;
  content: string;
  status: string;
  failureMeta?: {
    errorCode: string;
    retryable: boolean;
    fallbackUsed: boolean;
  };
};

const failedCard: TestHistoryMessage = {
  id: "assistant-failed-same-request",
  role: "assistant",
  content: ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_MESSAGE,
  status: "failed",
  failureMeta: {
    errorCode: ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_CODE,
    retryable: false,
    fallbackUsed: false
  }
};
const withOneFailure = replaceIngestRetryOutcome(
  [{ id: "user-1", role: "user", content: "微信截图识别并回复客户", status: "completed" }] as TestHistoryMessage[],
  undefined,
  failedCard
);
const repeatedFailure = replaceIngestRetryOutcome(withOneFailure, failedCard.id, failedCard);
const refreshedHistory = JSON.parse(JSON.stringify(repeatedFailure)) as typeof repeatedFailure;

assert.equal(repeatedFailure.filter((message) => message.id === failedCard.id).length, 1);
assert.equal(refreshedHistory.filter((message) => message.id === failedCard.id).length, 1);
assert.equal(refreshedHistory.at(-1)?.content, ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED_MESSAGE);

const routeSource = readFileSync("app/api/admin/kb/ingest/gpt/route.ts", "utf8");
const clientSource = readFileSync("lib/enterprise/ingest-client.ts", "utf8");
const parserSource = readFileSync("lib/enterprise/ingest-file-parser.ts", "utf8");
const uiSource = readFileSync("components/enterprise-admin/IngestModeToggle.tsx", "utf8");
assertSourceOrder(
  routeSource,
  "hasAdminIngestWechatTailRoleEvidenceInsufficient(input.attachments)",
  "if (attachmentEvidence.blocking)",
  "The explicit evidence-insufficient state must bypass the generic missing-attachment response."
);
assert.match(
  routeSource,
  /currentTurnState: readString\(item\.currentTurnState\)[\s\S]*?"evidence_insufficient"/,
  "The request parser must preserve the explicit empty-body tail-role state."
);
const routeGuardStart = routeSource.indexOf(
  "wechatGroundingRequest.currentTurnState === \"evidence_insufficient\""
);
const routeGroundingStart = routeSource.indexOf("retrieveAdminIngestGrounding({", routeGuardStart);
const routeProviderStart = routeSource.indexOf("runAdminIngestWithSelectedModel({", routeGuardStart);
const routeGuardBlock = routeSource.slice(routeGuardStart, Math.min(routeGroundingStart, routeProviderStart));

assert.ok(routeGuardStart >= 0, "The route must contain the dedicated evidence-insufficient guard.");
assert.ok(routeGroundingStart > routeGuardStart, "The 422 guard must run before RAG retrieval.");
assert.ok(routeProviderStart > routeGuardStart, "The 422 guard must run before provider dispatch.");
assert.match(routeGuardBlock, /fallbackUsed: false/);
assert.match(routeGuardBlock, /retryable: false/);
assert.match(routeGuardBlock, /actualProvider: null/);
assert.match(routeGuardBlock, /}, 422\)/);
assert.doesNotMatch(routeGuardBlock, /runAdminIngestWithSelectedModel|retrieveAdminIngestGrounding/);

assert.match(clientSource, /ADMIN_INGEST_WECHAT_TAIL_ROLE_UNVERIFIED/);
assert.match(clientSource, /currentTurnState\?: "reply_required" \| "waiting_for_customer" \| "evidence_insufficient"/);
assert.match(parserSource, /parseStatus: "metadata_only" as const,[\s\S]*currentTurnState: input\.wechatOutputMode === "full_answer"/);
assert.match(clientSource, /currentTurnState: lastData\?\.currentTurnState \?\? file\.currentTurnState/);
assertSourceOrder(
  clientSource,
  "if (isGptFailureResponse(payload) && ingestResult.type !== \"success\")",
  "throw toAdminIngestRequestError(payload, responseStatus, requestId);",
  "The structured 422 must be converted into an AdminIngestRequestError."
);
assert.match(uiSource, /shouldRestoreAdminIngestEvidencePreflightRequest\(\{/);
assert.match(uiSource, /caughtTailRoleUnverified && ownsCaughtRequest/);
assertSourceOrder(
  uiSource,
  "if (hasAdminIngestWechatTailRoleEvidenceInsufficient(outgoingAttachments))",
  "if (attachmentEvidence.blocking)",
  "The dedicated persistent failure must be raised before the generic attachment early return."
);
assertSourceOrder(
  uiSource,
  "const failedMessages = commitRequestMessages((current) => replaceIngestRetryOutcome(",
  "void persistConversationMessagesAtomically({",
  "The single failed card must be committed before its history snapshot is persisted."
);
assert.match(uiSource, /messages: failedMessages/);

console.log("Admin ingest WeChat evidence-insufficient terminal tests passed.");
