import { AlertCircle, Building2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function OrganizationLoadingState() {
  return (
    <Card>
      <CardContent className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> 正在加载组织信息…
      </CardContent>
    </Card>
  );
}

export function OrganizationErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
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

export function OrganizationEmptyState({ canBootstrap, accessState, onCreate }: { canBootstrap: boolean; accessState: "ACTIVE" | "INACTIVE" | "UNASSIGNED"; onCreate?: () => void }) {
  return (
    <Card className="border-dashed border-slate-300">
      <CardContent className="flex min-h-56 flex-col items-center justify-center text-center">
        <Building2 className="h-10 w-10 text-slate-300" aria-hidden="true" />
        <p className="mt-4 font-medium text-slate-800">尚未加入企业团队</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">
          {accessState === "INACTIVE" ? "您的团队成员身份已停用，请联系企业负责人恢复。" : canBootstrap ? "创建首个团队后，您将自动成为企业负责人。" : "请联系企业负责人发送邀请或添加您的账号。"}
        </p>
        {canBootstrap && onCreate ? <Button className="mt-5" onClick={onCreate}>创建首个团队</Button> : null}
      </CardContent>
    </Card>
  );
}
