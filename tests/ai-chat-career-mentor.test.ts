import assert from "node:assert/strict";

import {
  CAREER_MENTOR_POLICY_VERSION,
  buildCareerMentorBusinessContext,
  buildCareerMentorRetrievalQuery,
  buildCareerMentorRetrievalQueries,
  classifyCareerMentorQuestion,
  cleanCareerMentorUserAnswer,
  extractCareerMentorCustomerAnswer,
  isCareerMentorScope,
  prioritizeCareerMentorChunks
} from "../lib/ai-chat/career-mentor";
import type { RetrievedRagChunk } from "../lib/rag/search";

function createChunk(input: {
  chunkId: string;
  knowledgeItemId: string;
  content: string;
  relevanceScore: number;
}) {
  return {
    chunkId: input.chunkId,
    knowledgeItemId: input.knowledgeItemId,
    content: input.content,
    title: "讲事业导师训练资料",
    summary: null,
    tags: [],
    relevance_score: input.relevanceScore,
    score: input.relevanceScore,
    chunk_rank: 1
  } as unknown as RetrievedRagChunk;
}

function main() {
  assert.equal(isCareerMentorScope({
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach"
  }), true);
  assert.equal(isCareerMentorScope({
    agentId: "expert-career",
    knowledgeBaseId: "kb:expert-agent-expert-career"
  }), true);

  // Double locking prevents this policy from entering KKS, health or mismatched scopes.
  assert.equal(isCareerMentorScope({
    agentId: "expert-kks",
    knowledgeBaseId: "kb-kks-slim"
  }), false);
  assert.equal(isCareerMentorScope({
    agentId: "expert-health",
    knowledgeBaseId: "kb-health-expert"
  }), false);
  assert.equal(isCareerMentorScope({
    agentId: "expert-career",
    knowledgeBaseId: "kb-kks-slim"
  }), false);

  const question = "我是新人，刚给一个宝妈客户发完破冰视频，接下来我该怎么做？给我个详细步骤。";
  const classification = classifyCareerMentorQuestion(question);

  assert.equal(classification.scene, "follow_up");
  assert.equal(classification.stage, "follow_up");
  assert.ok(classification.retrievalTerms.includes("破冰视频"));
  assert.ok(classification.retrievalTerms.includes("促单跟进"));

  const longSilenceClassification = classifyCareerMentorQuestion(
    "我有个客户，加了我快三个月了，一直不说话，各种方法都试过了，现在该怎么办？"
  );

  assert.equal(longSilenceClassification.scene, "objection");
  assert.equal(longSilenceClassification.stage, "objection_close");

  const retrievalQuery = buildCareerMentorRetrievalQuery(question);

  assert.match(retrievalQuery, /宝妈/);
  assert.match(retrievalQuery, /破冰视频/);
  assert.match(retrievalQuery, /促单跟进/);
  assert.match(retrievalQuery, /详细步骤/);

  const retrievalQueries = buildCareerMentorRetrievalQueries(question);

  assert.equal(retrievalQueries.length, 2);
  assert.equal(retrievalQueries[0], question);
  assert.match(retrievalQueries[1], /促单跟进/);

  const policy = buildCareerMentorBusinessContext(question);

  assert.match(policy, new RegExp(CAREER_MENTOR_POLICY_VERSION));
  assert.match(policy, /retrieved context 是本轮答案的唯一业务知识来源/);
  assert.match(policy, /## 判断/);
  assert.match(policy, /## 回复思路/);
  assert.match(policy, /## 可复制给客户/);
  assert.match(policy, /每段独立话术/);
  assert.doesNotMatch(policy, /业务问题 客户问题 成交 回复 处理建议/);
  assert.ok(policy.length <= 2350);

  const ranked = prioritizeCareerMentorChunks({
    question,
    topK: 2,
    chunks: [
      createChunk({
        chunkId: "generic-high-score",
        knowledgeItemId: "generic-item",
        content: "通用销售建议：先发名片，再等待二十四小时，然后询问客户是否看过。",
        relevanceScore: 0.99
      }),
      createChunk({
        chunkId: "career-question",
        knowledgeItemId: "career-lesson-1",
        content: `测试提问 1：${question}`,
        relevanceScore: 0.22
      }),
      createChunk({
        chunkId: "career-answer",
        knowledgeItemId: "career-lesson-1",
        content: "预期输出（操作指导模式）：第一步立即转身激发；第二步五分钟后发送对应素材。话术：姐，我刚忙完一个客户。",
        relevanceScore: 0.18
      })
    ]
  });

  assert.deepEqual(ranked.map((chunk) => chunk.chunkId), ["career-question", "career-answer"]);

  const cleaned = cleanCareerMentorUserAnswer([
    "好的，管理员。",
    "测试提问 1：客户一周不回复怎么办？",
    "预期输出（话术提供模式）：## 判断",
    "客户目前处于促单跟进阶段。",
    "问答端同步确认：知识主干已建立。"
  ].join("\n"));

  assert.doesNotMatch(cleaned, /管理员|测试提问|预期输出|问答端|知识主干/);
  assert.match(cleaned, /## 判断/);
  assert.match(cleaned, /促单跟进阶段/);

  const customerAnswer = extractCareerMentorCustomerAnswer([
    "## 判断",
    "客户正在观望。",
    "",
    "## 回复思路",
    "先共情，再推进。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    "> “姐，我刚忙完一个客户，你有空时看一下就好。”",
    "",
    "### 话术 2",
    "> “没关系，你先忙，方便时我再帮你梳理。”"
  ].join("\n"));

  assert.match(customerAnswer, /姐，我刚忙完一个客户/);
  assert.match(customerAnswer, /没关系，你先忙/);
  assert.doesNotMatch(customerAnswer, /判断|回复思路|话术 1|话术 2/);

  console.log("ai-chat career mentor tests passed");
}

main();
