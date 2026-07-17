import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildAdminIngestPublishedMemoryContext } from "../lib/enterprise/admin-ingest-published-memory-context";

const careerTail = "PUBLISHED_CAREER_MEMORY_TAIL";
const currentPublishedContent = `${"先判断客户阶段，再调用对应沟通步骤。".repeat(100)}${careerTail}`;

async function main() {
const helperSource = readFileSync("lib/enterprise/admin-ingest-published-memory-context.ts", "utf8");
assert.doesNotMatch(helperSource, /loadAgentLearningEvents|buildStrictAgentLearningState/);

const result = await buildAdminIngestPublishedMemoryContext({
  query: "客户犹豫时怎么继续沟通？",
  actorId: "admin-a",
  agentId: "expert-agent-expert-career",
  knowledgeBaseId: "kb:expert-agent-expert-career",
  namespace: "agent:expert-agent-expert-career:kb:kb-business-coach",
  tenantId: "tenant-a",
  maxChars: 6_000
}, {
  searchRuntimeMemories: async () => ({
    ok: true,
    memoryApplied: true,
    memories: [{
      memoryId: "pub-career-1",
      title: "沟通五步骤长期记忆",
      summary: "先判断阶段",
      content: "STALE_INDEX_CONTENT_MUST_NOT_REACH_PROMPT",
      contentPreview: "STALE_INDEX_PREVIEW_MUST_NOT_REACH_PROMPT",
      score: 0.96,
      reason: "scope-match",
      matchedTokens: ["客户", "沟通"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-career",
      expertId: "expert-career",
      namespace: "kb-business-coach",
      tenantId: "tenant-a"
    }, {
      memoryId: "pub-preference-1",
      title: "已发布回答偏好",
      summary: "已发布偏好",
      content: "STALE_PREFERENCE_INDEX_MUST_NOT_APPLY",
      contentPreview: "STALE_PREFERENCE_INDEX_MUST_NOT_APPLY",
      score: 0.95,
      reason: "scope-match",
      matchedTokens: ["沟通"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-career",
      expertId: "expert-career",
      namespace: "kb-business-coach",
      tenantId: "tenant-a"
    }, {
      memoryId: "pub-kks-1",
      title: "KKS 记忆",
      summary: "不应出现",
      content: "KKS_MEMORY_MUST_NOT_REACH_CAREER",
      contentPreview: "不应出现",
      score: 0.99,
      reason: "bad-mock-cross-scope",
      matchedTokens: ["沟通"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-kks-slim",
      kbId: "kb-kks-slim",
      agentId: "expert-kks",
      expertId: "expert-kks",
      namespace: "kb-kks-slim",
      tenantId: "tenant-a"
    }, {
      memoryId: "pub-career-wrong-namespace",
      title: "错误 namespace 记忆",
      summary: "不应出现",
      content: "WRONG_NAMESPACE_MEMORY_MUST_NOT_REACH_CAREER",
      contentPreview: "不应出现",
      score: 0.98,
      reason: "bad-mock-wrong-namespace",
      matchedTokens: ["沟通"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-career",
      expertId: "expert-career",
      namespace: "kb-kks-slim",
      tenantId: "tenant-a"
    }, {
      memoryId: "pub-deleted-1",
      title: "已从发布存储删除的旧索引",
      summary: "不应出现",
      content: "DELETED_MEMORY_INDEX_MUST_NOT_REACH_PROMPT",
      contentPreview: "DELETED_MEMORY_INDEX_MUST_NOT_REACH_PROMPT",
      score: 0.97,
      reason: "stale-index",
      matchedTokens: ["沟通"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-career",
      expertId: "expert-career",
      namespace: "kb-business-coach",
      tenantId: "tenant-a"
    }, {
      memoryId: "pub-archived-1",
      title: "已归档的旧索引",
      summary: "不应出现",
      content: "ARCHIVED_MEMORY_INDEX_MUST_NOT_REACH_PROMPT",
      contentPreview: "ARCHIVED_MEMORY_INDEX_MUST_NOT_REACH_PROMPT",
      score: 0.96,
      reason: "archived-index",
      matchedTokens: ["沟通"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-business-coach",
      kbId: "kb-business-coach",
      agentId: "expert-career",
      expertId: "expert-career",
      namespace: "kb-business-coach",
      tenantId: "tenant-a"
    }],
    memoryTrace: [],
    usedMemoryIds: [
      "pub-career-1",
      "pub-preference-1",
      "pub-kks-1",
      "pub-career-wrong-namespace",
      "pub-deleted-1",
      "pub-archived-1"
    ],
    warnings: []
  }),
  loadPublishedMemories: async () => [{
    id: "pub-career-1",
    title: "当前发布的沟通五步骤长期记忆",
    type: "SOP",
    content: currentPublishedContent,
    summary: "当前发布存储正文",
    status: "published",
    visibility: "shared",
    knowledgeBaseId: "kb-business-coach",
    kbId: "kb-business-coach",
    agentId: "expert-career",
    expertId: "expert-career",
    namespace: "kb-business-coach",
    tenantId: "tenant-a",
    sourceApp: "admin_ingest",
    publishedAt: Date.now(),
    updatedAt: Date.now()
  }, {
    id: "pub-preference-1",
    title: "已发布回答偏好",
    type: "agent_preference",
    content: "PUBLISHED_PREFERENCE_RULE_MUST_APPLY",
    summary: "已发布偏好",
    tags: ["回答偏好"],
    status: "published",
    visibility: "shared",
    knowledgeBaseId: "kb-business-coach",
    kbId: "kb-business-coach",
    agentId: "expert-career",
    expertId: "expert-career",
    namespace: "kb-business-coach",
    tenantId: "tenant-a",
    sourceApp: "admin_ingest",
    publishedAt: Date.now(),
    updatedAt: Date.now()
  }, {
    id: "pub-kks-1",
    title: "KKS 记忆",
    type: "SOP",
    content: "KKS_CURRENT_STORE_MUST_NOT_REACH_CAREER",
    status: "published",
    visibility: "shared",
    knowledgeBaseId: "kb-kks-slim",
    kbId: "kb-kks-slim",
    agentId: "expert-kks",
    expertId: "expert-kks",
    namespace: "kb-kks-slim",
    tenantId: "tenant-a",
    sourceApp: "admin_ingest",
    publishedAt: Date.now(),
    updatedAt: Date.now()
  }, {
    id: "pub-career-wrong-namespace",
    title: "错误 namespace 记忆",
    type: "SOP",
    content: "WRONG_NAMESPACE_CURRENT_STORE_MUST_NOT_REACH_CAREER",
    status: "published",
    visibility: "shared",
    knowledgeBaseId: "kb-business-coach",
    kbId: "kb-business-coach",
    agentId: "expert-career",
    expertId: "expert-career",
    namespace: "kb-kks-slim",
    tenantId: "tenant-a",
    sourceApp: "admin_ingest",
    publishedAt: Date.now(),
    updatedAt: Date.now()
  }, {
    id: "pub-archived-1",
    title: "当前已归档",
    type: "SOP",
    content: "ARCHIVED_STORE_CONTENT_MUST_NOT_REACH_PROMPT",
    status: "archived",
    visibility: "shared",
    knowledgeBaseId: "kb-business-coach",
    kbId: "kb-business-coach",
    agentId: "expert-career",
    expertId: "expert-career",
    namespace: "kb-business-coach",
    tenantId: "tenant-a",
    sourceApp: "admin_ingest",
    publishedAt: Date.now(),
    updatedAt: Date.now()
  }]
});

assert.deepEqual(result.usedMemoryIds, ["pub-career-1", "pub-preference-1"]);
assert.ok(result.memoryContextText.includes(careerTail));
assert.match(result.memoryContextText, /当前发布的沟通五步骤长期记忆/);
assert.doesNotMatch(result.memoryContextText, /STALE_INDEX_CONTENT_MUST_NOT_REACH_PROMPT/);
assert.doesNotMatch(result.memoryContextText, /STALE_INDEX_PREVIEW_MUST_NOT_REACH_PROMPT/);
assert.doesNotMatch(result.memoryContextText, /KKS_MEMORY_MUST_NOT_REACH_CAREER/);
assert.doesNotMatch(result.memoryContextText, /KKS_CURRENT_STORE_MUST_NOT_REACH_CAREER/);
assert.doesNotMatch(result.memoryContextText, /WRONG_NAMESPACE_MEMORY_MUST_NOT_REACH_CAREER/);
assert.doesNotMatch(result.memoryContextText, /WRONG_NAMESPACE_CURRENT_STORE_MUST_NOT_REACH_CAREER/);
assert.doesNotMatch(result.memoryContextText, /DELETED_MEMORY_INDEX_MUST_NOT_REACH_PROMPT/);
assert.doesNotMatch(result.memoryContextText, /ARCHIVED_MEMORY_INDEX_MUST_NOT_REACH_PROMPT/);
assert.doesNotMatch(result.memoryContextText, /ARCHIVED_STORE_CONTENT_MUST_NOT_REACH_PROMPT/);
assert.match(result.agentLearningInstruction, /PUBLISHED_PREFERENCE_RULE_MUST_APPLY/);
assert.doesNotMatch(result.agentLearningInstruction, /STALE_PREFERENCE_INDEX_MUST_NOT_APPLY/);
assert.doesNotMatch(result.agentLearningInstruction, /DRAFT_LEARNING_(?:TOPIC|STYLE|RISK|CORRECTION)_MUST_NOT_APPLY/);
assert.equal(result.retrievedMemories.length, 2);
assert.ok(result.warnings.includes("CROSS_SCOPE_PUBLISHED_MEMORY_SKIPPED"));
assert.ok(result.warnings.includes("STALE_OR_UNPUBLISHED_MEMORY_INDEX_SKIPPED"));

const noCurrentPublishedMemory = await buildAdminIngestPublishedMemoryContext({
  query: "客户犹豫怎么办？",
  actorId: "admin-a",
  agentId: "expert-career",
  knowledgeBaseId: "kb-business-coach",
  namespace: "kb-business-coach",
  tenantId: "tenant-a"
}, {
  searchRuntimeMemories: async () => ({
    ok: true,
    memoryApplied: false,
    memories: [],
    memoryTrace: [],
    usedMemoryIds: [],
    warnings: []
  }),
  loadPublishedMemories: async () => []
});

assert.equal(noCurrentPublishedMemory.memoryContextText, "");
assert.equal(noCurrentPublishedMemory.agentLearningInstruction, "");
assert.deepEqual(noCurrentPublishedMemory.appliedPolicies, []);
assert.deepEqual(noCurrentPublishedMemory.usedMemoryIds, []);

const storeUnavailable = await buildAdminIngestPublishedMemoryContext({
  query: "客户犹豫怎么办？",
  actorId: "admin-a",
  agentId: "expert-career",
  knowledgeBaseId: "kb-business-coach",
  namespace: "kb-business-coach",
  tenantId: "tenant-a"
}, {
  searchRuntimeMemories: async () => ({
    ok: true,
    memoryApplied: true,
    memories: [{
      memoryId: "pub-career-1",
      title: "旧索引",
      content: "STORE_FAILURE_MUST_FAIL_CLOSED",
      contentPreview: "STORE_FAILURE_MUST_FAIL_CLOSED",
      score: 1,
      reason: "stale-index",
      matchedTokens: ["客户"],
      sourceApp: "admin_ingest",
      knowledgeBaseId: "kb-business-coach",
      agentId: "expert-career",
      namespace: "kb-business-coach",
      tenantId: "tenant-a"
    }],
    memoryTrace: [],
    usedMemoryIds: ["pub-career-1"],
    warnings: []
  }),
  loadPublishedMemories: async () => {
    throw new Error("published store unavailable");
  }
});

assert.equal(storeUnavailable.memoryContextText, "");
assert.equal(storeUnavailable.agentLearningInstruction, "");
assert.deepEqual(storeUnavailable.appliedPolicies, []);
assert.deepEqual(storeUnavailable.usedMemoryIds, []);
assert.ok(storeUnavailable.warnings.includes("PUBLISHED_MEMORY_STORE_UNAVAILABLE"));
assert.ok(storeUnavailable.warnings.includes("STALE_OR_UNPUBLISHED_MEMORY_INDEX_SKIPPED"));

console.log("admin ingest published memory context tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
