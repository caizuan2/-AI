import type {
  RuntimeV4FeedbackRecord,
  RuntimeV4MetricsSummary,
  RuntimeV4ScriptScore,
} from "./runtime-v4-growth-types";

function percent(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

export function buildGrowthMetricsSummary(input: {
  events: RuntimeV4FeedbackRecord[];
  scriptScoreboard: RuntimeV4ScriptScore[];
}): RuntimeV4MetricsSummary {
  const totalEvents = input.events.length;
  const copyEvents = input.events.filter((event) => event.event.startsWith("copy_")).length;
  const positiveEvents = input.events.filter((event) => (
    event.event.startsWith("copy_") ||
    event.event === "like_answer" ||
    event.event === "continue_thread" ||
    event.event === "save_response" ||
    event.event === "mark_deal_won"
  )).length;
  const negativeEvents = input.events.filter((event) => (
    event.event === "dislike_answer" ||
    event.event === "edit_script" ||
    event.event === "mark_deal_lost" ||
    event.event === "mark_customer_silent" ||
    event.event === "mark_stop_followup"
  )).length;
  const best = input.scriptScoreboard[0];
  const low = [...input.scriptScoreboard].reverse().find((score) => score.score < 0);

  return {
    totalEvents,
    copyRateSignal: percent(copyEvents, Math.max(totalEvents, 1)),
    positiveSignalRate: percent(positiveEvents, Math.max(totalEvents, 1)),
    negativeSignalRate: percent(negativeEvents, Math.max(totalEvents, 1)),
    bestPerformingTone: best?.tone,
    lowPerformingTone: low?.tone,
    recommendation: totalEvents >= 3
      ? "已进入小样本优化，可根据复制/追问/成交反馈调整下一轮话术顺序。"
      : "样本不足，先继续收集用户复制、追问和成交反馈。",
  };
}
