import type { RetrievedRagChunk } from "@/lib/rag/search";

export const CAREER_MENTOR_POLICY_VERSION = "career-mentor-five-step-context-lock-v8";
export const CAREER_MENTOR_RETRIEVAL_TOP_K = 14;
export const CAREER_MENTOR_FAST_RETRIEVAL_TOP_K = 8;

export type CareerMentorCoreStage =
  | "ice_breaking"
  | "follow_up"
  | "career_presentation"
  | "objection_handling"
  | "closing";

export type CareerMentorStage =
  | "framework"
  | CareerMentorCoreStage
  | "maintenance"
  | "unknown";

export type CareerMentorScene =
  | "career"
  | "investment"
  | "invitation"
  | "objection"
  | "closing"
  | "follow_up"
  | "maintenance"
  | "general";

export interface CareerMentorScopeInput {
  agentId?: unknown;
  expertId?: unknown;
  knowledgeBaseId?: unknown;
  kbId?: unknown;
  namespace?: unknown;
}

export interface CareerMentorClassification {
  scene: CareerMentorScene;
  sceneLabel: string;
  stage: CareerMentorStage;
  stageLabel: string;
  retrievalTerms: string[];
}

export interface CareerMentorConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface CareerMentorTurnContext {
  scenarioQuestion: string;
  supportingContext: string;
  continuationRequested: boolean;
  conversationContextApplied: boolean;
  anchorQuestion: string | null;
  currentStage: CareerMentorStage;
  resolvedStage: CareerMentorStage;
}

export interface CareerMentorStageModel {
  stage: CareerMentorCoreStage;
  step: 1 | 2 | 3 | 4 | 5;
  label: string;
  objective: string;
  psychologicalGoal: string;
  entryCondition: string;
  flow: readonly string[];
  retrievalTerms: readonly string[];
}

export const CAREER_MENTOR_KNOWLEDGE_TREE: readonly CareerMentorStageModel[] = [
  {
    stage: "ice_breaking",
    step: 1,
    label: "第一步：破冰",
    objective: "从陌生关系建立信任并发送资料",
    psychologicalGoal: "回答客户心里的‘你是谁、为什么我要听你讲’",
    entryCondition: "客户刚进入、不了解沟通者，或尚未完成自我介绍和资料发送",
    flow: ["感受客户", "自我介绍", "精准共鸣", "三句话内简单介绍事业", "发送资料并结束主动聊天"],
    retrievalTerms: ["第一步", "破冰", "破冰四步", "感受客户", "自我介绍", "精准共鸣", "建立信任", "发视频资料", "暴力破冰", "不闲聊", "话术"]
  },
  {
    stage: "follow_up",
    step: 2,
    label: "第二步：促单跟进",
    objective: "在客户看资料阶段持续展示价值并提升兴趣",
    psychologicalGoal: "让客户通过持续证据产生兴趣，而不是感到被催促",
    entryCondition: "已经完成破冰或发送资料，客户尚未主动深入了解或只是没有回复",
    flow: ["确认破冰和资料发送已完成", "按客户状态选择价值素材", "前期高频展示后持续跟进", "等待客户主动咨询", "进入讲事业"],
    retrievalTerms: ["第二步", "促单跟进", "持续展示", "客户不回复", "价值素材", "软炸弹", "原子弹", "展示火爆", "展示简单", "展示收益", "美好生活", "时间自由", "真实故事", "话术"]
  },
  {
    stage: "career_presentation",
    step: 3,
    label: "第三步：讲事业",
    objective: "让客户从感兴趣走向认可并产生行动意愿",
    psychologicalGoal: "先建立讲解者信念，再让客户理解行业与产品、利润空间、可持续赚钱三项标准",
    entryCondition: "客户主动想了解事业、如何参与或具体怎么做",
    flow: ["内部通心：公司价值、团队价值、个人价值", "要求客户认真听并建立三项判断标准", "拆解行业与产品、利润空间和可持续赚钱", "说明如何成为经营者", "强化加入的好处并遵守七条注意事项"],
    retrievalTerms: ["第三步", "讲事业", "讲事业通心", "讲口五步", "三个核心问题", "行业与产品", "利润空间", "可持续赚钱", "如何成为经营者", "加入的好处", "讲事业注意事项", "七条执行纪律", "话术"]
  },
  {
    stage: "objection_handling",
    step: 4,
    label: "第四步：锁定问题",
    objective: "识别并解决阻碍客户行动的真实问题",
    psychologicalGoal: "不被表面问题带节奏，把沟通带回客户真正关心的核心价值",
    entryCondition: "客户提出疑问、价格异议、信任问题、时间问题、比较、犹豫或考虑",
    flow: ["认可客户感受", "用一句话完成转移", "解释命中资料中的核心价值", "确认问题是否解除"],
    retrievalTerms: ["第四五步", "第四步", "锁定问题", "解决问题", "异议处理", "认可", "一句话转移", "三板斧", "三次考虑", "信任展示", "贵", "靠谱吗", "没时间", "考虑", "比较", "话术"]
  },
  {
    stage: "closing",
    step: 5,
    label: "第五步：成交",
    objective: "把客户的认可转化为一个明确行动",
    psychologicalGoal: "确认价值、明确行动时间并降低行动阻力",
    entryCondition: "客户已经认可，但迟迟不加入、不付款、不下单或没有推进下一步",
    flow: ["确认客户认可的价值", "确定行动时间", "降低行动阻力", "推进一次具体行动", "出现新问题时回到第四步再继续推进"],
    retrievalTerms: ["第四五步", "第五步", "成交", "扎口袋成交", "三板斧", "三次考虑", "信任展示", "认可但不行动", "不加入", "不付款", "行动时间", "降低阻力", "推进下一步", "话术"]
  }
] as const;

const CAREER_AGENT_ALIASES = new Set([
  "expert-career",
  "expert-business",
  "expert-agent-expert-career",
  "agent-expert-career",
  "讲事业导师",
  "事业导师",
  "business-coach",
  "career-mentor"
]);

const CAREER_KNOWLEDGE_BASE_ALIASES = new Set([
  "kb-business-coach",
  "kb-career-mentor",
  "kb:expert-agent-expert-career",
  "讲事业导师",
  "事业导师",
  "business-coach",
  "career-mentor"
]);

const CAREER_SIGNAL_TERMS = [
  "沟通五步骤",
  "沟通五步",
  "破冰视频",
  "破冰",
  "宝妈",
  "新人",
  "促单跟进",
  "跟进",
  "不回复",
  "已读不回",
  "不说话",
  "沉默",
  "一周",
  "三个月",
  "讲事业通心",
  "讲事业流程",
  "讲事业注意事项",
  "讲事业",
  "通心",
  "公司价值",
  "团队价值",
  "个人价值",
  "讲事业注意事项",
  "三个核心问题",
  "锁定问题",
  "解决问题",
  "扎口袋成交",
  "扎口袋",
  "转让促",
  "生死促",
  "异议处理",
  "异议",
  "犹豫",
  "考虑",
  "比较",
  "担心",
  "贵",
  "靠谱吗",
  "没有时间",
  "认可",
  "不加入",
  "不行动",
  "不付款",
  "长期维护",
  "邀约",
  "招商",
  "销售团队",
  "代理",
  "经销商",
  "批发"
] as const;

const CAREER_MENTOR_KNOWLEDGE_LAYER_TERMS = [
  "客户可复制话术卡片",
  "一线人员操作卡片",
  "完整课程精读笔记",
  "可直接转发",
  "话术全文",
  "完整话术",
  "一字不差",
  "标准回应",
  "文案示例"
] as const;

const STAGE_CONFIG: Record<CareerMentorStage, { label: string; terms: string[] }> = {
  framework: {
    label: "讲事业沟通五步整体流程",
    terms: ["沟通五步骤", "破冰", "促单跟进", "讲事业", "锁定问题", "成交", "长期客户维护"]
  },
  ice_breaking: {
    label: "第一步：破冰",
    terms: [...CAREER_MENTOR_KNOWLEDGE_TREE[0].retrievalTerms]
  },
  follow_up: {
    label: "第二步：促单跟进",
    terms: [...CAREER_MENTOR_KNOWLEDGE_TREE[1].retrievalTerms]
  },
  career_presentation: {
    label: "第三步：讲事业",
    terms: [...CAREER_MENTOR_KNOWLEDGE_TREE[2].retrievalTerms]
  },
  objection_handling: {
    label: "第四步：锁定问题",
    terms: [...CAREER_MENTOR_KNOWLEDGE_TREE[3].retrievalTerms]
  },
  closing: {
    label: "第五步：成交",
    terms: [...CAREER_MENTOR_KNOWLEDGE_TREE[4].retrievalTerms]
  },
  maintenance: {
    label: "成交后：长期客户维护",
    terms: ["成交后", "长期客户维护", "老客户", "持续关系", "复购", "售后", "跟进", "维护"]
  },
  unknown: {
    label: "待结合客户原话定位阶段",
    terms: ["沟通五步骤", "客户原话", "当前阶段", "已执行动作", "操作", "话术"]
  }
};

const SCENE_LABELS: Record<CareerMentorScene, string> = {
  career: "讲事业",
  investment: "招商",
  invitation: "邀约",
  objection: "异议处理",
  closing: "成交推进",
  follow_up: "客户跟进",
  maintenance: "长期客户维护",
  general: "讲事业沟通"
};

function normalizeScopeValue(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeContent(value: string) {
  return value
    .toLowerCase()
    .replace(/\u0000/g, "")
    .replace(/[^0-9a-z\u4e00-\u9fff]+/gi, "")
    .trim();
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function collectSignalTerms(value: string) {
  const normalized = normalizeContent(value);

  return CAREER_SIGNAL_TERMS
    .filter((term) => normalized.includes(normalizeContent(term)))
    .sort((left, right) => right.length - left.length);
}

const CAREER_MENTOR_CONTINUATION_PATTERNS = [
  /^(?:请)?(?:再)?换一组(?:吧|看看)?$/,
  /^(?:请)?(?:再)?换(?:一)?(?:个|种|版)?(?:更(?:简短|自然|口语|温和|专业|委婉|直接|详细|强势)的?)?(?:方案|说法|版本|回答|回复|话术|建议|思路|表达|风格)(?:吧|看看)?$/,
  /^(?:请)?(?:再|重新|另外)(?:(?:给我)?(?:来|写|生成|整理)|给(?:我)?)(?:一)?(?:个|条|种|版)?(?:更(?:简短|自然|口语|温和|专业|委婉|直接|详细|强势)的?)?(?:方案|说法|版本|回答|回复|话术|建议|思路|表达|风格)?(?:吧|看看)?$/,
  /^(?:这个|上一个|上一版|刚才的|前面的)(?:回答|方案|话术|版本|说法)?(?:不满意|不合适|不好|不行|不够自然|太长|太短|太生硬)(?:想)?(?:(?:再)?换(?:一)?(?:个|种|版)?(?:方案|说法|版本|回答|回复|话术|建议|思路|表达|风格)?|重新(?:给|来|写|生成)(?:我)?(?:一)?(?:个|条|版)?(?:方案|说法|版本|回答|回复|话术|建议|思路|表达|风格)?)?$/,
  /^(?:还有|再给)(?:别的|其他)?(?:方案|说法|版本|回答|回复|话术|建议|思路|表达|风格)(?:吗|么)?$/,
  /^(?:再)?(?:简短|精简|自然|口语|温和|直接|详细|专业|强势|委婉)(?:一?点|一些)$/
] as const;

export function isCareerMentorContinuationRequest(question: string) {
  const text = question
    .normalize("NFKC")
    .replace(/[\s，,。！？!?；;：:]+/g, "")
    .trim();
  const hasNewBusinessFacts = /客户|顾客|对方|宝妈|宝爸|老板|新人|产品|价格|资料|视频|破冰|跟进|事业|加入|成交|付款|靠谱|考虑|阶段/.test(text);

  return text.length > 0
    && text.length <= 60
    && !hasNewBusinessFacts
    && CAREER_MENTOR_CONTINUATION_PATTERNS.some((pattern) => pattern.test(text));
}

export function isCareerMentorScope(input: CareerMentorScopeInput) {
  const agentValues = [input.agentId, input.expertId]
    .map(normalizeScopeValue)
    .filter(Boolean);
  const knowledgeValues = [input.knowledgeBaseId, input.kbId, input.namespace]
    .map(normalizeScopeValue)
    .filter(Boolean);

  const hasCareerAgent = agentValues.some((value) => CAREER_AGENT_ALIASES.has(value));
  const hasCareerKnowledgeBase = knowledgeValues.some((value) => CAREER_KNOWLEDGE_BASE_ALIASES.has(value));

  return hasCareerAgent && hasCareerKnowledgeBase;
}

export function classifyCareerMentorQuestion(question: string, supportingContext = ""): CareerMentorClassification {
  const text = `${question}\n${supportingContext}`;
  const normalizedQuestion = normalizeContent(question);
  const normalizedSupportingContext = normalizeContent(supportingContext);
  const normalized = normalizeContent(text);
  let stage: CareerMentorStage = "unknown";

  const needsIceBreakPattern = /不知道你是谁|不了解你是谁|不了解我是谁|不认识你|刚加(?:上|到)?|刚认识|陌生客户|新客户|还没破冰|没有破冰|未破冰|还没自我介绍|没有自我介绍|还没发资料|没有发资料|没发资料/;
  const progressPattern = /破冰完成|已经破冰|破过冰|发完(?:视频|资料)|发了(?:视频|资料)|已经发(?:视频|资料)|看完(?:视频|资料)|看了(?:视频|资料)|已看(?:视频|资料)|已经了解|讲完事业|听完事业|认可|认同/;
  const materialSentPattern = /(?:给.{0,8}客户)?(?:发|发送).{0,6}(?:破冰)?(?:视频|资料)(?:了|完|后|之后)?/;
  const materialNotSentPattern = /(?:还没|没有|没|未).{0,12}(?:发|发送).{0,6}(?:破冰)?(?:视频|资料)/;
  const followUpIntentPattern = /怎么跟进|如何跟进|接下来|下一步|然后|之后/;
  const questionNeedsIceBreak = needsIceBreakPattern.test(normalizedQuestion)
    || materialNotSentPattern.test(normalizedQuestion);
  const questionShowsMaterialSent = materialSentPattern.test(normalizedQuestion)
    && !materialNotSentPattern.test(normalizedQuestion);
  const questionShowsProgress = progressPattern.test(normalizedQuestion) || questionShowsMaterialSent;
  const contextNeedsIceBreak = needsIceBreakPattern.test(normalizedSupportingContext)
    || materialNotSentPattern.test(normalizedSupportingContext);
  const contextShowsProgress = progressPattern.test(normalizedSupportingContext)
    || (
      materialSentPattern.test(normalizedSupportingContext)
      && !materialNotSentPattern.test(normalizedSupportingContext)
    );
  const needsIceBreak = questionNeedsIceBreak
    || (!questionShowsProgress && contextNeedsIceBreak && !contextShowsProgress);
  const closingSignal = /(?:认可|认同|同意|答应|说可以|觉得(?:很好|不错|可以)|已经(?:清楚|明白|看懂|了解)).{0,16}(?:不加入|没加入|没有加入|不行动|没行动|没有行动|迟迟不动|不付款|没付款|不下单|没下单|不决定|没决定|不推进|一直拖|拖着|拖延)|(?:不加入|没加入|没有加入|不行动|没行动|没有行动|迟迟不动|不付款|没付款|不下单|没下单|一直拖|拖着|拖延).{0,16}(?:认可|认同|同意|答应|说可以|觉得(?:很好|不错|可以))|(?:怎么|如何)(?:付款|支付|下单)|付款方式|支付方式/;
  const objectionSignal = /锁定问题|解决问题|异议|犹豫|考虑|再想想|担心|顾虑|有疑问|没钱|没有钱|没时间|没有时间|太忙|风险|说贵|觉得贵|认为贵|嫌贵|太贵|有点贵|产品.{0,6}贵|价格|费用|预算|靠谱|可靠|可信|信任|不相信|不信|正规吗|合法(?:吗|不)|比较|对比|别家|其他项目|像(?:传销|直销|微商)|拒绝/;
  const presentationSignal = /讲事业|讲事业通心|讲公司|讲行业|讲产品|讲利润|利润空间|持续赚钱|公司价值|团队价值|个人价值|讲事业注意事项|三个核心问题|事业机会|事业价值|主动.{0,8}(?:了解|咨询)|想.{0,8}(?:了解|知道).{0,8}(?:事业|怎么做|如何做|参与)|(?:怎么|如何)(?:参与|加入|做这个事业)|要求认真听/;
  const followUpSignal = /破冰视频.{0,8}(?:接下来|然后|之后|以后|发完|发了)|促单跟进|持续展示|已经了解.{0,12}(?:没行动|没有行动|还没行动)|看(?:完|过|了)(?:视频|资料).{0,12}(?:没行动|没有行动|不回复|没回复)|(?:视频|资料).{0,12}(?:怎么跟进|如何跟进|晚点再看|稍后再看|再看看|还在看)|(?:晚点|稍后|改天)(?:再)?看(?:视频|资料)|不回复|没回复|已读不回|不说话|沉默|没反应|一周|三个月|再次联系|继续聊/;
  const maintenanceMilestone = /成交后|成交以后|成交之后|已经成交|已成交|加入以后|加入之后|已经加入|老客户|长期客户/;
  const maintenanceTopic = /维护|持续关系|售后|复购|服务|跟进|下一步|怎么办/;
  const frameworkSignal = /(?:沟通五步|沟通五步骤)(?:是什么|有哪些|包括什么|怎么走|完整流程|整体流程|全貌)|(?:什么是|介绍|列出)(?:讲事业)?沟通五步|五步流程(?:是什么|有哪些|怎么走)|五个阶段(?:是什么|有哪些)/;

  if (maintenanceMilestone.test(normalized) && maintenanceTopic.test(normalized)) {
    stage = "maintenance";
  } else if (needsIceBreak) {
    stage = "ice_breaking";
  } else if (closingSignal.test(normalized)) {
    stage = "closing";
  } else if (objectionSignal.test(normalized)) {
    stage = "objection_handling";
  } else if (frameworkSignal.test(normalized)) {
    stage = "framework";
  } else if (presentationSignal.test(normalized)) {
    stage = "career_presentation";
  } else if (
    followUpSignal.test(normalized)
    || (questionShowsMaterialSent && followUpIntentPattern.test(normalizedQuestion))
  ) {
    stage = "follow_up";
  } else if (/破冰|刚加|刚认识|陌生客户|发名片|自我介绍|建立信任/.test(normalized)) {
    stage = "ice_breaking";
  }

  let scene: CareerMentorScene = "general";

  if (stage === "maintenance") {
    scene = "maintenance";
  } else if (stage === "closing") {
    scene = "closing";
  } else if (stage === "objection_handling") {
    scene = "objection";
  } else if (stage === "follow_up") {
    scene = "follow_up";
  } else if (/邀约|邀请|约见|见面|到店|会议/.test(normalized)) {
    scene = "invitation";
  } else if (/招商|代理|经销商|批发|销售团队|合作渠道/.test(normalized)) {
    scene = "investment";
  } else if (stage === "career_presentation" || /讲事业|事业机会|事业价值|沟通五步/.test(normalized)) {
    scene = "career";
  }

  const matchedTerms = collectSignalTerms(text).slice(0, 8);
  const retrievalTerms = dedupe([
    ...matchedTerms,
    ...STAGE_CONFIG[stage].terms,
    SCENE_LABELS[scene]
  ]).slice(0, 14);

  return {
    scene,
    sceneLabel: SCENE_LABELS[scene],
    stage,
    stageLabel: STAGE_CONFIG[stage].label,
    retrievalTerms
  };
}

export function isCareerMentorFastAnswerEligible(question: string, supportingContext = "") {
  const classification = classifyCareerMentorQuestion(question, supportingContext);

  return classification.stage !== "framework"
    && classification.stage !== "maintenance"
    && classification.stage !== "unknown"
    && question.trim().length <= 120
    && supportingContext.trim().length === 0;
}

function findCareerMentorConversationAnchor(
  recentConversation: readonly CareerMentorConversationTurn[]
) {
  for (let index = recentConversation.length - 1; index >= 0; index -= 1) {
    const turn = recentConversation[index];

    if (turn.role !== "user") {
      continue;
    }

    const content = turn.content.replace(/\s+/g, " ").trim().slice(0, 700);

    if (!content) {
      continue;
    }

    const classification = classifyCareerMentorQuestion(content);
    const continuationRequested = isCareerMentorContinuationRequest(content);
    const isConversationControl = /^(?:好|好的|好吧|行|可以|嗯|嗯嗯|收到|明白|明白了|知道了|谢谢|谢谢你|感谢|ok|okay)$/i.test(
      content.normalize("NFKC").replace(/[\s，,。！？!?；;：:]+/g, "")
    );

    if (continuationRequested || isConversationControl) {
      continue;
    }

    if (classification.stage !== "unknown") {
      return {
        question: content,
        stage: classification.stage
      };
    }

    // A newer substantive but unclassified user topic is a hard boundary. Do not
    // skip past it and accidentally inherit an older customer's stage.
    if (!continuationRequested) {
      return null;
    }
  }

  return null;
}

export function resolveCareerMentorTurnContext(input: {
  question: string;
  supportingContext?: string;
  recentConversation?: readonly CareerMentorConversationTurn[];
}): CareerMentorTurnContext {
  const baseSupportingContext = input.supportingContext?.trim() ?? "";
  const currentClassification = classifyCareerMentorQuestion(input.question, baseSupportingContext);
  const continuationRequested = isCareerMentorContinuationRequest(input.question);

  if (!continuationRequested) {
    return {
      scenarioQuestion: input.question,
      supportingContext: baseSupportingContext,
      continuationRequested: false,
      conversationContextApplied: false,
      anchorQuestion: null,
      currentStage: currentClassification.stage,
      resolvedStage: currentClassification.stage
    };
  }

  const canInheritConversation = currentClassification.stage === "unknown"
    && !baseSupportingContext;
  const anchor = canInheritConversation
    ? findCareerMentorConversationAnchor(input.recentConversation ?? [])
    : null;

  if (!anchor) {
    return {
      scenarioQuestion: input.question,
      supportingContext: baseSupportingContext,
      continuationRequested: true,
      conversationContextApplied: false,
      anchorQuestion: null,
      currentStage: currentClassification.stage,
      resolvedStage: currentClassification.stage
    };
  }

  const resolvedClassification = classifyCareerMentorQuestion(anchor.question, baseSupportingContext);

  return {
    scenarioQuestion: anchor.question,
    supportingContext: baseSupportingContext,
    continuationRequested: true,
    conversationContextApplied: true,
    anchorQuestion: anchor.question,
    currentStage: currentClassification.stage,
    resolvedStage: resolvedClassification.stage
  };
}

export function buildCareerMentorRetrievalQuery(question: string, supportingContext = "") {
  const classification = classifyCareerMentorQuestion(question, supportingContext);
  const context = supportingContext.trim().slice(0, 900);

  return [
    ...classification.retrievalTerms,
    ...CAREER_MENTOR_KNOWLEDGE_LAYER_TERMS,
    question.trim(),
    context
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function buildCareerMentorRetrievalQueries(question: string, supportingContext = "") {
  const exactQuery = [question.trim(), supportingContext.trim()]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
  const expandedQuery = buildCareerMentorRetrievalQuery(question, supportingContext);

  return Array.from(new Set([exactQuery, expandedQuery].filter(Boolean)));
}

function hasNonNegatedCareerMentorStageSignal(text: string, pattern: RegExp) {
  const matcher = new RegExp(pattern.source, pattern.flags.replace("g", "") + "g");
  let match = matcher.exec(text);

  while (match) {
    const prefix = text.slice(Math.max(0, match.index - 32), match.index);

    if (!/(?:严禁|禁止|不得|不能|不要|不可|避免|拒绝|不应|不宜|不建议|并非|不是|切勿|切忌|尚未|还没|没有|无需|不必|未|勿|没|无|不)[^。！？；\n]{0,24}$/.test(prefix)) {
      return true;
    }

    match = matcher.exec(text);
  }

  return false;
}

function detectCareerMentorSourceStages(sourceIdentity: string, contentAware = false) {
  const normalized = sourceIdentity
    .toLowerCase()
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const stages = new Set<CareerMentorCoreStage>();

  if (/(?:01.{0,20}破冰|第一步.{0,20}破冰|破冰.{0,20}第一步)/.test(normalized)) {
    stages.add("ice_breaking");
  }

  if (/(?:02.{0,24}促单跟进|第二步.{0,24}促单跟进|促单跟进.{0,20}第二步)/.test(normalized)) {
    stages.add("follow_up");
  }

  if (/(?:03.{0,24}讲事业|第三步.{0,24}讲事业|讲事业.{0,20}第三步)/.test(normalized)) {
    stages.add("career_presentation");
  }

  if (contentAware) {
    const objectionSignals = [
      /锁定问题/,
      /解决疑虑|异议|顾虑/,
      /万能公式/,
      /认可.{0,12}转移/,
      /核心价值解释/,
      /(?:太贵|价格|不靠谱|靠谱吗|没时间|没有时间|考虑|比较|犹豫|担心|疑问|反驳)/
    ].filter((pattern) => hasNonNegatedCareerMentorStageSignal(normalized, pattern)).length;
    const closingSignals = [
      /成交三核心/,
      /价值确认/,
      /行动时间/,
      /降低行动阻力/,
      /推进下一步|推进一次行动/,
      /微信还是支付宝|办理手续|付款方式|支付方式/,
      /(?:已经|基本|明确)?认可.{0,20}(?:迟迟|还没|没有|未|不)(?:行动|加入|付款|支付|下单)/,
      /(?:答应|同意|愿意).{0,20}(?:行动|加入|付款|支付|下单|签约)/
    ].filter((pattern) => hasNonNegatedCareerMentorStageSignal(normalized, pattern)).length;
    const objectionContent = hasNonNegatedCareerMentorStageSignal(normalized, /第四步/)
      || objectionSignals >= 1;
    const closingContent = hasNonNegatedCareerMentorStageSignal(normalized, /第五步/)
      || closingSignals >= 1;

    if (objectionContent) {
      stages.add("objection_handling");
    }

    if (closingContent) {
      stages.add("closing");
    }

  } else if (/(?:04.{0,32}(?:第四五步|锁定问题|收钱闭环)|第四五步|第四步.{0,20}锁定问题|第五步.{0,20}成交)/.test(normalized)) {
    stages.add("objection_handling");
    stages.add("closing");
  }

  return stages;
}

export function isCareerMentorEvidenceTextAligned(
  stage: CareerMentorStage,
  text: string
) {
  if (stage !== "objection_handling" && stage !== "closing") {
    return true;
  }

  const detectedStages = detectCareerMentorSourceStages(text, true);
  const otherFourthFifthStage = stage === "objection_handling"
    ? "closing"
    : "objection_handling";

  return detectedStages.has(stage) && !detectedStages.has(otherFourthFifthStage);
}

export function extractCareerMentorExplicitCustomerScriptBlocks(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const markerPattern = /(?:^|(?<=[\n。；;]))\s*(?:#{1,6}\s*)?(?:(?:可直接发给客户|可直接转发|话术全文|完整话术|一字不差|固定话术|标准话术|共鸣话术|标准回应|文案)(?:\s*[一二三四五六七八九十\d]+)?(?:\s*[（(][^）)\n]{1,48}[）)])?|(?:话术|回复)(?:\s*[一二三四五六七八九十\d]+)?(?:\s*[（(][^）)\n]{1,48}[）)])?)\s*(?:[：:]|(?=\n))/gm;
  const blocks: string[] = [];
  const matches = Array.from(normalized.matchAll(markerPattern));
  const boundaryHeading = /^(?:#{1,6}\s+.+|[一二三四五六七八九十百]+[、.].+|第[一二三四五六七八九十百\d]+(?:章|节|部分|步).+|\d+(?:\.\d+)+(?:\s+.+)?|【[^】]{1,80}】.*|(?:讲这个的时候要注意|为什么这段话能打动人|为什么[^。！？\n]{0,28}有效|等(?:他|她|客户)|重要客户|使用提醒|内部操作|内部说明|内部纪律|执行提醒|执行边界|边界说明|注意事项|操作要点|拆解|核心原则|公式结构|等待|先判断|开场|投屏展示|故事变通提示|配套说明|用法[一二三四五六七八九十\d]*|铁律[一二三四五六七八九十\d]*|自检问题))(?:\s*[—：:]|$)/;

  for (let matchIndex = 0; matchIndex < matches.length; matchIndex += 1) {
    const match = matches[matchIndex];
    if (match.index === undefined) {
      continue;
    }

    const markerStart = match.index;
    const markerEnd = markerStart + match[0].length;
    const markerContext = normalized.slice(Math.max(0, markerStart - 80), markerEnd);

    if (/(?:不是|并非|不属于|非)(?:给)?客户.{0,8}话术|(?:仅供|只供|用于).{0,16}(?:内部|培训|操作|参考)/.test(markerContext)) {
      continue;
    }

    const nextMarkerStart = matches[matchIndex + 1]?.index ?? normalized.length;
    const tail = normalized.slice(markerEnd, Math.min(nextMarkerStart, markerEnd + 4000));
    const blockLines: string[] = [];
    let contentStarted = false;

    for (const rawLine of tail.split("\n")) {
      const line = rawLine.replace(/^\s*>\s?/, "").trimEnd();
      const trimmed = line.trim();

      if (!contentStarted && !trimmed) {
        continue;
      }

      if (trimmed && boundaryHeading.test(trimmed)) {
        break;
      }

      if (trimmed) {
        contentStarted = true;
        blockLines.push(line.trim());
      } else if (contentStarted && blockLines.at(-1) !== "") {
        blockLines.push("");
      }
    }

    let block = blockLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const openingQuote = block[0];
    const closingQuote = openingQuote === "“"
      ? "”"
      : openingQuote === "「"
        ? "」"
        : openingQuote === "\""
          ? "\""
          : "";

    if (closingQuote) {
      const closingIndex = block.indexOf(closingQuote, 1);
      if (closingIndex >= 2) {
        block = block.slice(1, closingIndex).trim();
      }
    }

    block = block.replace(
      /[（(][^（）()\n]{0,220}(?:配图|图片|截屏|截图|发名片|推送名片|打开腾讯会议|共享屏幕|展示业务群|先聊|拉近感情|再切事业|等(?:他|她|客户)?回复|不多说|发完|跟上[^（）()\n]{0,20}素材|一个字[^（）()\n]{0,20}不要再说|关心的语气|促单的语气|让(?:他|她|客户)放松|同上)[^（）()\n]{0,220}[）)]/g,
      ""
    ).replace(/[ \t]{2,}/g, " ").trim();

    block = block.replace(
      /([。！？!?；;”"])[ \t]+(?:核心|关键细节)\s*[—：:][\s\S]*$/,
      "$1"
    ).trim();

    if (
      block.length >= 2
      && !/(?:使用提醒|内部操作|内部说明|内部纪律|执行提醒|执行边界|边界说明|注意事项)\s*[：:]/.test(block)
    ) {
      blocks.push(block);
    }
  }

  return Array.from(new Set(blocks));
}

function resolveCareerMentorSourceStages(metadataIdentity: string, contentLead: string) {
  const metadataStages = detectCareerMentorSourceStages(metadataIdentity);
  const contentStages = detectCareerMentorSourceStages(contentLead, true);
  const combinedFourthFifthFile = metadataStages.has("objection_handling")
    && metadataStages.has("closing");

  if (
    combinedFourthFifthFile
    && (contentStages.has("objection_handling") || contentStages.has("closing"))
  ) {
    return new Set<CareerMentorCoreStage>([
      ...Array.from(contentStages).filter((stage) => (
        stage === "objection_handling" || stage === "closing"
      ))
    ]);
  }

  if (combinedFourthFifthFile) {
    return new Set<CareerMentorCoreStage>();
  }

  if (metadataStages.size > 0) {
    return metadataStages;
  }

  return detectCareerMentorSourceStages(contentLead);
}

function isCareerMentorCoreStage(stage: CareerMentorStage): stage is CareerMentorCoreStage {
  return CAREER_MENTOR_KNOWLEDGE_TREE.some((item) => item.stage === stage);
}

function isCareerMentorStageAlignedSource(
  stage: CareerMentorStage,
  metadataIdentity: string,
  contentLead: string
) {
  const sourceStages = resolveCareerMentorSourceStages(metadataIdentity, contentLead);

  return stage !== "framework"
    && stage !== "maintenance"
    && stage !== "unknown"
    && sourceStages.has(stage);
}

function resolveCareerMentorCardIdentity(metadataIdentity: string, contentLead: string) {
  const customerCardPattern = /客户可复制话术卡片|客户可复制话术/;
  const operatorCardPattern = /一线人员操作卡片/;
  const metadataHasCustomerCard = customerCardPattern.test(metadataIdentity);
  const metadataHasOperatorCard = operatorCardPattern.test(metadataIdentity);
  const customerLeadIndex = contentLead.search(customerCardPattern);
  const operatorLeadIndex = contentLead.search(operatorCardPattern);

  return {
    customerCard: metadataHasCustomerCard || (
      !metadataHasOperatorCard
      && customerLeadIndex >= 0
      && (operatorLeadIndex < 0 || customerLeadIndex < operatorLeadIndex)
    ),
    operatorCard: metadataHasOperatorCard || (
      !metadataHasCustomerCard
      && operatorLeadIndex >= 0
      && (customerLeadIndex < 0 || operatorLeadIndex < customerLeadIndex)
    )
  };
}

function scoreCareerMentorChunk(
  chunk: RetrievedRagChunk,
  question: string,
  classification: CareerMentorClassification
) {
  const rawSearchable = [
    chunk.title,
    chunk.sourceTitle ?? "",
    chunk.summary ?? "",
    chunk.category ?? "",
    chunk.content,
    ...(chunk.tags ?? [])
  ].join(" ");
  const searchable = normalizeContent(rawSearchable);
  const metadataIdentity = [
    chunk.title,
    chunk.sourceTitle ?? "",
    chunk.category ?? "",
    ...(chunk.tags ?? [])
  ].join(" ");
  const contentLead = chunk.content.slice(0, 800);
  const normalizedQuestion = normalizeContent(question);
  const signalTerms = dedupe([
    ...collectSignalTerms(question),
    ...classification.retrievalTerms
  ]).map(normalizeContent).filter(Boolean);
  const signalMatches = signalTerms.filter((term) => searchable.includes(term)).length;
  const stageAligned = isCareerMentorStageAlignedSource(
    classification.stage,
    metadataIdentity,
    contentLead
  );
  const cardIdentity = resolveCareerMentorCardIdentity(metadataIdentity, contentLead);
  const sourceStages = resolveCareerMentorSourceStages(metadataIdentity, contentLead);
  const exactQuestionMatch = normalizedQuestion.length >= 8 && searchable.includes(normalizedQuestion);
  const expectedOutputMatch = /预期输出|建议操作|操作步骤|使用提醒|客户可复制话术|话术[：:]|话术模板/.test(chunk.content);
  const standardQuestionMatch = /测试提问|标准问题|场景问题/.test(chunk.content);
  const customerScriptCardMatch = stageAligned && cardIdentity.customerCard;
  const operatorCardMatch = stageAligned && cardIdentity.operatorCard;
  const stageMismatchedCard = (cardIdentity.customerCard || cardIdentity.operatorCard)
    && classification.stage !== "framework"
    && (!isCareerMentorCoreStage(classification.stage) || !sourceStages.has(classification.stage));
  const explicitCustomerTextMatch = /可直接发给客户|可直接转发|话术全文|完整话术|一字不差|标准话术|共鸣话术|标准回应|文案[：:]|文案示例|你怎么接|(?:回他|问他)[：:]/.test(rawSearchable);
  const operatorScriptMatch = operatorCardMatch && explicitCustomerTextMatch;

  return {
    score: (chunk.relevance_score * 4)
      + (exactQuestionMatch ? 14 : 0)
      + (signalMatches * 1.8)
      + (expectedOutputMatch ? 2.5 : 0)
      + (standardQuestionMatch ? 1.5 : 0)
      + (customerScriptCardMatch ? 20 : 0)
      + (operatorScriptMatch ? 9 : 0)
      + (operatorCardMatch ? 4 : 0),
    signalMatches,
    exactQuestionMatch,
    expectedOutputMatch,
    customerScriptCardMatch,
    operatorCardMatch,
    stageMismatchedCard,
    sourceStages
  };
}

export function prioritizeCareerMentorChunks(input: {
  chunks: RetrievedRagChunk[];
  question: string;
  supportingContext?: string;
  topK?: number;
}) {
  const classification = classifyCareerMentorQuestion(input.question, input.supportingContext);
  const dedupedChunks: RetrievedRagChunk[] = [];
  const seen = new Set<string>();

  for (const chunk of input.chunks) {
    const key = chunk.chunkId || chunk.knowledgeItemId;

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    dedupedChunks.push(chunk);
  }

  const scoredCandidates = dedupedChunks
    .map((chunk) => ({
      chunk,
      ...scoreCareerMentorChunk(chunk, input.question, classification)
    }))
    .filter((item) => !item.stageMismatchedCard);
  const scored = scoredCandidates.filter((item) => {
    if (isCareerMentorCoreStage(classification.stage)) {
      return item.sourceStages.has(classification.stage);
    }

    if (classification.stage === "framework") {
      return item.sourceStages.size > 0;
    }

    return false;
  });
  const bestSignalMatches = Math.max(0, ...scored.map((item) => item.signalMatches));
  const anchorItemIds = new Set(scored
    .filter((item) => item.customerScriptCardMatch
      || item.exactQuestionMatch
      || (bestSignalMatches >= 2 && item.signalMatches === bestSignalMatches))
    .map((item) => item.chunk.knowledgeItemId)
    .filter(Boolean));
  const limit = Math.max(1, input.topK ?? CAREER_MENTOR_RETRIEVAL_TOP_K);
  const sorted = scored
    .map((item) => ({
      ...item,
      score: item.score
        + (anchorItemIds.has(item.chunk.knowledgeItemId) ? 7 : 0)
        + (anchorItemIds.has(item.chunk.knowledgeItemId) && item.expectedOutputMatch ? 3 : 0)
        + (item.customerScriptCardMatch ? 8 : 0)
    }))
    .sort((left, right) => right.score - left.score || right.chunk.relevance_score - left.chunk.relevance_score);
  const preferred = [
    sorted.find((item) => item.customerScriptCardMatch),
    sorted.find((item) => item.operatorCardMatch && !item.customerScriptCardMatch),
    ...sorted
  ].filter((item): item is (typeof sorted)[number] => Boolean(item));
  const ordered = preferred.filter((item, index, items) => items.findIndex((candidate) => (
    candidate.chunk.chunkId || candidate.chunk.knowledgeItemId
  ) === (
    item.chunk.chunkId || item.chunk.knowledgeItemId
  )) === index);

  return ordered
    .slice(0, limit)
    .map((item, index) => ({
      ...item.chunk,
      chunk_rank: index + 1
    }));
}

export function hasCareerMentorFastAnswerEvidence(input: {
  chunks: RetrievedRagChunk[];
  question: string;
  supportingContext?: string;
}) {
  const classification = classifyCareerMentorQuestion(input.question, input.supportingContext);

  if (!isCareerMentorCoreStage(classification.stage)) {
    return false;
  }

  const ranked = prioritizeCareerMentorChunks({
    chunks: input.chunks,
    question: input.question,
    supportingContext: input.supportingContext,
    topK: CAREER_MENTOR_FAST_RETRIEVAL_TOP_K
  });
  const scored = ranked.map((chunk) => ({
    chunk,
    ...scoreCareerMentorChunk(chunk, input.question, classification)
  }));
  const customerScript = scored.find((item) => item.customerScriptCardMatch);
  const operatorGuidance = scored.find((item) => (
    item.operatorCardMatch
    || (item.expectedOutputMatch && !item.customerScriptCardMatch)
  ));

  return Boolean(customerScript && operatorGuidance);
}

const STAGE_EXECUTION_CONTEXT: Record<CareerMentorStage, string[]> = {
  framework: [
    "按五步完整说明：破冰建立信任并发资料；促单跟进持续展示价值；讲事业完成通心与客户讲解；锁定问题用公式解决疑虑；成交把认可转为行动；成交后进入长期维护。"
  ],
  ice_breaking: [
    "目标是陌生关系到建立信任并发资料。顺序：感受头像、朋友圈、职业、年龄和生活家庭状态 -> 自我介绍并问姓名工作 -> 用客户现状、自己的经历和已走出来形成精准共鸣 -> 三句话内简单介绍事业 -> 发资料并结束主动聊天。",
    "不闲聊、不反复追问、不被客户带节奏；只使用命中资料中的真实话术。"
  ],
  follow_up: [
    "前提是已完成破冰或已发资料。跟进不是催促，而是按客户状态展示软价值或推动行动素材；前期高频展示，之后持续跟进，客户主动咨询再进入第三步。",
    "客户没有回复不等于拒绝；不得因此跳到异议或成交。若尚未破冰，必须退回第一步。"
  ],
  career_presentation: [
    "先做内部通心：确认公司价值、团队价值和个人价值，定位为帮助客户了解机会。再按讲口五步推进：要求认真听 -> 建立行业与产品、利润空间、可持续赚钱三项标准 -> 逐项拆解 -> 说明如何成为经营者 -> 强化加入的好处；全程遵守命中资料中的七条注意事项。"
  ],
  objection_handling: [
    "客户有疑问、犹豫或比较时，先锁定真实阻碍，不直接追着问题逐条作答。使用：认可 -> 一句话转移 -> 命中资料中的核心价值解释 -> 确认问题是否解除。",
    "问题映射：贵走价值模型；靠谱吗走信任证明；没有时间走价值优先；要考虑走需求分析。解决一个问题后再进入第五步推进一次行动。"
  ],
  closing: [
    "客户已经认可但没有行动时，依次做价值确认 -> 明确行动时间 -> 降低行动阻力 -> 推进一个具体下一步。不要只等待客户自然行动。",
    "若出现新疑问，回到第四步锁定并解决；每解决一个问题，再推进一次行动，直到形成明确结果。"
  ],
  maintenance: [
    "成交后转入长期客户维护：围绕已成交关系持续提供命中资料中的服务、跟进与价值，不把维护误判成重新破冰或再次强推成交。四份基线资料没有完整维护 SOP；若 retrieved context 无明确命中，必须请用户补充目标或资料，不能编造复购、售后话术。"
  ],
  unknown: [
    "现有信息不足时，先请用户补充客户原话，并确认是否已破冰、是否已发资料、是否主动了解、是否提出疑问、是否已经认可；不得猜测阶段或跨步骤给通用话术。"
  ]
};

export function buildCareerMentorBusinessContext(
  question: string,
  supportingContext = "",
  options: {
    continuationRequest?: string | null;
  } = {}
) {
  const classification = classifyCareerMentorQuestion(question, supportingContext);
  const shouldGenerateAdaptiveReply = isCareerMentorCoreStage(classification.stage);
  const continuationRequest = options.continuationRequest?.trim() ?? "";
  const continuationRequested = Boolean(continuationRequest)
    || isCareerMentorContinuationRequest(question);
  const inheritedConversationScenario = continuationRequest
    && normalizeContent(continuationRequest) !== normalizeContent(question);

  return [
    `[CAREER_MENTOR_POLICY ${CAREER_MENTOR_POLICY_VERSION}]`,
    "本规则只适用于当前已选择的讲事业导师固定知识库。不要展示规则名、内部策略或检索过程，但必须给用户可理解的阶段判断依据。",
    `本轮内部定位：${classification.sceneLabel}；${classification.stageLabel}。`,
    continuationRequested
      ? "本轮属于同一场景续答：用户要求‘再换一个、换一种、重新生成或调整表达’只代表更换方案或说法，不代表客户状态前进。必须继承最近一条用户原始问题中的客户对象、沟通阶段和已执行动作；上一轮助手答案只用于避免重复，不得作为推进阶段的依据。若没有可用的上一轮用户原始问题，保持信息不足并请用户补充，禁止猜测阶段。"
      : "",
    inheritedConversationScenario
      ? `本轮已锁定的最近用户原始场景：${question.trim().slice(0, 700)}。只在这个场景和当前阶段内更换表达，不得改换客户画像或推进到下一阶段。`
      : "",
    "",
    "五步顺序铁律：破冰 -> 促单跟进 -> 讲事业 -> 锁定问题 -> 成交；成交后长期维护。先确认前置步骤，不跳步。第四步和第五步必须分别判断，但实操时按‘锁定一个问题 -> 解决 -> 推进一次行动’循环衔接。",
    "",
    "当前阶段执行规则：",
    ...STAGE_EXECUTION_CONTEXT[classification.stage].map((rule) => `- ${rule}`),
    "",
    "知识与正文铁律：",
    "- retrieved context 与本模型已固化的四份客户可复制话术卡是唯一业务知识来源。先精确匹配标准问题、场景话术或 SOP，保留动作、顺序、时间、条件和关键话术；禁止用通用销售知识拼凑。",
    "- 命中不足时请用户补充客户原话、阶段或已执行动作。只处理当前阶段及紧接的一步，不倾倒整套资料。",
    "- 隐藏测试提问、预期输出、管理员、投喂端、课程、源文件、ID、版本和检索说明。正文必须采用完整、自然、专业的 DeepSeek/GPT 风格 Markdown，不能只回答一句或只给话术卡。",
    "",
    "知识库原话优先铁律：",
    "- 自然正文中的分析、解释与执行建议优先采用当前阶段命中的精读笔记和一线人员操作卡片；‘可复制给客户’只采用同阶段、同客户场景的固定知识库话术，包括模型中逐字固化的四份客户话术卡原文。操作卡片中标明‘内部使用/绝不发给客户’的内容严禁进入话术卡。",
    "- 只要 retrieved context 命中可直接发给客户的固定话术，‘### 话术 1’必须从该命中片段连续逐字复制：字词、标点、数字、顺序全部保持，不润色、不纠错、不缩写、不拼接、不补词，也不添加原文没有的前后缀。",
    "- 当前阶段没有专门客户话术卡时，‘话术 1’只能逐字采用精读笔记或操作卡片中明确标为话术、回复、文案、可直接转发的客户文本；不能把通心、策略、操作、技巧、配图、自检或带教内容当客户话术。",
    shouldGenerateAdaptiveReply
      ? "- 在完整自然正文之后增加‘### AI思考回复话术’，根据本轮客户原话、当前阶段、已执行动作和命中知识固定生成 3 条可选择的短话术。三条必须分别采用不同沟通目标，依次使用‘#### AI建议话术 1（稳妥自然型）’‘#### AI建议话术 2（共情引导型）’‘#### AI建议话术 3（轻问推进型）’和独立引用块；不得只换同义词或重复同一表达。不得编造公司、产品、收益或案例事实，不得照抄固定话术冒充动态建议。用户未提供的客户姓名、朋友圈内容、个人经历、帮助人数、业绩、收益、时间和案例一律不得补全；改用中性称呼与条件式表达。"
      : "- 当前不是信息充分的五个客户沟通阶段，不生成 AI 思考回复话术；应先解释框架或请用户补充客户原话、阶段和已执行动作，严禁为长期维护或未知场景编造客户话术。",
    "- ‘## 可复制给客户’与 AI 思考话术严格分层：最下面只保留固定知识库话术，不放 AI 改写或延伸。若没有精确固定话术命中，先请用户补充客户原话、阶段或对应资料。",
    "",
    "最终输出由‘自然正文 + 现有话术卡’组成：",
    "- 先直接回应用户真正的问题，再按照内容需要自由组织标题、短段落、列表、引用或示例。正文标题必须随问题动态生成，不得套用‘判断’‘回复思路’‘推荐执行流程’三个固定栏目，也不得暴露内部阶段变量或思维链。",
    "- 正文要把当前阶段、为什么这样处理、动作顺序、适用边界和具体执行方法自然讲清楚；只使用命中证据能支持的事实，不为了拉长篇幅重复表述。",
    shouldGenerateAdaptiveReply
      ? "- 自然正文结束后必须输出‘### AI思考回复话术’，并按稳妥自然、共情引导、轻问推进三个不同方向且只输出‘#### AI建议话术 1（稳妥自然型）’‘#### AI建议话术 2（共情引导型）’‘#### AI建议话术 3（轻问推进型）’三条可复制动态回复。不得减少数量、合并或把卡片内容混入正文。"
      : "- 当前不是信息充分的核心沟通阶段，不输出‘### AI思考回复话术’，先自然说明框架或需要补充的信息。",
    "- 最后输出‘## 可复制给客户’，只放逐字命中的固定知识库话术，使用‘### 话术 1’和独立引用块，生成最下方绿色复制卡片；不得混入 AI 改写，不得在用户端显示内部检索标签。"
  ].join("\n").slice(0, 2700);
}

export interface CareerMentorAnswerGroundingInput {
  chunks: readonly RetrievedRagChunk[];
  question: string;
  supportingContext?: string;
  strictEvidencePlan?: boolean;
  evidencePlanAdaptiveReplies?: readonly string[];
  evidencePlanFixedScript?: string | null;
  evidencePlanEvidenceIds?: readonly string[];
}

const CAREER_MENTOR_COPY_GROUNDING_FALLBACK = "本轮没有检索到可逐字核对的同阶段客户话术。请补充客户原话、当前阶段或对应资料后再生成。";

interface CareerMentorCanonicalCopyEntry {
  stage: CareerMentorCoreStage;
  sourceTitle: string;
  sourceParagraph: number | string;
  match?: RegExp;
  exclude?: RegExp;
  defaultForStage?: boolean;
  script: string;
}

// These strings are copied verbatim from the four user-approved customer copy cards.
// They are a career-mentor-only fallback for deployments whose indexed records contain
// the uploaded filenames but not the DOCX body. The surrounding expert answer still
// comes from retrieved context; this catalog only supplies the first copyable script.
const CAREER_MENTOR_CANONICAL_COPY_LIBRARY: readonly CareerMentorCanonicalCopyEntry[] = [
  {
    stage: "ice_breaking",
    sourceTitle: "01_破冰_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 97,
    match: /靠谱|可靠|可信|信任|正规|是不是真的/,
    script: "姐，我发你的两个视频里面有详细介绍——你先安静下来用十五分钟认真看一遍。看完你心里就清楚了。有不明白的记下来——我看完视频再给你解答。"
  },
  {
    stage: "ice_breaking",
    sourceTitle: "01_破冰_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 89,
    defaultForStage: true,
    script: "姐/哥，我们这个事业很简单—— 很多80后、90后、00后，甚至50多岁的伙伴，各行各业的人都有。打工的、做生意的、在家带孩子的、退休的——各行各业都有。 他们来到这里之后，短短几个月就做到了周薪五位数。当然收益还有更高的。因为我们的运营方法和流程非常简单，人人都能快速学会。 操作也很方便——一部手机走到哪里做到哪里。不用出去跑、不用看人脸色、不用大量资金。你自己决定自己的节奏。 我这边刚好有两个内部的视频资料——你可以先看看，看完你心里就清楚了。"
  },
  {
    stage: "follow_up",
    sourceTitle: "02_促单跟进_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 115,
    defaultForStage: true,
    script: "姐，我刚忙完一个客户——群里这会又炸了。你看看这才多大一会——各行各业的精英排队咨询的、出单的、晋升的——从早到晚就没停过。你先好好看视频——看完你心里就有数了。"
  },
  {
    stage: "career_presentation",
    sourceTitle: "03_讲事业第三步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 30,
    match: /怎么讲|如何讲|讲解|开场|认真听|讲清楚/,
    script: "姐，接下来大概二十多分钟的时间——你要把所有的事情全部都放下。认真地听我讲，并且每一步都要跟我互动。这样的话，我就能够确保每一步我都给你讲解明白了。咱们确保一次性就把这个生意了解清楚，好不好啊姐？"
  },
  {
    stage: "career_presentation",
    sourceTitle: "03_讲事业第三步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 19,
    defaultForStage: true,
    script: "姐/哥，你现在方便吗？我现在正好有点时间——方便的话我给你打过去，一次性把这个生意给你讲明白、讲清楚。"
  },
  {
    stage: "objection_handling",
    sourceTitle: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 94,
    match: /贵|价格|费用|预算|1980/,
    exclude: /不贵|不是价格|价格没问题|价格不是问题|不觉得贵/,
    script: "姐——你除了觉得产品有点贵之外，还有没有其他的顾虑？你一次性说出来——我一次性给你解答。"
  },
  {
    stage: "objection_handling",
    sourceTitle: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 56,
    match: /没时间|没有时间|太忙|忙不过来/,
    exclude: /不是没时间|并不是没时间|时间不是问题|时间没问题|时间充足/,
    script: "姐你说得太对了——哪个人每天不忙？一个月赚两千块的人也忙得很对不对。链商是一个可兼职可全职的事业——前期你可以先兼职当副业。等你有一定收益或者非常有信心了——再选择全职做也可以。 姐——你再怎么没时间，牙膏是不是也要用？大米是不是也要吃？跟你有没有时间没有关系嘛。无非就是把家里的日用品换到我们这里来买——换个牌子用一用。你感觉产品好了给身边的朋友分享一下——就可以赚钱了。 那你找我是为了什么？是不是为了赚钱？ 赚钱最重要的是什么？你要能可持续地赚到钱。那怎么样可持续赚钱？就是有简单、人人可为的方法嘛。"
  },
  {
    stage: "objection_handling",
    sourceTitle: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 62,
    match: /靠谱|可靠|可信|信任|正规|合法|骗|不相信/,
    exclude: /不是不靠谱|没有不信任|不是信任问题|我相信你|已经相信|信得过|很靠谱|确实靠谱/,
    script: "姐——你是不是不相信我？来——我给你看看。"
  },
  {
    stage: "objection_handling",
    sourceTitle: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 25,
    match: /考虑|再想想|想一想|犹豫|顾虑|担心/,
    defaultForStage: true,
    script: "姐——考虑是正常的，说明你在认真了解这个事情。那你目前主要担心的是什么呢？是担心产品不好呢？还是担心公司不放心呢？还是担心自己能不能做起来？"
  },
  {
    stage: "closing",
    sourceTitle: "03_讲事业第三步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 141,
    match: /没有疑问|没疑问|都明白|搞清楚|听明白/,
    script: "那姐——咱们今天就把手续办了。非常简单——我教你操作，几分钟就搞定。"
  },
  {
    stage: "closing",
    sourceTitle: "04_讲事业第四五步_客户可复制话术卡片_WPS排版版.docx",
    sourceParagraph: 35,
    defaultForStage: true,
    script: "姐——搞明白了吧？微信还是支付宝？"
  }
] as const;

function selectCareerMentorCanonicalCopy(
  classification: CareerMentorClassification,
  question: string,
  supportingContext = ""
) {
  if (!isCareerMentorCoreStage(classification.stage)) {
    return null;
  }

  const normalizedQuestion = normalizeContent(question);
  const normalizedSupportingContext = normalizeContent(supportingContext);
  const stageEntries = CAREER_MENTOR_CANONICAL_COPY_LIBRARY.filter((entry) => (
    entry.stage === classification.stage
  ));
  const matches = (entry: CareerMentorCanonicalCopyEntry, text: string) => (
    Boolean(entry.match?.test(text)) && !entry.exclude?.test(text)
  );

  return stageEntries.find((entry) => matches(entry, normalizedQuestion))
    ?? stageEntries.find((entry) => matches(entry, normalizedSupportingContext))
    ?? stageEntries.find((entry) => entry.defaultForStage)
    ?? null;
}

export function buildCareerMentorNoEvidenceAnswer(
  question: string,
  supportingContext = ""
) {
  const classification = classifyCareerMentorQuestion(question, supportingContext);

  return [
    "## 判断",
    `当前阶段：${classification.stageLabel}。`,
    `调用步骤：${classification.stageLabel}。`,
    "判断依据：已识别当前沟通场景，但本轮暂未形成可验证的同阶段知识证据链，因此不直接生成业务结论或客户话术。",
    "",
    "## 回复思路",
    "先补齐客户原话、当前阶段和已经执行过的动作，再按沟通五步骤调用对应资料；在知识依据不足时，不跨步骤、不套用其他专家内容，也不使用通用销售话术代替。",
    "",
    "### 推荐执行流程",
    "1. 补充客户最近一句原话或清晰聊天截图。",
    "2. 说明是否已经破冰、是否发过资料，以及客户目前有没有明确疑问。",
    "3. 信息补齐后，再按当前阶段重新生成完整分析与三条可选择话术。",
    "",
    "## 可复制给客户",
    "本轮没有检索到可逐字核对的同阶段客户话术。请补充客户原话、当前阶段或对应资料后再生成。"
  ].join("\n");
}

export function buildCareerMentorNaturalNoEvidenceAnswer() {
  return "这次还没有检索到足够的讲事业资料来可靠回答。请补充客户最近一句原话，以及你已经做过哪些动作；信息补齐后，我会先判断所处阶段，再只依据对应阶段的资料整理一份完整方案。";
}

export function buildCareerMentorNaturalProviderErrorAnswer() {
  return "相关的讲事业资料已经找到，但 AI 本次没有完成正文生成。请稍后重试，系统会继续沿用当前客户、当前沟通阶段和已经执行过的动作，不会跳到下一步。";
}

export function buildCareerMentorNaturalProviderUnavailableAnswer() {
  return "讲事业资料已经准备好，但当前 AI 正文服务暂时不可用。请稍后再试；恢复后会继续依据当前阶段的知识库内容生成完整正文。";
}

function buildCareerMentorFenceMask(lines: string[]) {
  const mask = new Array<boolean>(lines.length).fill(false);
  let activeFence: { marker: "`" | "~"; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    if (activeFence) {
      mask[index] = true;
      const closingMatch = lines[index].match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);

      if (
        closingMatch
        && closingMatch[1][0] === activeFence.marker
        && closingMatch[1].length >= activeFence.length
      ) {
        activeFence = null;
      }

      continue;
    }

    if (/^(?: {4,}|\t)/.test(lines[index])) {
      mask[index] = true;
      continue;
    }

    const openingMatch = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);

    if (openingMatch) {
      activeFence = {
        marker: openingMatch[1][0] as "`" | "~",
        length: openingMatch[1].length
      };
      mask[index] = true;
    }
  }

  return mask;
}

function isCareerMentorCopyHeading(line: string) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 100) {
    return false;
  }

  const normalized = normalizeContent(trimmed);

  return normalized.startsWith("可复制给客户")
    || normalized.startsWith("可直接复制给客户")
    || normalized.startsWith("客户可复制话术")
    || normalized.startsWith("给客户的话术")
    || normalized.startsWith("可复制客户话术");
}

function isCareerMentorFirstScriptHeading(line: string) {
  return /^\s*(?:#{1,6}\s*)?(?:\*{1,2}|_{1,2})?\s*(?:话术\s*(?:1|一|①)|第一条话术)\s*(?:\*{1,2}|_{1,2})?\s*(?:[：:].*)?$/i.test(line);
}

function isCareerMentorAiReplyHeading(line: string) {
  return /^\s*(?:#{1,6}\s*)?(?:\*{1,2}|_{1,2})?\s*AI思考回复话术\s*(?:\*{1,2}|_{1,2})?\s*(?:[（(、:].*)?$/i.test(line);
}

function isCareerMentorExplicitAdaptiveReplyItemHeading(line: string) {
  const normalized = line
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();

  return !/^(?: {4,}|\t)/.test(line)
    && /^AI建议话术/i.test(normalized)
    && Boolean(parseCareerMentorAdaptiveReplyItemHeading(line));
}

function buildCareerMentorAiReplyMask(lines: string[], fenceMask: boolean[]) {
  let insideAiReplySection = false;

  return lines.map((line, index) => {
    if (fenceMask[index]) {
      return false;
    }

    if (isCareerMentorAiReplyHeading(line)) {
      insideAiReplySection = true;
      return true;
    }

    if (
      insideAiReplySection
      && (
        isCareerMentorCopyHeading(line)
        || (/^\s*#{1,2}\s+/.test(line) && !parseCareerMentorAdaptiveReplyItemHeading(line))
      )
    ) {
      insideAiReplySection = false;
      return false;
    }

    return insideAiReplySection;
  });
}

function findCareerMentorAiReplySections(lines: string[]) {
  const fenceMask = buildCareerMentorFenceMask(lines);
  const startIndexes = lines
    .map((line, index) => (
      !fenceMask[index] && isCareerMentorAiReplyHeading(line) ? index : -1
    ))
    .filter((index) => index >= 0);

  const explicitSections = startIndexes.map((startIndex, sectionIndex) => {
    const nextSectionIndex = startIndexes[sectionIndex + 1] ?? lines.length;
    let endIndex = nextSectionIndex;

    for (let index = startIndex + 1; index < nextSectionIndex; index += 1) {
      if (
        !fenceMask[index]
        && (
          isCareerMentorCopyHeading(lines[index])
          || (
            /^\s*#{1,3}\s+/.test(lines[index])
            && !parseCareerMentorAdaptiveReplyItemHeading(lines[index])
          )
        )
      ) {
        endIndex = index;
        break;
      }
    }

    return {
      startIndex,
      contentStartIndex: startIndex + 1,
      endIndex
    };
  });
  const orphanHeadingIndexes = lines
    .map((line, index) => (
      !fenceMask[index]
      && isCareerMentorExplicitAdaptiveReplyItemHeading(line)
      && !explicitSections.some((section) => (
        index >= section.startIndex && index < section.endIndex
      ))
        ? index
        : -1
    ))
    .filter((index) => index >= 0);
  const orphanSections: Array<{
    startIndex: number;
    contentStartIndex: number;
    endIndex: number;
  }> = [];
  let orphanCursor = 0;

  while (orphanCursor < orphanHeadingIndexes.length) {
    const startIndex = orphanHeadingIndexes[orphanCursor];
    let endIndex = lines.length;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      if (
        !fenceMask[index]
        && (
          isCareerMentorCopyHeading(lines[index])
          || (
            /^\s*#{1,3}\s+/.test(lines[index])
            && !parseCareerMentorAdaptiveReplyItemHeading(lines[index])
          )
        )
      ) {
        endIndex = index;
        break;
      }
    }

    orphanSections.push({
      startIndex,
      contentStartIndex: startIndex,
      endIndex
    });

    while (
      orphanCursor < orphanHeadingIndexes.length
      && orphanHeadingIndexes[orphanCursor] < endIndex
    ) {
      orphanCursor += 1;
    }
  }

  return [...explicitSections, ...orphanSections]
    .sort((left, right) => left.startIndex - right.startIndex);
}

function hasUnsupportedCareerMentorAdaptiveFacts(
  lines: string[],
  input: CareerMentorAnswerGroundingInput
) {
  const userEvidence = normalizeContent([
    input.question,
    input.supportingContext ?? ""
  ].join("\n"));
  const knowledgeEvidence = normalizeContent(input.chunks.map((chunk) => [
    chunk.title,
    chunk.sourceTitle ?? "",
    chunk.summary ?? "",
    chunk.content
  ].join(" ")).join("\n"));
  const allEvidence = `${userEvidence}${knowledgeEvidence}`;
  const genericSalutations = new Set(["姐姐", "哥哥", "大姐", "大哥"]);

  for (const line of lines) {
    const text = line
      .replace(/^\s*>\s?/, "")
      .replace(/^\s*#{1,6}\s+/, "")
      .replace(/[*_`]/g, "")
      .trim();

    if (!text || isCareerMentorAiReplyHeading(line) || /^AI建议话术\s*[一二三四五六七八九十\d]*/.test(text)) {
      continue;
    }

    const salutationMatches = Array.from(
      text.matchAll(/(?:^|[，。！？!：:\s])(?:您好[，,]?\s*)?([\u4e00-\u9fff]{1,2})(姐|哥|总|老师)(?=[，。！？!：:\s])/g)
    );

    for (const match of salutationMatches) {
      const salutation = `${match[1]}${match[2]}`;

      if (!genericSalutations.has(salutation) && !userEvidence.includes(normalizeContent(salutation))) {
        return true;
      }
    }

    const numericClaims = [
      ...Array.from(text.matchAll(/\d+(?:\.\d+)?\s*(?:多|余)?\s*(?:位|名|个|人|家|单|元|块|万|%|年|月|天|小时|分钟)/g)),
      ...Array.from(text.matchAll(/[一二三四五六七八九两]+十[一二三四五六七八九]?\s*(?:多|余)?\s*(?:位|名|人|家|单)/g))
    ].map((match) => normalizeContent(match[0]));

    if (numericClaims.some((claim) => claim && !allEvidence.includes(claim))) {
      return true;
    }

    const observationMatch = text.match(/(?:刚|最近)(?:刷到|看到|看见|留意到|注意到)[^。！？\n]{0,70}(?:照片|视频|朋友圈|动态|宝宝|孩子)|(?:您|你)(?:刚|最近)?发的[^。！？\n]{0,50}(?:照片|视频|朋友圈|动态)/);

    if (observationMatch && !userEvidence.includes(normalizeContent(observationMatch[0]))) {
      return true;
    }

    const personalClaim = text.match(/(?:我|我们|我这边)(?:自己)?(?:也是|之前|以前|去年|已经|曾经|最近|刚刚|刚|靠|做过|带过|帮过|帮助过|服务过|陪伴过)/);

    if (personalClaim && !userEvidence.includes(normalizeContent(personalClaim[0]))) {
      return true;
    }

    const outcomeClaim = text.match(
      /稳定(?:收入|收益|分润)|做到(?:周薪|月入)|轻松赚钱|保证(?:收益|赚钱|收入|分润)|一定(?:能|可以)?赚钱|月入过万/
    );

    if (outcomeClaim && !knowledgeEvidence.includes(normalizeContent(outcomeClaim[0]))) {
      return true;
    }

    const institutionalClaim = text.match(
      /(?:我们公司|本公司|公司|平台|团队|品牌|产品)[^。！？\n]{0,50}(?:国家(?:级)?认证|权威(?:认证|检测|背书)|官方(?:认证|认可)|专利|获奖|上市|批准|资质|检测报告)/
    );

    if (institutionalClaim && !allEvidence.includes(normalizeContent(institutionalClaim[0]))) {
      return true;
    }

    const institutionalAssertion = text.match(
      /(?:我们公司|本公司|公司|平台|团队|品牌)[^。！？\n]{0,36}(?:实力(?:很|非常)?强|领先|强大|靠谱|正规|可靠|值得信赖)/
    );

    if (institutionalAssertion && !allEvidence.includes(normalizeContent(institutionalAssertion[0]))) {
      return true;
    }

    const productAssertion = text.match(
      /(?:这个|我们的|该)?产品[^。！？\n]{0,40}(?:效果(?:很|非常)?好|安全(?:可靠)?|有效|优质|最好|没有副作用)/
    );

    if (productAssertion && !allEvidence.includes(normalizeContent(productAssertion[0]))) {
      return true;
    }

    const riskGuarantee = text.match(/零风险|没有风险|无风险|稳赚(?:不赔)?|不会亏/);

    if (riskGuarantee && !allEvidence.includes(normalizeContent(riskGuarantee[0]))) {
      return true;
    }

    const unverifiedCaseClaim = text.match(
      /(?:(?:我|我们|公司|团队|平台)(?:已经|曾经)?(?:帮助|服务|带领)?)?(?:很多|大量|不少|多位|多名|一批)(?:客户|伙伴|宝妈|妈妈|家庭|用户|人)[^。！？\n]{0,60}(?:成功|改善|实现|获得|做到|增加|赚|收益|收入|分润|改变)/
    );

    if (unverifiedCaseClaim && !allEvidence.includes(normalizeContent(unverifiedCaseClaim[0]))) {
      return true;
    }

    const personalCaseClaim = text.match(
      /(?:我|我们|我这边)[^。！？\n]{0,40}(?:帮|帮助|服务|带领)[^。！？\n]{0,40}(?:解决过|改善过|成功|实现|做到)/
    );

    if (personalCaseClaim && !allEvidence.includes(normalizeContent(personalCaseClaim[0]))) {
      return true;
    }

    const teamExperienceClaim = text.match(
      /(?:公司|团队|平台|品牌)[^。！？\n]{0,30}(?:有|拥有|具备)[^。！？\n]{0,20}(?:[一二三四五六七八九十百]+年|多年|丰富|成熟)[^。！？\n]{0,12}经验/
    );

    if (teamExperienceClaim && !allEvidence.includes(normalizeContent(teamExperienceClaim[0]))) {
      return true;
    }
  }

  return false;
}

const CAREER_MENTOR_ADAPTIVE_REPLY_TITLES = [
  "AI建议话术 1（稳妥自然型）",
  "AI建议话术 2（共情引导型）",
  "AI建议话术 3（轻问推进型）"
] as const;

function buildCareerMentorSafeAdaptiveReplies(
  classification: CareerMentorClassification,
  supportingContext: string
) {
  if (classification.stage === "ice_breaking") {
    return /宝妈|妈妈|带孩子|带娃/.test(normalizeContent(supportingContext))
      ? [
          "您好，带孩子的同时还要安排好自己的生活确实不容易。我们先不急着聊太多，我想先了解一下，您现在更希望改善时间安排，还是想多了解一个适合自己的选择？我再按您的实际情况和您说。",
          "您好，平时既要照顾孩子，也要安排自己的事情，确实挺辛苦的。您现在是更在意时间能不能灵活一些，还是想先看看有没有适合自己的方向？",
          "您好，我们先轻松认识一下，不着急谈太多。您目前主要是在照顾家庭，还是也有工作或其他安排？我了解清楚后再和您分享。"
        ]
      : [
          "您好，我们先不急着聊太多。我想先了解一下，您现在主要是在工作、做生意，还是照顾家庭？我再根据您的实际情况和您说。",
          "您好，我们先简单认识一下。您现在的生活重心更多是在工作、做生意，还是照顾家庭？我了解清楚后再和您交流。",
          "您好，不着急聊具体内容。我想先听听您目前最关注的是时间安排、收入方向，还是个人成长？您方便从最关心的一点说起吗？"
        ];
  }

  if (classification.stage === "follow_up") {
    return [
      "您好，资料您先按自己的节奏看。看完告诉我您最想先了解哪一部分，我再按您的关注点和您说。",
      "您好，不着急回复我。资料里哪一部分您比较有感觉，或者哪一部分还没看明白？您告诉我一个点，我按那个点和您聊。",
      "您好，您可以先不用一次看完。您更想先了解具体怎么做、时间怎么安排，还是整个模式？我先把您最关心的一点说明白。"
    ];
  }

  if (classification.stage === "career_presentation") {
    return [
      "您好，我们先把您最关心的一点讲清楚。您现在更想先了解怎么参与，还是时间和投入怎么安排？我按您的关注点一步一步说。",
      "您好，您可以先按自己的判断标准来了解，不需要急着做决定。您最想先核实哪一点？我先把这一点说清楚。",
      "您好，我先不一次讲很多。您更想先听整体逻辑，还是先了解参与后的具体步骤？我按您最关心的顺序来讲。"
    ];
  }

  if (classification.stage === "objection_handling") {
    return [
      "您好，您有顾虑很正常。您现在最担心的是哪一点？我们先把这一个问题说清楚，再看下一步。",
      "您好，先不用急着做决定。您是对价值、信任、时间，还是具体执行还有顾虑？我们只先解决最关键的一点。",
      "您好，认真确认清楚再决定是对的。您把最犹豫的地方直接告诉我，我先把事实和逻辑说明白，再由您判断。"
    ];
  }

  if (classification.stage === "closing") {
    return [
      "您好，前面您已经了解了一些。您现在主要卡在哪一步？我们先把这个问题解决，再确认一个您方便执行的下一步。",
      "您好，前面的内容如果您基本认可，我们就不把问题放得太大。您觉得现在最需要确认的是时间、流程，还是第一步怎么开始？",
      "您好，我们先定一个您没有压力的小步骤。您更方便先确认参与方式，还是先把具体时间安排好？"
    ];
  }

  return [
    "可以的。为了给您换一个真正适合当前情况的方案，请先告诉我您最想调整的是表达方式、执行步骤，还是客户话术。",
    "可以的。您先告诉我客户目前说了什么、已经沟通到哪一步，我再按这个场景给您更合适的表达。",
    "可以的。您更希望这次回复自然一点、共情一点，还是更明确地推进下一步？我按您要的方向调整。"
  ];
}

function parseCareerMentorAdaptiveReplyItemHeading(line: string) {
  if (/^(?: {4,}|\t)/.test(line)) {
    return null;
  }

  const normalized = line
    .replace(/^ {0,3}#{1,6}\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
  const match = normalized.match(
    /^(?:AI建议话术|话术)\s*((?:[一二三四五六七八九十\d]+|[①②③④⑤⑥⑦⑧⑨⑩]))?(?:[（(][^）)]{1,24}[）)])?\s*[：:]?\s*(.*)$/i
  );

  if (!match) {
    return null;
  }

  const slotMap: Record<string, number> = {
    "1": 0,
    "一": 0,
    "①": 0,
    "2": 1,
    "二": 1,
    "②": 1,
    "3": 2,
    "三": 2,
    "③": 2
  };

  return {
    slot: match[1] ? (slotMap[match[1]] ?? -1) : null,
    firstLine: match[2]?.trim() ?? ""
  };
}

function readCareerMentorAdaptiveReplies(lines: string[]) {
  const replies: Array<{ slot: number; text: string }> = [];
  let activeLines: string[] | null = null;
  let activeSlot: number | null = null;
  let nextSequentialSlot = 0;

  function flushReply() {
    if (!activeLines) {
      return;
    }

    const text = activeLines
      .map((line) => line.replace(/^\s*>\s?/, "").trim())
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) {
      const slot = activeSlot ?? nextSequentialSlot;

      if (slot >= 0 && slot < CAREER_MENTOR_ADAPTIVE_REPLY_TITLES.length) {
        replies.push({ slot, text });
        nextSequentialSlot = Math.max(nextSequentialSlot, slot + 1);
      }
    }

    activeLines = null;
    activeSlot = null;
  }

  for (const line of lines) {
    const heading = parseCareerMentorAdaptiveReplyItemHeading(line);

    if (heading) {
      flushReply();
      activeSlot = heading.slot;
      activeLines = heading.firstLine ? [heading.firstLine] : [];
      continue;
    }

    if (activeLines) {
      activeLines.push(line);
    }
  }

  flushReply();
  return replies;
}

function buildCareerMentorAdaptiveReplySection(replies: string[]) {
  return [
    "### AI思考回复话术",
    "",
    ...CAREER_MENTOR_ADAPTIVE_REPLY_TITLES.flatMap((title, index) => [
      `#### ${title}`,
      "",
      ...replies[index].split("\n").map((line) => `> ${line}`),
      ""
    ])
  ];
}

function removeCareerMentorAiReplySections(
  lines: string[],
  sections: ReturnType<typeof findCareerMentorAiReplySections>
) {
  const guardedLines: string[] = [];
  let cursor = 0;
  let firstInsertionIndex: number | null = null;

  for (const section of sections) {
    guardedLines.push(...lines.slice(cursor, section.startIndex));
    firstInsertionIndex ??= guardedLines.length;
    cursor = section.endIndex;
  }

  guardedLines.push(...lines.slice(cursor));

  return {
    lines: guardedLines,
    insertionIndex: firstInsertionIndex ?? guardedLines.length
  };
}

function sanitizeCareerMentorAdaptiveReplies(
  answer: string,
  input: CareerMentorAnswerGroundingInput
) {
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const classification = classifyCareerMentorQuestion(input.question, input.supportingContext);
  const sections = findCareerMentorAiReplySections(lines);

  if (
    !isCareerMentorCoreStage(classification.stage)
    || (input.strictEvidencePlan === true && input.chunks.length === 0)
  ) {
    if (sections.length === 0) {
      return answer;
    }

    return removeCareerMentorAiReplySections(lines, sections)
      .lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const generatedReplies = sections.flatMap((section) => (
    readCareerMentorAdaptiveReplies(lines.slice(section.contentStartIndex, section.endIndex))
  ));
  const safeReplies = input.strictEvidencePlan === true
    ? (input.evidencePlanAdaptiveReplies ?? []).slice(0, CAREER_MENTOR_ADAPTIVE_REPLY_TITLES.length)
    : buildCareerMentorSafeAdaptiveReplies(
        classification,
        `${input.question}\n${input.supportingContext ?? ""}`
      );
  const groundedCopyKey = normalizeContent(
    extractCareerMentorCustomerAnswer(answer)
  );
  const selectedReplies: string[] = [];
  const selectedKeys = new Set<string>();

  for (let slot = 0; slot < CAREER_MENTOR_ADAPTIVE_REPLY_TITLES.length; slot += 1) {
    const slotCandidates = input.strictEvidencePlan === true
      ? []
      : generatedReplies
          .filter((reply) => reply.slot === slot)
          .map((reply) => reply.text);
    const candidates = input.strictEvidencePlan === true
      ? [safeReplies[slot]].filter((reply): reply is string => Boolean(reply))
      : [...slotCandidates, safeReplies[slot], ...safeReplies].filter(
      (reply): reply is string => Boolean(reply)
        );

    for (const reply of candidates) {
      const key = normalizeContent(reply);
      const isGeneratedReply = slotCandidates.includes(reply);
      const replyLines = reply.split("\n").map((line) => `> ${line}`);

      if (
        !key
        || selectedKeys.has(key)
        || (
          isGeneratedReply
          && Boolean(groundedCopyKey)
          && (
            key === groundedCopyKey
            || key.includes(groundedCopyKey)
            || groundedCopyKey.includes(key)
          )
        )
        || (
          (isGeneratedReply || input.strictEvidencePlan === true)
          && hasUnsupportedCareerMentorAdaptiveFacts(replyLines, input)
        )
      ) {
        continue;
      }

      selectedReplies.push(reply);
      selectedKeys.add(key);
      break;
    }
  }

  const answerWithoutAiSections = removeCareerMentorAiReplySections(lines, sections);
  const baseLines = answerWithoutAiSections.lines;

  if (
    input.strictEvidencePlan === true
    && selectedReplies.length !== CAREER_MENTOR_ADAPTIVE_REPLY_TITLES.length
  ) {
    return baseLines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const replacementLines = buildCareerMentorAdaptiveReplySection(selectedReplies);

  const fenceMask = buildCareerMentorFenceMask(baseLines);
  const copyHeadingIndex = baseLines.findIndex((line, index) => (
    !fenceMask[index] && isCareerMentorCopyHeading(line)
  ));
  const insertionIndex = copyHeadingIndex >= 0
    ? copyHeadingIndex
    : answerWithoutAiSections.insertionIndex;

  return [
    ...baseLines.slice(0, insertionIndex),
    "",
    ...replacementLines,
    ...baseLines.slice(insertionIndex)
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function findCareerMentorCopySections(lines: string[]) {
  const fenceMask = buildCareerMentorFenceMask(lines);
  const aiReplyMask = buildCareerMentorAiReplyMask(lines, fenceMask);
  const startIndexes = lines
    .map((line, index) => (!fenceMask[index] && isCareerMentorCopyHeading(line) ? index : -1))
    .filter((index) => index >= 0);

  const explicitSections = startIndexes.map((startIndex, sectionIndex) => {
    const nextCopyIndex = startIndexes[sectionIndex + 1] ?? lines.length;
    let endIndex = nextCopyIndex;

    for (let index = startIndex + 1; index < nextCopyIndex; index += 1) {
      if (
        !fenceMask[index]
        && (
          isCareerMentorAiReplyHeading(lines[index])
          || /^ {0,3}#{1,2}\s+/.test(lines[index])
        )
      ) {
        endIndex = index;
        break;
      }
    }

    let firstScriptIndex = -1;

    for (let index = startIndex + 1; index < endIndex; index += 1) {
      if (!fenceMask[index] && isCareerMentorFirstScriptHeading(lines[index])) {
        firstScriptIndex = index;
        break;
      }
    }

    return {
      startIndex,
      endIndex,
      firstScriptIndex,
      explicitCopyHeading: true
    };
  });
  const orphanScriptIndexes = lines
    .map((line, index) => (
      !fenceMask[index]
      && !aiReplyMask[index]
      && isCareerMentorFirstScriptHeading(line)
      && !explicitSections.some((section) => index > section.startIndex && index < section.endIndex)
        ? index
        : -1
    ))
    .filter((index) => index >= 0);
  const orphanSections = orphanScriptIndexes.map((startIndex, sectionIndex) => {
    const nextOrphanIndex = orphanScriptIndexes[sectionIndex + 1] ?? lines.length;
    let endIndex = nextOrphanIndex;

    for (let index = startIndex + 1; index < nextOrphanIndex; index += 1) {
      if (
        !fenceMask[index]
        && (
          isCareerMentorAiReplyHeading(lines[index])
          || /^ {0,3}#{1,2}\s+/.test(lines[index])
        )
      ) {
        endIndex = index;
        break;
      }
    }

    return {
      startIndex,
      endIndex,
      firstScriptIndex: startIndex,
      explicitCopyHeading: false
    };
  });

  return [...explicitSections, ...orphanSections]
    .sort((left, right) => left.startIndex - right.startIndex);
}

function unwrapCareerMentorScriptFormatting(value: string) {
  let normalized = value.replace(/\r\n/g, "\n").trim();
  const wrapperPairs: Array<readonly [string, string]> = [
    ["“", "”"],
    ["\"", "\""],
    ["「", "」"],
    ["『", "』"]
  ];

  for (const [opening, closing] of wrapperPairs) {
    if (normalized.startsWith(opening) && normalized.endsWith(closing)) {
      normalized = normalized.slice(opening.length, -closing.length).trim();
      break;
    }
  }

  return normalized;
}

function readCareerMentorFirstScript(lines: string[], firstScriptIndex: number, endIndex: number) {
  if (firstScriptIndex < 0) {
    return "";
  }

  const nextHeadingOffset = lines
    .slice(firstScriptIndex + 1, endIndex)
    .findIndex((line) => /^\s*#{1,6}\s+/.test(line));
  const scriptEndIndex = nextHeadingOffset < 0
    ? endIndex
    : firstScriptIndex + 1 + nextHeadingOffset;
  const script = lines
    .slice(firstScriptIndex + 1, scriptEndIndex)
    .map((line) => line.replace(/^\s*>\s?/, ""))
    .join("\n")
    .trim();

  return unwrapCareerMentorScriptFormatting(script);
}

function isCareerMentorScriptGrounded(
  script: string,
  chunk: RetrievedRagChunk,
  classification: CareerMentorClassification
) {
  const content = chunk.content.replace(/\r\n/g, "\n");
  const explicitScripts = extractCareerMentorExplicitCustomerScriptBlocks(content);

  if (!script || !explicitScripts.includes(script)) {
    return false;
  }

  const metadataIdentity = [
    chunk.title,
    chunk.sourceTitle ?? "",
    chunk.category ?? "",
    ...(chunk.tags ?? [])
  ].join(" ");
  const contentLead = chunk.content.slice(0, 800);
  const sourceStages = resolveCareerMentorSourceStages(metadataIdentity, contentLead);

  if (isCareerMentorCoreStage(classification.stage)) {
    if (!sourceStages.has(classification.stage)) {
      return false;
    }
  } else if (classification.stage !== "framework") {
    return false;
  }

  return true;
}

function buildCareerMentorCanonicalCopySection(script: string) {
  return [
    "## 可复制给客户",
    "",
    "### 话术 1",
    "",
    ...script.replace(/\r\n/g, "\n").split("\n").map((line) => `> ${line}`)
  ];
}

function replaceCareerMentorCopySections(
  lines: string[],
  copySections: ReturnType<typeof findCareerMentorCopySections>,
  replacementLines: string[]
) {
  if (copySections.length === 0) {
    return [...lines, "", ...replacementLines]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const guardedLines: string[] = [];
  let cursor = 0;

  for (let sectionIndex = 0; sectionIndex < copySections.length; sectionIndex += 1) {
    const copySection = copySections[sectionIndex];

    guardedLines.push(...lines.slice(cursor, copySection.startIndex));

    if (sectionIndex === 0) {
      guardedLines.push(...replacementLines);
    }

    cursor = copySection.endIndex;
  }

  guardedLines.push(...lines.slice(cursor));

  return guardedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isCareerMentorSelectedEvidenceChunk(
  chunk: RetrievedRagChunk,
  input: CareerMentorAnswerGroundingInput
) {
  if (input.strictEvidencePlan !== true) {
    return true;
  }

  const selectedEvidenceIds = new Set(input.evidencePlanEvidenceIds ?? []);
  return selectedEvidenceIds.has(chunk.chunkId)
    || selectedEvidenceIds.has(chunk.knowledgeItemId);
}

function isCareerMentorCanonicalCopyAuthorized(
  canonicalCopy: CareerMentorCanonicalCopyEntry | null,
  classification: CareerMentorClassification,
  input: CareerMentorAnswerGroundingInput
) {
  if (!canonicalCopy) {
    return false;
  }

  if (input.strictEvidencePlan !== true) {
    return true;
  }

  const expectedSourceKey = normalizeContent(canonicalCopy.sourceTitle);

  return input.chunks.some((chunk) => {
    if (!isCareerMentorSelectedEvidenceChunk(chunk, input)) {
      return false;
    }

    const metadataIdentity = [
      chunk.title,
      chunk.sourceTitle ?? "",
      chunk.category ?? "",
      ...(chunk.tags ?? [])
    ].join(" ");
    const sourceStages = resolveCareerMentorSourceStages(
      metadataIdentity,
      chunk.content.slice(0, 800)
    );
    const sourceMatches = chunk.content.includes(canonicalCopy.script)
      && normalizeContent(metadataIdentity).includes(expectedSourceKey);

    return sourceMatches
      && isCareerMentorCoreStage(classification.stage)
      && sourceStages.has(classification.stage);
  });
}

function isCareerMentorPlannedFixedScriptGrounded(
  script: string,
  classification: CareerMentorClassification,
  input: CareerMentorAnswerGroundingInput
) {
  return Boolean(script) && input.chunks.some((chunk) => {
    if (!isCareerMentorSelectedEvidenceChunk(chunk, input)) {
      return false;
    }

    return isCareerMentorScriptGrounded(script, chunk, classification);
  });
}

export function enforceCareerMentorGroundedCopy(
  answer: string,
  input: CareerMentorAnswerGroundingInput
) {
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const copySections = findCareerMentorCopySections(lines);
  const classification = classifyCareerMentorQuestion(input.question, input.supportingContext);
  const canonicalCopy = selectCareerMentorCanonicalCopy(
    classification,
    input.question,
    input.supportingContext
  );
  const canonicalCopyAuthorized = isCareerMentorCanonicalCopyAuthorized(
    canonicalCopy,
    classification,
    input
  );
  const plannedFixedScript = input.evidencePlanFixedScript?.trim() ?? "";
  const plannedFixedScriptGrounded = isCareerMentorPlannedFixedScriptGrounded(
    plannedFixedScript,
    classification,
    input
  );
  let groundedFixedScript = "";

  if (copySections.length === 1) {
    const [copySection] = copySections;
    const script = readCareerMentorFirstScript(
      lines,
      copySection.firstScriptIndex,
      copySection.endIndex
    );
    const isGrounded = copySection.explicitCopyHeading
      && script.length > 0
      && (
        (canonicalCopyAuthorized && canonicalCopy?.script === script)
        || (plannedFixedScriptGrounded && plannedFixedScript === script)
        || input.chunks.some((chunk) => (
          isCareerMentorSelectedEvidenceChunk(chunk, input)
          && isCareerMentorScriptGrounded(script, chunk, classification)
        ))
      );

    if (isGrounded) {
      groundedFixedScript = script;
    }
  }

  if (groundedFixedScript) {
    return replaceCareerMentorCopySections(
      lines,
      copySections,
      buildCareerMentorCanonicalCopySection(groundedFixedScript)
    );
  }

  if (plannedFixedScriptGrounded) {
    return replaceCareerMentorCopySections(
      lines,
      copySections,
      buildCareerMentorCanonicalCopySection(plannedFixedScript)
    );
  }

  if (canonicalCopy && canonicalCopyAuthorized) {
    return replaceCareerMentorCopySections(
      lines,
      copySections,
      buildCareerMentorCanonicalCopySection(canonicalCopy.script)
    );
  }

  return replaceCareerMentorCopySections(lines, copySections, [
    "## 可复制给客户",
    "",
    CAREER_MENTOR_COPY_GROUNDING_FALLBACK
  ]);
}

export function cleanCareerMentorUserAnswer(
  answer: string,
  grounding?: CareerMentorAnswerGroundingInput
) {
  const cleaned = answer
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line
      .replace(/^\s*好的[，,]?\s*管理员[。！!，,：:]?\s*/i, "")
      .replace(/^\s*(?:#{1,6}\s*)?预期输出(?:[（(][^）)]*[）)])?\s*[：:]\s*/i, ""))
    .filter((line) => !/^\s*(?:#{1,6}\s*)?测试提问\s*\d*\s*[：:]?/i.test(line))
    .filter((line) => !/(?:问答端同步确认|投喂端同步|知识主干已建立|写死机制|源文件数字编序|三份文件已同步)/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!grounding) {
    return cleaned;
  }

  const groundedCopyAnswer = enforceCareerMentorGroundedCopy(cleaned, grounding);

  return sanitizeCareerMentorAdaptiveReplies(groundedCopyAnswer, grounding);
}

export function extractCareerMentorCustomerAnswer(answer: string) {
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const copySections = findCareerMentorCopySections(lines);

  if (
    copySections.length !== 1
    || !copySections[0].explicitCopyHeading
    || copySections[0].firstScriptIndex < 0
  ) {
    return "";
  }

  const [copySection] = copySections;

  const result: string[] = [];

  for (const line of lines.slice(copySection.startIndex + 1, copySection.endIndex)) {
    if (/^\s*#{1,2}\s+/.test(line)) {
      break;
    }

    const cleaned = line
      .replace(/^\s*#{3,6}\s*话术\s*[一二三四五六七八九十\d]*\s*[：:]?\s*/i, "")
      .replace(/^\s*>\s*/, "")
      .replace(/^\s*[“"]|[”"]\s*$/g, "")
      .trim();

    if (cleaned) {
      result.push(cleaned);
    } else if (result.length > 0 && result[result.length - 1] !== "") {
      result.push("");
    }
  }

  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
