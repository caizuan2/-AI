import type { RuntimeV4FeedbackRecord, RuntimeV4ScriptScore } from "./runtime-v4-growth-types";
import type { RuntimeV5StrategyCandidate } from "./runtime-v5-strategy-types";

function isHighRisk(candidate: RuntimeV5StrategyCandidate) {
  const text = `${candidate.messagePattern} ${candidate.expectedOutcome} ${candidate.label}`;
  return candidate.complianceRisk === "high" || /保证|必瘦|立刻见效|焦虑|不买就/i.test(text);
}

function matchCandidate(score: RuntimeV4ScriptScore, candidates: RuntimeV5StrategyCandidate[]) {
  const target = `${score.label} ${score.tone}`.toLowerCase();
  return candidates.find((candidate) =>
    target.includes(candidate.type.replace(/_/g, "-")) ||
    target.includes(candidate.type.replace(/_/g, " ")) ||
    target.includes(candidate.tone.toLowerCase()) ||
    candidate.id.toLowerCase().includes(score.variantId.toLowerCase())
  );
}

export function detectLowPerformanceStrategies(input: {
  scriptScoreboard?: RuntimeV4ScriptScore[] | null;
  feedbackEvents?: RuntimeV4FeedbackRecord[] | null;
  strategyCandidates: RuntimeV5StrategyCandidate[];
}) {
  const feedbackEvents = input.feedbackEvents ?? [];
  const sampleCount = feedbackEvents.length + (input.scriptScoreboard ?? []).reduce((sum, score) => (
    sum + score.copyCount + score.likeCount + score.dislikeCount + score.editCount + score.wonCount + score.lostCount
  ), 0);
  const reduced = new Map<string, RuntimeV5StrategyCandidate>();
  const retired = new Map<string, RuntimeV5StrategyCandidate>();
  const reasons: string[] = [];

  for (const candidate of input.strategyCandidates) {
    if (isHighRisk(candidate)) {
      retired.set(candidate.id, {
        ...candidate,
        status: "retired",
        reason: "策略包含高风险承诺或不适合健康/控体场景，直接停止推荐。",
      });
      continue;
    }

    if (sampleCount < 3) {
      reasons.push("样本少于 3 条，低效策略先保留测试，不直接淘汰。");
      continue;
    }
  }

  for (const score of input.scriptScoreboard ?? []) {
    const candidate = matchCandidate(score, input.strategyCandidates);
    if (!candidate || retired.has(candidate.id)) continue;

    const negative = score.dislikeCount + score.editCount + score.lostCount;
    const positive = score.copyCount + score.likeCount + score.continueCount + score.wonCount;

    if (score.recommendation === "avoid" || negative > positive + 1) {
      reduced.set(candidate.id, {
        ...candidate,
        status: "reduced",
        reason: `历史反馈偏弱：${score.reason}`,
      });
    } else if (score.recommendation === "reduce") {
      reduced.set(candidate.id, {
        ...candidate,
        status: "reduced",
        reason: score.reason,
      });
    }
  }

  return {
    reducedStrategies: Array.from(reduced.values()),
    retiredStrategies: Array.from(retired.values()),
    reasons: Array.from(new Set(reasons)),
    sampleCount,
  };
}
