import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  isHealthPeerCommunicationQuery,
  loadHealthFiveStepRuleCandidates,
  resolveHealthFiveStepStage,
} from "../lib/enterprise/admin-ingest-health-five-step-knowledge";
import { retrieveAdminIngestGrounding } from "../lib/enterprise/admin-ingest-grounding";

const RULE_ROOT = path.resolve(process.cwd(), "knowledge", "01_同行沟通五步法");
const HEALTH_SCOPE = {
  tenantId: "tenant-health-test",
  agentId: "expert-health",
  knowledgeBaseId: "kb-health-expert",
  namespace: "kb-health-expert",
};

async function main() {
  assert.equal(resolveHealthFiveStepStage("刚加上一位同行好友，第一句怎么破冰？"), "STEP1");
  assert.equal(resolveHealthFiveStepStage("怎么深挖团队复制和新人培训的痛点？"), "STEP2");
  assert.equal(resolveHealthFiveStepStage("客户问 AI 获客和培训系统有什么价值"), "STEP3");
  assert.equal(resolveHealthFiveStepStage("客户说太贵了，还要和家人商量"), "STEP4");
  assert.equal(resolveHealthFiveStepStage("客户问怎么加入，微信还是支付宝？"), "STEP5");
  assert.equal(resolveHealthFiveStepStage("请介绍日常膳食搭配"), null);
  assert.equal(isHealthPeerCommunicationQuery("请根据这张微信聊天截图回复客户"), true);
  assert.equal(isHealthPeerCommunicationQuery("请介绍日常膳食搭配"), false);

  const expectedFiles = [
    "AGENTS.md",
    "STEP1_破冰卖自己规则.md",
    "STEP2_找需求挖危机规则.md",
    "STEP3_讲系统价值规则.md",
    "STEP4_锁定问题解决问题规则.md",
    "STEP5_成交规则.md",
  ];

  for (const fileName of expectedFiles) {
    const content = await readFile(path.join(RULE_ROOT, fileName), "utf8");
    assert.ok(content.length > 1_000, `${fileName} 应保存完整、可执行的规则正文。`);
    assert.doesNotMatch(content, /contentReference\[oaicite/i);
  }

  const step4Candidates = await loadHealthFiveStepRuleCandidates({
    ...HEALTH_SCOPE,
    query: "客户说太贵了，我要怎么锁定真正顾虑？",
  });
  const step4Context = step4Candidates.map((candidate) => candidate.content).join("\n");

  assert.ok(step4Candidates.length >= 2);
  assert.match(step4Context, /只属于 `expert-health \/ kb-health-expert/);
  assert.match(step4Context, /认同 \+ 一句话过渡 \+ 三板斧/);
  assert.doesNotMatch(step4Context, /# STEP1 破冰卖自己规则/);
  assert.equal(step4Candidates.every((candidate) => (
    candidate.agentId === "expert-health"
    && candidate.knowledgeBaseId === "kb-health-expert"
    && candidate.namespace === "kb-health-expert"
    && candidate.tenantId === "tenant-health-test"
  )), true);

  const ordinaryHealthCandidates = await loadHealthFiveStepRuleCandidates({
    ...HEALTH_SCOPE,
    query: "请介绍日常膳食搭配",
  });
  assert.deepEqual(ordinaryHealthCandidates, []);

  const stageQueries = [
    "刚加上一位同行好友，第一句怎么破冰？",
    "怎么深挖团队复制和新人培训的痛点？",
    "客户问 AI 获客和培训系统有什么价值",
    "客户说太贵了，还要和家人商量",
    "客户问怎么加入，微信还是支付宝？",
  ];

  for (const query of stageQueries) {
    const candidates = await loadHealthFiveStepRuleCandidates({
      ...HEALTH_SCOPE,
      query,
    });
    const completeRuleText = candidates.map((candidate) => candidate.content).join("\n");
    assert.match(completeRuleText, /## 核心口诀/);
  }

  const unrelatedScopes = [{
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach",
  }, {
    agentId: "expert-kks",
    knowledgeBaseId: "kb-kks-slim",
    namespace: "kb-kks-slim",
  }, {
    agentId: "expert-sansheng-china",
    knowledgeBaseId: "kb-sansheng-china",
    namespace: "kb-sansheng-china",
  }, {
    agentId: "expert-health",
    knowledgeBaseId: "kb-health-expert",
    namespace: "kb-kks-slim",
  }];

  for (const scope of unrelatedScopes) {
    const candidates = await loadHealthFiveStepRuleCandidates({
      tenantId: "tenant-health-test",
      query: "客户说太贵了，要怎么成交？",
      ...scope,
    });
    assert.deepEqual(candidates, [], `${scope.agentId} 不得调用大健康五步法规则。`);
  }

  const grounding = await retrieveAdminIngestGrounding({
    ...HEALTH_SCOPE,
    actorUserId: "admin-health-test",
    query: "刚加上一位同行好友，怎么自然破冰？",
    strictKnowledgeMode: true,
  }, {
    retrieveRelevantChunks: async () => [],
  });

  assert.equal(grounding.applied, true);
  assert.equal(grounding.failureReason, "none");
  assert.match(grounding.context, /AI大健康专家：同行沟通五步法总规则/);
  assert.match(grounding.context, /STEP1 破冰卖自己规则/);
  assert.doesNotMatch(grounding.context, /STEP2 找需求挖危机规则/);
  assert.equal(grounding.sources.every((source) => (
    source.chunkId.startsWith("fixed-health-five-step:")
  )), true);

  const ordinaryHealthGrounding = await retrieveAdminIngestGrounding({
    ...HEALTH_SCOPE,
    actorUserId: "admin-health-test",
    query: "请介绍日常膳食搭配",
    strictKnowledgeMode: true,
  }, {
    retrieveRelevantChunks: async () => [],
  });

  assert.equal(ordinaryHealthGrounding.applied, false);
  assert.equal(ordinaryHealthGrounding.failureReason, "no_hit");
  assert.doesNotMatch(ordinaryHealthGrounding.context, /同行沟通五步法/);

  const careerGrounding = await retrieveAdminIngestGrounding({
    query: "刚加上一位同行好友，怎么自然破冰？",
    actorUserId: "admin-health-test",
    tenantId: "tenant-health-test",
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach",
    strictKnowledgeMode: true,
  }, {
    retrieveRelevantChunks: async () => [],
  });

  assert.equal(careerGrounding.applied, false);
  assert.equal(careerGrounding.failureReason, "no_hit");
  assert.doesNotMatch(careerGrounding.context, /同行沟通五步法/);

  console.log("admin ingest health five-step fixed knowledge tests passed");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
