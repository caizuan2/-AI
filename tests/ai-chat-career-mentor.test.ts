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
    ["讲事业沟通五步骤是什么？", "framework"],
    ["讲事业导师的五步流程有哪些？", "framework"],
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
    ["客户成交以后怎么维护老客户？", "maintenance"],
    ["给客户发我视频资料了，怎么跟进呢", "follow_up"],
    ["我已经给她发完视频了，下一步呢", "follow_up"],
    ["还没发资料，怎么跟进", "ice_breaking"],
    ["还没有给客户发送视频资料，怎么跟进", "ice_breaking"],
    ["发完资料后客户说贵", "objection_handling"],
    ["成交后怎么继续跟进", "maintenance"]
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
    classifyCareerMentorQuestion("讲事业沟通五步骤是什么，客户认可但迟迟不行动在哪一步？").stage,
    "closing"
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
  assert.match(policy, /retrieved context 与本模型已固化的四份客户可复制话术卡是唯一业务知识来源/);
  assert.match(policy, /逐字固化的四份客户话术卡原文/);
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
  assert.match(policy, /### AI思考回复话术/);
  assert.match(policy, /#### AI建议话术 1.*#### AI建议话术 2/);
  assert.match(policy, /客户原话、当前阶段、已执行动作和命中知识生成 1—2 条短话术/);
  assert.match(policy, /不得编造公司、产品、收益或案例事实/);
  assert.match(policy, /最下面只保留固定知识库话术，不放 AI 改写或延伸/);
  assert.match(policy, /没有精确固定话术命中，先请用户补充/);
  assert.match(policy, /不得省略流程或动态话术/);
  assert.match(policy, /完整 DeepSeek\/GPT 风格 Markdown 正文/);
  assert.doesNotMatch(policy, /业务问题 客户问题 成交 回复 处理建议/);
  assert.ok(policy.length <= 2700);
  assert.match(policy.slice(-160), /最下方绿色复制卡片/);
  assert.match(policy.slice(-160), /不得混入 AI 改写/);

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

  const frameworkPolicy = buildCareerMentorBusinessContext("沟通五步骤是什么？");

  assert.match(frameworkPolicy, /按五步完整说明：破冰建立信任并发资料；促单跟进持续展示价值；讲事业完成通心与客户讲解；锁定问题用公式解决疑虑；成交把认可转为行动/);
  assert.match(frameworkPolicy, /不生成 AI 思考回复话术/);
  assert.match(frameworkPolicy, /不要输出‘### AI思考回复话术’/);
  assert.doesNotMatch(frameworkPolicy, /不得省略流程或动态话术/);

  const maintenancePolicy = buildCareerMentorBusinessContext("客户成交以后，怎么长期维护关系？");

  assert.match(maintenancePolicy, /成交后：长期客户维护/);
  assert.match(maintenancePolicy, /没有完整维护 SOP/);
  assert.match(maintenancePolicy, /不能编造复购、售后话术/);
  assert.match(maintenancePolicy, /不生成 AI 思考回复话术/);
  assert.doesNotMatch(maintenancePolicy, /不得省略流程或动态话术/);

  const unknownPolicy = buildCareerMentorBusinessContext("还没成交，客户先问售后怎么办？");

  assert.match(unknownPolicy, /请用户补充客户原话、阶段和已执行动作/);
  assert.match(unknownPolicy, /不生成 AI 思考回复话术/);
  assert.match(unknownPolicy, /严禁为长期维护或未知场景编造客户话术/);
  assert.doesNotMatch(unknownPolicy, /不得省略流程或动态话术/);

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
    topK: 14,
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
        chunkId: "untagged-copy-card",
        knowledgeItemId: "untagged-copy-item",
        title: "客户可复制话术卡片",
        content: "完整话术：这是一条无法证明属于当前步骤的话术。",
        relevanceScore: 0.94
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
    ["matching-copy-card", "matching-operator-card", "generic-exact"]
  );
  assert.equal(knowledgeLayerRanked.some((chunk) => chunk.chunkId === "wrong-stage-copy-card"), false);
  assert.equal(knowledgeLayerRanked.some((chunk) => chunk.chunkId === "untagged-copy-card"), false);

  const presentationLayerRanked = prioritizeCareerMentorChunks({
    question: "第三步讲事业时，怎么要求客户认真听？",
    topK: 14,
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
    "## 可复制给客户：",
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
    "## 可复制给客户：",
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
  const canonicalFollowUpScript = "姐，我刚忙完一个客户——群里这会又炸了。你看看这才多大一会——各行各业的精英排队咨询的、出单的、晋升的——从早到晚就没停过。你先好好看视频——看完你心里就有数了。";
  const canonicalConsiderScript = "姐——考虑是正常的，说明你在认真了解这个事情。那你目前主要担心的是什么呢？是担心产品不好呢？还是担心公司不放心呢？还是担心自己能不能做起来？";
  const canonicalPriceScript = "姐——你除了觉得产品有点贵之外，还有没有其他的顾虑？你一次性说出来——我一次性给你解答。";
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

  const groundedChunk = createChunk({
    chunkId: "follow-up-copy-grounding",
    knowledgeItemId: "follow-up-copy-grounding-item",
    title: "02_讲事业沟通五步·第二步_促单跟进_客户可复制话术卡片_WPS排版版",
    content: `第二步促单跟进。完整话术：${exactKnowledgeScript}`,
    relevanceScore: 0.91
  });
  const groundedFullBody = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "先按命中知识继续展示价值。",
    "",
    "```text",
    "完整 DeepSeek/GPT 正文与代码块必须保留。",
    "```",
    "",
    "### AI思考回复话术",
    "",
    "#### AI建议话术 1",
    "> 姐，资料你先按自己的节奏看，看完告诉我你最想先了解哪一部分，我按你的关注点跟你说。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`,
    "",
    "### 话术 2",
    "> 这是依据同阶段知识生成的可选变体。"
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.match(groundedFullBody, new RegExp(exactKnowledgeScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(groundedFullBody, /完整 DeepSeek\/GPT 正文与代码块必须保留/);
  assert.match(groundedFullBody, /### AI思考回复话术/);
  assert.match(groundedFullBody, /#### AI建议话术 1/);
  assert.match(groundedFullBody, /资料你先按自己的节奏看/);
  assert.doesNotMatch(groundedFullBody, /这是依据同阶段知识生成的可选变体/);
  assert.equal((groundedFullBody.match(/## 可复制给客户/g) ?? []).length, 1);
  assert.equal((groundedFullBody.match(/### 话术 1/g) ?? []).length, 1);
  assert.ok(groundedFullBody.indexOf("### AI思考回复话术") < groundedFullBody.indexOf("## 可复制给客户"));
  assert.equal(extractCareerMentorCustomerAnswer(groundedFullBody).startsWith(exactKnowledgeScript), true);
  assert.equal(
    cleanCareerMentorUserAnswer(groundedFullBody, {
      chunks: [groundedChunk],
      question: "客户已经看了资料但没有行动，接下来怎么办？"
    }),
    groundedFullBody
  );

  const formatDriftAiHeadingAnswer = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "### AI思考回复话术",
    "#### 话术 1",
    "> 姐，资料你先按自己的节奏看，看完告诉我你最想了解哪一部分。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.match(formatDriftAiHeadingAnswer, /### AI思考回复话术/);
  assert.match(formatDriftAiHeadingAnswer, /#### 话术 1/);
  assert.match(formatDriftAiHeadingAnswer, /资料你先按自己的节奏看/);
  assert.ok(
    formatDriftAiHeadingAnswer.indexOf("#### 话术 1")
      < formatDriftAiHeadingAnswer.indexOf("## 可复制给客户")
  );
  assert.equal(extractCareerMentorCustomerAnswer(formatDriftAiHeadingAnswer), exactKnowledgeScript);

  const negativeInstructionPreserved = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "以下是内部分析，不可复制给客户。",
    "这一段完整正文必须保留。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.match(negativeInstructionPreserved, /以下是内部分析，不可复制给客户。/);
  assert.match(negativeInstructionPreserved, /这一段完整正文必须保留。/);
  assert.equal(extractCareerMentorCustomerAnswer(negativeInstructionPreserved), exactKnowledgeScript);

  const appendedCanonicalCopy = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "正文原有判断、流程与代码块都不能被重写。",
    "",
    "```text",
    "保留完整 DeepSeek/GPT 正文。",
    "```"
  ].join("\n"), {
    chunks: [],
    question: "给客户发我视频资料了，怎么跟进呢"
  });

  assert.match(appendedCanonicalCopy, /正文原有判断、流程与代码块都不能被重写/);
  assert.match(appendedCanonicalCopy, /```text[\s\S]*保留完整 DeepSeek\/GPT 正文。[\s\S]*```/);
  assert.equal(extractCareerMentorCustomerAnswer(appendedCanonicalCopy), canonicalFollowUpScript);

  const inventedScript = `${exactKnowledgeScript}现在就决定吧。`;
  const rejectedInventedCopy = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "正文分析必须继续显示。",
    "",
    "```text",
    "正文代码块也必须继续显示。",
    "```",
    "",
    "## 可复制给客户：",
    "### 话术 1",
    `> “${inventedScript}”`,
    "",
    "### 话术 2",
    "> 这条 AI 话术也必须一起移除。"
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.doesNotMatch(rejectedInventedCopy, /现在就决定吧|这条 AI 话术也必须一起移除/);
  assert.doesNotMatch(rejectedInventedCopy, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.match(rejectedInventedCopy, /正文分析必须继续显示/);
  assert.match(rejectedInventedCopy, /```text[\s\S]*正文代码块也必须继续显示[\s\S]*```/);
  assert.equal(extractCareerMentorCustomerAnswer(rejectedInventedCopy), canonicalFollowUpScript);

  const decoratedCopyHeadings = [
    "## **可复制给客户**",
    "## 📋 可复制给客户",
    "## 可复制给客户话术",
    "## 可直接复制给客户的话术",
    "## 可复制给客户｜推荐话术",
    "## 可复制给客户 - 推荐"
  ];

  for (const copyHeading of decoratedCopyHeadings) {
    const guardedDecoratedHeading = cleanCareerMentorUserAnswer([
      "## 判断",
      "- 当前阶段：第二步促单跟进",
      "",
      "## 回复思路",
      "标题装饰不能绕过硬校验。",
      "",
      copyHeading,
      "### **话术 1**",
      `> “${inventedScript}”`
    ].join("\n"), {
      chunks: [],
      question: "客户已经看了资料但没有行动，接下来怎么办？"
    });

    assert.doesNotMatch(guardedDecoratedHeading, /本轮没有检索到可逐字核对的同阶段客户话术/);
    assert.doesNotMatch(guardedDecoratedHeading, /现在就决定吧/);
    assert.equal(extractCareerMentorCustomerAnswer(guardedDecoratedHeading), canonicalFollowUpScript);
  }

  const rejectedOrphanScript = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "即使缺少复制区标题，话术 1 也必须进入硬校验。",
    "",
    "### 话术 1",
    `> “${inventedScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.doesNotMatch(rejectedOrphanScript, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.doesNotMatch(rejectedOrphanScript, /现在就决定吧/);
  assert.match(rejectedOrphanScript, /即使缺少复制区标题/);
  assert.equal(extractCareerMentorCustomerAnswer(rejectedOrphanScript), canonicalFollowUpScript);

  const rejectedWrongStageCopy = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "继续执行当前阶段。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [createChunk({
      chunkId: "wrong-stage-grounding",
      knowledgeItemId: "wrong-stage-grounding-item",
      title: "01_破冰_客户可复制话术卡片_WPS排版版",
      content: `第一步破冰。完整话术：${exactKnowledgeScript}`,
      relevanceScore: 0.99
    })],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.doesNotMatch(rejectedWrongStageCopy, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.doesNotMatch(rejectedWrongStageCopy, new RegExp(exactKnowledgeScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(extractCareerMentorCustomerAnswer(rejectedWrongStageCopy), canonicalFollowUpScript);

  const rejectedUntaggedCopy = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "继续执行当前阶段。",
    "",
    "可复制给客户（以下话术）：",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [createChunk({
      chunkId: "untagged-grounding",
      knowledgeItemId: "untagged-grounding-item",
      title: "客户可复制话术卡片",
      content: `完整话术：${exactKnowledgeScript}`,
      relevanceScore: 0.99
    })],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.doesNotMatch(rejectedUntaggedCopy, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.doesNotMatch(rejectedUntaggedCopy, new RegExp(exactKnowledgeScript.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(extractCareerMentorCustomerAnswer(rejectedUntaggedCopy), canonicalFollowUpScript);

  const rejectedDuplicateCopySections = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "重复复制区不能绕过硬校验。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${inventedScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.doesNotMatch(rejectedDuplicateCopySections, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.doesNotMatch(rejectedDuplicateCopySections, /现在就决定吧/);
  assert.equal(extractCareerMentorCustomerAnswer(rejectedDuplicateCopySections), canonicalFollowUpScript);

  const fencedMarkdownPreserved = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "下面代码块只是 Markdown 格式示例，必须原样保留。",
    "",
    "```markdown",
    "## 可复制给客户",
    "### 话术 1",
    "> 代码块中的展示示例。",
    "```",
    "",
    "## 可复制给客户：",
    "### 话术 1",
    `> “${inventedScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.match(fencedMarkdownPreserved, /```markdown[\s\S]*## 可复制给客户[\s\S]*代码块中的展示示例。[\s\S]*```/);
  assert.doesNotMatch(fencedMarkdownPreserved, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.doesNotMatch(fencedMarkdownPreserved, /现在就决定吧/);
  assert.equal(extractCareerMentorCustomerAnswer(fencedMarkdownPreserved), canonicalFollowUpScript);

  const objectionCanonicalCopy = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第四步锁定问题",
    "",
    "## 回复思路",
    "先锁定客户真正担心的问题。"
  ].join("\n"), {
    chunks: [],
    question: "客户说考虑考虑，怎么办"
  });

  assert.equal(extractCareerMentorCustomerAnswer(objectionCanonicalCopy), canonicalConsiderScript);

  const currentObjectionTakesPriority = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：第四步锁定问题",
    "",
    "## 回复思路",
    "只处理客户本轮提出的一个问题。"
  ].join("\n"), {
    chunks: [],
    question: "客户现在说没时间做，怎么办",
    supportingContext: "她上一轮还提到产品价格有点贵。"
  });

  assert.match(extractCareerMentorCustomerAnswer(currentObjectionTakesPriority), /^姐你说得太对了——哪个人每天不忙/);

  const currentConsiderationWins = cleanCareerMentorUserAnswer("## 判断\n保留正文。", {
    chunks: [],
    question: "客户现在说考虑考虑，怎么办",
    supportingContext: "她上一轮提到产品价格有点贵。"
  });

  assert.equal(extractCareerMentorCustomerAnswer(currentConsiderationWins), canonicalConsiderScript);

  const negatedPriceUsesTimeCopy = cleanCareerMentorUserAnswer("## 判断\n保留正文。", {
    chunks: [],
    question: "产品不贵，就是没时间做，怎么办"
  });
  const negatedTimeUsesPriceCopy = cleanCareerMentorUserAnswer("## 判断\n保留正文。", {
    chunks: [],
    question: "不是没时间，是觉得产品有点贵"
  });
  const currentTrustQuestionWins = cleanCareerMentorUserAnswer("## 判断\n保留正文。", {
    chunks: [],
    question: "客户现在说这个不靠谱，怎么办",
    supportingContext: "她上一轮还提到产品价格有点贵。"
  });
  const explicitNoTimeCopy = cleanCareerMentorUserAnswer("## 判断\n保留正文。", {
    chunks: [],
    question: "客户说没有时间做，怎么办"
  });
  const explicitDistrustCopy = cleanCareerMentorUserAnswer("## 判断\n保留正文。", {
    chunks: [],
    question: "客户不相信我，怎么办"
  });

  assert.match(extractCareerMentorCustomerAnswer(negatedPriceUsesTimeCopy), /^姐你说得太对了——哪个人每天不忙/);
  assert.equal(extractCareerMentorCustomerAnswer(negatedTimeUsesPriceCopy), canonicalPriceScript);
  assert.equal(extractCareerMentorCustomerAnswer(currentTrustQuestionWins), "姐——你是不是不相信我？来——我给你看看。");
  assert.match(extractCareerMentorCustomerAnswer(explicitNoTimeCopy), /^姐你说得太对了——哪个人每天不忙/);
  assert.equal(extractCareerMentorCustomerAnswer(explicitDistrustCopy), "姐——你是不是不相信我？来——我给你看看。");
  assert.doesNotMatch(
    [negatedPriceUsesTimeCopy, negatedTimeUsesPriceCopy, currentTrustQuestionWins].join("\n"),
    /走标准三板斧流程|共享屏幕|打开群/
  );

  const maintenanceFallback = cleanCareerMentorUserAnswer([
    "## 判断",
    "- 当前阶段：成交后长期客户维护",
    "",
    "## 回复思路",
    "四份资料没有完整维护 SOP，不能编造。"
  ].join("\n"), {
    chunks: [],
    question: "客户成交以后怎么维护老客户？"
  });

  assert.match(maintenanceFallback, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.equal(extractCareerMentorCustomerAnswer(maintenanceFallback), "");

  console.log("ai-chat career mentor tests passed");
}

main();
