"use client";

import { cn } from "@/lib/utils";

const STAGE_LABELS: Record<string, string> = {
  cold: "初次了解",
  curious: "正在了解",
  interested: "已有兴趣",
  hesitating: "正在犹豫",
  price_sensitive: "价格敏感",
  effect_doubt: "效果疑虑",
  ready_to_decide: "接近决策",
  after_start: "已开始后反馈",
  inactive: "低响应跟进",
};

export function CustomerStageBadge({
  stage,
  className,
}: {
  stage?: string | null;
  className?: string;
}) {
  if (!stage) {
    return null;
  }

  return (
    <span className={cn("rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-100", className)}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
