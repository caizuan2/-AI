import { BookOpenCheck, Scale, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function IndustryCoachSummary({ standardCount, activeStandardCount, ruleCount }: { standardCount: number; activeStandardCount: number; ruleCount: number }) {
  const ready = activeStandardCount > 0 && ruleCount > 0;
  const metrics = [
    { label: "企业标准数量", value: standardCount, suffix: "项", icon: BookOpenCheck },
    { label: "分析规则数量", value: ruleCount, suffix: "套", icon: Scale }
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <Card key={metric.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <div className="min-w-0"><p className="text-2xl font-semibold">{metric.value}<span className="ml-1 text-sm font-medium text-slate-500">{metric.suffix}</span></p><p className="text-xs text-slate-500">{metric.label}</p></div>
            </CardContent>
          </Card>
        );
      })}
      <Card>
        <CardContent className="flex items-center gap-4 p-5">
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}><Sparkles className="h-5 w-5" aria-hidden="true" /></span>
          <div className="min-w-0"><p className="text-xs text-slate-500">AI 训练状态</p><Badge className="mt-1" variant={ready ? "default" : "warning"}>{ready ? "知识融合已就绪" : activeStandardCount === 0 ? "待配置启用标准" : "待配置评分规则"}</Badge></div>
        </CardContent>
      </Card>
    </div>
  );
}
