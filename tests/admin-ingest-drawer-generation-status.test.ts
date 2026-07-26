import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  clearAdminIngestConversationRuntimeStatus,
  markAdminIngestConversationCompleted,
  markAdminIngestConversationGenerating,
  markAdminIngestConversationRead,
  removeAdminIngestConversationRuntimeStatus,
  type AdminIngestConversationRuntimeStatusMap
} from "../lib/enterprise/admin-ingest-conversation-runtime-status";

function testConversationRuntimeStatusIsolation() {
  let statuses: AdminIngestConversationRuntimeStatusMap = {};

  statuses = markAdminIngestConversationGenerating(statuses, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 1
  });
  statuses = markAdminIngestConversationGenerating(statuses, {
    conversationId: "conversation-b",
    requestId: "request-b",
    now: 2
  });

  assert.deepEqual(statuses["conversation-a"], {
    state: "generating",
    requestId: "request-a",
    updatedAt: 1
  });
  assert.deepEqual(statuses["conversation-b"], {
    state: "generating",
    requestId: "request-b",
    updatedAt: 2
  });

  statuses = markAdminIngestConversationCompleted(statuses, {
    conversationId: "conversation-a",
    requestId: "request-a",
    isVisible: false,
    now: 3
  });

  assert.equal(statuses["conversation-a"]?.state, "completed_unread");
  assert.equal(statuses["conversation-b"]?.state, "generating");

  statuses = clearAdminIngestConversationRuntimeStatus(statuses, {
    conversationId: "conversation-b",
    requestId: "request-b"
  });

  assert.equal(statuses["conversation-b"], undefined);
  assert.equal(statuses["conversation-a"]?.state, "completed_unread");
}

function testReadAndVisibleCompletionRules() {
  let statuses = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-a",
    now: 1
  });

  assert.equal(
    markAdminIngestConversationRead(statuses, "conversation-a"),
    statuses,
    "reading a generating conversation must preserve its generating status"
  );

  statuses = markAdminIngestConversationCompleted(statuses, {
    conversationId: "conversation-a",
    requestId: "request-a",
    isVisible: true,
    now: 2
  });
  assert.equal(statuses["conversation-a"], undefined);

  statuses = markAdminIngestConversationCompleted(
    markAdminIngestConversationGenerating(statuses, {
      conversationId: "conversation-a",
      requestId: "request-a-2",
      now: 3
    }),
    {
      conversationId: "conversation-a",
      requestId: "request-a-2",
      isVisible: false,
      now: 4
    }
  );
  statuses = markAdminIngestConversationRead(statuses, "conversation-a");
  assert.equal(statuses["conversation-a"], undefined);
}

function testStaleRequestCannotOverwriteNewStatus() {
  let statuses = markAdminIngestConversationGenerating({}, {
    conversationId: "conversation-a",
    requestId: "request-new",
    now: 2
  });
  const current = statuses;

  statuses = markAdminIngestConversationCompleted(statuses, {
    conversationId: "conversation-a",
    requestId: "request-old",
    isVisible: false,
    now: 3
  });
  assert.equal(statuses, current);
  assert.equal(statuses["conversation-a"]?.state, "generating");
  assert.equal(statuses["conversation-a"]?.requestId, "request-new");

  statuses = clearAdminIngestConversationRuntimeStatus(statuses, {
    conversationId: "conversation-a",
    requestId: "request-old"
  });
  assert.equal(statuses, current);

  statuses = removeAdminIngestConversationRuntimeStatus(
    statuses,
    "conversation-a"
  );
  assert.equal(statuses["conversation-a"], undefined);
}

async function testApkDrawerProductionWiring() {
  const [
    toggleSource,
    shellSource,
    listSource,
    itemSource
  ] = await Promise.all([
    readFile("components/enterprise-admin/IngestModeToggle.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestChatGPTShell.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestAgentConversationList.tsx", "utf8"),
    readFile("components/enterprise-admin/IngestAgentConversationItem.tsx", "utf8")
  ]);

  assert.match(toggleSource, /markAdminIngestConversationGenerating/);
  assert.match(toggleSource, /markAdminIngestConversationCompleted/);
  assert.match(toggleSource, /markAdminIngestConversationRead/);
  assert.match(
    toggleSource,
    /isVisible:\s*isRequestConversationVisible\(\)/
  );
  assert.match(
    toggleSource,
    /successRendered && !abortController\.signal\.aborted/
  );
  assert.match(
    shellSource,
    /conversationRuntimeStatusById=\{isAdminApk \? conversationRuntimeStatusById : \{\}\}/
  );
  assert.match(
    shellSource,
    /const isConversationListVisible = isExpanded \|\| hasGeneratingConversation/
  );
  assert.match(
    shellSource,
    /hasUnreadConversation && !isConversationListVisible/
  );
  assert.match(
    listSource,
    /highlightedConversations[\s\S]*conversationRuntimeStatusById\[conversation\.id\]/
  );
  assert.match(itemSource, />\s*生成中\s*</);
  assert.match(itemSource, /LoaderCircle[\s\S]*animate-spin/);
  assert.match(itemSource, /生成完成，尚未查看/);
  assert.match(itemSource, /bg-\[#3b8df5\]/);
  assert.doesNotMatch(itemSource, /红色|bg-red|text-red/);
}

async function main() {
  testConversationRuntimeStatusIsolation();
  testReadAndVisibleCompletionRules();
  testStaleRequestCannotOverwriteNewStatus();
  await testApkDrawerProductionWiring();
  console.log("Admin ingest APK drawer generation status tests passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
