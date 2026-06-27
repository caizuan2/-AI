export type ChatModeKey =
  | "business_problem"
  | "reply_script"
  | "screenshot_analysis"
  | "conversion_path"
  | "expert_review"
  | "deep_thinking"
  | "brain_search";

export type ChatModeSource = "auto" | "manual" | "ai" | "rules";

export type ChatModeConfig = {
  key: ChatModeKey;
  label: string;
  placeholder: string;
  prompt: string;
};

export type ChatModeCandidate = {
  key: ChatModeKey;
  label: string;
  confidence: number;
  reason: string;
};

export type ChatModeDecision = {
  mode: ChatModeConfig;
  source: ChatModeSource;
  confidence: number;
  reason: string;
  alternatives: ChatModeCandidate[];
  classifierVersion: string;
};

export type FinalChatModeDecision = {
  mode: ChatModeConfig;
  source: "ai" | "rules" | "manual";
  confidence: number;
  reason: string;
  alternatives: ChatModeCandidate[];
  lockedByUser: boolean;
  classifierVersion: string;
};

export type ChatModeClassifierInput = {
  text: string;
  hasImage?: boolean;
  hasAttachment?: boolean;
  manualMode?: ChatModeKey | null;
};

export const CHAT_MODE_CLASSIFIER_VERSION = "ai-knowledge-os-v12.5-rules";

export const CHAT_MODE_ORDER: ChatModeKey[] = [
  "business_problem",
  "reply_script",
  "screenshot_analysis",
  "conversion_path",
  "expert_review",
  "deep_thinking",
  "brain_search"
];

export const CHAT_MODE_CONFIGS: Record<ChatModeKey, ChatModeConfig> = {
  business_problem: {
    key: "business_problem",
    label: "业务问题",
    placeholder: "请描述你的业务问题，我会整理判断、建议和下一步行动。",
    prompt: "请把用户问题当作真实业务问题处理。先判断问题本质，再给出处理建议、可执行话术和下一步行动。"
  },
  reply_script: {
    key: "reply_script",
    label: "回复话术",
    placeholder: "请粘贴客户原话，我会生成可直接发给客户的回复话术。",
    prompt: "请优先生成可直接发给客户的自然话术。话术要短、真诚、有边界，不要强行成交。必要时先引用小董AI大脑资料。"
  },
  screenshot_analysis: {
    key: "screenshot_analysis",
    label: "客户截图分析",
    placeholder: "请上传客户截图或粘贴聊天内容，我会分析客户意图并给出回复方案。",
    prompt: "请根据客户截图或对话内容判断客户意图、情绪和顾虑，再给出回复话术和下一步跟进建议。"
  },
  conversion_path: {
    key: "conversion_path",
    label: "成交路径",
    placeholder: "请描述当前客户阶段，我会给出成交推进路径。",
    prompt: "请判断客户所处阶段，给出低压力推进路径。不要直接逼单，先建立信任，再给下一步动作。"
  },
  expert_review: {
    key: "expert_review",
    label: "专家研判",
    placeholder: "请描述具体情况，我会从专业角度判断风险和策略。",
    prompt: "请从专业角度判断问题、风险、客户意图和处理策略，输出清晰结论和建议。"
  },
  deep_thinking: {
    key: "deep_thinking",
    label: "深度思考",
    placeholder: "请说明复杂问题，我会进行深度拆解并给出可执行方案。",
    prompt: "请进行深度拆解，说明问题本质、关键影响因素、可执行步骤和注意事项。"
  },
  brain_search: {
    key: "brain_search",
    label: "大脑搜索",
    placeholder: "请说明要查找的问题，我会优先检索小董AI大脑🧠中的资料。",
    prompt: "请优先检索小董AI大脑🧠中的资料。若命中资料，必须基于资料回答；若没有命中，明确说明暂无明确资料并给出谨慎建议。"
  }
};

type DetectorRule = {
  mode: ChatModeKey;
  confidence: number;
  keywords: string[];
  reason: string;
};

const RULES: DetectorRule[] = [
  {
    mode: "reply_script",
    confidence: 0.92,
    reason: "识别到客户回复/话术类表达。",
    keywords: [
      "怎么回复",
      "如何回复",
      "客户说",
      "帮我回",
      "话术",
      "发给客户",
      "回复客户",
      "客户问",
      "客户拒绝",
      "考虑考虑",
      "太贵",
      "不要了",
      "没兴趣"
    ]
  },
  {
    mode: "brain_search",
    confidence: 0.88,
    reason: "识别到知识库/资料检索需求。",
    keywords: [
      "知识库",
      "小董ai大脑",
      "小董AI大脑",
      "资料",
      "投喂资料",
      "根据资料",
      "查一下",
      "搜索",
      "有没有相关",
      "引用",
      "依据",
      "标准答案",
      "怎么使用",
      "说明书",
      "教程"
    ]
  },
  {
    mode: "conversion_path",
    confidence: 0.84,
    reason: "识别到成交推进类需求。",
    keywords: [
      "成交",
      "转化",
      "推进",
      "逼单",
      "下单",
      "签约",
      "付款",
      "复购",
      "客户犹豫",
      "怎么促成",
      "怎么跟进",
      "销售路径",
      "成交路径"
    ]
  },
  {
    mode: "expert_review",
    confidence: 0.8,
    reason: "识别到判断、风险或策略研判需求。",
    keywords: [
      "判断",
      "评估",
      "风险",
      "靠谱吗",
      "是否可行",
      "专业角度",
      "专家",
      "问题在哪里",
      "客户意图",
      "客户心理",
      "客户犹豫",
      "为什么犹豫",
      "犹豫原因",
      "策略",
      "研判"
    ]
  },
  {
    mode: "deep_thinking",
    confidence: 0.76,
    reason: "识别到深度拆解或复杂分析需求。",
    keywords: [
      "深度分析",
      "详细分析",
      "底层逻辑",
      "为什么",
      "原理",
      "全方面",
      "系统分析",
      "推理",
      "拆解",
      "长期方案",
      "复杂问题"
    ]
  }
];

const SCREENSHOT_KEYWORDS = [
  "截图",
  "微信截图",
  "聊天记录",
  "客户对话截图",
  "图片里",
  "识别图片",
  "screenshot",
  "image",
  "attachment"
];

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, "");
}

function matchesKeyword(text: string, keyword: string) {
  return text.includes(normalizeText(keyword));
}

function clampConfidence(value: number) {
  if (!Number.isFinite(value)) {
    return 0.5;
  }

  return Math.max(0, Math.min(1, value));
}

export function toChatModeCandidate(
  modeKey: ChatModeKey,
  confidence: number,
  reason = CHAT_MODE_CONFIGS[modeKey].prompt
): ChatModeCandidate {
  return {
    key: modeKey,
    label: CHAT_MODE_CONFIGS[modeKey].label,
    confidence: clampConfidence(confidence),
    reason
  };
}

function makeDecision(
  modeKey: ChatModeKey,
  source: ChatModeSource,
  confidence: number,
  reason: string,
  alternatives: ChatModeCandidate[] = [],
  classifierVersion = CHAT_MODE_CLASSIFIER_VERSION
): ChatModeDecision {
  return {
    mode: CHAT_MODE_CONFIGS[modeKey],
    source,
    confidence: clampConfidence(confidence),
    reason,
    alternatives: alternatives
      .filter((candidate) => candidate.key !== modeKey)
      .slice(0, 2),
    classifierVersion
  };
}

function scoreRules(input: ChatModeClassifierInput) {
  const text = normalizeText(input.text);
  const scores = new Map<ChatModeKey, ChatModeCandidate>();
  const ensureCandidate = (modeKey: ChatModeKey, confidence: number, reason: string) => {
    if (!scores.has(modeKey)) {
      scores.set(modeKey, toChatModeCandidate(modeKey, confidence, reason));
    }
  };

  if (input.hasImage || input.hasAttachment || SCREENSHOT_KEYWORDS.some((keyword) => matchesKeyword(text, keyword))) {
    scores.set("screenshot_analysis", toChatModeCandidate(
      "screenshot_analysis",
      0.96,
      "识别到截图、图片或附件分析需求。"
    ));
  }

  for (const rule of RULES) {
    const matchCount = rule.keywords.filter((keyword) => matchesKeyword(text, keyword)).length;

    if (matchCount === 0) {
      continue;
    }

    const weightedConfidence = clampConfidence(rule.confidence + Math.min(0.07, (matchCount - 1) * 0.025));
    const existing = scores.get(rule.mode);

    if (!existing || weightedConfidence > existing.confidence) {
      scores.set(rule.mode, toChatModeCandidate(rule.mode, weightedConfidence, rule.reason));
    }
  }

  const matchedModes = new Set(scores.keys());

  if (matchedModes.has("reply_script")) {
    ensureCandidate("conversion_path", 0.64, "该问题也涉及客户跟进推进。");
    ensureCandidate("expert_review", 0.52, "可进一步分析客户顾虑和回复策略。");
  }

  if (matchedModes.has("conversion_path")) {
    ensureCandidate("reply_script", 0.58, "成交推进通常也需要可直接发送的话术。");
    ensureCandidate("expert_review", 0.5, "可进一步判断客户所处阶段和风险。");
  }

  if (matchedModes.has("expert_review")) {
    ensureCandidate("deep_thinking", 0.58, "该问题也适合做更深入的原因拆解。");
    ensureCandidate("conversion_path", 0.46, "研判后可能需要形成下一步推进路径。");
  }

  if (matchedModes.has("deep_thinking")) {
    ensureCandidate("expert_review", 0.55, "深度拆解前可先给专业判断。");
    ensureCandidate("brain_search", 0.46, "复杂问题可能需要先查小董AI大脑🧠资料。");
  }

  if (matchedModes.has("brain_search")) {
    ensureCandidate("expert_review", 0.5, "资料检索后可进一步做专业研判。");
    ensureCandidate("business_problem", 0.44, "也可以按业务问题整理行动建议。");
  }

  if (matchedModes.has("screenshot_analysis")) {
    ensureCandidate("reply_script", 0.58, "截图分析后通常需要生成回复话术。");
    ensureCandidate("expert_review", 0.52, "也可以进一步判断客户意图和风险。");
  }

  if (!scores.has("business_problem")) {
    scores.set("business_problem", toChatModeCandidate(
      "business_problem",
      scores.size > 0 ? 0.42 : 0.5,
      "未识别到明确专项意图，使用业务问题默认模式。"
    ));
  }

  return Array.from(scores.values()).sort((left, right) => right.confidence - left.confidence);
}

export function buildChatModeDecisionFromCandidate(input: {
  candidate: ChatModeCandidate;
  source: ChatModeSource;
  alternatives?: ChatModeCandidate[];
  classifierVersion?: string;
}): ChatModeDecision {
  return makeDecision(
    input.candidate.key,
    input.source,
    input.candidate.confidence,
    input.candidate.reason,
    input.alternatives ?? [],
    input.classifierVersion
  );
}

export function detectChatMode(input: ChatModeClassifierInput): ChatModeDecision {
  if (input.manualMode) {
    return makeDecision(input.manualMode, "manual", 1, "用户手动选择，优先覆盖自动判断。");
  }

  const candidates = scoreRules(input);
  const primary = candidates[0] ?? toChatModeCandidate(
    "business_problem",
    0.5,
    "未识别到明确专项意图，使用业务问题默认模式。"
  );

  return buildChatModeDecisionFromCandidate({
    candidate: primary,
    source: "rules",
    alternatives: candidates.filter((candidate) => candidate.key !== primary.key)
  });
}

function toFinalChatModeDecision(decision: ChatModeDecision, lockedByUser: boolean): FinalChatModeDecision {
  return {
    mode: decision.mode,
    source: decision.source === "manual" ? "manual" : decision.source === "ai" ? "ai" : "rules",
    confidence: decision.confidence,
    reason: decision.reason,
    alternatives: decision.alternatives,
    lockedByUser,
    classifierVersion: decision.classifierVersion
  };
}

export function resolveFinalChatMode(input: {
  aiDecision?: ChatModeDecision | null;
  ruleDecision: ChatModeDecision;
  manualMode?: ChatModeKey | null;
}): FinalChatModeDecision {
  const autoDecision = input.aiDecision?.source === "ai" && input.aiDecision.confidence >= 0.65
    ? input.aiDecision
    : input.ruleDecision;

  if (input.manualMode) {
    const alternatives = [
      toChatModeCandidate(autoDecision.mode.key, autoDecision.confidence, autoDecision.reason),
      ...autoDecision.alternatives
    ];

    return toFinalChatModeDecision(
      makeDecision(input.manualMode, "manual", 1, "用户手动选择，优先覆盖自动判断。", alternatives),
      true
    );
  }

  if (autoDecision?.mode?.key) {
    return toFinalChatModeDecision(autoDecision, false);
  }

  if (input.ruleDecision?.mode?.key) {
    return toFinalChatModeDecision(input.ruleDecision, false);
  }

  return toFinalChatModeDecision(makeDecision(
    "business_problem",
    "rules",
    0.5,
    "未识别到明确专项意图，使用业务问题默认模式。"
  ), false);
}
