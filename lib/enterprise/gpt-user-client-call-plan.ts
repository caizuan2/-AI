export interface GptUserClientCallPlan {
  retrievalStrategy: string;
  userAnswerStyle: string;
  safetyRules: string[];
  recommendedAgents: string[];
  exampleUserQuestions: string[];
  answerTemplates: string[];
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStringArray(value: unknown, limit = 8) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean).slice(0, limit)
    : [];
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildFallbackUserClientCallPlan(input: {
  category?: string;
  tags?: string[];
  standardQuestion?: string;
  standardAnswer?: string;
} = {}): GptUserClientCallPlan {
  const category = input.category || "企业知识库";
  const tags = input.tags?.length ? input.tags.slice(0, 4).join("、") : "场景标签、风险边界、标准问答";

  return {
    retrievalStrategy: `用户端提问后，先按「${category}」和标签「${tags}」检索相关知识片段，再把命中的标准问答、适用场景和合规边界交给 GPT 二次推理，不让用户直接阅读原始资料。`,
    userAnswerStyle: "先共情用户问题，再解释底层逻辑，然后给出可执行建议，最后补充注意事项和咨询/评估引导。语气要自然、专业、温和，不做绝对承诺。",
    safetyRules: [
      "不承诺固定效果或收益。",
      "不替代医生、律师、财务等专业判断。",
      "涉及疾病、孕妇、儿童、老人、服药人群或高风险场景时，必须提示先咨询专业人士。",
      "案例只能作为参考，不能暗示所有人都会得到同样结果。",
      "不得把普通产品表述为治疗、治愈或诊断方案。"
    ],
    recommendedAgents: [category, "客服 Agent", "售后 Agent", "销售 Agent"].filter(Boolean).slice(0, 4),
    exampleUserQuestions: [
      input.standardQuestion || "这个情况适不适合我？",
      "使用过程中出现不适应该怎么办？",
      "它和普通方案相比差异在哪里？",
      "有没有需要避开的禁忌或注意事项？"
    ],
    answerTemplates: [
      `我先理解你的担心，再结合已入库的「${category}」资料帮你判断：这个问题不能只看单一结论，要同时看适用人群、使用阶段和风险边界。`,
      input.standardAnswer || "建议先确认用户基础情况和使用目标，再给出分阶段建议，并提醒必要时咨询专业人士。",
      "如果你愿意，我可以继续问你几个关键信息，再帮你判断更适合哪一种处理方式。"
    ]
  };
}

export function normalizeUserClientCallPlan(value: unknown, fallback: GptUserClientCallPlan): GptUserClientCallPlan {
  const record = readRecord(value);

  return {
    retrievalStrategy: readString(record.retrievalStrategy) || fallback.retrievalStrategy,
    userAnswerStyle: readString(record.userAnswerStyle) || fallback.userAnswerStyle,
    safetyRules: readStringArray(record.safetyRules, 10).length > 0
      ? readStringArray(record.safetyRules, 10)
      : fallback.safetyRules,
    recommendedAgents: readStringArray(record.recommendedAgents, 8).length > 0
      ? readStringArray(record.recommendedAgents, 8)
      : fallback.recommendedAgents,
    exampleUserQuestions: readStringArray(record.exampleUserQuestions, 10).length > 0
      ? readStringArray(record.exampleUserQuestions, 10)
      : fallback.exampleUserQuestions,
    answerTemplates: readStringArray(record.answerTemplates, 8).length > 0
      ? readStringArray(record.answerTemplates, 8)
      : fallback.answerTemplates
  };
}
