import { BookOpenCheck, CheckCircle2, Clock3, Lightbulb, MessagesSquare, ScanSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { AiBrainStats, KnowledgeGrowthPoint } from "@/apps/team-os/features/ai-brain/types";

export function AiBrainStatsGrid({ stats }: { stats: AiBrainStats }) {
  const items = [
    { label: "候选知识", value: stats.candidateCount, icon: BookOpenCheck, color: "text-indigo-700", surface: "bg-indigo-50" },
    { label: "待审核", value: stats.pendingCount + stats.reviewingCount, icon: Clock3, color: "text-amber-700", surface: "bg-amber-50" },
    { label: "已批准", value: stats.approvedCount, icon: CheckCircle2, color: "text-emerald-700", surface: "bg-emerald-50" },
    { label: "待优化", value: stats.pendingOptimizationCount, icon: Lightbulb, color: "text-violet-700", surface: "bg-violet-50" },
    { label: "负向反馈", value: stats.negativeFeedbackCount, icon: MessagesSquare, color: "text-rose-700", surface: "bg-rose-50" },
    { label: "审核进行中", value: stats.reviewingCount, icon: ScanSearch, color: "text-sky-700", surface: "bg-sky-50" }
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div>
                <p className="text-xs font-medium text-slate-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{item.value}</p>
              </div>
              <span className={`rounded-xl p-3 ${item.surface}`}><Icon className={`h-6 w-6 ${item.color}`} aria-hidden="true" /></span>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(date);
}

export function KnowledgeGrowthChart({ points }: { points: KnowledgeGrowthPoint[] }) {
  const max = Math.max(1, ...points.map((point) => point.count));
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">知识增长趋势</h2>
          <p className="mt-1 text-sm text-slate-500">按候选知识创建日期统计，帮助观察企业经验沉淀节奏。</p>
        </div>
        {points.length === 0 ? (
          <div className="mt-6 flex min-h-44 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-400">暂无可展示的增长数据</div>
        ) : (
          <div className="mt-6 overflow-x-auto pb-2">
            <div className="flex h-52 min-w-[36rem] items-end gap-3" role="img" aria-label="候选知识增长柱状图">
              {points.map((point) => (
                <div key={point.date} className="flex h-full min-w-12 flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-xs font-semibold text-slate-600">{point.count}</span>
                  <div className="flex h-36 w-full items-end rounded-lg bg-slate-100 p-1">
                    <div className="w-full rounded-md bg-gradient-to-t from-indigo-700 to-violet-500" style={{ height: `${Math.max(5, point.count / max * 100)}%` }} />
                  </div>
                  <span className="whitespace-nowrap text-xs text-slate-400">{dayLabel(point.date)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
