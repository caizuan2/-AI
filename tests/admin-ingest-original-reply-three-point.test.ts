import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  mergeAdminIngestConversationSyncMessages,
  readAdminIngestConversationSyncSnapshot
} from "@/lib/enterprise/admin-ingest-conversation-sync-store";
import {
  createEmptyConversationState,
  markRequestActive
} from "@/lib/enterprise/ingest-conversation-state";
import {
  appendAssistantPlaceholder,
  completeAssistantMessage,
  updateAssistantMessage
} from "@/lib/enterprise/ingest-message-reducer";
import type { IngestChatMessage } from "@/lib/enterprise/mock-chat";

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function main() {
  const previousDir = process.env.ADMIN_INGEST_CONVERSATION_DIR;
  const testDir = await mkdtemp(join(tmpdir(), "admin-ingest-original-reply-three-point-"));
  const requestId = "deepseek-three-point-original-reply";
  const conversationId = "conversation-three-point-original-reply";
  const providerFinal = "\n# 深度思考原文正文\n\n保留  Markdown、换行、空格与表情 😊。  \n";

  process.env.ADMIN_INGEST_CONVERSATION_DIR = testDir;

  try {
    let uiState = markRequestActive(createEmptyConversationState({
      conversationId,
      agentId: "expert-health",
      knowledgeBaseId: "kb-health-expert"
    }), requestId);
    uiState = appendAssistantPlaceholder(uiState, {
      id: "assistant-three-point-original-reply",
      requestId,
      createdAt: 1_786_000_100_000
    });
    uiState = updateAssistantMessage(uiState, {
      requestId,
      content: providerFinal.slice(0, 24)
    });
    uiState = updateAssistantMessage(uiState, {
      requestId,
      content: providerFinal
    });
    uiState = completeAssistantMessage(uiState, {
      requestId,
      content: providerFinal
    });

    const uiTerminal = uiState.messages.find((message) => message.requestId === requestId)?.content ?? "";
    const historyMessage: IngestChatMessage = {
      id: "assistant-three-point-original-reply",
      role: "assistant",
      content: uiTerminal,
      time: new Date(1_786_000_100_000).toISOString(),
      status: "completed",
      source: "admin_ingest",
      platform: "web",
      syncTarget: ["web", "apk", "exe"]
    };

    await mergeAdminIngestConversationSyncMessages("three-point-owner", {
      conversationId,
      messages: [historyMessage]
    });
    const persisted = await readAdminIngestConversationSyncSnapshot("three-point-owner");
    const historyReadback = persisted.state.conversationMessagesById[conversationId]?.[0]?.content ?? "";

    assert.equal(uiState.isGenerating, false);
    assert.equal(uiTerminal, providerFinal);
    assert.equal(historyReadback, providerFinal);
    assert.equal(sha256(providerFinal), sha256(uiTerminal));
    assert.equal(sha256(providerFinal), sha256(historyReadback));
    assert.equal(
      sha256(providerFinal),
      sha256(historyReadback),
      "Provider final, UI terminal, and persisted history readback must be byte-identical UTF-8 text."
    );
  } finally {
    if (previousDir === undefined) {
      delete process.env.ADMIN_INGEST_CONVERSATION_DIR;
    } else {
      process.env.ADMIN_INGEST_CONVERSATION_DIR = previousDir;
    }
    await rm(testDir, { recursive: true, force: true });
  }

  console.log("admin ingest original reply three-point SHA tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
