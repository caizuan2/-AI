import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  isHealthPeerCommunicationQuery,
  loadHealthFiveStepRuleCandidates,
  resolveHealthFiveStepStage,
  resolveHealthKnowledgeCommand,
} from "../lib/enterprise/admin-ingest-health-five-step-knowledge";
import { retrieveAdminIngestGrounding } from "../lib/enterprise/admin-ingest-grounding";

const RULE_ROOT = path.resolve(process.cwd(), "knowledge", "01_同行沟通五步法");
const KNOWLEDGE_ROOT = path.resolve(process.cwd(), "knowledge");
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
  assert.equal(resolveHealthKnowledgeCommand("/分析同行聊天\n请看下面记录"), "分析同行聊天");
  assert.equal(resolveHealthKnowledgeCommand("/生成系统价值沟通方案\n请看下面记录"), "生成系统价值沟通方案");
  assert.equal(resolveHealthKnowledgeCommand("/复盘同行沟通记录"), "复盘同行沟通记录");
  assert.equal(resolveHealthKnowledgeCommand("请分析同行聊天"), null);

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
    assert.doesNotMatch(content, /STEP[1-5]/, `${fileName} 的可见规则正文不得保留英文阶段名称。`);
  }

  const rootRuleContent = await readFile(path.join(RULE_ROOT, "AGENTS.md"), "utf8");
  assert.match(rootRuleContent, /内部依据不得外显/);
  assert.match(rootRuleContent, /固定知识片段/);
  assert.match(rootRuleContent, /长期记忆/);
  assert.match(rootRuleContent, /不得披露内部文件名、片段号、记忆编号、知识库 ID 或检索机制/);
  assert.match(rootRuleContent, /不得因此删减、改写、概括或替换所选模型正常生成的原始 Markdown 正文/);

  const supportFiles = [
    "02_客户心理模型.md",
    "03_同行客户画像库.md",
    "04_客户阶段判断模型.md",
    "05_客户跟进策略模型.md",
    "06_素材调用与内容展示规则.md",
    "07_沟通复盘与优化规则.md",
    "08_commands高级指令库.md",
    "09_案例库与训练数据结构.md",
    "10_知识库安全与输出规范.md",
    "11_AI Agent调用优先级路由规则.md",
    "12_AI Agent记忆库结构规则.md",
  ];
  const commandFiles = [
    "分析同行聊天.md",
    "判断客户阶段.md",
    "生成下一句话.md",
    "生成电话沟通方案.md",
    "处理客户异议.md",
    "复盘失败沟通.md",
    "生成客户跟进计划.md",
  ];

  for (const relativePath of [
    ...supportFiles,
    ...commandFiles.map((fileName) => path.join("commands", fileName)),
  ]) {
    const content = await readFile(path.join(KNOWLEDGE_ROOT, relativePath), "utf8");
    assert.ok(content.length > 400, `${relativePath} 应保存完整、可执行的规则正文。`);
    assert.doesNotMatch(content, /contentReference\[oaicite/i);
    assert.doesNotMatch(content, /STEP[1-5]/, `${relativePath} 不得向模型注入英文阶段名称。`);
  }

  const commandExpectations = [{
    command: "分析同行聊天",
    expectedTitles: ["分析同行聊天", "同行客户画像库", "客户心理模型", "客户阶段判断模型"],
  }, {
    command: "判断客户阶段",
    expectedTitles: ["判断客户阶段", "客户阶段判断模型", "客户心理模型"],
  }, {
    command: "生成下一句话",
    expectedTitles: ["生成下一句话", "客户心理模型", "客户阶段判断模型"],
  }, {
    command: "生成电话沟通方案",
    expectedTitles: ["生成电话沟通方案", "同行客户画像库", "客户阶段判断模型"],
  }, {
    command: "处理客户异议",
    expectedTitles: ["处理客户异议", "客户心理模型", "客户阶段判断模型", "第四步"],
  }, {
    command: "复盘失败沟通",
    expectedTitles: ["复盘失败沟通", "沟通复盘与优化规则", "客户阶段判断模型"],
  }, {
    command: "生成客户跟进计划",
    expectedTitles: ["生成客户跟进计划", "客户跟进策略模型", "客户阶段判断模型"],
  }, {
    command: "分析健康同行客户",
    expectedTitles: ["分析健康同行客户", "同行客户画像库", "客户心理模型", "客户阶段判断模型"],
  }, {
    command: "生成破冰方案",
    expectedTitles: ["生成破冰方案", "同行客户画像库", "客户阶段判断模型", "第一步"],
  }, {
    command: "生成系统价值沟通方案",
    expectedTitles: ["生成系统价值沟通方案", "同行客户画像库", "客户阶段判断模型", "第三步"],
  }, {
    command: "锁定问题解决问题",
    expectedTitles: ["锁定问题解决问题", "客户心理模型", "客户阶段判断模型", "第四步"],
  }, {
    command: "生成合作推进方案",
    expectedTitles: ["生成合作推进方案", "记忆库结构规则", "第五步"],
  }, {
    command: "模拟健康同行沟通",
    expectedTitles: ["模拟健康同行沟通", "案例库与训练数据结构", "同行客户画像库"],
  }, {
    command: "复盘同行沟通记录",
    expectedTitles: ["复盘同行沟通记录", "沟通复盘与优化规则", "案例库与训练数据结构", "记忆库结构规则"],
  }];

  for (const expectation of commandExpectations) {
    const candidates = await loadHealthFiveStepRuleCandidates({
      ...HEALTH_SCOPE,
      query: `/${expectation.command}`,
    });
    const titles = candidates.map((candidate) => candidate.title).join("\n");
    const content = candidates.map((candidate) => candidate.content).join("\n");

    for (const expectedTitle of expectation.expectedTitles) {
      assert.match(titles, new RegExp(expectedTitle));
    }
    assert.match(titles, /知识库安全与输出规范/);
    assert.match(titles, /调用优先级路由规则/);
    assert.doesNotMatch(titles, /STEP[1-5]/);
    assert.doesNotMatch(content, /STEP[1-5]/);
  }

  const topicExpectations = [{
    query: "这个客户沉默几天了，后续怎么跟进？",
    title: "客户跟进策略模型",
  }, {
    query: "这个同行适合发送什么案例素材？",
    title: "素材调用与内容展示规则",
  }, {
    query: "帮我复盘为什么这次沟通没有推进",
    title: "沟通复盘与优化规则",
  }, {
    query: "请用相似案例模拟一次健康同行沟通训练",
    title: "案例库与训练数据结构",
  }, {
    query: "结合上次历史沟通，继续推进这个同行的下一步动作",
    title: "记忆库结构规则",
  }];

  for (const expectation of topicExpectations) {
    const candidates = await loadHealthFiveStepRuleCandidates({
      ...HEALTH_SCOPE,
      query: expectation.query,
    });
    assert.match(candidates.map((candidate) => candidate.title).join("\n"), new RegExp(expectation.title));
  }

  const step4Candidates = await loadHealthFiveStepRuleCandidates({
    ...HEALTH_SCOPE,
    query: "客户说太贵了，我要怎么锁定真正顾虑？",
  });
  const step4Context = step4Candidates.map((candidate) => candidate.content).join("\n");

  assert.ok(step4Candidates.length >= 2);
  assert.match(step4Context, /只属于 `expert-health \/ kb-health-expert/);
  assert.match(step4Context, /认同 \+ 一句话过渡 \+ 三板斧/);
  assert.match(step4Context, /第四步 锁定问题解决问题规则/);
  assert.match(step4Context, /AI大健康专家同行沟通安全与输出质量规则/);
  assert.match(step4Context, /AI大健康专家同行沟通知识路由系统/);
  assert.doesNotMatch(step4Context, /\bSTEP[1-5]\b/);
  assert.doesNotMatch(step4Context, /# 第一步 破冰卖自己规则/);
  assert.equal(step4Candidates.every((candidate) => !/\bSTEP[1-5]\b/.test(candidate.title)), true);
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
    assert.equal(candidates.every((candidate) => !/\bSTEP[1-5]\b/.test(candidate.title)), true);
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

  for (const scope of unrelatedScopes) {
    const candidates = await loadHealthFiveStepRuleCandidates({
      tenantId: "tenant-health-test",
      query: "/分析同行聊天",
      ...scope,
    });
    assert.deepEqual(candidates, [], `${scope.agentId} 不得调用大健康指令层。`);
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
  assert.match(grounding.context, /内部依据不得外显/);
  assert.match(grounding.context, /第一步 破冰卖自己规则/);
  assert.match(grounding.context, /知识库安全与输出规范/);
  assert.match(grounding.context, /调用优先级路由规则/);
  assert.doesNotMatch(grounding.context, /\bSTEP[1-5]\b/);
  assert.doesNotMatch(grounding.context, /第二步 找需求挖危机规则/);
  assert.equal(grounding.sources.every((source) => (
    source.chunkId.startsWith("fixed-health-five-step:")
  )), true);

  const commandGrounding = await retrieveAdminIngestGrounding({
    ...HEALTH_SCOPE,
    actorUserId: "admin-health-test",
    query: "/生成下一句话\n客户说：我先看看",
    strictKnowledgeMode: true,
    maxContextChars: 30_000,
  }, {
    retrieveRelevantChunks: async () => [],
  });

  assert.equal(commandGrounding.applied, true);
  assert.match(commandGrounding.context, /指令：生成下一句话/);
  assert.match(commandGrounding.context, /AI大健康专家客户心理模型/);
  assert.match(commandGrounding.context, /AI大健康专家客户阶段判断模型/);
  assert.doesNotMatch(commandGrounding.context, /\bSTEP[1-5]\b/);

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
