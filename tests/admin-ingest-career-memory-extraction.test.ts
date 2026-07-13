import assert from "node:assert/strict";
import {
  canonicalizeCareerMemoryDraft,
  canonicalizeCareerMemoryExtractionInput,
  canonicalizeCareerMemoryExtractionResult,
  createCareerMemoryDraftDedupKey
} from "../lib/enterprise/ingest-memory-career-scope";
import { extractMemoriesFromConversation } from "../lib/enterprise/ingest-memory-extractor";
import type {
  IngestMemoryExtractionInput,
  IngestMemoryItem
} from "../lib/enterprise/ingest-memory-types";

const source: IngestMemoryExtractionInput = {
  conversationId: "conv-expert-agent-expert-career-test",
  agentId: "expert-agent-expert-career",
  knowledgeBaseId: "kb:expert-agent-expert-career",
  ownerAdminId: "admin-career-test",
  ownerUserId: "admin-career-test",
  messages: [
    { id: "user-1", role: "user", content: "请把讲事业的沟通五步整理成可执行话术。" },
    { id: "assistant-1", role: "assistant", content: "第一步先建立信任，第二步确认客户需求，再给出下一步行动。" }
  ]
};

const canonicalSource = canonicalizeCareerMemoryExtractionInput(source);
assert.equal(canonicalSource.agentId, "expert-career");
assert.equal(canonicalSource.knowledgeBaseId, "kb-business-coach");
assert.equal(canonicalSource.conversationId, source.conversationId);

const extraction = canonicalizeCareerMemoryExtractionResult(
  extractMemoriesFromConversation(source)
);
assert.ok(extraction.draftCandidates.length > 0);
for (const draft of extraction.draftCandidates) {
  assert.equal(draft.agentId, "expert-career");
  assert.equal(draft.knowledgeBaseId, "kb-business-coach");
  assert.equal(draft.meta?.sourceAgentId, "expert-agent-expert-career");
  assert.equal(draft.meta?.sourceKnowledgeBaseId, "kb:expert-agent-expert-career");
}

const legacyDraft: IngestMemoryItem = {
  id: "legacy-career-draft",
  type: "script",
  title: "沟通五步",
  content: "先建立信任，再确认客户需求。",
  sourceConversationId: source.conversationId,
  agentId: "expert-agent-expert-career",
  knowledgeBaseId: "kb:expert-agent-expert-career",
  confidence: 0.8,
  status: "draft",
  createdAt: 1
};
const canonicalDraft = canonicalizeCareerMemoryDraft(legacyDraft);
assert.equal(canonicalDraft.agentId, "expert-career");
assert.equal(canonicalDraft.knowledgeBaseId, "kb-business-coach");
assert.equal(canonicalDraft.meta?.sourceAgentId, "expert-agent-expert-career");
assert.equal(canonicalDraft.meta?.sourceKnowledgeBaseId, "kb:expert-agent-expert-career");

const repeatedDraft: IngestMemoryItem = {
  ...legacyDraft,
  id: "new-career-draft",
  agentId: "expert-career",
  knowledgeBaseId: "kb-business-coach",
  content: "  先建立信任，  再确认客户需求。  ",
  createdAt: 2
};
assert.equal(
  createCareerMemoryDraftDedupKey(legacyDraft),
  createCareerMemoryDraftDedupKey(repeatedDraft)
);
assert.equal(canonicalizeCareerMemoryDraft(legacyDraft).id, canonicalizeCareerMemoryDraft(repeatedDraft).id);
assert.notEqual(
  createCareerMemoryDraftDedupKey(legacyDraft),
  createCareerMemoryDraftDedupKey({ ...repeatedDraft, sourceConversationId: "another-conversation" })
);
assert.notEqual(
  createCareerMemoryDraftDedupKey({ ...legacyDraft, ownerAdminId: "admin-a" }),
  createCareerMemoryDraftDedupKey({ ...repeatedDraft, ownerAdminId: "admin-b" })
);

const kksSource: IngestMemoryExtractionInput = {
  ...source,
  agentId: "expert-agent-expert-slim-kks",
  knowledgeBaseId: "kb-kks-slim"
};
const healthSource: IngestMemoryExtractionInput = {
  ...source,
  agentId: "expert-health",
  knowledgeBaseId: "kb-health-expert"
};
assert.strictEqual(canonicalizeCareerMemoryExtractionInput(kksSource), kksSource);
assert.strictEqual(canonicalizeCareerMemoryExtractionInput(healthSource), healthSource);
const mixedCareerKksSource: IngestMemoryExtractionInput = {
  ...source,
  agentId: "expert-career",
  knowledgeBaseId: "kb-kks-slim"
};
const mixedKksCareerSource: IngestMemoryExtractionInput = {
  ...source,
  agentId: "expert-kks",
  knowledgeBaseId: "kb-business-coach"
};
const mixedCareerHealthSource: IngestMemoryExtractionInput = {
  ...source,
  agentId: "expert-career",
  knowledgeBaseId: "kb-health-expert"
};
const mixedHealthCareerSource: IngestMemoryExtractionInput = {
  ...source,
  agentId: "expert-health",
  knowledgeBaseId: "kb-business-coach"
};
assert.strictEqual(canonicalizeCareerMemoryExtractionInput(mixedCareerKksSource), mixedCareerKksSource);
assert.strictEqual(canonicalizeCareerMemoryExtractionInput(mixedKksCareerSource), mixedKksCareerSource);
assert.strictEqual(canonicalizeCareerMemoryExtractionInput(mixedCareerHealthSource), mixedCareerHealthSource);
assert.strictEqual(canonicalizeCareerMemoryExtractionInput(mixedHealthCareerSource), mixedHealthCareerSource);
assert.equal(createCareerMemoryDraftDedupKey({ ...legacyDraft, agentId: "expert-kks", knowledgeBaseId: "kb-kks-slim" }), null);
assert.equal(createCareerMemoryDraftDedupKey({ ...legacyDraft, agentId: "expert-health", knowledgeBaseId: "kb-health-expert" }), null);

console.log("admin ingest career memory extraction tests passed");
