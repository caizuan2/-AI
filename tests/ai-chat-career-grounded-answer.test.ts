import assert from "node:assert/strict";

import {
  CAREER_MENTOR_EVIDENCE_PLAN_VERSION,
  generateCareerMentorGroundedAnswer,
  validateCareerMentorNaturalWriterAnswer,
  validateCareerMentorWriterAnswer,
  type CareerMentorEvidencePlanV1
} from "../lib/ai-chat/career-mentor-grounded-answer";
import type { RagAnswerResult } from "../lib/ai/rag-answer";
import { buildRagPromptMessages, type RagContext } from "../lib/ai/rag-prompt";
import type { ChatWithFallbackResult } from "../lib/ai/types";
import {
  retrieveRelevantChunks,
  type RagSearchDb
} from "../lib/rag/search";

const knowledgeContext: RagContext = {
  id: "knowledge-follow-up",
  sourceId: "chunk-follow-up",
  title: "02_促单跟进_客户可复制话术卡片_WPS排版版",
  sourceType: "admin_docx",
  content: [
    "第二步促单跟进。",
    "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。",
    "固定话术：资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。"
  ].join("\n"),
  relevance_score: 0.88
};

const customerContext: RagContext = {
  id: "attachment-ocr-context",
  sourceId: "attachment-ocr",
  title: "客户聊天截图",
  sourceType: "attachment_ocr",
  content: "客户(左侧)：我晚点再看看资料。"
};

const replyDrafts = [
  "您好，资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。",
  "您好，不着急，确认客户最关注哪一部分，再围绕关注点继续沟通。",
  "您好，最关注哪一部分？我先围绕关注点继续沟通。"
];

const followUpActionQuote = "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。";
const followUpFixedQuote = "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。";

function createPlan(): CareerMentorEvidencePlanV1 {
  return {
    version: CAREER_MENTOR_EVIDENCE_PLAN_VERSION,
    stage: "follow_up",
    customerState: "客户已收到资料，表示稍后再看。",
    completedActions: ["已发送资料"],
    responseFocus: "确认客户关注点，保持轻量跟进。",
    evidenceFindings: [{
      evidenceId: "chunk-follow-up",
      supportingQuotes: [
        followUpActionQuote,
        followUpFixedQuote
      ]
    }],
    executionSequence: {
      evidenceId: "chunk-follow-up",
      supportingQuote: followUpActionQuote,
      actionAnchors: [
        "确认客户最关注哪一部分",
        "围绕关注点继续沟通"
      ]
    },
    replyBlueprints: [
      {
        style: "稳妥自然型",
        goal: "给客户留出阅读空间。",
        draft: replyDrafts[0],
        evidenceIds: ["chunk-follow-up"],
        supportingQuote: followUpFixedQuote
      },
      {
        style: "共情引导型",
        goal: "降低回复压力并收集疑问。",
        draft: replyDrafts[1],
        evidenceIds: ["chunk-follow-up"],
        supportingQuote: followUpActionQuote
      },
      {
        style: "轻问推进型",
        goal: "用选择题确认关注点。",
        draft: replyDrafts[2],
        evidenceIds: ["chunk-follow-up"],
        supportingQuote: followUpActionQuote
      }
    ],
    fixedScriptCandidate: {
      text: "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。",
      evidenceId: "chunk-follow-up"
    },
    missingInformation: [],
    forbiddenClaims: ["不得编造收益、案例或时间承诺"]
  };
}

function createPlannerResponse(text: string): ChatWithFallbackResult {
  return {
    text,
    provider: "deepseek",
    model: "deepseek-chat",
    fallbackUsed: false,
    model_feedback_event: {
      model_used: "deepseek-chat",
      was_successful: true,
      fallback_triggered: false,
      response_quality: null,
      latency: 12
    }
  };
}

function createWriterAnswer(options: {
  drafts?: string[];
  judgementBasis?: string;
  fixedScript?: string;
} = {}): string {
  const drafts = options.drafts ?? replyDrafts;
  const fixedScript = options.fixedScript
    ?? "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。";

  return [
    "## 判断",
    "当前阶段：第二步促单跟进。",
    "调用步骤：促单跟进。",
    `判断依据：${options.judgementBasis ?? "客户说晚点再看资料，接下来要确认客户最关注哪一部分。"}`,
    "",
    "## 回复思路",
    "确认客户最关注哪一部分，再围绕关注点继续沟通。",
    "",
    "### 推荐执行流程",
    "1. 确认客户最关注哪一部分。",
    "2. 围绕关注点继续沟通。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${drafts[0]}`,
    "",
    "#### AI建议话术 2（共情引导型）",
    `> ${drafts[1]}`,
    "",
    "#### AI建议话术 3（轻问推进型）",
    `> ${drafts[2]}`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    ...fixedScript.split("\n").map((line) => `> ${line}`)
  ].join("\n");
}

function createNaturalWriterAnswer(options: {
  drafts?: string[];
  fixedScript?: string;
  body?: string;
} = {}): string {
  const drafts = options.drafts ?? replyDrafts;
  const body = options.body ?? [
    "## 先把这次跟进的目标放对",
    "客户说晚点再看资料。资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。",
    "",
    "## 下一步可以怎么做",
    "资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。先确认客户最关注哪一部分，再围绕关注点继续沟通。"
  ].join("\n");

  return [
    body,
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${drafts[0]}`,
    "",
    "#### AI建议话术 2（共情引导型）",
    `> ${drafts[1]}`,
    "",
    "#### AI建议话术 3（轻问推进型）",
    `> ${drafts[2]}`,
    "",
    "## 可复制给客户",
    ...(options.fixedScript
      ? ["### 话术 1", ...options.fixedScript.split("\n").map((line) => `> ${line}`)]
      : [])
  ].join("\n");
}

function createWriterResult(answer: string): RagAnswerResult {
  return {
    answer,
    citations: [],
    answerHash: "ans_test",
    model: "deepseek-chat",
    providerUsed: "deepseek",
    fallbackUsed: false,
    answer_grounding_score: 0.9,
    model_feedback_event: {
      model_used: "deepseek-chat",
      was_successful: true,
      fallback_triggered: false,
      response_quality: 0.9,
      latency: 20
    }
  };
}

async function main() {
  let strictScopedFetches = 0;
  const strictScopedDb = {
    knowledgeChunk: {
      findMany: async () => {
        strictScopedFetches += 1;
        return [];
      }
    }
  } as unknown as RagSearchDb;

  const strictScopedResult = await retrieveRelevantChunks("完全不相关的问题", {
    userId: "user-test",
    tenantId: "tenant-test",
    agentId: "expert-career",
    knowledgeBaseId: "kb-business-coach",
    namespace: "kb-business-coach",
    knowledgeScope: {
      tenantId: "tenant-test",
      agentId: "expert-career",
      knowledgeBaseId: "kb-business-coach",
      namespace: "kb-business-coach"
    },
    allowScopedFallback: false,
    db: strictScopedDb
  });
  assert.deepEqual(strictScopedResult, []);
  assert.equal(strictScopedFetches, 1);

  let legacyScopedFetches = 0;
  const legacyScopedDb = {
    knowledgeChunk: {
      findMany: async () => {
        legacyScopedFetches += 1;
        return [];
      }
    }
  } as unknown as RagSearchDb;
  await retrieveRelevantChunks("完全不相关的问题", {
    userId: "user-test",
    tenantId: "tenant-test",
    agentId: "expert-kks",
    knowledgeBaseId: "kb-kks-slim",
    namespace: "kb-kks-slim",
    knowledgeScope: {
      tenantId: "tenant-test",
      agentId: "expert-kks",
      knowledgeBaseId: "kb-kks-slim",
      namespace: "kb-kks-slim"
    },
    db: legacyScopedDb
  });
  assert.equal(legacyScopedFetches, 2);

  const plan = createPlan();
  let plannerCalls = 0;
  let writerCalls = 0;
  let writerBusinessContext = "";
  const groundedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext, customerContext],
    {
      provider: "deepseek",
      providerChain: ["deepseek"],
      model: "deepseek-chat",
      expectedStage: "follow_up",
      businessExecutionContext: "本轮内部定位：促单跟进；固定生成 3 条 AI 建议话术。",
      recentConversation: []
    },
    {
      chat: async () => {
        plannerCalls += 1;
        return createPlannerResponse(JSON.stringify(plan));
      },
      writer: async (_question, _contexts, options) => {
        writerCalls += 1;
        writerBusinessContext = options?.businessExecutionContext ?? "";
        return createWriterResult(createWriterAnswer());
      },
      recordUsage: async () => undefined
    }
  );

  assert.equal(plannerCalls, 1);
  assert.equal(writerCalls, 1);
  assert.match(writerBusinessContext, /CAREER_EVIDENCE_PLAN_APP_VALIDATED/);
  assert.match(writerBusinessContext, /"expectedStage":"follow_up"/);
  assert.deepEqual(groundedResult.careerEvidencePlan.adaptiveReplies, replyDrafts);
  assert.deepEqual(groundedResult.careerEvidencePlan.evidenceIds, ["chunk-follow-up"]);
  assert.equal(groundedResult.careerEvidencePlan.plannerPassed, true);
  assert.equal(groundedResult.careerEvidencePlan.writerPassed, true);
  const actualWriterPrompt = buildRagPromptMessages(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    { businessExecutionContext: writerBusinessContext }
  ).map((message) => message.content).join("\n");
  assert.match(actualWriterPrompt, /CAREER_EVIDENCE_PLAN_APP_VALIDATED/);
  for (const reply of replyDrafts) {
    assert.equal(actualWriterPrompt.includes(reply), true);
  }

  const naturalAnswer = createNaturalWriterAnswer();
  const naturalValidation = validateCareerMentorNaturalWriterAnswer({
    answer: naturalAnswer,
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext],
    recentConversation: []
  });

  assert.equal(naturalValidation.ok, true, naturalValidation.issues.join(", "));
  assert.doesNotMatch(naturalAnswer, /^## 判断$|^## 回复思路$|^### 推荐执行流程$/m);

  const fixedTemplateValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createWriterAnswer(),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(fixedTemplateValidation.ok, false);
  assert.equal(fixedTemplateValidation.issues.includes("writer_fixed_body_template_used"), true);

  const reversedSequenceValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        "## 跟进时先守住客户节奏",
        "客户已经收到资料，当前需要把沟通入口留得轻一些。围绕关注点继续沟通之后，再确认客户最关注哪一部分。为了让正文保持完整，这里只解释当前阶段的做法，不增加知识片段没有提供的事实，也不提前推进到后续阶段。",
        "",
        "## 为什么顺序很重要",
        "把两个动作倒过来会失去明确关注点，因此应回到资料里已经给出的原始顺序，再安排下一次交流。"
      ].join("\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(reversedSequenceValidation.ok, false);
  assert.equal(reversedSequenceValidation.issues.includes("writer_execution_flow_not_grounded"), true);

  const unsupportedClaimValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: `${createNaturalWriterAnswer().split("### AI思考回复话术")[0]}\n这个方法保证每月收入五万元。`
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(unsupportedClaimValidation.ok, false);
  assert.equal(unsupportedClaimValidation.issues.includes("writer_unsupported_sensitive_claim"), true);

  const ungroundedNaturalAdviceValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        "## 先这样跟进",
        "先确认客户最关注哪一部分，再围绕关注点继续沟通。每天给客户连续发十条消息，是最稳妥、最专业、最容易让客户产生兴趣的做法。这套频率适合所有客户，不需要根据客户反应调整。为了把方案讲完整，这里继续补充一些没有来自资料的普通建议，让正文达到完整长度并保持自然表达。还可以要求伙伴每天记录客户隐私和家庭情况，并统一套用这一节奏，不必判断客户是否愿意继续沟通。这些做法都没有出现在知识片段里，但也没有包含收入保证或公司资质等敏感词。"
      ].join("\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(ungroundedNaturalAdviceValidation.ok, false);
  assert.equal(
    ungroundedNaturalAdviceValidation.issues.includes("writer_natural_body_not_grounded"),
    true
  );

  const shortUngroundedActionsValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
        "马上打电话。天天催客户。"
      ].join("\n\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(shortUngroundedActionsValidation.ok, false);
  assert.equal(
    shortUngroundedActionsValidation.issues.includes("writer_natural_body_not_grounded"),
    true
  );

  const fencedUngroundedActionsValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
        "```text",
        "马上打电话。",
        "天天催客户。",
        "```"
      ].join("\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(fencedUngroundedActionsValidation.ok, false);
  assert.equal(
    fencedUngroundedActionsValidation.issues.includes("writer_natural_body_unsupported_markup"),
    true
  );

  for (const ungroundedHeading of [
    "## 天天催客户",
    "## 马上打电话",
    "## 目标：诱导客户透露隐私",
    "## 下一步：误导客户接受安排",
    "## 为什么要歪曲客户需求",
    "## 沟通重点：套客户个人信息"
  ]) {
    const ungroundedHeadingValidation = validateCareerMentorNaturalWriterAnswer({
      answer: createNaturalWriterAnswer({
        body: [
          createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
          ungroundedHeading
        ].join("\n\n")
      }),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？",
      customerContexts: [customerContext]
    });
    assert.equal(ungroundedHeadingValidation.ok, false, ungroundedHeading);
    assert.equal(
      ungroundedHeadingValidation.issues.includes("writer_natural_body_not_grounded"),
      true,
      ungroundedHeading
    );
  }

  for (const ungroundedShortClause of [
    "逼单。",
    "逼她。",
    "恐吓。",
    "洗脑。",
    "造假。",
    "纠缠。",
    "轰炸。",
    "硬推。"
  ]) {
    const ungroundedShortClauseValidation = validateCareerMentorNaturalWriterAnswer({
      answer: createNaturalWriterAnswer({
        body: [
          createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
          ungroundedShortClause
        ].join("\n\n")
      }),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？",
      customerContexts: [customerContext]
    });
    assert.equal(ungroundedShortClauseValidation.ok, false, ungroundedShortClause);
    assert.equal(
      ungroundedShortClauseValidation.issues.includes("writer_natural_body_not_grounded"),
      true,
      ungroundedShortClause
    );
  }

  for (const ungroundedFrequencyClause of [
    "每天确认客户最关注哪一部分。",
    "每天围绕关注点继续沟通。",
    "每天确认客户最关注哪一部分。每天围绕关注点继续沟通。"
  ]) {
    const ungroundedFrequencyClauseValidation = validateCareerMentorNaturalWriterAnswer({
      answer: createNaturalWriterAnswer({
        body: [
          createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
          ungroundedFrequencyClause
        ].join("\n\n")
      }),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？",
      customerContexts: [customerContext]
    });
    assert.equal(ungroundedFrequencyClauseValidation.ok, false, ungroundedFrequencyClause);
    assert.equal(
      ungroundedFrequencyClauseValidation.issues.includes("writer_natural_body_not_grounded"),
      true,
      ungroundedFrequencyClause
    );
  }

  const adviceQuestionEchoValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
        "天天催客户。"
      ].join("\n\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "我应该天天催客户吗？",
    customerContexts: [customerContext]
  });
  assert.equal(adviceQuestionEchoValidation.ok, false);
  assert.equal(
    adviceQuestionEchoValidation.issues.includes("writer_natural_body_not_grounded"),
    true
  );

  for (const [ungroundedRequestedAction, requestedActionQuestion] of [
    ["给客户发红包。", "给我一套给客户发红包的话术"],
    ["给客户送礼物。", "给我一套给客户送礼物的话术"],
    ["夸客户很漂亮。", "给我一套夸客户很漂亮的话术"],
    ["约客户见面。", "给我一套约客户见面的话术"]
  ] as const) {
    const requestedActionEchoValidation = validateCareerMentorNaturalWriterAnswer({
      answer: createNaturalWriterAnswer({
        body: [
          createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
          ungroundedRequestedAction
        ].join("\n\n")
      }),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: requestedActionQuestion,
      customerContexts: [customerContext]
    });
    assert.equal(requestedActionEchoValidation.ok, false, requestedActionQuestion);
    assert.equal(
      requestedActionEchoValidation.issues.includes("writer_natural_body_not_grounded"),
      true,
      requestedActionQuestion
    );
  }

  for (const copyTailInjection of ["硬推。", "每天轰炸。", "造假。"]) {
    const copyTailInjectionValidation = validateCareerMentorNaturalWriterAnswer({
      answer: [
        createNaturalWriterAnswer(),
        "## 额外策略",
        copyTailInjection
      ].join("\n\n"),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？",
      customerContexts: [customerContext]
    });
    assert.equal(copyTailInjectionValidation.ok, false, copyTailInjection);
    assert.equal(
      copyTailInjectionValidation.issues.includes("writer_section_topology_invalid"),
      true,
      copyTailInjection
    );
  }

  const validNaturalLines = createNaturalWriterAnswer().split("\n");
  const aiSectionLineIndex = validNaturalLines.findIndex((line) => line === "### AI思考回复话术");
  const copySectionLineIndex = validNaturalLines.findIndex((line) => line === "## 可复制给客户");
  for (const injectionIndex of [aiSectionLineIndex + 1, copySectionLineIndex]) {
    const injectedLines = [...validNaturalLines];
    injectedLines.splice(injectionIndex, 0, "## 额外策略", "", "硬推。", "");
    const aiSectionInjectionValidation = validateCareerMentorNaturalWriterAnswer({
      answer: injectedLines.join("\n"),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？",
      customerContexts: [customerContext]
    });
    assert.equal(aiSectionInjectionValidation.ok, false, String(injectionIndex));
    assert.equal(
      aiSectionInjectionValidation.issues.includes("writer_section_topology_invalid"),
      true,
      String(injectionIndex)
    );
  }

  for (const alteredAction of [
    "欺骗客户最关注哪一部分。",
    "套取客户最关注哪一部分。",
    "隐瞒客户最关注哪一部分。",
    "删除客户最关注哪一部分。",
    "确认客户最关注哪个项目。",
    "确认客户最关注哪位伙伴。",
    "确认客户最关注哪次活动。"
  ]) {
    const alteredNaturalActionValidation = validateCareerMentorNaturalWriterAnswer({
      answer: createNaturalWriterAnswer({
        body: [
          createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
          alteredAction
        ].join("\n\n")
      }),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？",
      customerContexts: [customerContext]
    });
    assert.equal(alteredNaturalActionValidation.ok, false, alteredAction);
    assert.equal(
      alteredNaturalActionValidation.issues.includes("writer_natural_body_not_grounded"),
      true,
      alteredAction
    );
  }

  const negatedNaturalActionValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        "## 跟进动作不能被反向改写",
        "客户说晚点再看资料。资料发出后，不用确认客户最关注哪一部分，再围绕关注点继续沟通。资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。确认客户最关注哪一部分，再围绕关注点继续沟通。资料您先按自己的节奏看，看完告诉我您最想了解哪一部分。"
      ].join("\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(negatedNaturalActionValidation.ok, false);
  assert.equal(
    negatedNaturalActionValidation.issues.includes("writer_natural_body_not_grounded"),
    true
  );

  const naturalParaphraseValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        createNaturalWriterAnswer().split("### AI思考回复话术")[0].trim(),
        "这样做的目的，是先弄清楚对方真正关心的内容，然后针对这一点继续聊。"
      ].join("\n\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(naturalParaphraseValidation.ok, true, naturalParaphraseValidation.issues.join(", "));

  const chineseInternalPlanLeakValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        "## 内部证据计划说明",
        "以下内容来自应用校验后的证据计划。内部规划器已经完成证据选择，现在先把内部证据计划的判断告诉你，再给出用户端答案。确认客户最关注哪一部分，再围绕关注点继续沟通。为了达到完整正文长度，这里继续说明应用已经校验过知识依据，并把内部处理过程转成了当前回复。这个内部规划过程原本不会给客户看到，但这次正文直接把它写在这里。"
      ].join("\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(chineseInternalPlanLeakValidation.ok, false);
  assert.equal(
    chineseInternalPlanLeakValidation.issues.includes("writer_internal_plan_leak"),
    true
  );

  const frameworkQuotes = [
    "沟通五步骤依次是破冰、促单跟进、讲事业、锁定问题和成交，每一步都要根据客户当前状态判断，不能随意跳步。",
    "破冰先建立信任并发送资料，促单跟进持续展示价值，客户主动了解后再讲事业，出现疑虑时锁定问题，认可后推动成交。",
    "陌生客户先解决你是谁和为什么愿意听的问题，已经了解但没有行动时继续展示价值，主动想了解事业时再进入完整讲解。",
    "客户提出贵、靠不靠谱、没时间或考虑一下时，先认可，再转移焦点，最后用核心价值解释；认可却不行动时再推进下一步。"
  ];
  const frameworkContexts = frameworkQuotes.map((quote, index): RagContext => ({
    id: `framework-${index + 1}`,
    sourceId: `framework-${index + 1}`,
    title: "沟通五步骤知识树",
    sourceType: "admin_docx",
    content: quote
  }));
  const frameworkPlan: CareerMentorEvidencePlanV1 = {
    version: CAREER_MENTOR_EVIDENCE_PLAN_VERSION,
    stage: "framework",
    customerState: "用户正在了解沟通五步骤整体框架。",
    completedActions: [],
    responseFocus: "说明五步骤整体顺序和阶段判断。",
    evidenceFindings: frameworkQuotes.map((quote, index) => ({
      evidenceId: `framework-${index + 1}`,
      supportingQuotes: [quote]
    })),
    executionSequence: null,
    replyBlueprints: [],
    fixedScriptCandidate: null,
    missingInformation: [],
    forbiddenClaims: []
  };
  const frameworkNaturalAnswer = [
    "## 五步骤的整体逻辑",
    "",
    frameworkQuotes[0],
    "",
    frameworkQuotes[1],
    "",
    "## 阶段判断怎么做",
    "",
    frameworkQuotes[2],
    "",
    frameworkQuotes[3],
    "",
    "## 可复制给客户"
  ].join("\n");
  const frameworkNaturalValidation = validateCareerMentorNaturalWriterAnswer({
    answer: frameworkNaturalAnswer,
    plan: frameworkPlan,
    knowledgeContexts: frameworkContexts,
    expectedReplyCount: 0,
    question: "沟通五步骤都是什么？"
  });
  assert.equal(frameworkNaturalValidation.ok, true, JSON.stringify(frameworkNaturalValidation));

  const naturalStageConflictValidation = validateCareerMentorNaturalWriterAnswer({
    answer: createNaturalWriterAnswer({
      body: [
        "## 先尊重客户当前的阅读节奏",
        "客户已经收到资料并表示稍后再看，当前仍应先确认客户最关注哪一部分，再围绕关注点继续沟通。这样可以让本轮交流继续停留在资料跟进阶段，不加入知识片段没有支持的判断。",
        "",
        "## 不应提前跨到成交动作",
        "现在立即要求客户付款并马上加入。"
      ].join("\n")
    }),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？",
    customerContexts: [customerContext]
  });
  assert.equal(naturalStageConflictValidation.ok, false);
  assert.equal(
    naturalStageConflictValidation.issues.includes("writer_stage_action_conflict"),
    true
  );

  let naturalWriterCalls = 0;
  let naturalWriterBusinessContext = "";
  const naturalGroundedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext, customerContext],
    {
      provider: "deepseek",
      providerChain: ["deepseek"],
      model: "deepseek-v4-pro",
      expectedStage: "follow_up",
      outputMode: "natural_markdown_with_cards",
      temperature: 0.7,
      maxTokens: 6000,
      businessExecutionContextMaxChars: 7000,
      businessExecutionContext: "CAREER_NATURAL_TAIL_RULE"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(plan)),
      writer: async (_question, _contexts, options) => {
        naturalWriterCalls += 1;
        naturalWriterBusinessContext = options?.businessExecutionContext ?? "";
        assert.equal(options?.temperature, 0.7);
        assert.equal(options?.maxTokens, 6000);
        assert.equal(options?.businessExecutionContextMaxChars, 7000);
        return createWriterResult(createNaturalWriterAnswer());
      },
      recordUsage: async () => undefined
    }
  );

  assert.equal(naturalWriterCalls, 1);
  assert.match(naturalWriterBusinessContext, /完整、自然、专业的 DeepSeek\/GPT 风格 Markdown 正文/);
  assert.match(naturalWriterBusinessContext, /不要套用‘判断’‘回复思路’‘推荐执行流程’三个固定栏目/);
  const naturalWriterPrompt = buildRagPromptMessages(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      businessExecutionContext: naturalWriterBusinessContext,
      businessExecutionContextMaxChars: 7000
    }
  ).map((message) => message.content).join("\n");
  assert.match(naturalWriterPrompt, /CAREER_NATURAL_TAIL_RULE/);
  assert.match(naturalGroundedResult.answer, /## 先把这次跟进的目标放对/);
  assert.match(naturalGroundedResult.answer, /### AI思考回复话术/);
  assert.match(naturalGroundedResult.answer, /## 可复制给客户/);
  assert.equal(naturalGroundedResult.careerEvidencePlan.groundingValidationPassed, true);

  let naturalRepairWriterCalls = 0;
  const naturalRepairResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext, customerContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      outputMode: "natural_markdown_with_cards"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(plan)),
      writer: async () => {
        naturalRepairWriterCalls += 1;
        return createWriterResult(
          naturalRepairWriterCalls < 3
            ? createWriterAnswer()
            : createNaturalWriterAnswer()
        );
      },
      recordUsage: async () => undefined
    }
  );

  assert.equal(naturalRepairWriterCalls, 3);
  assert.match(naturalRepairResult.answer, /## 先把这次跟进的目标放对/);

  let rejectedNaturalWriterCalls = 0;
  await assert.rejects(() => generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext, customerContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      outputMode: "natural_markdown_with_cards"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(plan)),
      writer: async () => {
        rejectedNaturalWriterCalls += 1;
        return createWriterResult(createWriterAnswer());
      },
      recordUsage: async () => undefined
    }
  ), /回答未通过知识依据校验/);
  assert.equal(rejectedNaturalWriterCalls, 3);

  let repairPlannerCalls = 0;
  const repairedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      businessExecutionContext: "固定生成 3 条 AI 建议话术。"
    },
    {
      chat: async () => {
        repairPlannerCalls += 1;
        return createPlannerResponse(repairPlannerCalls === 1 ? "不是 JSON" : JSON.stringify(plan));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );

  assert.equal(repairPlannerCalls, 2);
  assert.equal(repairedResult.careerEvidencePlan.plannerRepairUsed, true);

  let stageRepairCalls = 0;
  const stageRepairedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      businessExecutionContext: "固定生成 3 条 AI 建议话术。"
    },
    {
      chat: async () => {
        stageRepairCalls += 1;
        return createPlannerResponse(JSON.stringify(
          stageRepairCalls === 1 ? { ...plan, stage: "closing" } : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );

  assert.equal(stageRepairCalls, 2);
  assert.equal(stageRepairedResult.careerEvidencePlan.stage, "follow_up");

  let missingFixedScriptCalls = 0;
  const missingFixedScriptResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        missingFixedScriptCalls += 1;
        return createPlannerResponse(JSON.stringify(
          missingFixedScriptCalls === 1
            ? { ...plan, fixedScriptCandidate: null }
            : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );
  assert.equal(missingFixedScriptCalls, 2);
  assert.equal(missingFixedScriptResult.careerEvidencePlan.fixedScript, followUpFixedQuote);

  let reversedSequenceCalls = 0;
  await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        reversedSequenceCalls += 1;
        return createPlannerResponse(JSON.stringify(
          reversedSequenceCalls === 1
            ? {
                ...plan,
                executionSequence: {
                  ...plan.executionSequence,
                  actionAnchors: [
                    "围绕关注点继续沟通",
                    "确认客户最关注哪一部分"
                  ]
                }
              }
            : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );
  assert.equal(reversedSequenceCalls, 2);

  const roleAwareCustomerContext: RagContext = {
    ...customerContext,
    content: [
      "客户(左侧)：我晚点再看看资料。",
      "我(右侧)：我是宝妈。"
    ].join("\n")
  };
  let roleAwarePlannerCalls = 0;
  await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext, roleAwareCustomerContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        roleAwarePlannerCalls += 1;
        return createPlannerResponse(JSON.stringify(
          roleAwarePlannerCalls === 1
            ? {
                ...plan,
                replyBlueprints: plan.replyBlueprints.map((item, index) => index === 0
                  ? { ...item, draft: `宝妈，${item.draft}` }
                  : item)
              }
            : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );
  assert.equal(roleAwarePlannerCalls, 2);

  let staleCustomerFactCalls = 0;
  await generateCareerMentorGroundedAnswer(
    "这是新客户，客户说晚点再看资料，不是宝妈。",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      recentConversation: [{
        role: "user",
        content: "上一个客户是宝妈，已经看过资料。"
      }]
    },
    {
      chat: async () => {
        staleCustomerFactCalls += 1;
        return createPlannerResponse(JSON.stringify(
          staleCustomerFactCalls === 1
            ? {
                ...plan,
                replyBlueprints: plan.replyBlueprints.map((item, index) => index === 0
                  ? { ...item, draft: `宝妈，${item.draft}` }
                  : item)
              }
            : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );
  assert.equal(staleCustomerFactCalls, 2);

  const naturalQuestionDrafts = [
    "您好，您先慢慢看资料，看完后把最想了解的部分告诉我就好。",
    replyDrafts[1],
    `${replyDrafts[2]}可以吗？`
  ];
  const naturalQuestionPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    replyBlueprints: plan.replyBlueprints.map((item, index) => ({
      ...item,
      draft: naturalQuestionDrafts[index]
    }))
  };
  let naturalQuestionPlannerCalls = 0;
  const naturalQuestionResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        naturalQuestionPlannerCalls += 1;
        return createPlannerResponse(JSON.stringify(naturalQuestionPlan));
      },
      writer: async () => createWriterResult(createWriterAnswer({
        drafts: naturalQuestionDrafts
      })),
      recordUsage: async () => undefined
    }
  );
  assert.equal(naturalQuestionPlannerCalls, 1);
  assert.equal(
    naturalQuestionResult.careerEvidencePlan.adaptiveReplies[2],
    naturalQuestionDrafts[2]
  );

  const continuationDrafts = [
    `传统老板，${replyDrafts[0]}`,
    replyDrafts[1],
    replyDrafts[2]
  ];
  const continuationPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    replyBlueprints: plan.replyBlueprints.map((item, index) => ({
      ...item,
      draft: continuationDrafts[index]
    }))
  };
  const continuationResult = await generateCareerMentorGroundedAnswer(
    "再换一个方案",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      recentConversation: [
        {
          role: "user",
          content: "客户说晚点再看资料，是传统服装店老板，已经发过资料。"
        },
        {
          role: "assistant",
          content: "上一版建议已提供。"
        }
      ]
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(continuationPlan)),
      writer: async () => createWriterResult(createWriterAnswer({ drafts: continuationDrafts })),
      recordUsage: async () => undefined
    }
  );
  assert.equal(continuationResult.careerEvidencePlan.adaptiveReplies[0], continuationDrafts[0]);

  let assistantOnlyFactCalls = 0;
  await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，再换一个方案",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      recentConversation: [{ role: "assistant", content: "客户是退休人员。" }]
    },
    {
      chat: async () => {
        assistantOnlyFactCalls += 1;
        return createPlannerResponse(JSON.stringify(
          assistantOnlyFactCalls === 1
            ? {
                ...plan,
                replyBlueprints: plan.replyBlueprints.map((item, index) => index === 0
                  ? { ...item, draft: `退休，${item.draft}` }
                  : item)
              }
            : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );
  assert.equal(assistantOnlyFactCalls, 2);

  let actionRepairCalls = 0;
  const actionRepairedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      businessExecutionContext: "固定生成 3 条 AI 建议话术。"
    },
    {
      chat: async () => {
        actionRepairCalls += 1;
        const ungroundedPlan = {
          ...plan,
          replyBlueprints: plan.replyBlueprints.map((item, index) => index === 0
            ? {
                ...item,
                goal: "立即成交",
                draft: "您好，请您现在立即付款并马上加入。"
              }
            : item)
        };
        return createPlannerResponse(JSON.stringify(actionRepairCalls === 1 ? ungroundedPlan : plan));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );

  assert.equal(actionRepairCalls, 2);
  assert.deepEqual(actionRepairedResult.careerEvidencePlan.adaptiveReplies, replyDrafts);

  let duplicatePlannerCalls = 0;
  const duplicateGuardResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        duplicatePlannerCalls += 1;
        const duplicatePlan = {
          ...plan,
          replyBlueprints: plan.replyBlueprints.map((item, index) => ({
            ...item,
            draft: `${["您好", "姐", "哥"][index]}，资料发出后，确认客户最关注哪一部分。`
          }))
        };
        return createPlannerResponse(JSON.stringify(
          duplicatePlannerCalls === 1 ? duplicatePlan : plan
        ));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  );
  assert.equal(duplicatePlannerCalls, 2);
  assert.deepEqual(duplicateGuardResult.careerEvidencePlan.adaptiveReplies, replyDrafts);

  for (const unsupportedDraft of [
    "资料发出后，我会免费送您一台手机，您先按自己的节奏看。",
    "资料发出后，我们安排专车接您，您先按自己的节奏看。",
    "资料发出后，我替您办理会员，您先按自己的节奏看。",
    "资料发出后，拉黑客户，再围绕关注点继续沟通。",
    "资料发出后先骗客户，再围绕关注点继续沟通。",
    "资料发出后先骂客户，再围绕关注点继续沟通。",
    "资料发出后删除客户，再围绕关注点继续沟通。"
  ]) {
    let unsupportedBenefitPlannerCalls = 0;
    const unsupportedBenefitResult = await generateCareerMentorGroundedAnswer(
      "客户说晚点再看资料，我怎么跟进？",
      [knowledgeContext],
      {
        provider: "deepseek",
        expectedStage: "follow_up"
      },
      {
        chat: async () => {
          unsupportedBenefitPlannerCalls += 1;
          const unsupportedBenefitPlan = {
            ...plan,
            replyBlueprints: plan.replyBlueprints.map((item, index) => index === 0
              ? { ...item, draft: unsupportedDraft }
              : item)
          };
          return createPlannerResponse(JSON.stringify(
            unsupportedBenefitPlannerCalls === 1 ? unsupportedBenefitPlan : plan
          ));
        },
        writer: async () => createWriterResult(createWriterAnswer()),
        recordUsage: async () => undefined
      }
    );

    assert.equal(unsupportedBenefitPlannerCalls, 2);
    assert.deepEqual(unsupportedBenefitResult.careerEvidencePlan.adaptiveReplies, replyDrafts);
  }

  const negatedActionContext: RagContext = {
    ...knowledgeContext,
    content: [
      knowledgeContext.content,
      "执行边界：不要让客户交钱，不要让客户签约，也不要让客户买单。"
    ].join("\n")
  };
  for (const negationInvertedDraft of [
    "先让客户交钱，再确认客户最关注哪一部分。",
    "先让客户签约，再确认客户最关注哪一部分。",
    "先让客户买单，再确认客户最关注哪一部分。"
  ]) {
    let negationPlannerCalls = 0;
    const negationGuardResult = await generateCareerMentorGroundedAnswer(
      "客户说晚点再看资料，我怎么跟进？",
      [negatedActionContext],
      {
        provider: "deepseek",
        expectedStage: "follow_up"
      },
      {
        chat: async () => {
          negationPlannerCalls += 1;
          const negationInvertedPlan = {
            ...plan,
            replyBlueprints: plan.replyBlueprints.map((item, index) => index === 0
              ? { ...item, draft: negationInvertedDraft }
              : item)
          };
          return createPlannerResponse(JSON.stringify(
            negationPlannerCalls === 1 ? negationInvertedPlan : plan
          ));
        },
        writer: async () => createWriterResult(createWriterAnswer()),
        recordUsage: async () => undefined
      }
    );
    assert.equal(negationPlannerCalls, 2);
    assert.deepEqual(negationGuardResult.careerEvidencePlan.adaptiveReplies, replyDrafts);
  }

  const customerFactQuestion = "客户李姐今年45岁，她说价格是500元，每天只有15分钟，资料发了怎么跟进？";
  const customerFactDrafts = [
    "您好，您每天只有15分钟，可以先按自己的节奏看，看完告诉我您最想了解哪一部分。",
    replyDrafts[1],
    replyDrafts[2]
  ];
  const customerFactPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    replyBlueprints: plan.replyBlueprints.map((item, index) => ({
      ...item,
      draft: customerFactDrafts[index]
    }))
  };
  const customerFactResult = await generateCareerMentorGroundedAnswer(
    customerFactQuestion,
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(customerFactPlan)),
      writer: async () => createWriterResult(createWriterAnswer({
        drafts: customerFactDrafts,
        judgementBasis: "客户李姐今年45岁，她说价格是500元，每天只有15分钟，资料发了，接下来要确认客户最关注哪一部分。"
      })),
      recordUsage: async () => undefined
    }
  );
  assert.deepEqual(customerFactResult.careerEvidencePlan.adaptiveReplies, customerFactDrafts);

  let repairWriterCalls = 0;
  let repairWriterBusinessContext = "";
  await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      businessExecutionContext: "固定生成 3 条 AI 建议话术。"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(plan)),
      writer: async (_question, _contexts, writerOptions) => {
        repairWriterCalls += 1;
        repairWriterBusinessContext = writerOptions?.businessExecutionContext ?? "";
        return createWriterResult(
          repairWriterCalls === 1
            ? "## 判断\n当前阶段：第二步。\n\n## 回复思路\n### 推荐执行流程\n1. 先确认关注点。"
            : createWriterAnswer()
        );
      },
      recordUsage: async () => undefined
    }
  );

  assert.equal(repairWriterCalls, 2);
  const actualRepairPrompt = buildRagPromptMessages(
    "客户说晚点再看资料，我怎么跟进？",
    [knowledgeContext],
    { businessExecutionContext: repairWriterBusinessContext }
  ).map((message) => message.content).join("\n");
  assert.match(actualRepairPrompt, /CAREER_WRITER_REPAIR_APP_VALIDATED/);
  for (const reply of replyDrafts) {
    assert.equal(actualRepairPrompt.includes(reply), true);
  }

  const unsupportedClaim = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "确认客户最关注哪一部分",
      "保证三个月月入五万元，再确认客户最关注哪一部分"
    ),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(unsupportedClaim.ok, false);
  assert.equal(unsupportedClaim.issues.includes("writer_unsupported_sensitive_claim"), true);

  const stageConflict = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "1. 确认客户最关注哪一部分。",
      "1. 现在立即要求客户付款并马上加入。"
    ),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(stageConflict.ok, false);
  assert.equal(stageConflict.issues.includes("writer_stage_action_conflict"), true);

  const reversedWriterFlow = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "1. 确认客户最关注哪一部分。\n2. 围绕关注点继续沟通。",
      "1. 围绕关注点继续沟通。\n2. 确认客户最关注哪一部分。"
    ),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(reversedWriterFlow.ok, false);
  assert.equal(
    reversedWriterFlow.issues.includes("writer_execution_flow_not_grounded"),
    true
  );

  const fabricatedCustomerState = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "客户说晚点再看资料，接下来要确认客户最关注哪一部分。",
      "客户刚刚失业并离婚，而且已经承诺购买。"
    ),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(fabricatedCustomerState.ok, false);
  assert.equal(fabricatedCustomerState.issues.includes("writer_judgement_not_grounded"), true);

  for (const fabricatedState of ["失业", "已婚", "怀孕", "有病", "破产", "离职"]) {
    const shortFabricatedCustomerState = validateCareerMentorWriterAnswer({
      answer: createWriterAnswer().replace(
        "判断依据：客户说晚点再看资料，接下来要确认客户最关注哪一部分。",
        `判断依据：客户说晚点再看资料，${fabricatedState}，接下来要确认客户最关注哪一部分。`
      ),
      plan,
      knowledgeContexts: [knowledgeContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？"
    });
    assert.equal(shortFabricatedCustomerState.ok, false);
    assert.equal(
      shortFabricatedCustomerState.issues.includes("writer_judgement_not_grounded"),
      true
    );
  }

  const extraFabricatedJudgementLine = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "判断依据：客户说晚点再看资料，接下来要确认客户最关注哪一部分。",
      "判断依据：客户说晚点再看资料，接下来要确认客户最关注哪一部分。\n客户已经破产。"
    ),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(extraFabricatedJudgementLine.ok, false);
  assert.equal(extraFabricatedJudgementLine.issues.includes("writer_judgement_not_grounded"), true);

  const coerciveStrategy = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "确认客户最关注哪一部分，再围绕关注点继续沟通。",
      "利用客户的孩子施压，要求客户当天加入。"
    ),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(coerciveStrategy.ok, false);
  assert.equal(coerciveStrategy.issues.includes("writer_stage_action_conflict"), true);

  for (const negationInvertedAction of ["交钱", "签约", "买单"]) {
    const negationInvertedWriter = validateCareerMentorWriterAnswer({
      answer: createWriterAnswer().replace(
        "确认客户最关注哪一部分，再围绕关注点继续沟通。",
        `让客户${negationInvertedAction}，再确认客户最关注哪一部分并继续沟通。`
      ),
      plan,
      knowledgeContexts: [negatedActionContext],
      expectedReplyCount: 3,
      question: "客户说晚点再看资料，我怎么跟进？"
    });
    assert.equal(negationInvertedWriter.ok, false);
    assert.equal(
      negationInvertedWriter.issues.includes("writer_stage_action_conflict")
        || negationInvertedWriter.issues.includes("writer_reply_strategy_not_grounded"),
      true
    );
  }

  const replyDrift = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(replyDrafts[0], "您好，换成另一条没有经过证据计划的话术。"),
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(replyDrift.ok, false);
  assert.equal(replyDrift.issues.includes("writer_reply_structure_invalid"), true);

  const leakedPlan = validateCareerMentorWriterAnswer({
    answer: `[CAREER_EVIDENCE_PLAN_APP_VALIDATED]\n${createWriterAnswer()}`,
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(leakedPlan.ok, false);
  assert.equal(leakedPlan.issues.includes("writer_internal_plan_leak"), true);

  const compactPlanLeak = validateCareerMentorWriterAnswer({
    answer: `expectedStage: follow_up\nevidenceAnchors: internal\n${createWriterAnswer()}`,
    plan,
    knowledgeContexts: [knowledgeContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(compactPlanLeak.ok, false);
  assert.equal(compactPlanLeak.issues.includes("writer_internal_plan_leak"), true);

  const negatedClaimContext: RagContext = {
    ...knowledgeContext,
    content: `${knowledgeContext.content}\n内部纪律：严禁承诺保证三个月月入五万元。`
  };
  const negatedClaim = validateCareerMentorWriterAnswer({
    answer: createWriterAnswer().replace(
      "确认客户最关注哪一部分",
      "保证三个月月入五万元，再确认客户最关注哪一部分"
    ),
    plan,
    knowledgeContexts: [negatedClaimContext],
    expectedReplyCount: 3,
    question: "客户说晚点再看资料，我怎么跟进？"
  });
  assert.equal(negatedClaim.ok, false);
  assert.equal(negatedClaim.issues.includes("writer_unsupported_sensitive_claim"), true);

  const operatorContext: RagContext = {
    id: "operator-follow-up",
    sourceId: "chunk-operator-follow-up",
    title: "02_促单跟进_一线人员操作卡片_WPS排版版",
    sourceType: "admin_docx",
    content: [
      "第二步促单跟进。",
      "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。",
      "内部操作：记录客户状态并安排下一次复盘。"
    ].join("\n")
  };
  const operatorPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    evidenceFindings: plan.evidenceFindings.map((finding) => ({
      ...finding,
      evidenceId: "chunk-operator-follow-up"
    })),
    replyBlueprints: plan.replyBlueprints.map((item) => ({
      ...item,
      evidenceIds: ["chunk-operator-follow-up"]
    })),
    fixedScriptCandidate: {
      text: "内部操作：记录客户状态并安排下一次复盘。",
      evidenceId: "chunk-operator-follow-up"
    }
  };
  let operatorPlannerCalls = 0;
  await assert.rejects(() => generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [operatorContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        operatorPlannerCalls += 1;
        return createPlannerResponse(JSON.stringify(operatorPlan));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  ), /暂未完成知识证据校验/);
  assert.equal(operatorPlannerCalls, 2);

  const customerCardInternalContext: RagContext = {
    ...knowledgeContext,
    id: "customer-card-internal",
    sourceId: "chunk-customer-card-internal",
    content: [
      "第二步促单跟进。",
      "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。",
      "本段用于说明执行边界。".repeat(24),
      "使用提醒：不要连续追问客户。"
    ].join("\n")
  };
  const customerCardInternalPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    evidenceFindings: [{
      evidenceId: "chunk-customer-card-internal",
      supportingQuotes: [
        "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。"
      ]
    }],
    replyBlueprints: plan.replyBlueprints.map((item) => ({
      ...item,
      evidenceIds: ["chunk-customer-card-internal"]
    })),
    fixedScriptCandidate: {
      text: "不要连续追问客户。",
      evidenceId: "chunk-customer-card-internal"
    }
  };
  let customerCardInternalCalls = 0;
  await assert.rejects(() => generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [customerCardInternalContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        customerCardInternalCalls += 1;
        return createPlannerResponse(JSON.stringify(customerCardInternalPlan));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  ), /暂未完成知识证据校验/);
  assert.equal(customerCardInternalCalls, 2);

  const negatedCustomerScriptContext: RagContext = {
    ...knowledgeContext,
    id: "negated-customer-script",
    sourceId: "chunk-negated-customer-script",
    content: [
      "第二步促单跟进。",
      "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。",
      "以下内容不是客户话术，仅供内部使用：不要连续追问客户。"
    ].join("\n")
  };
  const negatedCustomerScriptPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    evidenceFindings: [{
      evidenceId: "chunk-negated-customer-script",
      supportingQuotes: [
        "资料发出后，跟进重点是确认客户最关注哪一部分，再围绕关注点继续沟通。"
      ]
    }],
    replyBlueprints: plan.replyBlueprints.map((item) => ({
      ...item,
      evidenceIds: ["chunk-negated-customer-script"]
    })),
    fixedScriptCandidate: {
      text: "不要连续追问客户。",
      evidenceId: "chunk-negated-customer-script"
    }
  };
  let negatedCustomerScriptCalls = 0;
  await assert.rejects(() => generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [negatedCustomerScriptContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        negatedCustomerScriptCalls += 1;
        return createPlannerResponse(JSON.stringify(negatedCustomerScriptPlan));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  ), /暂未完成知识证据校验/);
  assert.equal(negatedCustomerScriptCalls, 2);

  const multilineFixedContext: RagContext = {
    ...knowledgeContext,
    id: "multiline-fixed",
    sourceId: "chunk-multiline-fixed",
    content: `${knowledgeContext.content}\n固定话术：第一句。\n第二句。`
  };
  const multilineFixedPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    evidenceFindings: [{
      evidenceId: "chunk-multiline-fixed",
      supportingQuotes: [
        followUpActionQuote,
        followUpFixedQuote
      ]
    }],
    executionSequence: {
      evidenceId: "chunk-multiline-fixed",
      supportingQuote: followUpActionQuote,
      actionAnchors: [
        "确认客户最关注哪一部分",
        "围绕关注点继续沟通"
      ]
    },
    replyBlueprints: plan.replyBlueprints.map((item) => ({
      ...item,
      evidenceIds: ["chunk-multiline-fixed"]
    })),
    fixedScriptCandidate: {
      text: "第一句。\n第二句。",
      evidenceId: "chunk-multiline-fixed"
    }
  };
  const multilineFixedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [multilineFixedContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(multilineFixedPlan)),
      writer: async () => createWriterResult(createWriterAnswer({
        fixedScript: "第一句。\n第二句。"
      })),
      recordUsage: async () => undefined
    }
  );
  assert.equal(multilineFixedResult.careerEvidencePlan.fixedScript, "第一句。\n第二句。");

  const annotatedFixedScript = "资料您先看完。看完告诉我您最关注哪一部分。";
  const annotatedFixedContext: RagContext = {
    ...knowledgeContext,
    id: "annotated-fixed",
    sourceId: "chunk-annotated-fixed",
    content: [
      "第二步促单跟进。",
      followUpActionQuote,
      `固定话术：${followUpFixedQuote}`,
      "固定话术：资料您先看完。（配图：资料截图）看完告诉我您最关注哪一部分。"
    ].join("\n")
  };
  const annotatedFixedPlan: CareerMentorEvidencePlanV1 = {
    ...plan,
    evidenceFindings: [{
      evidenceId: "chunk-annotated-fixed",
      supportingQuotes: [followUpActionQuote, followUpFixedQuote]
    }],
    executionSequence: {
      evidenceId: "chunk-annotated-fixed",
      supportingQuote: followUpActionQuote,
      actionAnchors: [
        "确认客户最关注哪一部分",
        "围绕关注点继续沟通"
      ]
    },
    replyBlueprints: plan.replyBlueprints.map((item) => ({
      ...item,
      evidenceIds: ["chunk-annotated-fixed"]
    })),
    fixedScriptCandidate: {
      text: annotatedFixedScript,
      evidenceId: "chunk-annotated-fixed"
    }
  };
  const annotatedFixedResult = await generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [annotatedFixedContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(annotatedFixedPlan)),
      writer: async () => createWriterResult(createWriterAnswer({
        fixedScript: annotatedFixedScript
      })),
      recordUsage: async () => undefined
    }
  );
  assert.equal(annotatedFixedResult.careerEvidencePlan.fixedScript, annotatedFixedScript);

  let alteredMultilineCalls = 0;
  await assert.rejects(() => generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [multilineFixedContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up"
    },
    {
      chat: async () => {
        alteredMultilineCalls += 1;
        return createPlannerResponse(JSON.stringify({
          ...multilineFixedPlan,
          fixedScriptCandidate: {
            text: "第一句。\n第二句！",
            evidenceId: "chunk-multiline-fixed"
          }
        }));
      },
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  ), /暂未完成知识证据校验/);
  assert.equal(alteredMultilineCalls, 2);

  const iceSequenceQuote = "第一步破冰：观察头像和朋友圈→说明姓名职业→共同经历→三句话说明事业→发送资料。";
  const iceEmpathyQuote = "理解您的情况，交流共同经历。";
  const iceQuestionQuote = "方便先了解您的职业吗？";
  const iceFixedQuote = "您好，看到您的朋友圈很有生活气息，方便认识一下吗？";
  const iceContext: RagContext = {
    id: "ice-complete-sequence",
    sourceId: "chunk-ice-complete-sequence",
    title: "01_破冰_客户可复制话术卡片_WPS排版版",
    sourceType: "admin_docx",
    content: [
      iceSequenceQuote,
      iceEmpathyQuote,
      iceQuestionQuote,
      `固定话术：${iceFixedQuote}`
    ].join("\n")
  };
  const iceDrafts = [
    iceFixedQuote,
    `您好，${iceEmpathyQuote}`,
    `您好，${iceQuestionQuote}`
  ];
  const icePlan: CareerMentorEvidencePlanV1 = {
    version: CAREER_MENTOR_EVIDENCE_PLAN_VERSION,
    stage: "ice_breaking",
    customerState: "陌生客户尚未建立信任。",
    completedActions: [],
    responseFocus: "按第一步破冰完整建立连接。",
    evidenceFindings: [{
      evidenceId: "chunk-ice-complete-sequence",
      supportingQuotes: [
        iceSequenceQuote,
        iceEmpathyQuote,
        iceQuestionQuote,
        iceFixedQuote
      ]
    }],
    executionSequence: {
      evidenceId: "chunk-ice-complete-sequence",
      supportingQuote: iceSequenceQuote,
      actionAnchors: [
        "观察头像和朋友圈",
        "说明姓名职业",
        "共同经历",
        "三句话说明事业",
        "发送资料"
      ]
    },
    replyBlueprints: [
      {
        style: "稳妥自然型",
        goal: "自然认识客户。",
        draft: iceDrafts[0],
        evidenceIds: ["chunk-ice-complete-sequence"],
        supportingQuote: iceFixedQuote
      },
      {
        style: "共情引导型",
        goal: "从共同经历建立共鸣。",
        draft: iceDrafts[1],
        evidenceIds: ["chunk-ice-complete-sequence"],
        supportingQuote: iceEmpathyQuote
      },
      {
        style: "轻问推进型",
        goal: "轻问职业信息。",
        draft: iceDrafts[2],
        evidenceIds: ["chunk-ice-complete-sequence"],
        supportingQuote: iceQuestionQuote
      }
    ],
    fixedScriptCandidate: {
      text: iceFixedQuote,
      evidenceId: "chunk-ice-complete-sequence"
    },
    missingInformation: [],
    forbiddenClaims: ["不得跳过破冰直接成交"]
  };
  const iceWriterAnswer = [
    "## 判断",
    "当前阶段：第一步破冰。",
    "调用步骤：破冰。",
    "判断依据：陌生客户需要先观察头像和朋友圈。",
    "",
    "## 回复思路",
    "观察头像和朋友圈，说明姓名职业，共同经历，三句话说明事业，发送资料。",
    "",
    "### 推荐执行流程",
    "1. 观察头像和朋友圈。",
    "2. 说明姓名职业。",
    "3. 共同经历。",
    "4. 三句话说明事业。",
    "5. 发送资料。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${iceDrafts[0]}`,
    "",
    "#### AI建议话术 2（共情引导型）",
    `> ${iceDrafts[1]}`,
    "",
    "#### AI建议话术 3（轻问推进型）",
    `> ${iceDrafts[2]}`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${iceFixedQuote}`
  ].join("\n");
  let incompleteSequenceCalls = 0;
  const iceSequenceResult = await generateCareerMentorGroundedAnswer(
    "陌生客户需要先观察头像和朋友圈，怎么破冰？",
    [iceContext],
    {
      provider: "deepseek",
      expectedStage: "ice_breaking"
    },
    {
      chat: async () => {
        incompleteSequenceCalls += 1;
        return createPlannerResponse(JSON.stringify(
          incompleteSequenceCalls === 1
            ? {
                ...icePlan,
                executionSequence: {
                  evidenceId: "chunk-ice-complete-sequence",
                  supportingQuote: iceSequenceQuote,
                  actionAnchors: ["观察头像和朋友圈"]
                }
              }
            : icePlan
        ));
      },
      writer: async () => createWriterResult(iceWriterAnswer),
      recordUsage: async () => undefined
    }
  );
  assert.equal(incompleteSequenceCalls, 2);
  assert.equal(iceSequenceResult.careerEvidencePlan.stage, "ice_breaking");

  const objectionQuote = "第四步锁定问题：客户说贵时，先认可客户的顾虑，再解释核心价值。";
  const closingActionQuote = "第五步成交：先做价值确认，再确认行动时间，最后降低行动阻力。";
  const closingQuestionQuote = "行动时间可以这样问：您想选择什么时间行动？";
  const closingFixedQuote = "方向认可后，我们一起确认行动时间。";
  const mixedFourthFifthQuote = [objectionQuote, closingActionQuote].join("\n");
  const mixedFourthFifthContext: RagContext = {
    id: "mixed-four-five",
    sourceId: "chunk-mixed-four-five",
    title: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版",
    sourceType: "admin_docx",
    content: [
      objectionQuote,
      closingActionQuote,
      closingQuestionQuote,
      `固定话术：${closingFixedQuote}`
    ].join("\n")
  };
  const closingDrafts = [
    `您好，${closingFixedQuote}`,
    "您好，不着急，先做价值确认，再确认行动时间。",
    `您好，${closingQuestionQuote}`
  ];
  const closingPlan: CareerMentorEvidencePlanV1 = {
    version: CAREER_MENTOR_EVIDENCE_PLAN_VERSION,
    stage: "closing",
    customerState: "客户已经认可，但迟迟没有行动。",
    completedActions: ["已完成价值讲解"],
    responseFocus: "确认行动时间并降低行动阻力。",
    evidenceFindings: [{
      evidenceId: "chunk-mixed-four-five",
      supportingQuotes: [closingActionQuote, closingQuestionQuote, closingFixedQuote]
    }],
    executionSequence: {
      evidenceId: "chunk-mixed-four-five",
      supportingQuote: closingActionQuote,
      actionAnchors: ["价值确认", "确认行动时间", "降低行动阻力"]
    },
    replyBlueprints: [
      {
        style: "稳妥自然型",
        goal: "自然确认下一步。",
        draft: closingDrafts[0],
        evidenceIds: ["chunk-mixed-four-five"],
        supportingQuote: closingFixedQuote
      },
      {
        style: "共情引导型",
        goal: "降低压力并确认时间。",
        draft: closingDrafts[1],
        evidenceIds: ["chunk-mixed-four-five"],
        supportingQuote: closingActionQuote
      },
      {
        style: "轻问推进型",
        goal: "用轻问确认行动时间。",
        draft: closingDrafts[2],
        evidenceIds: ["chunk-mixed-four-five"],
        supportingQuote: closingQuestionQuote
      }
    ],
    fixedScriptCandidate: {
      text: closingFixedQuote,
      evidenceId: "chunk-mixed-four-five"
    },
    missingInformation: [],
    forbiddenClaims: ["不得跳过问题直接施压成交"]
  };
  const closingWriterAnswer = [
    "## 判断",
    "当前阶段：第五步成交。",
    "调用步骤：成交。",
    "判断依据：客户已经认可，接下来要做价值确认。",
    "",
    "## 回复思路",
    "做价值确认，再确认行动时间，最后降低行动阻力。",
    "",
    "### 推荐执行流程",
    "1. 价值确认。",
    "2. 确认行动时间。",
    "3. 降低行动阻力。",
    "",
    "### AI思考回复话术",
    "#### AI建议话术 1（稳妥自然型）",
    `> ${closingDrafts[0]}`,
    "",
    "#### AI建议话术 2（共情引导型）",
    `> ${closingDrafts[1]}`,
    "",
    "#### AI建议话术 3（轻问推进型）",
    `> ${closingDrafts[2]}`,
    "",
    "## 可复制给客户",
    "### 话术 1",
    `> ${closingFixedQuote}`
  ].join("\n");
  let mixedStagePlannerCalls = 0;
  const mixedStageResult = await generateCareerMentorGroundedAnswer(
    "客户已经认可，但迟迟不行动怎么办？",
    [mixedFourthFifthContext],
    {
      provider: "deepseek",
      expectedStage: "closing"
    },
    {
      chat: async () => {
        mixedStagePlannerCalls += 1;
        return createPlannerResponse(JSON.stringify(
          mixedStagePlannerCalls === 1
            ? {
                ...closingPlan,
                evidenceFindings: [{
                  evidenceId: "chunk-mixed-four-five",
                  supportingQuotes: [mixedFourthFifthQuote]
                }]
              }
            : closingPlan
        ));
      },
      writer: async () => createWriterResult(closingWriterAnswer),
      recordUsage: async () => undefined
    }
  );
  assert.equal(mixedStagePlannerCalls, 2);
  assert.equal(mixedStageResult.careerEvidencePlan.stage, "closing");
  assert.deepEqual(mixedStageResult.careerEvidencePlan.adaptiveReplies, closingDrafts);

  await assert.rejects(() => generateCareerMentorGroundedAnswer(
    "客户说晚点再看资料，我怎么跟进？",
    [customerContext],
    {
      provider: "deepseek",
      expectedStage: "follow_up",
      businessExecutionContext: "固定生成 3 条 AI 建议话术。"
    },
    {
      chat: async () => createPlannerResponse(JSON.stringify(plan)),
      writer: async () => createWriterResult(createWriterAnswer()),
      recordUsage: async () => undefined
    }
  ), /没有可验证的知识证据/);

  console.log("ai-chat career grounded answer tests passed");
}

void main();
