import { AlertCircle, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function TaskLoadingState() {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> 正在加载任务…
      </CardContent>
    </Card>
  );
}

export function TaskErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-rose-200 bg-rose-50/50">
      <CardContent className="flex min-h-48 flex-col items-center justify-center text-center">
        <AlertCircle className="h-7 w-7 text-rose-500" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-rose-800">{message}</p>
        <Button className="mt-4" variant="outline" size="sm" onClick={onRetry}>重新加载</Button>
      </CardContent>
    </Card>
  );
}
