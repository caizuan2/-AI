"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WorkflowExecutionList } from "@/apps/team-os/features/workflow/components/WorkflowExecutionList";
import { WorkflowPageHeader } from "@/apps/team-os/features/workflow/components/WorkflowPageHeader";
import { WorkflowSectionNavigation } from "@/apps/team-os/features/workflow/components/WorkflowSectionNavigation";
import {
  WorkflowErrorState,
  WorkflowForbiddenState,
  WorkflowLoadingState
} from "@/apps/team-os/features/workflow/components/WorkflowState";
import { useWorkflowExecutions } from "@/apps/team-os/features/workflow/hooks/useWorkflowData";

export function WorkflowExecutionsPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const resource = useWorkflowExecutions(companyId, 50);
  const data = resource.data;
  const forbidden = resource.error?.code === "FORBIDDEN";

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    router.replace(`/team-os/workflow/executions?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <WorkflowPageHeader
        eyebrow="Automation Audit Log"
        title="工作流执行记录"
        description="查看 AI 判断、动作执行顺序、Dry-run 与生产模式结果。日志不会展示原始敏感业务数据或内部错误堆栈。"
        context={data?.context}
        onCompanyChange={changeCompany}
      />

      {resource.loading && !data ? <WorkflowLoadingState label="正在读取自动化执行日志…" /> : forbidden ? <WorkflowForbiddenState description="当前角色无权查看工作流执行记录。培训师仅可查看培训相关流程，普通成员不能访问管理日志。" /> : resource.error && !data ? <WorkflowErrorState message={resource.error.message} onRetry={() => void resource.reload()} /> : data ? (
        <>
          <WorkflowSectionNavigation context={data.context} />
          {resource.error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">刷新失败，当前继续展示上一次成功加载的数据：{resource.error.message}</div> : null}
          <WorkflowExecutionList context={data.context} items={data.items} />
          <p className="text-right text-xs text-slate-400">当前展示最近 {Math.min(data.items.length, 50)} 条授权范围内执行记录。</p>
        </>
      ) : null}
    </div>
  );
}
