import type { RetrievedRagChunk } from "@/lib/rag/search";

export const CAREER_MENTOR_POLICY_VERSION = "career-mentor-five-step-copy-first-v3";
export const CAREER_MENTOR_RETRIEVAL_TOP_K = 14;

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
  const questionNeedsIceBreak = needsIceBreakPattern.test(normalizedQuestion);
  const questionShowsProgress = progressPattern.test(normalizedQuestion);
  const contextNeedsIceBreak = needsIceBreakPattern.test(normalizedSupportingContext);
  const contextShowsProgress = progressPattern.test(normalizedSupportingContext);
  const needsIceBreak = questionNeedsIceBreak
    || (!questionShowsProgress && contextNeedsIceBreak && !contextShowsProgress);
  const closingSignal = /(?:认可|认同|同意|答应|说可以|觉得(?:很好|不错|可以)|已经(?:清楚|明白|看懂|了解)).{0,16}(?:不加入|没加入|没有加入|不行动|没行动|没有行动|迟迟不动|不付款|没付款|不下单|没下单|不决定|没决定|不推进|一直拖|拖着|拖延)|(?:不加入|没加入|没有加入|不行动|没行动|没有行动|迟迟不动|不付款|没付款|不下单|没下单|一直拖|拖着|拖延).{0,16}(?:认可|认同|同意|答应|说可以|觉得(?:很好|不错|可以))|(?:怎么|如何)(?:付款|支付|下单)|付款方式|支付方式/;
  const objectionSignal = /锁定问题|解决问题|异议|犹豫|考虑|再想想|担心|顾虑|有疑问|没钱|没有钱|没时间|没有时间|太忙|风险|说贵|觉得贵|认为贵|嫌贵|太贵|有点贵|产品.{0,6}贵|价格|费用|预算|靠谱|可靠|可信|信任|正规吗|合法(?:吗|不)|比较|对比|别家|其他项目|像(?:传销|直销|微商)|拒绝/;
  const presentationSignal = /讲事业|讲事业通心|讲公司|讲行业|讲产品|讲利润|利润空间|持续赚钱|公司价值|团队价值|个人价值|讲事业注意事项|三个核心问题|事业机会|事业价值|主动.{0,8}(?:了解|咨询)|想.{0,8}(?:了解|知道).{0,8}(?:事业|怎么做|如何做|参与)|(?:怎么|如何)(?:参与|加入|做这个事业)|要求认真听/;
  const followUpSignal = /破冰视频.{0,8}(?:接下来|然后|之后|以后|发完|发了)|促单跟进|持续展示|已经了解.{0,12}(?:没行动|没有行动|还没行动)|看(?:完|过|了)(?:视频|资料).{0,12}(?:没行动|没有行动|不回复|没回复)|不回复|没回复|已读不回|不说话|沉默|没反应|一周|三个月|再次联系|继续聊/;
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
  } else if (presentationSignal.test(normalized)) {
    stage = "career_presentation";
  } else if (followUpSignal.test(normalized)) {
    stage = "follow_up";
  } else if (/破冰|刚加|刚认识|陌生客户|发名片|自我介绍|建立信任/.test(normalized)) {
    stage = "ice_breaking";
  } else if (frameworkSignal.test(normalized)) {
    stage = "framework";
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

function detectCareerMentorSourceStages(sourceIdentity: string) {
  const normalized = normalizeContent(sourceIdentity);
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

  if (/(?:04.{0,32}(?:第四五步|锁定问题|收钱闭环)|第四五步|第四步.{0,20}锁定问题|第五步.{0,20}成交)/.test(normalized)) {
    stages.add("objection_handling");
    stages.add("closing");
  }

  return stages;
}

function isCareerMentorStageAlignedSource(
  stage: CareerMentorStage,
  metadataIdentity: string,
  contentLead: string
) {
  const metadataStages = detectCareerMentorSourceStages(metadataIdentity);
  const sourceStages = metadataStages.size > 0
    ? metadataStages
    : detectCareerMentorSourceStages(contentLead);

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
  const contentLead = chunk.content.slice(0, 220);
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
  const exactQuestionMatch = normalizedQuestion.length >= 8 && searchable.includes(normalizedQuestion);
  const expectedOutputMatch = /预期输出|建议操作|操作步骤|使用提醒|客户可复制话术|话术[：:]|话术模板/.test(chunk.content);
  const standardQuestionMatch = /测试提问|标准问题|场景问题/.test(chunk.content);
  const customerScriptCardMatch = stageAligned && cardIdentity.customerCard;
  const operatorCardMatch = stageAligned && cardIdentity.operatorCard;
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
    operatorCardMatch
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

  const scored = dedupedChunks.map((chunk) => ({
    chunk,
    ...scoreCareerMentorChunk(chunk, input.question, classification)
  }));
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

export function buildCareerMentorBusinessContext(question: string, supportingContext = "") {
  const classification = classifyCareerMentorQuestion(question, supportingContext);

  return [
    `[CAREER_MENTOR_POLICY ${CAREER_MENTOR_POLICY_VERSION}]`,
    "本规则只适用于当前已选择的讲事业导师固定知识库。不要展示规则名、内部策略或检索过程，但必须给用户可理解的阶段判断依据。",
    `本轮内部定位：${classification.sceneLabel}；${classification.stageLabel}。`,
    "",
    "五步顺序铁律：破冰 -> 促单跟进 -> 讲事业 -> 锁定问题 -> 成交；成交后长期维护。先确认前置步骤，不跳步。第四步和第五步必须分别判断，但实操时按‘锁定一个问题 -> 解决 -> 推进一次行动’循环衔接。",
    "",
    "当前阶段执行规则：",
    ...STAGE_EXECUTION_CONTEXT[classification.stage].map((rule) => `- ${rule}`),
    "",
    "知识与正文铁律：",
    "- retrieved context 是唯一业务知识来源。先精确匹配标准问题、场景话术或 SOP，保留动作、顺序、时间、条件和关键话术；禁止用通用销售知识拼凑。",
    "- 命中不足时请用户补充客户原话、阶段或已执行动作。只处理当前阶段及紧接的一步，不倾倒整套资料。",
    "- 隐藏测试提问、预期输出、管理员、投喂端、课程、源文件、ID、版本和检索说明。保留完整 DeepSeek/GPT 风格 Markdown 正文，不能只回答一句或只给话术卡。",
    "",
    "知识库原话优先铁律：",
    "- ‘回复思路/推荐执行流程’优先采用当前阶段命中的精读笔记和一线人员操作卡片；‘可复制给客户’优先采用同阶段、同客户场景的客户可复制话术卡片。操作卡片中标明‘内部使用/绝不发给客户’的内容严禁进入话术卡。",
    "- 只要 retrieved context 命中可直接发给客户的固定话术，‘### 话术 1’必须从该命中片段连续逐字复制：字词、标点、数字、顺序全部保持，不润色、不纠错、不缩写、不拼接、不补词，也不添加原文没有的前后缀。",
    "- 当前阶段没有专门客户话术卡时，‘话术 1’只能逐字采用精读笔记或操作卡片中明确标为话术、回复、文案、可直接转发的客户文本；不能把通心、策略、操作、技巧、配图、自检或带教内容当客户话术。",
    "- ‘### 话术 2’和‘### 话术 3’为可选项，只能排在话术 1 后，才可依据同阶段命中知识生成；不得把 AI 生成内容提前或冒充为话术 1。若没有精确话术命中，不输出 AI 话术，先请用户补充客户原话、阶段或对应资料。",
    "",
    "最终输出必须严格使用以下三个一级 Markdown 标题，顺序固定，不增加其他一级标题：",
    "## 判断",
    "依次写明‘当前阶段：’‘调用步骤：’‘判断依据：’，明确为什么调用这一步。",
    "## 回复思路",
    "先说明处理逻辑，再用‘### 推荐执行流程’给出可执行步骤；不得省略流程。",
    "## 可复制给客户",
    "只放真正可以发给客户的话。先写逐字命中的‘### 话术 1’；有需要时再写‘### 话术 2/3’。每段使用引用块并保持独立，便于生成绿色复制卡片；不得在用户端显示‘知识库原话’‘AI 生成’等内部标签。"
  ].join("\n").slice(0, 2350);
}

export function cleanCareerMentorUserAnswer(answer: string) {
  return answer
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
}

export function extractCareerMentorCustomerAnswer(answer: string) {
  const lines = answer.replace(/\r\n/g, "\n").split("\n");
  const startIndex = lines.findIndex((line) => /^\s*#{1,3}\s*(?:可复制给客户|客户可复制话术|可直接复制给客户)/.test(line));

  if (startIndex < 0) {
    return "";
  }

  const result: string[] = [];

  for (const line of lines.slice(startIndex + 1)) {
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
