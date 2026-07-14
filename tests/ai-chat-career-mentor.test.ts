import assert from "node:assert/strict";

import {
  CAREER_MENTOR_KNOWLEDGE_TREE,
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
  title?: string;
  sourceTitle?: string | null;
  category?: string | null;
  tags?: string[];
}) {
  return {
    chunkId: input.chunkId,
    knowledgeItemId: input.knowledgeItemId,
    content: input.content,
    title: input.title ?? "讲事业导师训练资料",
    sourceTitle: input.sourceTitle ?? null,
    summary: null,
    category: input.category ?? null,
    tags: input.tags ?? [],
    relevance_score: input.relevanceScore,
    score: input.relevanceScore,
    chunk_rank: 1
  } as unknown as RetrievedRagChunk;
}

function main() {
  assert.deepEqual(
    CAREER_MENTOR_KNOWLEDGE_TREE.map(({ step, stage }) => ({ step, stage })),
    [
      { step: 1, stage: "ice_breaking" },
      { step: 2, stage: "follow_up" },
      { step: 3, stage: "career_presentation" },
      { step: 4, stage: "objection_handling" },
      { step: 5, stage: "closing" }
    ]
  );
  assert.deepEqual(CAREER_MENTOR_KNOWLEDGE_TREE[0].flow, [
    "感受客户",
    "自我介绍",
    "精准共鸣",
    "三句话内简单介绍事业",
    "发送资料并结束主动聊天"
  ]);
  assert.match(CAREER_MENTOR_KNOWLEDGE_TREE[1].psychologicalGoal, /展示|催促/);
  assert.match(CAREER_MENTOR_KNOWLEDGE_TREE[2].flow.join(" -> "), /公司价值.*团队价值.*个人价值/);
  assert.match(CAREER_MENTOR_KNOWLEDGE_TREE[2].flow.join(" -> "), /行业与产品.*利润空间.*可持续赚钱/);
  assert.match(CAREER_MENTOR_KNOWLEDGE_TREE[2].flow.join(" -> "), /七条注意事项/);
  assert.match(CAREER_MENTOR_KNOWLEDGE_TREE[3].flow.join(" -> "), /认可客户感受.*一句话.*核心价值/);
  assert.match(CAREER_MENTOR_KNOWLEDGE_TREE[4].flow.join(" -> "), /行动时间.*降低行动阻力.*第四步/);

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
  assert.equal(isCareerMentorScope({
    agentId: "expert-health",
    knowledgeBaseId: "kb-business-coach"
  }), false);
  assert.equal(isCareerMentorScope({
    agentId: "expert-career"
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

  assert.equal(longSilenceClassification.scene, "follow_up");
  assert.equal(longSilenceClassification.stage, "follow_up");

  const decisionTreeCases = [
    ["沟通五步骤是什么？", "framework"],
    ["这是刚加上的陌生客户，还不知道我是谁，怎么开始？", "ice_breaking"],
    ["客户不回复怎么办？", "follow_up"],
    ["客户听完事业但没回复，接下来怎么办？", "follow_up"],
    ["客户已经看了资料但没有行动，接下来怎么办？", "follow_up"],
    ["客户主动想了解这个事业怎么做？", "career_presentation"],
    ["客户问怎么加入？", "career_presentation"],
    ["讲事业时怎么说明利润和收益空间？", "career_presentation"],
    ["客户说贵怎么办？", "objection_handling"],
    ["客户问靠谱吗？", "objection_handling"],
    ["客户说没有时间做，怎么回答？", "objection_handling"],
    ["客户说要考虑，还在和别家比较，怎么办？", "objection_handling"],
    ["客户已经认可但是迟迟不加入，怎么推进？", "closing"],
    ["客户认可了但还没付款，下一步怎么做？", "closing"],
    ["客户问如何付款？", "closing"],
    ["客户说可以但是迟迟没付款，怎么办？", "closing"],
    ["客户答应了但一直拖着，怎么办？", "closing"],
    ["客户成交以后，怎么长期维护关系？", "maintenance"],
    ["客户成交以后怎么维护老客户？", "maintenance"]
  ] as const;

  for (const [input, expectedStage] of decisionTreeCases) {
    assert.equal(
      classifyCareerMentorQuestion(input).stage,
      expectedStage,
      `unexpected stage for: ${input}`
    );
  }

  assert.equal(
    classifyCareerMentorQuestion(
      "客户一直不回复，我该怎么办？",
      "这个客户刚加上，还没破冰，也没有自我介绍和发送资料。"
    ).stage,
    "ice_breaking"
  );
  assert.equal(
    classifyCareerMentorQuestion(
      "客户一直不回复，我该怎么办？",
      "这个客户已经完成破冰，也发了视频资料。"
    ).stage,
    "follow_up"
  );
  assert.equal(
    classifyCareerMentorQuestion(
      "客户刚加上就问产品贵不贵，我该怎么回复？"
    ).stage,
    "ice_breaking"
  );
  assert.equal(
    classifyCareerMentorQuestion("客户说不了解我是谁，应该怎么处理？").stage,
    "ice_breaking"
  );
  assert.equal(
    classifyCareerMentorQuestion("沟通五步骤里客户说贵怎么办？").stage,
    "objection_handling"
  );
  assert.equal(
    classifyCareerMentorQuestion("还没成交，客户先问售后怎么办？").stage,
    "unknown"
  );
  assert.equal(
    classifyCareerMentorQuestion("客户问售后保障靠谱吗？").stage,
    "objection_handling"
  );

  const retrievalQuery = buildCareerMentorRetrievalQuery(question);

  assert.match(retrievalQuery, /宝妈/);
  assert.match(retrievalQuery, /破冰视频/);
  assert.match(retrievalQuery, /促单跟进/);
  assert.match(retrievalQuery, /详细步骤/);
  assert.match(retrievalQuery, /客户可复制话术卡片/);
  assert.match(retrievalQuery, /一线人员操作卡片/);
  assert.match(retrievalQuery, /话术全文/);

  const retrievalQueries = buildCareerMentorRetrievalQueries(question);

  assert.equal(retrievalQueries.length, 2);
  assert.equal(retrievalQueries[0], question);
  assert.match(retrievalQueries[1], /促单跟进/);

  const policy = buildCareerMentorBusinessContext(question);

  assert.match(policy, new RegExp(CAREER_MENTOR_POLICY_VERSION));
  assert.match(policy, /retrieved context 是唯一业务知识来源/);
  assert.match(policy, /五步顺序铁律：破冰 -> 促单跟进 -> 讲事业 -> 锁定问题 -> 成交/);
  assert.match(policy, /没有回复不等于拒绝/);
  assert.match(policy, /## 判断/);
  assert.match(policy, /当前阶段：.*调用步骤：.*判断依据：/);
  assert.match(policy, /## 回复思路/);
  assert.match(policy, /### 推荐执行流程/);
  assert.match(policy, /## 可复制给客户/);
  assert.match(policy, /知识库原话优先铁律/);
  assert.match(policy, /话术 1.*连续逐字复制/);
  assert.match(policy, /字词、标点、数字、顺序全部保持/);
  assert.match(policy, /不润色、不纠错、不缩写、不拼接、不补词/);
  assert.match(policy, /内部使用\/绝不发给客户.*严禁进入话术卡/);
  assert.match(policy, /话术 2.*话术 3.*为可选项.*只能排在话术 1 后/);
  assert.match(policy, /没有精确话术命中，不输出 AI 话术/);
  assert.match(policy, /每段使用引用块并保持独立/);
  assert.match(policy, /完整 DeepSeek\/GPT 风格 Markdown 正文/);
  assert.doesNotMatch(policy, /业务问题 客户问题 成交 回复 处理建议/);
  assert.ok(policy.length <= 2350);
  assert.match(policy.slice(-140), /绿色复制卡片/);
  assert.match(policy.slice(-140), /不得在用户端显示/);

  const objectionPolicy = buildCareerMentorBusinessContext("客户说贵、还说不靠谱，怎么办？");

  assert.match(objectionPolicy, /第四步：锁定问题/);
  assert.match(objectionPolicy, /认可 -> 一句话转移/);
  assert.match(objectionPolicy, /贵走价值模型/);
  assert.match(objectionPolicy, /靠谱吗走信任证明/);

  const closingPolicy = buildCareerMentorBusinessContext("客户已经认可但迟迟不加入，怎么办？");

  assert.match(closingPolicy, /第五步：成交/);
  assert.match(closingPolicy, /价值确认 -> 明确行动时间 -> 降低行动阻力/);
  assert.match(closingPolicy, /出现新疑问，回到第四步/);

  const presentationPolicy = buildCareerMentorBusinessContext("客户主动想了解这个事业怎么做？");

  assert.match(presentationPolicy, /第三步：讲事业/);
  assert.match(presentationPolicy, /公司价值、团队价值和个人价值/);
  assert.match(presentationPolicy, /行业与产品、利润空间、可持续赚钱三项标准/);
  assert.match(presentationPolicy, /说明如何成为经营者/);
  assert.match(presentationPolicy, /七条注意事项/);

  const maintenancePolicy = buildCareerMentorBusinessContext("客户成交以后，怎么长期维护关系？");

  assert.match(maintenancePolicy, /成交后：长期客户维护/);
  assert.match(maintenancePolicy, /没有完整维护 SOP/);
  assert.match(maintenancePolicy, /不能编造复购、售后话术/);

  const objectionRetrievalQuery = buildCareerMentorRetrievalQuery("客户说贵怎么办？");
  const closingRetrievalQuery = buildCareerMentorRetrievalQuery("客户认可但是不加入？");

  assert.match(objectionRetrievalQuery, /第四五步/);
  assert.match(objectionRetrievalQuery, /锁定问题/);
  assert.match(closingRetrievalQuery, /第四五步/);
  assert.match(closingRetrievalQuery, /扎口袋成交/);

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

  const knowledgeLayerRanked = prioritizeCareerMentorChunks({
    question: "客户说产品贵，怎么锁定问题？",
    topK: 2,
    chunks: [
      createChunk({
        chunkId: "generic-exact",
        knowledgeItemId: "generic-exact-item",
        content: "客户说产品贵，怎么锁定问题？可以先讲通用销售原则。",
        relevanceScore: 0.99
      }),
      createChunk({
        chunkId: "wrong-stage-copy-card",
        knowledgeItemId: "ice-breaking-copy-item",
        title: "01_破冰_客户可复制话术卡片_WPS排版版",
        content: "第一步破冰。话术全文：姐/哥，我先简单介绍一下自己。",
        relevanceScore: 0.95
      }),
      createChunk({
        chunkId: "matching-operator-card",
        knowledgeItemId: "objection-operator-item",
        title: "04_讲事业第四五步_一线人员操作卡片_WPS排版版",
        content: "第四五步锁定问题。一线人员操作卡片配合客户可复制话术卡片使用。客户说贵时，标准话术：先认可，再把问题带回价值。",
        relevanceScore: 0.18
      }),
      createChunk({
        chunkId: "matching-copy-card",
        knowledgeItemId: "objection-copy-item",
        title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
        content: "第四五步锁定问题与成交。完整话术：姐，我理解你觉得价格高——我们先把价值看清楚。",
        relevanceScore: 0.12
      })
    ]
  });

  assert.deepEqual(
    knowledgeLayerRanked.map((chunk) => chunk.chunkId),
    ["matching-copy-card", "matching-operator-card"]
  );

  const presentationLayerRanked = prioritizeCareerMentorChunks({
    question: "第三步讲事业时，怎么要求客户认真听？",
    topK: 2,
    chunks: [
      createChunk({
        chunkId: "wrong-objection-copy-card",
        knowledgeItemId: "wrong-objection-copy-item",
        title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
        content: "做完第三步（讲事业）之后，客户脑子里的信息最热。完整话术：姐，我们先把你担心的问题说清楚。",
        relevanceScore: 0.99
      }),
      createChunk({
        chunkId: "matching-presentation-operator-card",
        knowledgeItemId: "presentation-operator-item",
        title: "03_讲事业第三步_一线人员操作卡片_WPS排版版",
        content: "第三步讲事业。一线人员操作卡片配合客户可复制话术卡片使用。标准话术（一字不能省）：先要求客户认真听。",
        relevanceScore: 0.12
      }),
      createChunk({
        chunkId: "matching-presentation-copy-card",
        knowledgeItemId: "presentation-copy-item",
        title: "03_讲事业第三步_客户可复制话术卡片_WPS排版版",
        content: "第三步讲事业。话术（一字不差记下来）：姐，接下来请你认真听。",
        relevanceScore: 0.08
      })
    ]
  });

  assert.deepEqual(
    presentationLayerRanked.map((chunk) => chunk.chunkId),
    ["matching-presentation-copy-card", "matching-presentation-operator-card"]
  );

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

  const fullBody = cleanCareerMentorUserAnswer([
    "好的，管理员。",
    "预期输出（操作指导模式）：## 判断",
    "- 当前阶段：第四步锁定问题",
    "- 调用步骤：第四步",
    "- 判断依据：客户明确提出价格异议。",
    "",
    "## 回复思路",
    "先认可客户感受，再把问题带回命中资料里的价值解释。",
    "",
    "### 推荐执行流程",
    "1. 认可客户感受。",
    "2. 用一句话转移。",
    "3. 解释核心价值。",
    "",
    "```text",
    "这段完整正文和代码块都必须保留。",
    "```",
    "",
    "## 可复制给客户",
    "### 话术 1",
    "> “我理解你的顾虑，我们先把价值看清楚。”"
  ].join("\n"));

  assert.doesNotMatch(fullBody, /管理员|预期输出/);
  assert.match(fullBody, /当前阶段：第四步锁定问题/);
  assert.match(fullBody, /### 推荐执行流程/);
  assert.match(fullBody, /1\. 认可客户感受/);
  assert.match(fullBody, /```text[\s\S]*完整正文和代码块都必须保留[\s\S]*```/);
  assert.match(fullBody, /## 可复制给客户/);

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

  const exactKnowledgeScript = "姐，你先用十五分钟认真看一遍——看完我们再聊1980。";
  const exactExtractedScript = extractCareerMentorCustomerAnswer([
    "## 判断",
    "客户已完成破冰。",
    "",
    "## 回复思路",
    "先按当前阶段推进。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${exactKnowledgeScript}`
  ].join("\n"));

  assert.equal(exactExtractedScript, exactKnowledgeScript);

  console.log("ai-chat career mentor tests passed");
}

main();
