import { classifyRuntimeV2UserIntent } from "./runtime-v2-intent-classifier";
import { applyRuntimeV2ComplianceBoundary } from "./runtime-v2-compliance-boundary";
import { buildRuntimeV2DecisionGuide } from "./runtime-v2-decision-guide-policy";
import { buildObjectionHandlingPlan } from "./runtime-v2-objection-handler";
import { buildRuntimeV2SalesFollowupPlan } from "./runtime-v2-sales-followup-policy";
import { classifyRuntimeV2SalesIntent, type RuntimeV2SalesIntentProfile } from "./runtime-v2-sales-intent-classifier";
import { buildRuntimeV2SalesLoop } from "./runtime-v2-sales-loop-output";
import { buildRuntimeV2TrustBuildingMessage } from "./runtime-v2-trust-building-policy";
import type { RuntimeV2Input, RuntimeV2Memory, RuntimeV2Source } from "./runtime-v2-types";

const MAX_SCRIPT_LENGTH = 250;
const MIN_SCRIPT_LENGTH = 40;
const WEAK_SCRIPT_PATTERNS = [
  /我先确认一下您的具体情况，再给您一个更稳妥的方案/,
  /先确认客户(?:当前)?(?:真实)?目标/,
  /再给出(?:简洁且)?稳妥的说明/,
  /最后引导客户(?:回复|进入)?下一步/,
  /请先把当前目标、基础情况和最卡住的一点告诉我/,
];

function clean(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
    : "";
}

function compact(value: string, max = MAX_SCRIPT_LENGTH): string {
  const normalized = clean(value)
    .replace(/^【[^】]+】\s*/gm, "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length <= max) {
    return normalized;
  }

  return `${normalized.slice(0, max - 1).trim()}…`;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function extractSection(text: string, labels: string[]) {
  const titlePattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const bracketRegex = new RegExp(`【(?:${titlePattern})】\\s*([\\s\\S]*?)(?=\\n?【|$)`, "i");
  const bracketMatch = text.match(bracketRegex);

  if (bracketMatch?.[1]) {
    return compact(bracketMatch[1]);
  }

  const inlineRegex = new RegExp(`(?:${titlePattern})\\s*[:：]\\s*([\\s\\S]*?)(?=\\n\\S{2,18}\\s*[:：]|$)`, "i");
  return compact(text.match(inlineRegex)?.[1] ?? "");
}

function firstSpecificCandidate(rawValue: unknown): string {
  const raw = readRecord(rawValue);
  const text = clean(typeof rawValue === "string" ? rawValue : raw.answer);
  const candidates = [
    clean(raw.customerCopy),
    clean(raw.customer_copy),
    clean(raw.customerReply),
    clean(raw.customer_reply),
    clean(raw.customerAnswer),
    clean(raw.customer_answer),
    extractSection(text, ["可直接发给客户", "可直接复制给客户的话术", "客户话术", "标准回复话术", "话术"]),
  ];

  for (const candidate of candidates) {
    const next = compact(candidate);

    if (next.length >= MIN_SCRIPT_LENGTH && !WEAK_SCRIPT_PATTERNS.some((pattern) => pattern.test(next))) {
      return next;
    }
  }

  return "";
}

function safeScript(input: RuntimeV2Input, profile: RuntimeV2SalesIntentProfile, text: string): string {
  return applyRuntimeV2ComplianceBoundary({ customerCopy: text }, input, profile).customerCopy ?? text;
}

export function buildRuntimeV2CustomerScript(
  input: RuntimeV2Input,
  evidence?: { sources?: RuntimeV2Source[]; memories?: RuntimeV2Memory[]; answer?: string | null },
): string {
  const query = clean(input.query);
  const profile = classifyRuntimeV2UserIntent(input);
  const salesProfile = classifyRuntimeV2SalesIntent(input, { sources: evidence?.sources });
  const salesLoopPlan = buildRuntimeV2SalesLoop({
    scope: input,
    sources: evidence?.sources,
    memories: evidence?.memories,
  });
  const objectionPlan = buildObjectionHandlingPlan({
    scope: input,
    salesProfile,
    sources: evidence?.sources,
  });

  if (salesProfile.salesIntent === "cycle_choice") {
    return safeScript(input, salesProfile, buildRuntimeV2DecisionGuide(input).customerCopy);
  }

  if (
    salesProfile.salesIntent === "considering" ||
    salesProfile.salesIntent === "price_objection" ||
    salesProfile.salesIntent === "weight_fluctuation" ||
    salesProfile.salesIntent === "usage_question"
  ) {
    return safeScript(input, salesProfile, salesLoopPlan.nextCustomerMessage || objectionPlan.recommendedCustomerCopy);
  }

  if (salesProfile.salesIntent === "trust_building" || salesProfile.salesIntent === "effect_doubt") {
    return safeScript(input, salesProfile, buildRuntimeV2TrustBuildingMessage(input, evidence?.sources).customerCopy);
  }

  if (salesProfile.salesIntent === "followup" || salesProfile.salesIntent === "wechat_short") {
    const followup = buildRuntimeV2SalesFollowupPlan(input, salesProfile);
    const script = salesProfile.salesIntent === "wechat_short"
      ? `${followup.nextMessage} ${followup.nextQuestion}`
      : `${followup.nextMessage}\n\n${followup.nextQuestion}`;

    return safeScript(input, salesProfile, salesLoopPlan.nextCustomerMessage || script);
  }

  if (profile.intent === "comparison_table" || /33循环|77循环/.test(query)) {
    return safeScript(input, salesProfile, "33循环和77循环不是简单谁快谁慢，主要看您的基础和执行稳定性。33循环更适合先轻启动、先体验节奏的人；77循环更适合饮食作息波动大、需要完整过渡的人。我们先看您的目标、作息和当前基础，再判断从哪个周期开始，这样更稳，也更容易坚持。");
  }

  if (profile.intent === "objection_handling" || /考虑考虑|犹豫/.test(query)) {
    return safeScript(input, salesProfile, "可以的，您考虑一下很正常，我也不想让您仓促决定。您现在主要是担心价格、效果，还是时间安排不太确定？您告诉我一个最在意的点，我先帮您讲清楚，您再判断也不迟。");
  }

  if (/太贵|价格|预算/.test(query)) {
    return safeScript(input, salesProfile, "理解的，价格确实要认真考虑。我先不催您决定，想先确认一下：您主要是觉得预算有压力，还是担心不适合自己？我先把最关键的点讲清楚，您再判断是否继续，这样会更稳妥。");
  }

  if (/体重|波动|控体|减脂|大健康/.test(query)) {
    return safeScript(input, salesProfile, "体重短期波动很正常，不一定代表没有变化。水分、盐分、作息、排便和饮食节奏都会影响当天数字。我们先看 3 到 7 天趋势，再结合围度和执行情况判断，不用因为一天的数字太紧张。");
  }

  if (/KKS/i.test(query) || profile.intent === "usage_guide") {
    return safeScript(input, salesProfile, "KKS怎么用要先看您的目标和当前基础，不建议一开始就套固定方案。您先告诉我现在主要想改善什么、饮食作息大概怎样，我再帮您判断从哪个节奏开始更稳。");
  }

  if (profile.intent === "wechat_short") {
    return "微信短版可以这样发：您先别急着定方案，把当前最想改善的点和基础情况告诉我，我再按您的情况给一版更稳、更好执行的建议。";
  }

  const title = evidence?.sources?.[0]?.title ?? evidence?.memories?.[0]?.title;

  return title
    ? safeScript(input, salesProfile, salesLoopPlan.nextCustomerMessage || `我先结合“${title}”帮您简单判断：先把当前目标和最卡住的一点说清楚，我再给您一个更贴合实际的处理建议。这样不直接套方案，也更容易推进下一步。`)
    : safeScript(input, salesProfile, salesLoopPlan.nextCustomerMessage || "我先帮您把问题拆清楚：您现在最想解决的是思路、执行步骤，还是给客户回复？您告诉我一个重点，我再给您一版更具体、可以直接使用的建议。");
}

export function extractRuntimeV2CustomerScript(
  rawValue: unknown,
  input: RuntimeV2Input,
  evidence?: { sources?: RuntimeV2Source[]; memories?: RuntimeV2Memory[]; answer?: string | null },
): string {
  const candidate = firstSpecificCandidate(rawValue);

  if (candidate) {
    const salesProfile = classifyRuntimeV2SalesIntent(input, { sources: evidence?.sources });
    return safeScript(input, salesProfile, candidate);
  }

  return compact(buildRuntimeV2CustomerScript(input, evidence));
}
