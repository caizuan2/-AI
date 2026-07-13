"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopilotChatPanel } from "@/apps/team-os/features/copilot/components/CopilotChatPanel";
import {
  CopilotMetricGrid,
  CopilotNoSections,
  CopilotSections,
  CopilotSummary
} from "@/apps/team-os/features/copilot/components/CopilotDashboard";
import { CopilotPageHeader } from "@/apps/team-os/features/copilot/components/CopilotPageHeader";
import { CopilotRoleNavigation } from "@/apps/team-os/features/copilot/components/CopilotRoleNavigation";
import {
  CopilotErrorState,
  CopilotLoadingState
} from "@/apps/team-os/features/copilot/components/CopilotState";
import { useCopilotDashboard } from "@/apps/team-os/features/copilot/hooks/useCopilot";
import type { CopilotAssistantRole } from "@/apps/team-os/features/copilot/types";

const roleConfig: Record<CopilotAssistantRole, {
  eyebrow: string;
  fallbackTitle: string;
  fallbackDescription: string;
  path: string;
}> = {
  EMPLOYEE_ASSISTANT: {
    eyebrow: "Employee Copilot",
    fallbackTitle: "员工 AI 助手",
    fallbackDescription: "聚焦本人工作范围，整理今日任务、客户跟进、培训进度与成长建议。",
    path: "/team-os/copilot/employee"
  },
  MANAGER_ASSISTANT: {
    eyebrow: "Manager Copilot",
    fallbackTitle: "主管 AI 助手",
    fallbackDescription: "聚焦直属团队范围，识别任务进度、成员表现与客户风险。",
    path: "/team-os/copilot/manager"
  },
  OWNER_ASSISTANT: {
    eyebrow: "Executive Copilot",
    fallbackTitle: "老板 AI 助手",
    fallbackDescription: "聚焦当前企业经营范围，汇总业务健康度、组织风险与经营建议。",
    path: "/team-os/copilot/owner"
  }
};

export function CopilotWorkspacePage({
  assistantRole,
  initialCompanyId
}: {
  assistantRole: CopilotAssistantRole;
  initialCompanyId?: string;
}) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const resource = useCopilotDashboard(assistantRole, companyId);
  const config = roleConfig[assistantRole];
  const data = resource.data;
  const forbidden = resource.error?.code === "FORBIDDEN";

  const handleCompanyChange = React.useCallback((nextCompanyId: string) => {
    setCompanyId(nextCompanyId);
    router.replace(`${config.path}?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }, [config.path, router]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <CopilotPageHeader
        eyebrow={config.eyebrow}
        title={data?.title ?? config.fallbackTitle}
        description={data?.description ?? config.fallbackDescription}
        context={data?.context}
        refreshing={resource.loading}
        onCompanyChange={handleCompanyChange}
        onRefresh={() => void resource.reload()}
      />

      <CopilotRoleNavigation
        currentRole={assistantRole}
        availableRoles={data?.context.availableRoles}
      />

      {resource.syncing ? (
        <div className="flex justify-end" role="status" aria-live="polite">
          <Badge variant="outline" className="gap-1.5 bg-white text-slate-500">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            正在更新主动洞察
          </Badge>
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
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">
              最新数据刷新失败，当前继续展示上一次成功加载的结果：{resource.error.message}
            </div>
          ) : null}
          <CopilotSummary
            greeting={data.greeting}
            summary={data.summary}
            insightCount={data.insights.length}
          />
          <CopilotMetricGrid metrics={data.metrics} />
          {data.sections.length > 0 ? <CopilotSections sections={data.sections} /> : <CopilotNoSections />}
          <CopilotChatPanel
            assistantRole={assistantRole}
            companyId={data.context.companyId}
            suggestedQuestions={data.suggestedQuestions}
          />
          <p className="text-right text-xs text-slate-400">
            数据生成时间：{new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(data.generatedAt))}
          </p>
        </>
      ) : null}
    </div>
  );
}
