import { AlertCircle, GraduationCap, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function TrainingLoadingState({ label = "正在加载培训数据…" }: { label?: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        {label}
      </CardContent>
    </Card>
  );
}

export function TrainingErrorState({
  message,
  onRetry,
  title = "培训数据加载失败"
}: {
  message: string;
  onRetry?: () => void;
  title?: string;
}) {
  return (
    <Card className="border-rose-200 bg-rose-50/50">
      <CardContent className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden="true" />
        <p className="mt-3 font-medium text-rose-900">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-rose-700">{message}</p>
        {onRetry ? <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button> : null}
      </CardContent>
    </Card>
  );
}

export function TrainingEmptyState({
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
      <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
        <GraduationCap className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-4 font-medium text-slate-800">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
