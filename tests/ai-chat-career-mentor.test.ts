import assert from "node:assert/strict";

import {
  CAREER_MENTOR_KNOWLEDGE_TREE,
  CAREER_MENTOR_POLICY_VERSION,
  buildCareerMentorBusinessContext,
  buildCareerMentorNoEvidenceAnswer,
  buildCareerMentorRetrievalQuery,
  buildCareerMentorRetrievalQueries,
  classifyCareerMentorQuestion,
  cleanCareerMentorUserAnswer,
  extractCareerMentorExplicitCustomerScriptBlocks,
  extractCareerMentorCustomerAnswer,
  isCareerMentorContinuationRequest,
  isCareerMentorScope,
  prioritizeCareerMentorChunks,
  resolveCareerMentorTurnContext
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

  assert.deepEqual(extractCareerMentorExplicitCustomerScriptBlocks([
    "话术全文",
    "",
    "第一句。",
    "",
    "第二句。",
    "",
    "讲这个的时候要注意",
    "这是内部说明。",
    "",
    "固定话术1（稳妥版）：",
    "",
    "第三句。",
    "",
    "第四句。",
    "",
    "二、下一节"
  ].join("\n")), [
    "第一句。\n\n第二句。",
    "第三句。\n\n第四句。"
  ]);
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("第二步促单跟进。完整话术：客户逐字原话。"),
    ["客户逐字原话。"]
  );
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("文案：客户逐字原话。 核心——这是内部解释。"),
    ["客户逐字原话。"]
  );
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("话术（一对一版）\n\n重要客户——这里是内部使用说明。"),
    []
  );
  assert.deepEqual(extractCareerMentorExplicitCustomerScriptBlocks([
    "话术全文",
    "",
    "第一句。",
    "",
    "话术全文",
    "",
    "第二句。"
  ].join("\n")), ["第一句。", "第二句。"]);
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("文案：客户逐字原话。 （配图：内部截图）"),
    ["客户逐字原话。"]
  );
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("话术：先问候客户。 （先聊几句——然后等他回复） 再自然收尾。"),
    ["先问候客户。 再自然收尾。"]
  );
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("话术：姐，最近怎么样？ （关心的语气——不是促单的语气——让他放松）"),
    ["姐，最近怎么样？"]
  );
  assert.deepEqual(
    extractCareerMentorExplicitCustomerScriptBlocks("你怎么接\n\n\"回头再联系你\""),
    []
  );

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
    ["客户说晚点再看资料，我怎么跟进？", "follow_up"],
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

  assert.equal(isCareerMentorContinuationRequest("再换一个方案"), true);
  assert.equal(isCareerMentorContinuationRequest("再换一组"), true);
  assert.equal(isCareerMentorContinuationRequest("换一组"), true);
  assert.equal(isCareerMentorContinuationRequest("请再换一组吧"), true);
  assert.equal(isCareerMentorContinuationRequest("换一种更自然的说法"), true);
  assert.equal(isCareerMentorContinuationRequest("换一种更强势的说法"), true);
  assert.equal(isCareerMentorContinuationRequest("这个回答不满意，重新给一个方案"), true);
  assert.equal(isCareerMentorContinuationRequest("再给我一个方案"), true);
  assert.equal(isCareerMentorContinuationRequest("重新给我一个方案"), true);
  assert.equal(isCareerMentorContinuationRequest("另外给我一个方案"), true);
  assert.equal(isCareerMentorContinuationRequest("客户现在说贵，怎么办？"), false);
  assert.equal(isCareerMentorContinuationRequest("客户说再换一个产品"), false);
  assert.equal(isCareerMentorContinuationRequest("再换一组，客户现在说贵"), false);
  assert.equal(isCareerMentorContinuationRequest("客户说换一组产品"), false);
  assert.equal(isCareerMentorContinuationRequest("换组"), false);
  assert.equal(isCareerMentorContinuationRequest("换一个阶段"), false);
  assert.equal(isCareerMentorContinuationRequest("再换一个方案，客户现在说贵"), false);

  const resolvedIceBreakingFollowUp = resolveCareerMentorTurnContext({
    question: "再换一组",
    recentConversation: [
      {
        role: "user",
        content: "客户是宝妈，应该怎么破冰，给我一些建议"
      },
      {
        role: "assistant",
        content: "上一版长正文里提到了第三步讲事业，但这不代表客户阶段已经变化。"
      }
    ]
  });

  assert.equal(resolvedIceBreakingFollowUp.continuationRequested, true);
  assert.equal(resolvedIceBreakingFollowUp.conversationContextApplied, true);
  assert.equal(resolvedIceBreakingFollowUp.currentStage, "unknown");
  assert.equal(resolvedIceBreakingFollowUp.resolvedStage, "ice_breaking");
  assert.equal(resolvedIceBreakingFollowUp.anchorQuestion, "客户是宝妈，应该怎么破冰，给我一些建议");
  assert.equal(resolvedIceBreakingFollowUp.scenarioQuestion, "客户是宝妈，应该怎么破冰，给我一些建议");
  assert.equal(resolvedIceBreakingFollowUp.supportingContext, "");

  const repeatedFollowUp = resolveCareerMentorTurnContext({
    question: "再来一个",
    recentConversation: [
      { role: "user", content: "客户是宝妈，应该怎么破冰，给我一些建议" },
      { role: "assistant", content: "第一版回答。" },
      { role: "user", content: "再换一个方案" },
      { role: "assistant", content: "第二版回答。" }
    ]
  });

  assert.equal(repeatedFollowUp.conversationContextApplied, true);
  assert.equal(repeatedFollowUp.anchorQuestion, "客户是宝妈，应该怎么破冰，给我一些建议");
  assert.equal(repeatedFollowUp.resolvedStage, "ice_breaking");

  const explicitCurrentObjection = resolveCareerMentorTurnContext({
    question: "客户现在说贵，换个回答",
    recentConversation: [
      { role: "user", content: "客户是宝妈，应该怎么破冰，给我一些建议" },
      { role: "assistant", content: "上一版破冰回答。" }
    ]
  });

  assert.equal(explicitCurrentObjection.currentStage, "objection_handling");
  assert.equal(explicitCurrentObjection.resolvedStage, "objection_handling");
  assert.equal(explicitCurrentObjection.conversationContextApplied, false);

  const noHistoryFollowUp = resolveCareerMentorTurnContext({
    question: "再换一个方案",
    recentConversation: []
  });

  assert.equal(noHistoryFollowUp.conversationContextApplied, false);
  assert.equal(noHistoryFollowUp.resolvedStage, "unknown");

  const newerUnknownTopicStopsOldInheritance = resolveCareerMentorTurnContext({
    question: "再换一个方案",
    recentConversation: [
      { role: "user", content: "客户是宝妈，应该怎么破冰，给我一些建议" },
      { role: "assistant", content: "上一版破冰回答。" },
      { role: "user", content: "帮我写一条朋友圈文案" },
      { role: "assistant", content: "朋友圈文案回答。" }
    ]
  });

  assert.equal(newerUnknownTopicStopsOldInheritance.conversationContextApplied, false);
  assert.equal(newerUnknownTopicStopsOldInheritance.resolvedStage, "unknown");

  const newAttachmentPreventsOldConversationInheritance = resolveCareerMentorTurnContext({
    question: "再换一个方案",
    supportingContext: "新上传截图中的客户原话：我觉得价格有点贵。",
    recentConversation: [
      { role: "user", content: "客户是宝妈，应该怎么破冰，给我一些建议" },
      { role: "assistant", content: "上一版破冰回答。" }
    ]
  });

  assert.equal(newAttachmentPreventsOldConversationInheritance.conversationContextApplied, false);
  assert.equal(newAttachmentPreventsOldConversationInheritance.resolvedStage, "objection_handling");
  assert.equal(newAttachmentPreventsOldConversationInheritance.scenarioQuestion, "再换一个方案");

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

  const inheritedRetrievalQueries = buildCareerMentorRetrievalQueries(
    resolvedIceBreakingFollowUp.scenarioQuestion,
    resolvedIceBreakingFollowUp.supportingContext
  );

  assert.match(inheritedRetrievalQueries[0], /宝妈.*破冰/);
  assert.doesNotMatch(inheritedRetrievalQueries[0], /再换一个方案/);
  assert.match(inheritedRetrievalQueries[1], /第一步.*破冰.*精准共鸣/);
  assert.doesNotMatch(inheritedRetrievalQueries[1], /第三步.*讲事业/);

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
  assert.match(policy, /固定生成 3 条可选择的短话术/);
  assert.match(policy, /AI建议话术 1（稳妥自然型）.*AI建议话术 2（共情引导型）.*AI建议话术 3（轻问推进型）/);
  assert.match(policy, /不得省略流程、减少数量或合并话术/);
  assert.doesNotMatch(policy, /1—2 条短话术|可选的.*AI建议话术 2/);
  assert.match(policy, /不得编造公司、产品、收益或案例事实/);
  assert.match(policy, /最下面只保留固定知识库话术，不放 AI 改写或延伸/);
  assert.match(policy, /没有精确固定话术命中，先请用户补充/);
  assert.match(policy, /客户姓名、朋友圈内容、个人经历、帮助人数、业绩、收益、时间和案例一律不得补全/);

  const followUpPolicy = buildCareerMentorBusinessContext(
    resolvedIceBreakingFollowUp.scenarioQuestion,
    resolvedIceBreakingFollowUp.supportingContext,
    { continuationRequest: "再换一个方案" }
  );

  assert.match(followUpPolicy, /同一场景续答/);
  assert.match(followUpPolicy, /只代表更换方案或说法，不代表客户状态前进/);
  assert.match(followUpPolicy, /第一步：破冰/);
  assert.match(followUpPolicy, /客户是宝妈，应该怎么破冰/);
  assert.match(policy, /不得省略流程、减少数量或合并话术/);
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
        title: "02_讲事业沟通五步·第二步_促单跟进_精读笔记_WPS排版版",
        content: `测试提问 1：${question}`,
        relevanceScore: 0.22
      }),
      createChunk({
        chunkId: "career-answer",
        knowledgeItemId: "career-lesson-1",
        title: "02_讲事业沟通五步·第二步_促单跟进_精读笔记_WPS排版版",
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
    ["matching-copy-card", "matching-operator-card"]
  );
  assert.equal(knowledgeLayerRanked.some((chunk) => chunk.chunkId === "generic-exact"), false);
  assert.equal(knowledgeLayerRanked.some((chunk) => chunk.chunkId === "wrong-stage-copy-card"), false);
  assert.equal(knowledgeLayerRanked.some((chunk) => chunk.chunkId === "untagged-copy-card"), false);

  const closingLayerRanked = prioritizeCareerMentorChunks({
    question: "客户已经认可但迟迟不加入，下一步怎么推进？",
    topK: 14,
    chunks: [
      createChunk({
        chunkId: "combined-file-objection-only",
        knowledgeItemId: "combined-file-objection-only-item",
        title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
        content: "第四步锁定问题。客户说贵时，先认可，再围绕价值解释解决顾虑，不要直接推进成交。",
        relevanceScore: 0.99
      }),
      createChunk({
        chunkId: "combined-file-natural-objection",
        knowledgeItemId: "combined-file-natural-objection-item",
        title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
        content: "客户说太贵怎么办？先顺着他说，不要着急反驳，再问他真正担心的是什么，不要推进下一步。",
        relevanceScore: 0.98
      }),
      createChunk({
        chunkId: "combined-file-ambiguous",
        knowledgeItemId: "combined-file-ambiguous-item",
        title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
        content: "和客户继续保持联系，等对方后续反馈。",
        relevanceScore: 0.97
      }),
      createChunk({
        chunkId: "combined-file-closing",
        knowledgeItemId: "combined-file-closing-item",
        title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
        content: "第五步成交。完成价值确认，明确行动时间，降低行动阻力，再推进一个具体下一步。",
        relevanceScore: 0.2
      })
    ]
  });

  assert.deepEqual(
    closingLayerRanked.map((chunk) => chunk.chunkId),
    ["combined-file-closing"]
  );

  const sameDocumentObjectionRanked = prioritizeCareerMentorChunks({
    question: "客户说贵怎么办？",
    topK: 14,
    chunks: [
      createChunk({
        chunkId: "same-doc-objection",
        knowledgeItemId: "same-combined-document",
        title: "04_讲事业第四五步_精读笔记_WPS排版版",
        content: "第四步锁定问题。客户说贵时先认可，再围绕价值解释解决顾虑。",
        relevanceScore: 0.7
      }),
      createChunk({
        chunkId: "same-doc-closing",
        knowledgeItemId: "same-combined-document",
        title: "04_讲事业第四五步_精读笔记_WPS排版版",
        content: "第五步成交。完成价值确认，明确行动时间，再推进一个具体下一步。",
        relevanceScore: 0.69
      })
    ]
  });

  assert.deepEqual(
    sameDocumentObjectionRanked.map((chunk) => chunk.chunkId),
    ["same-doc-objection"]
  );

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
  assert.match(groundedFullBody, /#### AI建议话术 1（稳妥自然型）/);
  assert.match(groundedFullBody, /#### AI建议话术 2（共情引导型）/);
  assert.match(groundedFullBody, /#### AI建议话术 3（轻问推进型）/);
  assert.equal((groundedFullBody.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
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

  const sanitizedInventedAdaptiveReply = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第一步破冰。",
    "",
    "## 回复思路",
    "完整正文继续保留，只处理不可靠的动态话术。",
    "",
    "### AI思考回复话术",
    "",
    "#### AI建议话术 1",
    "",
    "> 您好，李姐！刚刷到您发的宝宝第一次自己吃饭的照片。我们最近帮20多位宝妈实现了稳定分润。",
    "",
    "### 推荐执行流程",
    "",
    "1. 完整流程正文不能被动态话术清洗删除。",
    "",
    "## 可复制给客户",
    "",
    "### 话术 1",
    "",
    "> 这是一条未经知识校验的固定话术。"
  ].join("\n"), {
    chunks: [],
    question: resolvedIceBreakingFollowUp.scenarioQuestion,
    supportingContext: resolvedIceBreakingFollowUp.supportingContext
  });

  assert.match(sanitizedInventedAdaptiveReply, /完整正文继续保留/);
  assert.match(sanitizedInventedAdaptiveReply, /### AI思考回复话术/);
  assert.equal((sanitizedInventedAdaptiveReply.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.match(sanitizedInventedAdaptiveReply, /带孩子的同时还要安排好自己的生活/);
  assert.match(sanitizedInventedAdaptiveReply, /### 推荐执行流程/);
  assert.match(sanitizedInventedAdaptiveReply, /完整流程正文不能被动态话术清洗删除/);
  assert.doesNotMatch(sanitizedInventedAdaptiveReply, /李姐|宝宝第一次自己吃饭|20多位|稳定分润/);
  assert.match(extractCareerMentorCustomerAnswer(sanitizedInventedAdaptiveReply), /^姐\/哥，我们这个事业很简单/);

  const mixedAdaptiveReplies = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "完整正文和三条动态话术必须同时保留。",
    "",
    "### AI思考回复话术",
    "",
    "#### AI建议话术 1（稳妥自然型）",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。",
    "",
    "#### AI建议话术 2（共情引导型）",
    "> 李姐，刚看到您朋友圈的新照片，我们已经帮20位伙伴实现稳定收益。",
    "",
    "#### AI建议话术 3（轻问推进型）",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。",
    "",
    "#### AI建议话术 4（多余话术）",
    "> 第四条不应进入最终输出。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((mixedAdaptiveReplies.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.equal((mixedAdaptiveReplies.match(/资料先按自己的节奏看，您最想了解哪部分/g) ?? []).length, 1);
  assert.doesNotMatch(mixedAdaptiveReplies, /李姐|朋友圈的新照片|20位|稳定收益|第四条不应进入/);
  assert.match(mixedAdaptiveReplies, /不着急回复我/);
  assert.match(mixedAdaptiveReplies, /您可以先不用一次看完/);
  assert.equal(extractCareerMentorCustomerAnswer(mixedAdaptiveReplies), exactKnowledgeScript);
  assert.equal(cleanCareerMentorUserAnswer(mixedAdaptiveReplies, {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  }), mixedAdaptiveReplies);

  const duplicateAdaptiveSections = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "重复区段必须合并成唯一三条，区段之间的正文仍要保留。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。",
    "",
    "### 推荐执行流程",
    "1. 这段流程正文不能被删除。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（重复）",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。",
    "#### AI建议话术 2（共情引导型）",
    "> 姐，不着急回复我，您先告诉我资料里最想了解哪一部分。",
    "#### AI建议话术 3（轻问推进型）",
    "> 姐，您更想先了解具体怎么做，还是时间怎么安排？",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((duplicateAdaptiveSections.match(/### AI思考回复话术/g) ?? []).length, 1);
  assert.equal((duplicateAdaptiveSections.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.equal((duplicateAdaptiveSections.match(/资料先按自己的节奏看，您最想了解哪部分/g) ?? []).length, 1);
  assert.match(duplicateAdaptiveSections, /这段流程正文不能被删除/);
  assert.equal(extractCareerMentorCustomerAnswer(duplicateAdaptiveSections), exactKnowledgeScript);
  assert.equal(cleanCareerMentorUserAnswer(duplicateAdaptiveSections, {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  }), duplicateAdaptiveSections);

  const orphanAdaptiveHeading = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "模型漏掉容器标题时也只能保留三条卡片。",
    "",
    "**AI建议话术 1（稳妥自然型）**",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((orphanAdaptiveHeading.match(/### AI思考回复话术/g) ?? []).length, 1);
  assert.equal((orphanAdaptiveHeading.match(/#### AI建议话术 [123]（/g) ?? []).length, 3);
  assert.equal((orphanAdaptiveHeading.match(/资料先按自己的节奏看，您最想了解哪部分/g) ?? []).length, 1);
  assert.equal(extractCareerMentorCustomerAnswer(orphanAdaptiveHeading), exactKnowledgeScript);

  const unsupportedInstitutionAndCaseClaims = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "只替换没有知识依据的公司、产品和案例事实。",
    "",
    "### AI思考回复话术",
    "",
    "#### AI建议话术 1（稳妥自然型）",
    "> 我们公司已经获得国家认证，您可以放心了解。",
    "",
    "#### AI建议话术 2（共情引导型）",
    "> 产品经过权威检测，所以完全不用担心。",
    "",
    "#### AI建议话术 3（轻问推进型）",
    "> 我们帮助很多宝妈改善了生活，很多客户都成功了。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((unsupportedInstitutionAndCaseClaims.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.doesNotMatch(
    unsupportedInstitutionAndCaseClaims,
    /国家认证|权威检测|帮助很多宝妈|很多客户都成功/
  );
  assert.match(unsupportedInstitutionAndCaseClaims, /资料您先按自己的节奏看/);
  assert.equal(extractCareerMentorCustomerAnswer(unsupportedInstitutionAndCaseClaims), exactKnowledgeScript);

  const additionalUnsupportedClaims = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "个人案例、团队年限和收益保证都必须有依据。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    "> 我帮客户解决过很多类似问题，您放心。",
    "#### AI建议话术 2（共情引导型）",
    "> 我们的团队有十年经验，您可以放心。",
    "#### AI建议话术 3（轻问推进型）",
    "> 这个事业保证赚钱，您不用担心。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((additionalUnsupportedClaims.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.doesNotMatch(additionalUnsupportedClaims, /帮客户解决过|十年经验|保证赚钱/);
  assert.equal(extractCareerMentorCustomerAnswer(additionalUnsupportedClaims), exactKnowledgeScript);

  const unsupportedCompanyProductRiskAssertions = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "公司实力、产品效果和风险保证都必须有知识依据。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    "> 我们公司实力很强，您可以放心。",
    "#### AI建议话术 2（共情引导型）",
    "> 这个产品效果很好，很多人都说不错。",
    "#### AI建议话术 3（轻问推进型）",
    "> 这是一个零风险的事业机会。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((unsupportedCompanyProductRiskAssertions.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.doesNotMatch(
    unsupportedCompanyProductRiskAssertions,
    /公司实力很强|产品效果很好|零风险/
  );
  assert.equal(extractCareerMentorCustomerAnswer(unsupportedCompanyProductRiskAssertions), exactKnowledgeScript);

  const fixedKnowledgeCopyNotReusedAsAiReply = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "AI 动态建议不能照抄最下方固定知识库话术。",
    "",
    "### AI思考回复话术",
    "",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${exactKnowledgeScript}`,
    "",
    "#### AI建议话术 2（共情引导型）",
    "> 姐，不着急回复我，您先告诉我资料里最想了解哪一部分。",
    "",
    "#### AI建议话术 3（轻问推进型）",
    "> 姐，您更想先了解具体怎么做，还是时间怎么安排？",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((fixedKnowledgeCopyNotReusedAsAiReply.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.equal(fixedKnowledgeCopyNotReusedAsAiReply.split(exactKnowledgeScript).length - 1, 1);
  assert.match(fixedKnowledgeCopyNotReusedAsAiReply, /资料您先按自己的节奏看/);
  assert.equal(extractCareerMentorCustomerAnswer(fixedKnowledgeCopyNotReusedAsAiReply), exactKnowledgeScript);

  const shortClosingKnowledgeScript = "姐——搞明白了吧？微信还是支付宝？";
  const shortFixedKnowledgeCopyNotReused = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第五步成交。",
    "",
    "## 回复思路",
    "短固定知识话术同样不能在 AI 建议区重复。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${shortClosingKnowledgeScript}`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${shortClosingKnowledgeScript}`
  ].join("\n"), {
    chunks: [],
    question: "客户认可但是不加入？"
  });

  assert.equal((shortFixedKnowledgeCopyNotReused.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.equal(shortFixedKnowledgeCopyNotReused.split(shortClosingKnowledgeScript).length - 1, 1);
  assert.equal(extractCareerMentorCustomerAnswer(shortFixedKnowledgeCopyNotReused), shortClosingKnowledgeScript);

  const providedCustomerNameIsPreserved = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第一步破冰。",
    "",
    "## 回复思路",
    "### AI思考回复话术",
    "#### AI建议话术 1",
    "> 李姐，先不急着聊太多，我想先了解一下您现在最关心什么。"
  ].join("\n"), {
    chunks: [],
    question: "客户叫李姐，是宝妈，怎么破冰"
  });

  assert.match(providedCustomerNameIsPreserved, /李姐，先不急着聊太多/);

  const formatDriftAiHeadingAnswer = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进",
    "",
    "## 回复思路",
    "### AI思考回复话术",
    "### 话术 1",
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
  assert.match(formatDriftAiHeadingAnswer, /#### AI建议话术 1（稳妥自然型）/);
  assert.equal((formatDriftAiHeadingAnswer.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.match(formatDriftAiHeadingAnswer, /资料你先按自己的节奏看/);
  assert.ok(
    formatDriftAiHeadingAnswer.indexOf("#### AI建议话术 1")
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
  assert.equal((negativeInstructionPreserved.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.ok(negativeInstructionPreserved.indexOf("### AI思考回复话术") < negativeInstructionPreserved.indexOf("## 可复制给客户"));
  assert.equal(extractCareerMentorCustomerAnswer(negativeInstructionPreserved), exactKnowledgeScript);

  const frameworkAnswerWithoutAdaptiveReplies = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前问题是沟通五步骤框架说明。",
    "",
    "## 回复思路",
    "按五个阶段完整说明，不生成客户动态话术。"
  ].join("\n"), {
    chunks: [],
    question: "沟通五步骤是什么？"
  });

  assert.doesNotMatch(frameworkAnswerWithoutAdaptiveReplies, /### AI思考回复话术|#### AI建议话术/);

  for (const nonCoreScenario of [
    {
      question: "沟通五步骤是什么？",
      stage: "框架说明"
    },
    {
      question: "长期客户应该怎么维护？",
      stage: "长期维护"
    }
  ]) {
    const nonCoreHallucinatedAdaptiveReply = cleanCareerMentorUserAnswer([
      "## 判断",
      `当前阶段：${nonCoreScenario.stage}。`,
      "",
      "## 回复思路",
      "这段非核心阶段正文必须保留。",
      "",
      "### AI思考回复话术",
      "#### AI建议话术 1（不应显示）",
      "> 这条模型误生成的话术必须移除。"
    ].join("\n"), {
      chunks: [],
      question: nonCoreScenario.question
    });

    assert.match(nonCoreHallucinatedAdaptiveReply, /这段非核心阶段正文必须保留/);
    assert.doesNotMatch(
      nonCoreHallucinatedAdaptiveReply,
      /### AI思考回复话术|#### AI建议话术|模型误生成的话术/
    );
  }

  const fixedCopyBeforeAdaptiveReplies = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "即使模型把固定知识卡放在前面，最终结构也必须纠正。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`,
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。"
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((fixedCopyBeforeAdaptiveReplies.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.ok(
    fixedCopyBeforeAdaptiveReplies.indexOf("### AI思考回复话术")
      < fixedCopyBeforeAdaptiveReplies.indexOf("## 可复制给客户")
  );
  assert.equal(extractCareerMentorCustomerAnswer(fixedCopyBeforeAdaptiveReplies), exactKnowledgeScript);

  const orphanFixedCopyBeforeAdaptiveReplies = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "固定知识卡容器标题漂移时也必须纠正顺序。",
    "",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`,
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    "> 姐，资料先按自己的节奏看，您最想了解哪部分就告诉我。"
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.equal((orphanFixedCopyBeforeAdaptiveReplies.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  assert.ok(
    orphanFixedCopyBeforeAdaptiveReplies.indexOf("### AI思考回复话术")
      < orphanFixedCopyBeforeAdaptiveReplies.indexOf("## 可复制给客户")
  );
  assert.equal(extractCareerMentorCustomerAnswer(orphanFixedCopyBeforeAdaptiveReplies), canonicalFollowUpScript);

  const indentedCodeAdaptiveHeading = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "下面是四空格缩进代码，必须逐字保留。",
    "",
    "    ### AI思考回复话术",
    "    #### AI建议话术 1",
    "    > 缩进代码里的示例话术不能成为卡片。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.match(
    indentedCodeAdaptiveHeading,
    /    ### AI思考回复话术\n    #### AI建议话术 1\n    > 缩进代码里的示例话术不能成为卡片。/
  );
  assert.equal((indentedCodeAdaptiveHeading.match(/#### AI建议话术 [123]（/g) ?? []).length, 3);
  assert.ok(
    indentedCodeAdaptiveHeading.lastIndexOf("### AI思考回复话术")
      < indentedCodeAdaptiveHeading.indexOf("## 可复制给客户")
  );

  const fencedAdaptiveHeading = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "以下代码块只是格式示例，必须原样保留。",
    "",
    "````markdown",
    "```markdown",
    "### AI思考回复话术",
    "#### AI建议话术 1",
    "> 代码块里的示例话术。",
    "```",
    "````",
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> “${exactKnowledgeScript}”`
  ].join("\n"), {
    chunks: [groundedChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？"
  });

  assert.match(
    fencedAdaptiveHeading,
    /````markdown[\s\S]*```markdown[\s\S]*代码块里的示例话术。[\s\S]*```[\s\S]*````/
  );
  assert.equal((fencedAdaptiveHeading.match(/#### AI建议话术 [123]（/g) ?? []).length, 3);
  assert.ok(fencedAdaptiveHeading.lastIndexOf("### AI思考回复话术") < fencedAdaptiveHeading.indexOf("## 可复制给客户"));

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

  const strictNoEvidenceAnswer = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "正文保留。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    "> 这条没有证据的话术不能显示。",
    "",
    "## 可复制给客户",
    "### 话术 1",
    "> 这条没有证据的固定话术也不能显示。"
  ].join("\n"), {
    chunks: [],
    question: "客户已经看了资料但没有行动，接下来怎么办？",
    strictEvidencePlan: true,
    evidencePlanAdaptiveReplies: [],
    evidencePlanEvidenceIds: []
  });

  assert.match(strictNoEvidenceAnswer, /正文保留/);
  assert.doesNotMatch(strictNoEvidenceAnswer, /AI思考回复话术|AI建议话术|没有证据的话术/);
  assert.match(strictNoEvidenceAnswer, /本轮没有检索到可逐字核对的同阶段客户话术/);
  assert.equal(extractCareerMentorCustomerAnswer(strictNoEvidenceAnswer), "");

  const strictEvidenceChunk = createChunk({
    chunkId: "strict-follow-up-evidence",
    knowledgeItemId: "strict-follow-up-item",
    title: "02_促单跟进_客户可复制话术卡片_WPS排版版",
    content: [
      "第二步促单跟进。",
      "固定话术：资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。"
    ].join("\n"),
    relevanceScore: 0.82
  });
  const evidencePlanReplies = [
    "您好，资料您先慢慢看，您最想先了解哪一部分，我就从那一点和您说。",
    "您好，不着急回复，哪里还没看明白您直接告诉我，我们先把那一点聊清楚。",
    "您好，您更想先了解具体怎么做，还是想先确认时间怎么安排？"
  ];
  const strictPlanFilledAnswer = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "根据当前资料继续温和跟进。",
    "",
    "### 推荐执行流程",
    "1. 先确认客户最关注的部分。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${evidencePlanReplies[0]}`,
    "",
    "## 可复制给客户"
  ].join("\n"), {
    chunks: [strictEvidenceChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？",
    strictEvidencePlan: true,
    evidencePlanAdaptiveReplies: evidencePlanReplies,
    evidencePlanFixedScript: "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。",
    evidencePlanEvidenceIds: ["strict-follow-up-evidence"]
  });

  assert.equal((strictPlanFilledAnswer.match(/#### AI建议话术 [123]/g) ?? []).length, 3);
  for (const reply of evidencePlanReplies) {
    assert.equal(strictPlanFilledAnswer.includes(reply), true);
  }
  assert.equal(
    extractCareerMentorCustomerAnswer(strictPlanFilledAnswer),
    "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。"
  );

  const strictRejectedReplyAnswer = cleanCareerMentorUserAnswer([
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "",
    "## 回复思路",
    "正文仍应保留。",
    "",
    "### 推荐执行流程",
    "1. 先确认客户最关注的部分。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${evidencePlanReplies[0]}`,
    "",
    "## 可复制给客户"
  ].join("\n"), {
    chunks: [strictEvidenceChunk],
    question: "客户已经看了资料但没有行动，接下来怎么办？",
    strictEvidencePlan: true,
    evidencePlanAdaptiveReplies: [
      evidencePlanReplies[0],
      "我们公司保证月入过万，您现在加入一定能赚钱。",
      evidencePlanReplies[2]
    ],
    evidencePlanFixedScript: "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。",
    evidencePlanEvidenceIds: ["strict-follow-up-evidence"]
  });

  assert.match(strictRejectedReplyAnswer, /正文仍应保留/);
  assert.doesNotMatch(strictRejectedReplyAnswer, /AI思考回复话术|AI建议话术|保证月入过万/);

  const noEvidenceBody = buildCareerMentorNoEvidenceAnswer(
    "客户已经看了资料但没有行动，接下来怎么办？"
  );
  assert.match(noEvidenceBody, /## 判断[\s\S]*## 回复思路[\s\S]*### 推荐执行流程/);
  assert.doesNotMatch(noEvidenceBody, /### AI思考回复话术|### 话术 1/);

  console.log("ai-chat career mentor tests passed");
}

main();
