import { Eye, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function IndustryAccessNotice({ canViewCatalog, canManage }: { canViewCatalog: boolean; canManage: boolean }) {
  if (canManage) return null;

  if (canViewCatalog) {
    return (
      <Card className="border-sky-200 bg-sky-50/60">
        <CardContent className="flex items-start gap-3 p-4 text-sm leading-6 text-sky-900">
          <Eye className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" aria-hidden="true" />
          <p>当前角色拥有行业目录只读权限，可以查看标准与评分规则，但不能创建或修改企业级配置。</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-indigo-200 bg-indigo-50/60">
      <CardContent className="flex items-start gap-3 p-4 text-sm leading-6 text-indigo-950">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-indigo-700" aria-hidden="true" />
        <p>员工角色不能直接浏览企业标准与评分规则；相关内容只会在您发起 AI 沟通分析时按权限安全使用。</p>
      </CardContent>
    </Card>
  );
}
