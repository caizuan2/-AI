import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  MAX_CONCURRENT_INGEST_CONVERSATIONS,
  countActiveIngestConversationRequests,
  createEmptyConversationState,
  isCurrentIngestConversationRequest,
  markRequestActive,
  markRequestCompleted
} from "../lib/enterprise/ingest-conversation-state";
import {
  canStartRequest,
  cancelRequest,
  createIngestQueueState,
  startRequest
} from "../lib/enterprise/ingest-request-queue";

function testConversationRequestIsolation() {
  const conversationA = markRequestActive(
    createEmptyConversationState(),
    "request-a"
  );
  const conversationB = markRequestActive(
    createEmptyConversationState(),
    "request-b"
  );
  const activeStates = {
    "conversation-a": conversationA,
    "conversation-b": conversationB
  };

  assert.equal(MAX_CONCURRENT_INGEST_CONVERSATIONS, 2);
  assert.equal(countActiveIngestConversationRequests(activeStates), 2);
  assert.equal(
    isCurrentIngestConversationRequest(
      activeStates,
      "conversation-a",
      "request-a"
    ),
    true
  );
  assert.equal(
    isCurrentIngestConversationRequest(
      activeStates,
      "conversation-b",
      "request-b"
    ),
    true
  );
  assert.equal(
    isCurrentIngestConversationRequest(
      activeStates,
      "conversation-b",
      "request-a"
    ),
    false
  );

  const completedA = markRequestCompleted(
    conversationA,
    "request-a"
  );
  assert.equal(
    countActiveIngestConversationRequests({
      ...activeStates,
      "conversation-a": completedA
    }),
    1
  );
}

function testQueueCancellationIsConversationScoped() {
  let queue = createIngestQueueState();
  queue = startRequest(queue, "conversation-a", "request-a");

  assert.equal(canStartRequest(queue, "conversation-a"), false);
  assert.equal(canStartRequest(queue, "conversation-b"), true);

  queue = startRequest(queue, "conversation-b", "request-b");
  queue = cancelRequest(queue, "conversation-b", "request-b");

  assert.equal(canStartRequest(queue, "conversation-a"), false);
  assert.equal(canStartRequest(queue, "conversation-b"), true);
}

async function testProductionWiring() {
  const source = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );
  const cancelStart = source.indexOf("function handleCancelIngest()");
  const cancelEnd = source.indexOf(
    "async function handleSave()",
    cancelStart
  );
  const cancelSource = source.slice(cancelStart, cancelEnd);

  assert.match(source, /activeIngestRequestIdByConversationRef/);
  assert.match(source, /conversationLastInputByIdRef/);
  assert.doesNotMatch(source, /activeIngestRequestIdRef/);
  assert.match(source, /const commitRequestMessages =/);
  assert.match(
    source,
    /\[conversationId\]: nextMessages/
  );
  assert.match(
    source,
    /isCurrentIngestConversationRequest\(\s*conversationStateByIdRef\.current,\s*conversationId,\s*requestId\s*\)/
  );
  assert.match(
    source,
    /countActiveIngestConversationRequests\(\s*conversationStateByIdRef\.current\s*\)/
  );
  assert.match(
    source,
    /当前已有 \$\{MAX_CONCURRENT_INGEST_CONVERSATIONS\} 个对话在生成，请等待任一对话完成后再发送。/
  );
  assert.match(
    source,
    /MAX_CONCURRENT_INGEST_CONVERSATIONS[\s\S]*if \(!options\?\.preserveComposer\) \{\s*setInput\(visibleInput\);/
  );
  assert.match(
    source,
    /setRecords\(\(current\) => mergeTrainingRecords\(result\.records, current\)\)/
  );
  assert.match(
    source,
    /conversationLastInputByIdRef\.current\[conversationId\] = visibleInput/
  );
  assert.match(
    source,
    /isParsing:\s*activeConversationIsParsing/
  );
  assert.match(
    cancelSource,
    /abortControllerByConversationRef\.current\[conversationId\]/
  );
  assert.match(
    cancelSource,
    /cancelRequest\(\s*requestQueueRef\.current,\s*conversationId,\s*requestId\s*\)/
  );
  assert.doesNotMatch(cancelSource, /Object\.values/);
}

async function main() {
  testConversationRequestIsolation();
  testQueueCancellationIsConversationScoped();
  await testProductionWiring();
  console.log("Admin ingest cross-conversation generation tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
