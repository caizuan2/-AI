import type { RuntimeV3ScriptVariant } from "./runtime-v3-sales-learning-types";
import type {
  RuntimeV4FeedbackRecord,
  RuntimeV4ScriptRecommendation,
  RuntimeV4ScriptScore,
} from "./runtime-v4-growth-types";
import { normalizeRuntimeV4VariantEvent } from "./runtime-v4-learning-policy";

function recommendationFor(score: number, total: number, dislikeCount: number, editCount: number): RuntimeV4ScriptRecommendation {
  if (total < 2) return "keep_testing";
  if (score >= 4) return "promote";
  if (score <= -1 || dislikeCount >= 2) return "avoid";
  if (editCount + dislikeCount >= Math.max(1, total - editCount)) return "reduce";
  return "keep_testing";
}

function reasonFor(score: RuntimeV4ScriptScore, total: number) {
  if (total === 0) return "样本不足，先继续观察复制、点赞和追问行为。";
  if (score.recommendation === "promote") return "复制、正向反馈或成交信号更强，下一轮优先使用。";
  if (score.recommendation === "avoid") return "负向或流失信号偏高，下一轮应避免继续放大。";
  if (score.recommendation === "reduce") return "需要编辑或继续追问较多，下一轮降低优先级。";
  return "样本还不够稳定，继续 A/B/C 小样本测试。";
}

export function buildRuntimeV4ScriptScoreboard(input: {
  variants: RuntimeV3ScriptVariant[];
  events: RuntimeV4FeedbackRecord[];
}): RuntimeV4ScriptScore[] {
  const variants = input.variants.length > 0
    ? input.variants
    : [
      { id: "A", label: "稳妥解释", tone: "warm" as const, message: "", bestFor: "建立信任", riskLevel: "low" as const },
      { id: "B", label: "价值说明", tone: "trust_building" as const, message: "", bestFor: "价值解释", riskLevel: "low" as const },
      { id: "C", label: "柔和推进", tone: "closing_soft" as const, message: "", bestFor: "推进下一步", riskLevel: "low" as const },
    ];

  const scores = variants.map((variant) => {
    let copyCount = 0;
    let likeCount = 0;
    let dislikeCount = 0;
    let editCount = 0;
    let continueCount = 0;
    let wonCount = 0;
    let lostCount = 0;

    for (const event of input.events) {
      const eventVariant = normalizeRuntimeV4VariantEvent(event.event, event.variantId);
      const targeted = !eventVariant || eventVariant === variant.id.toUpperCase();

      if (!targeted) continue;
      if (event.event.startsWith("copy_")) copyCount += 1;
      if (event.event === "like_answer") likeCount += 1;
      if (event.event === "dislike_answer") dislikeCount += 1;
      if (event.event === "edit_script") editCount += 1;
      if (event.event === "continue_thread") continueCount += 1;
      if (event.event === "mark_deal_won") wonCount += 1;
      if (event.event === "mark_deal_lost") lostCount += 1;
    }

    const score = copyCount * 2 + likeCount * 3 + wonCount * 5 + continueCount * 2 - dislikeCount * 3 - editCount - lostCount * 5;
    const total = copyCount + likeCount + dislikeCount + editCount + continueCount + wonCount + lostCount;
    const recommendation = recommendationFor(score, total, dislikeCount, editCount);
    const draft: RuntimeV4ScriptScore = {
      variantId: variant.id,
      label: variant.label,
      tone: variant.tone,
      copyCount,
      likeCount,
      dislikeCount,
      editCount,
      continueCount,
      wonCount,
      lostCount,
      score,
      rank: 0,
      recommendation,
      reason: "",
    };

    return {
      ...draft,
      reason: reasonFor(draft, total),
    };
  });

  return scores
    .sort((left, right) => right.score - left.score || left.variantId.localeCompare(right.variantId))
    .map((score, index) => ({ ...score, rank: index + 1 }));
}
