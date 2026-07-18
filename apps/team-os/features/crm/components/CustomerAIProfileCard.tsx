import { BrainCircuit, Target, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerRiskBadge } from "@/apps/team-os/features/crm/components/CrmBadges";
import { CUSTOMER_INTENT_LABELS, formatCrmDate } from "@/apps/team-os/features/crm/components/crm-ui";
import type { CustomerAIProfileRecord } from "@/apps/team-os/features/crm/types";

export function CustomerAIProfileCard({ profile, stale }: { profile?: CustomerAIProfileRecord; stale: boolean }) {
  if (!profile) {
    return <Card className="border-dashed border-slate-300"><CardContent className="flex min-h-44 flex-col items-center justify-center p-5 text-center"><BrainCircuit className="h-9 w-9 text-slate-300" aria-hidden="true" /><p className="mt-3 font-medium text-slate-800">尚未生成 AI 客户画像</p><p className="mt-1 text-sm text-slate-500">添加至少一条跟进并手动分析后，将在这里展示意向、痛点、风险与成交概率。</p></CardContent></Card>;
  }

  const probability = Math.max(0, Math.min(100, profile.purchaseProbability ?? 0));
  return (
    <Card className="border-indigo-200 bg-indigo-50/30">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="flex items-center gap-2"><BrainCircuit className="h-5 w-5 text-indigo-700" aria-hidden="true" />AI 客户画像</CardTitle>{stale ? <Badge variant="warning">画像待更新</Badge> : <Badge>已更新</Badge>}</div></CardHeader>
      <CardContent className="space-y-5">
        <div className="flex flex-wrap gap-2"><Badge variant="outline">{CUSTOMER_INTENT_LABELS[profile.intent]}</Badge><CustomerRiskBadge riskLevel={profile.riskLevel} /></div>
        <div><div className="flex items-center justify-between gap-3 text-sm"><span className="font-medium text-slate-700">购买概率</span><span className="font-semibold text-indigo-700">{probability}%</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="客户购买概率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={probability}><div className="h-full rounded-full bg-indigo-600" style={{ width: `${probability}%` }} /></div></div>
        <div><p className="flex items-center gap-2 text-sm font-medium text-slate-700"><TriangleAlert className="h-4 w-4 text-amber-600" aria-hidden="true" />客户痛点</p>{profile.painPoints.length > 0 ? <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-700">{profile.painPoints.map((painPoint, index) => <li key={`${painPoint}-${index}`} className="break-words rounded-lg bg-white p-3 [overflow-wrap:anywhere]">{painPoint}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">暂无明确痛点。</p>}</div>
        <div className="rounded-xl bg-violet-50 p-4"><p className="flex items-center gap-2 text-sm font-medium text-violet-900"><Target className="h-4 w-4" aria-hidden="true" />下一步建议</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-violet-950 [overflow-wrap:anywhere]">{profile.nextAction || "暂无建议。"}</p></div>
        <p className="text-xs text-slate-500">更新于 {formatCrmDate(profile.updatedAt)}</p>
      </CardContent>
    </Card>
  );
}
