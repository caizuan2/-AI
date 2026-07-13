import type { RetrievedRagChunk } from "@/lib/rag/search";

export const CAREER_MENTOR_POLICY_VERSION = "career-mentor-kb-first-v1";
export const CAREER_MENTOR_RETRIEVAL_TOP_K = 14;

export type CareerMentorStage =
  | "framework"
  | "ice_breaking"
  | "follow_up"
  | "career_presentation"
  | "objection_close"
  | "unknown";

export type CareerMentorScene =
  | "career"
  | "investment"
  | "invitation"
  | "objection"
  | "follow_up"
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
  "担心",
  "邀约",
  "招商",
  "销售团队",
  "代理",
  "经销商",
  "批发"
] as const;

const STAGE_CONFIG: Record<CareerMentorStage, { label: string; terms: string[] }> = {
  framework: {
    label: "讲事业沟通五步整体流程",
    terms: ["沟通五步", "破冰", "促单跟进", "讲事业通心", "锁定问题", "扎口袋成交"]
  },
  ice_breaking: {
    label: "第一步：破冰",
    terms: ["第一步", "破冰", "破冰视频", "建立信任", "筛选客户", "操作", "话术"]
  },
  follow_up: {
    label: "第二步：促单跟进",
    terms: ["第二步", "促单跟进", "跟进", "客户不回复", "沉默客户", "操作", "话术"]
  },
  career_presentation: {
    label: "第三步：讲事业",
    terms: ["第三步", "讲事业", "通心", "讲事业流程", "讲事业注意事项", "操作", "话术"]
  },
  objection_close: {
    label: "第四五步：锁定问题、解决问题和扎口袋成交",
    terms: ["第四五步", "锁定问题", "解决问题", "扎口袋成交", "异议处理", "成交", "操作", "话术"]
  },
  unknown: {
    label: "待结合客户原话定位阶段",
    terms: ["讲事业", "沟通", "客户问题", "操作", "话术"]
  }
};

const SCENE_LABELS: Record<CareerMentorScene, string> = {
  career: "讲事业",
  investment: "招商",
  invitation: "邀约",
  objection: "异议处理",
  follow_up: "客户跟进",
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
  const normalized = normalizeContent(text);
  let stage: CareerMentorStage = "unknown";

  if (/沟通五步|沟通五步骤|五步流程|五个阶段/.test(normalized)) {
    stage = "framework";
  } else if (/锁定问题|解决问题|扎口袋|成交|异议|犹豫|考虑|担心|顾虑|没钱|没时间|风险|收益|转让促|生死促|三个月|各种方法.{0,8}试过|很久.{0,8}(?:不回复|不说话|没反应)/.test(normalized)) {
    stage = "objection_close";
  } else if (/破冰视频/.test(normalized) && /接下来|然后|之后|以后|发完|发了/.test(normalized)) {
    stage = "follow_up";
  } else if (/促单跟进|跟进|不回复|已读不回|不说话|沉默|没反应|一周|三个月|再次联系|继续聊/.test(normalized)) {
    stage = "follow_up";
  } else if (/讲事业|通心|讲公司|讲行业|讲产品|讲制度|事业机会|事业价值/.test(normalized)) {
    stage = "career_presentation";
  } else if (/破冰|刚加|刚认识|陌生客户|发名片|自我介绍|建立信任/.test(normalized)) {
    stage = "ice_breaking";
  }

  let scene: CareerMentorScene = "general";

  if (/异议|犹豫|考虑|担心|顾虑|拒绝|锁定问题|扎口袋|成交/.test(normalized)) {
    scene = "objection";
  } else if (/邀约|邀请|约见|见面|到店|会议/.test(normalized)) {
    scene = "invitation";
  } else if (/招商|代理|经销商|批发|销售团队|合作渠道/.test(normalized)) {
    scene = "investment";
  } else if (stage === "follow_up") {
    scene = "follow_up";
  } else if (stage === "objection_close") {
    scene = "objection";
  } else if (/讲事业|事业机会|事业价值|沟通五步/.test(normalized)) {
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

function scoreCareerMentorChunk(
  chunk: RetrievedRagChunk,
  question: string,
  classification: CareerMentorClassification
) {
  const searchable = normalizeContent([
    chunk.title,
    chunk.summary ?? "",
    chunk.content,
    ...(chunk.tags ?? [])
  ].join(" "));
  const normalizedQuestion = normalizeContent(question);
  const signalTerms = dedupe([
    ...collectSignalTerms(question),
    ...classification.retrievalTerms
  ]).map(normalizeContent).filter(Boolean);
  const signalMatches = signalTerms.filter((term) => searchable.includes(term)).length;
  const exactQuestionMatch = normalizedQuestion.length >= 8 && searchable.includes(normalizedQuestion);
  const expectedOutputMatch = /预期输出|建议操作|操作步骤|使用提醒|客户可复制话术|话术[：:]|话术模板/.test(chunk.content);
  const standardQuestionMatch = /测试提问|标准问题|场景问题/.test(chunk.content);

  return {
    score: (chunk.relevance_score * 4)
      + (exactQuestionMatch ? 14 : 0)
      + (signalMatches * 1.8)
      + (expectedOutputMatch ? 2.5 : 0)
      + (standardQuestionMatch ? 1.5 : 0),
    signalMatches,
    exactQuestionMatch,
    expectedOutputMatch
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
    .filter((item) => item.exactQuestionMatch || (bestSignalMatches >= 2 && item.signalMatches === bestSignalMatches))
    .map((item) => item.chunk.knowledgeItemId)
    .filter(Boolean));
  const limit = Math.max(1, input.topK ?? CAREER_MENTOR_RETRIEVAL_TOP_K);

  return scored
    .map((item) => ({
      ...item,
      score: item.score
        + (anchorItemIds.has(item.chunk.knowledgeItemId) ? 7 : 0)
        + (anchorItemIds.has(item.chunk.knowledgeItemId) && item.expectedOutputMatch ? 3 : 0)
    }))
    .sort((left, right) => right.score - left.score || right.chunk.relevance_score - left.chunk.relevance_score)
    .slice(0, limit)
    .map((item, index) => ({
      ...item.chunk,
      chunk_rank: index + 1
    }));
}

export function buildCareerMentorBusinessContext(question: string, supportingContext = "") {
  const classification = classifyCareerMentorQuestion(question, supportingContext);

  return [
    `[CAREER_MENTOR_POLICY ${CAREER_MENTOR_POLICY_VERSION}]`,
    "本规则只适用于当前已选择的讲事业导师知识库，不要展示规则名称或内部判断过程。",
    `本轮内部定位：${classification.sceneLabel}；${classification.stageLabel}。`,
    "",
    "知识边界铁律：",
    "- retrieved context 是本轮答案的唯一业务知识来源。禁止用模型自带的通用销售、商业或行业话术替代命中资料。",
    "- 先精确匹配资料中的标准问题、场景话术或操作 SOP，再组织回答；保留命中答案的核心逻辑、动作顺序、时间节点、条件和原有话术。",
    "- 若资料没有给出足够明确的对应答案，直接请用户补充客户原话、当前阶段或已执行动作；禁止自行拼凑通用建议。",
    "",
    "内部流程铁律：",
    "- 始终以五步推进：破冰 -> 促单跟进 -> 讲事业（通心+流程+注意事项） -> 锁定并解决问题 -> 扎口袋成交；第四、第五步作为一个连续闭环处理。",
    "- 思路、梦想家园、六大价值、市场赋能等资料只能作为当前阶段的支撑，不能覆盖五步主线。",
    "- 只回答用户当前所在阶段和紧接着的一步，不要一次性把整套课程倾倒给用户。",
    "",
    "用户化改写铁律：",
    "- 资料里的‘测试提问、预期输出、操作指导模式、管理员、知识主干、写死机制、问答端、投喂端、课程融合、源文件’都是内部包装，不得出现在用户答案。",
    "- 把管理员版答案改成一线人员能直接执行的表达，但不能删改其业务动作、时间、顺序和关键话术。不要输出来源、课程名、老师名、文档名、ID、版本或检索说明。",
    "",
    "最终输出必须严格使用以下三个一级 Markdown 标题，顺序固定，不增加其他一级标题：",
    "## 判断",
    "用一句话判断客户所处阶段和核心诉求。",
    "## 回复思路",
    "用一至两句话说明当前逻辑；需要详细 SOP 时，可在本节使用‘### 执行步骤’，逐步保留资料中的动作与时间节点。",
    "## 可复制给客户",
    "只放真正可以发给客户的话，不放分析、操作、配图、技巧或注意事项。每段独立话术写成‘### 话术 1/2/3’并使用引用块，便于生成独立绿色复制卡片。"
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
