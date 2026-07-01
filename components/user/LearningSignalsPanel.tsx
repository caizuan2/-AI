"use client";

import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";

const SIGNAL_LABELS: Record<string, string> = {
  copied_customer_copy: "复制客户话术",
  copied_variant_a: "复制 A 话术",
  copied_variant_b: "复制 B 话术",
  copied_variant_c: "复制 C 话术",
  liked_answer: "点赞",
  disliked_answer: "点踩",
  edited_script: "编辑话术",
  continued_thread: "继续追问",
  asked_followup: "要求换一种",
  saved_response: "保存回复",
  ignored_response: "未采纳",
  manual_positive: "正向标记",
  manual_negative: "负向标记",
};

export function LearningSignalsPanel({
  signals,
  reason,
  className,
}: {
  signals?: RuntimeV3GrowthOutput["learningSignals"] | null;
  reason?: string | null;
  className?: string;
}) {
  if (!signals && !reason) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-900 ring-1 ring-emerald-100", className)}>
      <div className="mb-1.5 flex items-center gap-2 font-semibold">
        <Activity className="h-3.5 w-3.5" aria-hidden="true" />
        学习信号
      </div>
      {reason ? <p className="text-emerald-800">{reason}</p> : null}
      {(signals?.length ?? 0) > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {signals?.slice(0, 6).map((signal) => (
            <span key={signal} className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800">
              {SIGNAL_LABELS[signal] ?? signal}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
