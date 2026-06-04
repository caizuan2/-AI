import { CheckCircle2, Loader2, Search, Sparkles } from "lucide-react";

const steps = [
  { label: "正在检索", icon: Search },
  { label: "正在阅读来源", icon: CheckCircle2 },
  { label: "正在生成答案", icon: Sparkles }
];

export function LoadingRetrievalTimeline({ active = false }: { active?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {steps.map((step, index) => {
          const Icon = active && index === 2 ? Loader2 : step.icon;

          return (
            <div key={step.label} className="flex items-center gap-2 text-sm text-muted dark:text-slate-400">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-200">
                <Icon className={`h-4 w-4 ${active && index === 2 ? "animate-spin" : ""}`} />
              </span>
              {step.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
