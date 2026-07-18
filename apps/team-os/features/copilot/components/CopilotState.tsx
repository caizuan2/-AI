import { AlertCircle, Bot, LoaderCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function CopilotLoadingState() {
  return (
    <Card>
      <CardContent className="flex min-h-56 items-center justify-center gap-3 p-6 text-sm text-slate-500" role="status" aria-live="polite" aria-busy="true">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
        AI 助手正在读取授权范围内的运营数据…
      </CardContent>
    </Card>
  );
}

export function CopilotErrorState({ message, forbidden = false, onRetry }: {
  message: string;
  forbidden?: boolean;
  onRetry?: () => void;
}) {
  const Icon = forbidden ? ShieldAlert : AlertCircle;
  return (
    <Card className={forbidden ? "border-amber-200 bg-amber-50/50" : "border-rose-200 bg-rose-50/50"}>
      <CardContent className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
        <Icon className={forbidden ? "h-9 w-9 text-amber-600" : "h-9 w-9 text-rose-500"} aria-hidden="true" />
        <p className="mt-4 font-semibold text-slate-900">{forbidden ? "当前角色不能使用此助手" : "AI 助手加载失败"}</p>
        <p className="mt-2 max-w-xl break-words text-sm leading-6 text-slate-600" role="alert">{message}</p>
        {onRetry ? <Button className="mt-5" size="sm" variant="outline" onClick={onRetry}>重新加载</Button> : null}
      </CardContent>
    </Card>
  );
}

export function CopilotEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-dashed border-slate-300">
      <CardContent className="flex min-h-44 flex-col items-center justify-center p-6 text-center">
        <Bot className="h-9 w-9 text-slate-300" aria-hidden="true" />
        <p className="mt-3 font-medium text-slate-800">{title}</p>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">{description}</p>
      </CardContent>
    </Card>
  );
}
