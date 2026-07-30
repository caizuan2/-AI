import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("conversation endpoint returns only the requested account-scoped body", async () => {
  const source = await readFile(
    "app/api/admin/ingest-conversations/route.ts",
    "utf8"
  );

  assert.match(
    source,
    /new URL\(request\.url\)\.searchParams[\s\S]*get\("conversationId"\)/
  );
  assert.match(
    source,
    /state\.agentConversations\.find\([\s\S]*candidate\.id === conversationId/
  );
  assert.match(source, /INGEST_CONVERSATION_NOT_FOUND/);
  assert.match(
    source,
    /messages:\s*createAdminIngestFastConversationMessages\([\s\S]*state\.conversationMessagesById\[conversationId\]/
  );
  assert.match(
    source,
    /draft:\s*access\.accessTier === "full_ingest"/
  );
});

test("cached directory selection fetches a missing body without showing false empty history", async () => {
  const source = await readFile(
    "components/enterprise-admin/IngestModeToggle.tsx",
    "utf8"
  );

  assert.match(
    source,
    /conversation\.messageCount > 0[\s\S]*\?\s*\[\][\s\S]*createEmptyHistoryMessages/
  );
  assert.match(
    source,
    /INGEST_CONVERSATION_SYNC_ENDPOINT\}\?conversationId=\$\{encodeURIComponent\(conversation\.id\)\}/
  );
  assert.match(
    source,
    /payload\.conversationId !== conversation\.id/
  );
  assert.match(
    source,
    /activeConversationIdRef\.current === conversation\.id[\s\S]*setMessages\(resolveRestoredConversationMessages/
  );
  assert.match(
    source,
    /targetConversation\.messageCount > 0[\s\S]*void hydrateConversationBody\(targetConversation, targetAgent\)/
  );
  assert.match(
    source,
    /该对话正文同步失败，已保留本机上次成功正文/
  );
});
