"use client";

import * as React from "react";
import { Bot, Lightbulb, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalyticsRangeDays, BusinessInsightData } from "@/apps/team-os/features/analytics/types";
import { AnalyticsClientError, generateBusinessInsight } from "@/apps/team-os/features/analytics/services/analytics-client";
import { formatAnalyticsDateTime } from "@/apps/team-os/features/analytics/utils/analytics-format";

export function BusinessInsightPanel({
  companyId,
  days,
  allowed,
  hasData
}: {
  companyId: string;
  days: AnalyticsRangeDays;
  allowed: boolean;
  hasData: boolean;
}) {
  const [data, setData] = React.useState<BusinessInsightData | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const requestRef = React.useRef(0);

  React.useEffect(() => {
    requestRef.current += 1;
    setData(null);
    setError(null);
    setLoading(false);
    return () => { requestRef.current += 1; };
  }, [companyId, days]);

  async function handleGenerate() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await generateBusinessInsight({ companyId, days });
      if (requestId === requestRef.current) setData(result);
    } catch (caught) {
      if (requestId === requestRef.current) {
        setError(caught instanceof AnalyticsClientError ? caught.message : caught instanceof Error ? caught.message : "经营建议生成失败，请重试。");
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }

  return (
    <Card className="border-indigo-100 bg-gradient-to-br from-white to-indigo-50/50">
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-indigo-700" aria-hidden="true" />AI 经营分析</CardTitle><p className="mt-1 text-sm leading-6 text-slate-500">仅将当前权限范围内的结构化聚合指标交给 AI，不发送客户或员工业务原文。</p></div>
        {allowed && hasData ? <Button size="sm" onClick={() => void handleGenerate()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />{loading ? "分析中…" : data ? "重新分析" : "生成建议"}</Button> : null}
      </CardHeader>
      <CardContent>
        {!allowed ? <p className="flex items-center gap-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-800"><ShieldAlert className="h-4 w-4 shrink-0" />当前角色可以查看授权指标，但不能生成企业经营建议。</p> : !hasData ? <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">当前区间暂无足够的可用聚合数据，暂不能生成经营建议。</p> : error ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert"><p>{error}</p><button type="button" className="mt-2 font-semibold underline" onClick={() => void handleGenerate()}>重试</button></div> : !data ? <div className="flex min-h-32 flex-col items-center justify-center text-center"><Lightbulb className="h-8 w-8 text-indigo-300" /><p className="mt-3 text-sm text-slate-500">点击“生成建议”，获取基于当前数据口径的经营洞察。</p></div> : (
          <div className="space-y-5">
            <div className="rounded-xl bg-white p-4 shadow-sm"><p className="text-sm font-semibold text-slate-900">经营摘要</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 [overflow-wrap:anywhere]">{data.summary}</p></div>
            <div className="grid gap-4 md:grid-cols-3">
              <InsightList title="经营亮点" items={data.highlights} tone="emerald" />
              <InsightList title="重点风险" items={data.risks} tone="rose" />
              <InsightList title="建议行动" items={data.actions} tone="indigo" />
            </div>
            <p className="text-xs text-slate-400">生成时间：{formatAnalyticsDateTime(data.generatedAt)} · AI 建议仅供经营决策参考</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InsightList({ title, items, tone }: { title: string; items: string[]; tone: "emerald" | "rose" | "indigo" }) {
  const tones = {
    emerald: "border-emerald-100 bg-emerald-50/60 text-emerald-900",
    rose: "border-rose-100 bg-rose-50/60 text-rose-900",
    indigo: "border-indigo-100 bg-indigo-50/60 text-indigo-900"
  } as const;
  return <div className={`break-words rounded-xl border p-4 [overflow-wrap:anywhere] ${tones[tone]}`}><p className="text-sm font-semibold">{title}</p>{items.length > 0 ? <ul className="mt-3 list-disc space-y-2 pl-4 text-xs leading-5">{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="mt-3 text-xs opacity-70">暂无</p>}</div>;
}
