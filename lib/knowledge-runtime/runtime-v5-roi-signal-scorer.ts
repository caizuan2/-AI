import type { RuntimeV4FeedbackRecord } from "./runtime-v4-growth-types";
import type { RuntimeV5ROISignals } from "./runtime-v5-strategy-types";

const HIGH_ROI_EVENTS = new Set([
  "copy_customer_copy",
  "copy_variant_a",
  "copy_variant_b",
  "copy_variant_c",
  "like_answer",
  "continue_thread",
  "save_response",
  "mark_deal_won",
]);

const LOW_ROI_EVENTS = new Set([
  "dislike_answer",
  "edit_script",
  "mark_deal_lost",
  "mark_stop_followup",
  "mark_customer_silent",
]);

function eventLabel(event: string) {
  const labels: Record<string, string> = {
    copy_customer_copy: "复制客户话术",
    copy_variant_a: "复制 A 版话术",
    copy_variant_b: "复制 B 版话术",
    copy_variant_c: "复制 C 版话术",
    like_answer: "点赞回答",
    continue_thread: "继续追问",
    save_response: "保存回答",
    mark_deal_won: "标记成交",
    dislike_answer: "点踩回答",
    edit_script: "编辑话术",
    mark_deal_lost: "标记未成交",
    mark_stop_followup: "停止跟进",
    mark_customer_silent: "客户沉默",
  };
  return labels[event] ?? event;
}

export function scoreRuntimeV5ROISignals(input: {
  feedbackEvents?: RuntimeV4FeedbackRecord[] | null;
}): RuntimeV5ROISignals {
  const events = input.feedbackEvents ?? [];
  const highROI = events
    .filter((event) => HIGH_ROI_EVENTS.has(event.event))
    .slice(-6)
    .map((event) => eventLabel(event.event));
  const lowROI = events
    .filter((event) => LOW_ROI_EVENTS.has(event.event))
    .slice(-6)
    .map((event) => eventLabel(event.event));
  const score = events.length === 0
    ? 0
    : Math.max(0, Math.min(1, (highROI.length + 0.5) / (highROI.length + lowROI.length + 1)));

  return {
    highROI: Array.from(new Set(highROI)),
    lowROI: Array.from(new Set(lowROI)),
    score,
    reason: events.length < 3
      ? "当前样本不足，ROI 仅代表用户采纳信号，不代表真实成交率。"
      : `当前采纳信号约 ${(score * 100).toFixed(0)}%，仅用于话术优化参考。`,
  };
}
