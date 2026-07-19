import { CheckCircle2, Clock3, Lightbulb, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBrainEmptyState } from "@/apps/team-os/features/ai-brain/components/AiBrainState";
import type { AiBrainContext, KnowledgeOptimizationRecord, KnowledgeOptimizationStatus } from "@/apps/team-os/features/ai-brain/types";

const statusLabels: Record<KnowledgeOptimizationStatus, string> = {
  PENDING: "待处理",
  APPLIED: "已应用",
  REJECTED: "已拒绝"
};

const statusIcons = {
  PENDING: Clock3,
  APPLIED: CheckCircle2,
  REJECTED: XCircle
} as const;

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function KnowledgeOptimizationList({ context, items }: { context: AiBrainContext; items: KnowledgeOptimizationRecord[] }) {
  const teamNames = new Map(context.teams.map((team) => [team.id, team.name]));
  if (items.length === 0) {
    return <AiBrainEmptyState title="暂无优化建议" description="生成分析后，错误回答、知识缺口和可识别的重复信号会形成待处理建议。" />;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {items.map((item) => {
        const Icon = statusIcons[item.status];
        return (
          <Card key={item.id}>
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="flex items-center gap-2"><Lightbulb className="h-5 w-5 text-violet-700" aria-hidden="true" />知识优化建议</CardTitle>
                <Badge variant={item.status === "PENDING" ? "warning" : item.status === "APPLIED" ? "default" : "secondary"}><Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />{statusLabels[item.status]}</Badge>
              </div>
              <p className="text-xs text-slate-400">{item.teamId ? teamNames.get(item.teamId) ?? "授权团队" : "企业级"} · {formatDate(item.createdAt)}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{item.suggestion}</p>
              <p className="break-words border-t border-slate-100 pt-3 text-xs text-slate-400 [overflow-wrap:anywhere]">关联知识标识：<span className="font-mono">{item.knowledgeId}</span></p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
