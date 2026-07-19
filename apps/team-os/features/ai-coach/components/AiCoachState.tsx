import { AlertCircle, Bot, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AiCoachLoadingState({ label = "正在加载 AI 教练数据…" }: { label?: string }) {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> {label}
      </CardContent>
    </Card>
  );
}

export function AiCoachErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-rose-200 bg-rose-50/50">
      <CardContent className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-8 w-8 text-rose-500" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-rose-800">{message}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>
      </CardContent>
    </Card>
  );
}

export function AiCoachEmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Card className="border-dashed border-slate-300">
      <CardContent className="flex min-h-52 flex-col items-center justify-center p-6 text-center">
        <Bot className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-4 font-medium text-slate-800">{title}</p>
        <p className="mt-2 max-w-lg text-sm leading-6 text-slate-500">{description}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
