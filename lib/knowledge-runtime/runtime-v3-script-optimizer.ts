import type {
  RuntimeV3BestScriptRecommendation,
  RuntimeV3CustomerSegment,
  RuntimeV3LearningSummary,
  RuntimeV3ScriptVariant,
} from "./runtime-v3-sales-learning-types";

function isCycleQuestion(query: string) {
  return /33|77|循环|周期|怎么选/.test(query);
}

function variant(id: string, label: string, tone: RuntimeV3ScriptVariant["tone"], message: string, bestFor: string): RuntimeV3ScriptVariant {
  return {
    id,
    label,
    tone,
    message,
    bestFor,
    riskLevel: "low",
    complianceNotes: ["不承诺效果", "不强逼单", "不制造焦虑"],
  };
}

function buildVariants(query: string, segment: RuntimeV3CustomerSegment): RuntimeV3ScriptVariant[] {
  if (isCycleQuestion(query)) {
    return [
      variant("A", "温和解释版", "trust_building", "33/77 可以先按目标和执行基础来选：如果您更想先建立习惯，可以从 33 开始；如果基础更稳定、想做完整周期管理，再考虑 77。我们先看您的作息、饮食和当前目标，再给您一个稳妥选择。", "客户正在比较 33/77，需要先降低决策压力。"),
      variant("B", "直接推进版", "direct", "33/77 的选择不用猜，我先确认三个信息：当前目标、作息饮食、过去执行情况。确认后我直接帮您判断从 33 还是 77 更合适。", "客户已经愿意继续沟通，适合推进基础信息确认。"),
      variant("C", "决策引导版", "decision_guiding", "如果您现在纠结 33/77，我建议先不要急着选长周期。先把目标和身体基础说清楚，再决定周期，这样方案会更稳，也更容易坚持。", "客户需要被引导到更稳妥的决策路径。"),
    ];
  }

  if (segment === "price_sensitive_lead") {
    return [
      variant("A", "价值解释版", "trust_building", "我理解您会先看价格。这个不是单看一次服务，而是帮您把目标、执行节奏和反馈调整理清楚，避免自己乱试走弯路。您可以先告诉我最在意的是预算，还是担心做了没变化？", "价格顾虑明显，先讲价值而不是直接降价。"),
      variant("B", "低压力推进版", "warm", "价格这块可以先不用急着定，我先帮您判断适不适合、需要多长周期。如果不匹配，我也不会建议您盲目开始。", "客户担心投入，适合降低决策压力。"),
      variant("C", "选择引导版", "decision_guiding", "您可以先按目标优先级来选：如果只是想了解方向，先做基础判断；如果已经准备调整，再看周期方案。这样不会一上来就被价格卡住。", "客户需要先建立选择框架。"),
    ];
  }

  if (segment === "effect_doubt") {
    return [
      variant("A", "真实预期版", "trust_building", "您担心效果是正常的，我不会给您保证结果。更稳妥的做法是先看您的基础情况和执行难点，再判断有没有适合的调整空间。", "客户担心效果，需要真实预期管理。"),
      variant("B", "案例边界版", "warm", "每个人情况不一样，所以不能直接套结果。我可以先帮您拆一下影响变化的关键点，比如作息、饮食、执行稳定度，再看该怎么开始。", "需要建立可信边界，避免夸大。"),
      variant("C", "决策确认版", "decision_guiding", "如果您最担心没效果，我们先不急着定方案，先确认三个基础点，再判断是否值得开始。这样对您更稳。", "把客户从怀疑带到事实判断。"),
    ];
  }

  if (segment === "silent_risk") {
    return [
      variant("A", "温和收口版", "closing_soft", "我先不打扰您了。您后面如果还想继续了解，可以直接发我您的目标和当前情况，我再帮您判断方向。", "客户沉默风险高，适合低压力收口。"),
      variant("B", "轻提醒版", "warm", "刚刚的信息您可以先慢慢看。如果卡在价格、效果或怎么开始，我可以只针对那一点给您一个简短建议。", "适合给客户留下低门槛回复口。"),
      variant("C", "停止推进版", "closing_soft", "没关系，这件事不急。您如果暂时不考虑，我这边先不继续推了，避免打扰。", "明确尊重边界，避免骚扰。"),
    ];
  }

  if (segment === "high_intent_lead") {
    return [
      variant("A", "基础确认版", "decision_guiding", "可以开始前我先确认几个基础信息：您的目标、现在的作息饮食、过去有没有尝试过类似调整。确认后我帮您判断从哪一步更稳。", "客户高意向，需要推进基础信息。"),
      variant("B", "直接安排版", "direct", "可以，我们先不复杂化。您把目标和当前情况发我，我按您的基础给您整理一个开始路径。", "客户已经准备行动，适合直接推进。"),
      variant("C", "稳妥成交版", "closing_soft", "可以先从最小一步开始，不急着做大决定。先把基础情况确认清楚，再安排适合您的节奏。", "高意向但仍需降低压力。"),
    ];
  }

  return [
    variant("A", "温和建立信任", "warm", "我理解您想先确认清楚。我们先不急着下结论，您把当前目标和最卡住的一点告诉我，我再给您更贴近实际的建议。", "客户还在了解或犹豫阶段。"),
    variant("B", "直接推进下一步", "direct", "可以，我先帮您拆成两步：先确认目标，再判断下一步怎么做。您现在最想解决的是哪一个点？", "客户愿意继续沟通时使用。"),
    variant("C", "决策引导轻成交", "decision_guiding", "如果您现在还在考虑，我建议先把真正顾虑说出来。是担心价格、效果，还是不知道怎么开始？我可以针对这一点给您更短的回复。", "客户需要明确顾虑后再推进。"),
  ];
}

export function optimizeScriptVariants(input: {
  query: string;
  customerSegment: RuntimeV3CustomerSegment;
  learningSummary?: RuntimeV3LearningSummary | null;
}) : RuntimeV3BestScriptRecommendation {
  const variants = buildVariants(input.query, input.customerSegment);
  const preferredVariant = input.learningSummary?.preferredVariantId;
  const preferredTone = input.learningSummary?.preferredTone;
  const byVariant = variants.find((item) => item.id === preferredVariant);
  const byTone = variants.find((item) => item.tone === preferredTone);
  const segmentDefault =
    input.customerSegment === "price_sensitive_lead" || input.customerSegment === "effect_doubt"
      ? variants[0]
      : input.customerSegment === "high_intent_lead"
        ? variants[1]
        : input.customerSegment === "silent_risk"
          ? variants[0]
          : variants[2] ?? variants[0];
  const recommended = byVariant ?? byTone ?? segmentDefault ?? variants[0];

  return {
    recommendedVariantId: recommended.id,
    reason: byVariant || byTone
      ? "结合当前知识库/Agent 的本地学习信号，优先推荐用户更常采纳的语气。"
      : "根据客户分层和当前问题，推荐最稳妥的话术版本。",
    alternatives: variants,
  };
}
