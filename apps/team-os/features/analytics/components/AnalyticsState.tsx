import type { ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, BarChart3, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AnalyticsLoadingState({ label = "正在汇总运营数据…" }: { label?: string }) {
  return (
    <Card>
      <CardContent
        className="flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-slate-500"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        {label}
      </CardContent>
    </Card>
  );
}

export function AnalyticsErrorState({
  message,
  onRetry,
  title = "数据分析加载失败"
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50/50">
      <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden="true" />
        <p className="mt-3 font-medium text-rose-900">{title}</p>
        <p className="mt-2 max-w-xl break-words text-sm leading-6 text-rose-700 [overflow-wrap:anywhere]" role="alert">{message}</p>
        {onRetry ? <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button> : null}
      </CardContent>
    </Card>
  );
}

export function AnalyticsEmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <Card className="border-dashed border-slate-300">
      <CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
        <BarChart3 className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-4 font-medium text-slate-800">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}

export function AnalyticsForbiddenState({ description }: { description: string }) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="h-9 w-9 text-amber-600" aria-hidden="true" />
        <p className="mt-4 font-semibold text-amber-900">当前角色不可查看此分析</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-amber-800">{description}</p>
        <Link href="/team-os/analytics" className="focus-ring mt-5 inline-flex h-10 items-center rounded-lg border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 hover:bg-amber-50">返回数据总览</Link>
      </CardContent>
    </Card>
  );
}

export function AnalyticsCoverageNotice({ coverage, truncated = false }: { coverage: string[]; truncated?: boolean }) {
  if (coverage.length === 0 && !truncated) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs leading-5 text-slate-500" role="note">
      <p className="font-semibold text-slate-700">数据口径</p>
      {coverage.length > 0 ? <ul className="mt-2 list-disc space-y-1 pl-5">{coverage.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : null}
      {truncated ? <p className="mt-2 font-medium text-amber-700">数据量超过当前分析上限，页面已明确标注截断结果，请勿将其视为全量统计。</p> : null}
    </div>
  );
}
