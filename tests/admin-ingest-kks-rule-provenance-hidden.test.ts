import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { retrieveAdminIngestGrounding } from "../lib/enterprise/admin-ingest-grounding";
import {
  isKksFixedRuleScope,
  loadKksFixedRuleCandidates,
} from "../lib/enterprise/admin-ingest-kks-fixed-rules";

const KKS_SCOPE = {
  tenantId: "tenant-kks-test",
  agentId: "expert-kks",
  knowledgeBaseId: "kb-kks-slim",
  namespace: "kb-kks-slim",
};

async function main() {
  const rulePath = path.resolve(
    process.cwd(),
    "knowledge",
    "03_AI瘦身KKS专业师",
    "AGENTS.md",
  );
  const ruleContent = await readFile(rulePath, "utf8");

  assert.match(ruleContent, /内部依据不得外显/);
  assert.match(ruleContent, /固定知识片段/);
  assert.match(ruleContent, /长期记忆/);
  assert.match(ruleContent, /规则文件名/);
  assert.match(ruleContent, /内部 ID/);
  assert.match(ruleContent, /知识检索、记忆调用和规则加载过程/);
  assert.match(ruleContent, /原始 Markdown 正文必须继续原样透传、展示、保存和同步/);
  assert.match(ruleContent, /不得在规则层对模型返回正文做二次改写/);

  assert.equal(isKksFixedRuleScope(KKS_SCOPE), true);
  assert.equal(isKksFixedRuleScope({
    ...KKS_SCOPE,
    namespace: "kb-health-expert",
  }), false);

  const candidates = await loadKksFixedRuleCandidates(KKS_SCOPE);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.agentId, "expert-kks");
  assert.equal(candidates[0]?.knowledgeBaseId, "kb-kks-slim");
  assert.equal(candidates[0]?.namespace, "kb-kks-slim");
  assert.equal(candidates[0]?.tenantId, "tenant-kks-test");
  assert.match(candidates[0]?.content ?? "", /AI瘦身KKS专业师固定知识库总规则/);

  const unrelatedScopes = [{
    agentId: "expert-health",
    knowledgeBaseId: "kb-health-expert",
    namespace: "kb-health-expert",
  }, {
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach",
  }, {
    agentId: "expert-sansheng-china",
    knowledgeBaseId: "kb-sansheng-china",
    namespace: "kb-sansheng-china",
  }, {
    agentId: "expert-kks",
    knowledgeBaseId: "kb-kks-slim",
    namespace: "kb-health-expert",
  }];

  for (const scope of unrelatedScopes) {
    const unrelatedCandidates = await loadKksFixedRuleCandidates({
      tenantId: "tenant-kks-test",
      ...scope,
    });
    assert.deepEqual(
      unrelatedCandidates,
      [],
      `${scope.agentId} / ${scope.namespace} 不得加载 KKS 专属规则。`,
    );
  }

  const retrievedCandidate = {
    chunkId: "chunk-kks-1",
    knowledgeItemId: "item-kks-1",
    knowledgeBaseId: "kb-kks-slim",
    agentId: "expert-kks",
    tenantId: "tenant-kks-test",
    namespace: "kb-kks-slim",
    title: "瘦身知识",
    content: "根据用户提供的真实情况给出专业、稳妥的饮食和运动建议。",
    score: 0.98,
  };
  const grounding = await retrieveAdminIngestGrounding({
    ...KKS_SCOPE,
    actorUserId: "admin-kks-test",
    query: "请结合资料给我一份稳妥的体重管理建议",
    strictKnowledgeMode: true,
  }, {
    retrieveRelevantChunks: async () => [retrievedCandidate],
  });

  assert.equal(grounding.applied, true);
  assert.equal(grounding.failureReason, "none");
  assert.match(grounding.context, /AI瘦身KKS专业师固定知识库总规则/);
  assert.match(grounding.context, /内部依据不得外显/);
  assert.match(grounding.context, /根据用户提供的真实情况给出专业、稳妥的饮食和运动建议/);
  assert.equal(grounding.sources[0]?.chunkId, "fixed-kks-rules:agents:1");
  assert.equal(grounding.sources[1]?.chunkId, "chunk-kks-1");
  assert.match(
    grounding.warnings.join("\n"),
    /已加载 AI瘦身KKS专业师专属固定输出规则/,
  );

  const noHitGrounding = await retrieveAdminIngestGrounding({
    ...KKS_SCOPE,
    actorUserId: "admin-kks-test",
    query: "固定知识库没有命中的问题",
    strictKnowledgeMode: true,
  }, {
    retrieveRelevantChunks: async () => [],
  });

  assert.equal(noHitGrounding.applied, false);
  assert.equal(noHitGrounding.failureReason, "no_hit");
  assert.equal(noHitGrounding.context, "");

  const healthGrounding = await retrieveAdminIngestGrounding({
    tenantId: "tenant-kks-test",
    actorUserId: "admin-kks-test",
    agentId: "expert-health",
    knowledgeBaseId: "kb-health-expert",
    namespace: "kb-health-expert",
    query: "请介绍日常膳食搭配",
    strictKnowledgeMode: true,
  }, {
    retrieveRelevantChunks: async () => [{
      ...retrievedCandidate,
      chunkId: "chunk-health-1",
      knowledgeItemId: "item-health-1",
      agentId: "expert-health",
      knowledgeBaseId: "kb-health-expert",
      namespace: "kb-health-expert",
    }],
  });

  assert.equal(healthGrounding.applied, true);
  assert.doesNotMatch(healthGrounding.context, /AI瘦身KKS专业师固定知识库总规则/);
  assert.equal(
    healthGrounding.sources.some((source) => source.chunkId.startsWith("fixed-kks-rules:")),
    false,
  );

  console.log("admin ingest KKS rule provenance hidden tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
