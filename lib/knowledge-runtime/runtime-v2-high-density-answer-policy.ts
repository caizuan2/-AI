import { classifyRuntimeV2UserIntent } from "./runtime-v2-intent-classifier";
import { applyRuntimeV2ComplianceBoundary } from "./runtime-v2-compliance-boundary";
import { buildRuntimeV2DecisionGuide } from "./runtime-v2-decision-guide-policy";
import { buildObjectionHandlingPlan } from "./runtime-v2-objection-handler";
import { classifyRuntimeV2SalesIntent } from "./runtime-v2-sales-intent-classifier";
import { buildRuntimeV2TrustBuildingMessage } from "./runtime-v2-trust-building-policy";
import type { RuntimeV2Input, RuntimeV2Memory, RuntimeV2Source } from "./runtime-v2-types";

export interface RuntimeV2EvidenceBundle {
  sources?: RuntimeV2Source[];
  memories?: RuntimeV2Memory[];
  rawAnswer?: string | null;
}

const WEAK_PATTERNS = [
  /先确认客户(?:当前)?(?:真实)?(?:目标|情况)/,
  /再给出(?:简洁且)?稳妥的说明/,
  /最后引导客户(?:回复|进入)?下一步/,
  /我先确认一下您的具体情况/,
  /知识库中暂无明确资料/,
  /暂无明确资料/,
];

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : "";
}

function buildEvidenceNote(input: RuntimeV2EvidenceBundle): string {
  const titles = [
    ...(input.sources ?? []).map((source) => clean(source.title) || clean(source.knowledgeBaseId) || clean(source.kbId)),
    ...(input.memories ?? []).map((memory) => clean(memory.title) || clean(memory.id)),
  ].filter(Boolean);

  const uniqueTitles = Array.from(new Set(titles)).slice(0, 2);

  return uniqueTitles.length > 0
    ? `\n\n这版回答已结合${uniqueTitles.join("、")}等资料，具体来源仍保留在引用面板中。`
    : "";
}

export function isWeakRuntimeV2Answer(answer: string | null | undefined): boolean {
  const text = clean(answer);

  if (!text) {
    return true;
  }

  const compact = text.replace(/\s+/g, "");

  if (compact.length < 120) {
    return true;
  }

  const weakHits = WEAK_PATTERNS.filter((pattern) => pattern.test(text)).length;

  return weakHits >= 2 && compact.length < 420;
}

export function buildHighDensityAnswerInstruction(input: RuntimeV2Input): string {
  const profile = classifyRuntimeV2UserIntent(input);

  return [
    "[High Density Answer Policy]",
    "禁止空话：不要只写“先确认情况、再给建议、最后引导下一步”。",
    "必须给判断标准、业务理由、可执行动作和可直接发送的话术。",
    "如涉及 33/77，要说明适合人群、使用节奏、判断方式、沟通方式和注意事项。",
    "如涉及 KKS，要说明不能承诺效果，要看基础、执行和周期管理。",
    `Current intent=${profile.intent}.`,
  ].join("\n");
}

export function buildRuntimeV2HighDensityAnswer(
  input: RuntimeV2Input,
  evidence: RuntimeV2EvidenceBundle = {},
): string {
  const query = clean(input.query);
  const profile = classifyRuntimeV2UserIntent(input);
  const salesProfile = classifyRuntimeV2SalesIntent(input, { sources: evidence.sources });
  const objectionPlan = buildObjectionHandlingPlan({ scope: input, salesProfile, sources: evidence.sources });
  const evidenceNote = buildEvidenceNote(evidence);

  if (salesProfile.salesIntent === "cycle_choice") {
    return applyRuntimeV2ComplianceBoundary({
      answer: `${buildRuntimeV2DecisionGuide(input).answer}${evidenceNote}`,
    }, input, salesProfile).answer ?? buildRuntimeV2DecisionGuide(input).answer;
  }

  if (salesProfile.salesIntent === "effect_doubt" || salesProfile.salesIntent === "trust_building") {
    const trust = buildRuntimeV2TrustBuildingMessage(input, evidence.sources ?? []);
    return applyRuntimeV2ComplianceBoundary({
      answer: `${trust.answer}\n\n可直接这样转入下一步：\n${trust.customerCopy}${evidenceNote}`,
    }, input, salesProfile).answer ?? trust.answer;
  }

  if (
    salesProfile.salesIntent === "considering" ||
    salesProfile.salesIntent === "price_objection" ||
    salesProfile.salesIntent === "usage_question"
  ) {
    return applyRuntimeV2ComplianceBoundary({
      answer: [
        `### ${objectionPlan.diagnosis}`,
        "",
        `客户心理：${objectionPlan.customerPsychology}`,
        "",
        "建议这样处理：",
        `1. ${objectionPlan.responseStrategy}`,
        "2. 只追问一个最关键的顾虑，不要一次问太多。",
        "3. 用低压力下一步承接客户回复。",
        "",
        "可直接这样回：",
        objectionPlan.recommendedCustomerCopy,
        evidenceNote,
      ].join("\n"),
    }, input, salesProfile).answer ?? objectionPlan.recommendedCustomerCopy;
  }

  if (profile.intent === "comparison_table") {
    return [
      "### 33循环和77循环对比表",
      "",
      "| 对比维度 | 33循环 | 77循环 | 沟通重点 |",
      "| --- | --- | --- | --- |",
      "| 适合人群 | 想先轻启动、先体验节奏、基础较稳定的人 | 作息饮食波动更大、希望完整过渡和周期管理的人 | 不要说谁一定更快，先看基础和执行稳定性 |",
      "| 使用节奏 | 更适合先建立执行感，观察饮食、作息和反馈 | 更适合拉长观察周期，把习惯、反馈和调整串起来 | 让客户理解“周期”是管理节奏，不是承诺结果 |",
      "| 判断方式 | 看客户目标是否清晰、执行是否稳定、是否能先配合基础动作 | 看客户是否需要更完整陪跑、是否经常反复、是否需要阶段调整 | 先问目标、当前基础、作息饮食和可配合程度 |",
      "| 沟通方式 | 适合说“先从轻一点的节奏开始，看看身体反馈” | 适合说“我们把周期拉完整一点，更方便观察和调整” | 强调稳妥、可执行、按反馈调整 |",
      "| 注意事项 | 不承诺固定效果，不把周期说成保证 | 不承诺固定效果，不替代专业诊断 | 控体类沟通要保留边界：看基础、执行和反馈 |",
      "",
      "客户如果还不确定，先不要直接让他选 33 或 77。更稳的做法是先确认三个信息：当前目标、日常饮食作息、过去执行是否容易中断。确认后再判断从轻启动还是完整周期开始。",
      evidenceNote,
    ].join("\n");
  }

  if (profile.intent === "objection_handling" || profile.intent === "customer_reply") {
    return [
      "### 先接住客户情绪，再问出真实顾虑",
      "",
      "客户说“考虑考虑”时，不要急着追单，也不要只回“好的”。这句话通常代表客户还没有完全拒绝，而是在价格、效果、信任、时间安排里还有一个点没想清楚。",
      "",
      "建议先做三步：",
      "1. 先认可客户想再判断的状态，让对方没有压力。",
      "2. 再用一个问题确认真正卡点，别一次问太多。",
      "3. 最后给一个低压力下一步，让客户愿意继续回复。",
      "",
      "可直接这样回：",
      "“可以的，您考虑一下很正常，我也不想让您仓促决定。您现在主要是担心价格、效果，还是时间安排不太确定？您告诉我一个最在意的点，我先帮您讲清楚，您再判断也不迟。”",
      evidenceNote,
    ].join("\n");
  }

  if (/体重|波动|控体|减脂|大健康/.test(query)) {
    return [
      "### 控体期间体重波动是正常现象",
      "",
      "体重短期上下浮动，不一定代表方案无效。控体过程中，体重会受水分、盐分、作息、排便、运动后肌肉储水、饮食节奏等影响，尤其是前期更容易出现一天重一点、一天轻一点的情况。",
      "",
      "可以这样判断：",
      "1. 不看单日体重，至少看 3 到 7 天趋势。",
      "2. 同时看围度、精神状态、饮食执行和排便情况。",
      "3. 如果连续多天都偏离，再根据饮食和作息做调整。",
      "",
      "给客户解释时不要承诺一定下降，要说“先看趋势和执行反馈”。这样更合规，也更容易让客户稳定执行。",
      evidenceNote,
    ].join("\n");
  }

  if (profile.intent === "usage_guide" || /KKS/i.test(query)) {
    return [
      "### KKS使用要先看目标和执行基础",
      "",
      "KKS不是简单固定步骤，更适合按客户目标、当前基础、饮食作息和执行稳定性来安排。沟通时不要直接承诺效果，先确认客户想改善什么、当前基础如何、能不能配合周期管理。",
      "",
      "建议流程：",
      "1. 先问客户目标：想改善体重、围度、状态，还是饮食节奏。",
      "2. 再问当前基础：作息、饮食、排便、过去是否反复。",
      "3. 最后按反馈给使用节奏，并说明需要观察周期反馈。",
      "",
      "可直接对客户说：",
      "“KKS怎么用要先看您的目标和当前基础，不建议一开始就套固定方案。您先告诉我现在主要想改善什么、饮食作息大概怎样，我再帮您判断从哪个节奏开始更稳。”",
      evidenceNote,
    ].join("\n");
  }

  if (profile.intent === "wechat_short") {
    return "可以的，我给您压成微信短版：先别急着下结论，您把当前最想解决的点告诉我，我再按您的情况给一个更适合的建议。这样更稳，也避免直接套方案。";
  }

  return [
    "### 先给结论",
    "",
    `你问的是“${query || "当前问题"}”。先不要用固定模板回答，应该先判断对方真正想解决的是思路、执行步骤，还是客户沟通话术。`,
    "",
    "建议这样处理：",
    "1. 先把问题对象讲清楚，避免答偏。",
    "2. 再给出 2 到 3 个具体判断标准。",
    "3. 最后给一段可以直接使用的表达或下一步动作。",
    evidenceNote,
  ].join("\n");
}
