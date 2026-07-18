import type { ReactNode } from "react";
import { AlertCircle, BrainCircuit, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AiBrainLoadingState({ label = "正在读取企业知识分析…" }: { label?: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-slate-500" role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        {label}
      </CardContent>
    </Card>
  );
}

export function AiBrainErrorState({
  message,
  onRetry,
  title = "AI Brain 加载失败"
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50/50">
      <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden="true" />
        <p className="mt-3 font-semibold text-rose-900">{title}</p>
        <p className="mt-2 max-w-xl break-words text-sm leading-6 text-rose-700 [overflow-wrap:anywhere]" role="alert">{message}</p>
        {onRetry ? <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button> : null}
      </CardContent>
    </Card>
  );
}

export function AiBrainForbiddenState({
  title = "当前角色无权查看此页面",
  description
}: {
  title?: string;
  description: string;
}) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="h-9 w-9 text-amber-600" aria-hidden="true" />
        <p className="mt-4 font-semibold text-amber-950">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-amber-800">{description}</p>
      </CardContent>
    </Card>
  );
}

export function AiBrainEmptyState({
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
        <BrainCircuit className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-4 font-semibold text-slate-800">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
