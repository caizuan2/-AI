import assert from "node:assert/strict";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canonicalizeCareerMemoryExtractionResult } from "../lib/enterprise/ingest-memory-career-scope";
import { extractMemoriesFromConversation } from "../lib/enterprise/ingest-memory-extractor";
import type { IngestMemoryExtractionInput } from "../lib/enterprise/ingest-memory-types";

async function main() {
  const memoryDir = path.join(tmpdir(), `xt-career-memory-test-${process.pid}-${Date.now()}`);
  const originalCwd = process.cwd();
  await mkdir(memoryDir, { recursive: true });
  process.env.ADMIN_INGEST_MEMORY_DIR = memoryDir;
  process.chdir(memoryDir);

  try {
    const [{ persistMemoryExtraction }, { listMemoryDrafts, loadAgentLearningEvents }] = await Promise.all([
      import("../lib/enterprise/ingest-memory-panel-service"),
      import("../lib/enterprise/ingest-memory-store")
    ]);
    const rawSource: IngestMemoryExtractionInput = {
      conversationId: "conv-career-persistence-test",
      agentId: "expert-agent-expert-career",
      knowledgeBaseId: "kb:expert-agent-expert-career",
      ownerAdminId: "admin-career-persistence-test",
      ownerUserId: "admin-career-persistence-test",
      messages: [
        { id: "user-1", role: "user", content: "请整理讲事业沟通五步的标准话术。" },
        { id: "assistant-1", role: "assistant", content: "先建立信任，再确认需求，然后给出下一步行动。" }
      ]
    };
    const source: IngestMemoryExtractionInput = {
      ...rawSource,
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach"
    };
    const extraction = canonicalizeCareerMemoryExtractionResult(
      extractMemoriesFromConversation(rawSource)
    );

    const [first, second] = await Promise.all([
      persistMemoryExtraction({ extraction, source }),
      persistMemoryExtraction({ extraction, source })
    ]);
    const drafts = await listMemoryDrafts({
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach",
      ownerAdminId: rawSource.ownerAdminId,
      ownerUserId: rawSource.ownerUserId
    });
    const learningEvents = await loadAgentLearningEvents({
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach",
      ownerAdminId: rawSource.ownerAdminId,
      ownerUserId: rawSource.ownerUserId
    });

    assert.ok(first.savedDrafts.length > 0);
    assert.equal(second.savedDrafts.length, 0);
    assert.equal(drafts.length, first.savedDrafts.length);
    assert.equal(new Set(drafts.map((draft) => draft.id)).size, drafts.length);
    assert.equal(learningEvents.length, 1);
    assert.ok(drafts.every((draft) => draft.agentId === "expert-career"));
    assert.ok(drafts.every((draft) => draft.knowledgeBaseId === "kb-business-coach"));

    console.log("admin ingest career memory persistence tests passed");
  } finally {
    process.chdir(originalCwd);
    await rm(memoryDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
