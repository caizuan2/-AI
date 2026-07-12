import Link from "next/link";
import { ArrowRight, Bot, RefreshCw, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrainingEmptyState, TrainingErrorState, TrainingLoadingState } from "@/apps/team-os/features/training/components/TrainingState";
import type { TrainingRecommendationData } from "@/apps/team-os/features/training/types";

const priorityLabels = { HIGH: "优先训练", MEDIUM: "建议训练", LOW: "持续提升" } as const;

export function TrainingRecommendationPanel({
  data,
  loading,
  error,
  onRetry
}: {
  data: TrainingRecommendationData | null;
  loading: boolean;
  error?: string;
  onRetry: () => void;
}) {
  if (loading) return <TrainingLoadingState label="AI 正在分析能力与课程匹配…" />;
  if (error) return <TrainingErrorState title="个性化推荐暂不可用" message={`${error} 其他课程与学习进度不受影响。`} onRetry={onRetry} />;
  if (!data || data.recommendations.length === 0) {
    return <TrainingEmptyState title="暂时没有推荐课程" description={data?.summary || "完成 AI 教练分析或企业新增启用课程后，可生成更准确的个性化推荐。"} />;
  }

  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-indigo-700" />AI 个性化推荐</CardTitle><p className="mt-2 text-sm leading-6 text-slate-600">{data.summary}</p></div>
        <Button variant="ghost" size="icon" onClick={onRetry} aria-label="重新生成推荐"><RefreshCw className="h-4 w-4" /></Button>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        {data.recommendations.map((item) => (
          <div key={item.courseId ?? item.title} className="rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><Bot className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-slate-900">{item.title}</p><Badge variant={item.priority === "HIGH" ? "warning" : "secondary"}>{priorityLabels[item.priority]}</Badge></div><p className="mt-2 text-sm leading-6 text-slate-600">{item.reason}</p></div>
            </div>
            {item.focusAreas.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{item.focusAreas.map((area) => <Badge key={area} variant="outline">{area}</Badge>)}</div> : null}
            {item.courseId ? <Link href={`/team-os/training/courses?courseId=${encodeURIComponent(item.courseId)}`} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-indigo-700 hover:text-indigo-900">查看课程<ArrowRight className="h-4 w-4" /></Link> : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
