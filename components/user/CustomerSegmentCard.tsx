"use client";

import { Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV3GrowthOutput } from "@/lib/knowledge-runtime/runtime-v3-sales-learning-types";

const SEGMENT_LABELS: Record<RuntimeV3GrowthOutput["customerSegment"], string> = {
  new_lead: "新线索客户",
  curious_lead: "了解型客户",
  warm_lead: "暖意向客户",
  high_intent_lead: "高意向客户",
  price_sensitive_lead: "价格敏感客户",
  effect_doubt: "效果怀疑客户",
  hesitating_lead: "犹豫客户",
  started_customer: "已开始客户",
  silent_risk: "沉默风险客户",
  lost_or_stop: "停止跟进客户",
};

export function CustomerSegmentCard({
  segment,
  reason,
  tone,
  className,
}: {
  segment?: RuntimeV3GrowthOutput["customerSegment"] | null;
  reason?: string | null;
  tone?: string | null;
  className?: string;
}) {
  if (!segment) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 ring-1 ring-emerald-100", className)}>
      <div className="mb-1.5 flex items-center gap-2 font-semibold text-emerald-900">
        <Users className="h-3.5 w-3.5" aria-hidden="true" />
        客户分层：{SEGMENT_LABELS[segment] ?? segment}
      </div>
      {reason ? <p className="text-emerald-800">{reason}</p> : null}
      {tone ? <p className="mt-1 text-emerald-700">推荐语气：{tone}</p> : null}
    </div>
  );
}
