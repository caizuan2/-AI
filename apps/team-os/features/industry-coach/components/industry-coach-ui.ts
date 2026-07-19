import type { IndustryCoachSkillKey } from "@/apps/team-os/features/industry-coach/types";

export const INDUSTRY_COACH_SKILLS: ReadonlyArray<{ key: IndustryCoachSkillKey; label: string; hint: string }> = [
  { key: "ice_breaking", label: "破冰能力", hint: "建立关系、了解客户背景" },
  { key: "needs_discovery", label: "需求挖掘", hint: "发现痛点、提出有效问题" },
  { key: "product_presentation", label: "产品价值传递", hint: "结合需求介绍产品价值" },
  { key: "objection_handling", label: "异议处理", hint: "处理价格、效果与信任问题" },
  { key: "closing_progress", label: "成交推进", hint: "形成明确的下一步行动" }
];

export function formatIndustryDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
