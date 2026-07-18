"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, Building2, Filter, Lightbulb, LoaderCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CopilotInsightList } from "@/apps/team-os/features/copilot/components/CopilotInsightList";
import { CopilotPageHeader } from "@/apps/team-os/features/copilot/components/CopilotPageHeader";
import { CopilotRoleNavigation } from "@/apps/team-os/features/copilot/components/CopilotRoleNavigation";
import {
  CopilotEmptyState,
  CopilotErrorState,
  CopilotLoadingState
} from "@/apps/team-os/features/copilot/components/CopilotState";
import { useCopilotInsights } from "@/apps/team-os/features/copilot/hooks/useCopilot";
import type {
  CopilotAssistantRole,
  CopilotInsightType,
  CopilotPriority
} from "@/apps/team-os/features/copilot/types";

const roleOptions: Array<{
  role: CopilotAssistantRole;
  label: string;
  icon: typeof UserRound;
}> = [
  { role: "EMPLOYEE_ASSISTANT", label: "员工洞察", icon: UserRound },
  { role: "MANAGER_ASSISTANT", label: "主管洞察", icon: BriefcaseBusiness },
  { role: "OWNER_ASSISTANT", label: "经营洞察", icon: Building2 }
];

const typeOptions: Array<{ value?: CopilotInsightType; label: string }> = [
  { label: "全部领域" },
  { value: "TASK", label: "任务" },
  { value: "CRM", label: "客户" },
  { value: "TRAINING", label: "培训" },
  { value: "TEAM", label: "团队" },
  { value: "BUSINESS", label: "经营" }
];

const priorityOptions: Array<{ value?: CopilotPriority; label: string }> = [
  { label: "全部优先级" },
  { value: "HIGH", label: "高优先级" },
  { value: "MEDIUM", label: "中优先级" },
  { value: "LOW", label: "建议关注" }
];

export function CopilotInsightsPage({
  initialRole = "EMPLOYEE_ASSISTANT",
  initialCompanyId
}: {
  initialRole?: CopilotAssistantRole;
  initialCompanyId?: string;
}) {
  const router = useRouter();
  const [role, setRole] = React.useState<CopilotAssistantRole>(initialRole);
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const [type, setType] = React.useState<CopilotInsightType>();
  const [priority, setPriority] = React.useState<CopilotPriority>();
  const resource = useCopilotInsights(role, companyId);
  const data = resource.data;
  const forbidden = resource.error?.code === "FORBIDDEN";

  const updateLocation = React.useCallback((nextRole: CopilotAssistantRole, nextCompanyId?: string) => {
    const params = new URLSearchParams({ role: nextRole });
    if (nextCompanyId) params.set("companyId", nextCompanyId);
    router.replace(`/team-os/copilot/insights?${params.toString()}`, { scroll: false });
  }, [router]);

  const selectRole = React.useCallback((nextRole: CopilotAssistantRole) => {
    setRole(nextRole);
    setType(undefined);
    setPriority(undefined);
    updateLocation(nextRole, companyId);
  }, [companyId, updateLocation]);

  const selectCompany = React.useCallback((nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    updateLocation(role, nextCompanyId);
  }, [role, updateLocation]);

  const items = React.useMemo(() => (data?.items ?? []).filter((item) => (
    (!type || item.type === type) && (!priority || item.priority === priority)
  )), [data?.items, priority, type]);

  const availableRoles = data?.context.availableRoles;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CopilotPageHeader
        eyebrow="AI Insight Center"
        title="主动洞察中心"
        description="集中查看 AI 从授权范围内识别的任务、客户、培训、团队与经营信号，并获得可执行建议。"
        context={data?.context}
        refreshing={resource.loading || resource.syncing}
        onCompanyChange={selectCompany}
        onRefresh={() => void resource.sync()}
      />
      <CopilotRoleNavigation currentRole={role} availableRoles={availableRoles} />

      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Lightbulb className="h-4 w-4" aria-hidden="true" />
              洞察视角
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {roleOptions.map((option) => {
                const Icon = option.icon;
                const available = !availableRoles || availableRoles.includes(option.role);
                return (
                  <Button
                    key={option.role}
                    className="whitespace-nowrap"
                    variant={role === option.role ? "secondary" : "ghost"}
                    size="sm"
                    disabled={!available || resource.loading || resource.syncing}
                    title={available ? option.label : "当前角色无权使用"}
                    onClick={() => selectRole(option.role)}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500"><Filter className="h-3.5 w-3.5" aria-hidden="true" />业务领域</p>
              <div className="flex flex-wrap gap-2">
                {typeOptions.map((option) => (
                  <Button key={option.value ?? "ALL"} variant={type === option.value ? "secondary" : "ghost"} size="sm" onClick={() => setType(option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500">优先级</p>
              <div className="flex flex-wrap gap-2">
                {priorityOptions.map((option) => (
                  <Button key={option.value ?? "ALL"} variant={priority === option.value ? "secondary" : "ghost"} size="sm" onClick={() => setPriority(option.value)}>
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {resource.syncing ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          正在重新分析当前范围并同步洞察…
        </div>
      ) : null}

      {resource.loading && !data ? (
        <CopilotLoadingState />
      ) : resource.error && !data ? (
        <CopilotErrorState
          message={resource.error.message}
          forbidden={forbidden}
          onRetry={forbidden ? undefined : () => void resource.reload()}
        />
      ) : data ? (
        <>
          {resource.error ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">洞察同步失败，当前继续展示已保存结果：{resource.error.message}</div>
          ) : null}
          {items.length === 0 ? (
            <CopilotEmptyState
              title={data.items.length === 0 ? "暂无主动洞察" : "当前筛选没有匹配结果"}
              description={data.items.length === 0
                ? "点击“刷新数据”后，系统会依据当前角色和企业范围重新分析；没有风险时也会保持为空。"
                : "可以清除业务领域或优先级筛选，查看其他洞察。"}
            />
          ) : <CopilotInsightList items={items} />}
          <p className="text-right text-xs text-slate-400">共 {data.items.length} 条已保存洞察 · 当前显示 {items.length} 条</p>
        </>
      ) : null}
    </div>
  );
}
