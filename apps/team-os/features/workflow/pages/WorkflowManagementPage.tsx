"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { WorkflowList } from "@/apps/team-os/features/workflow/components/WorkflowList";
import { WorkflowPageHeader } from "@/apps/team-os/features/workflow/components/WorkflowPageHeader";
import { WorkflowSectionNavigation } from "@/apps/team-os/features/workflow/components/WorkflowSectionNavigation";
import {
  WorkflowErrorState,
  WorkflowForbiddenState,
  WorkflowLoadingState
} from "@/apps/team-os/features/workflow/components/WorkflowState";
import { useWorkflowList } from "@/apps/team-os/features/workflow/hooks/useWorkflowData";

export function WorkflowManagementPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const resource = useWorkflowList(companyId);
  const data = resource.data;
  const forbidden = resource.error?.code === "FORBIDDEN";

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    router.replace(`/team-os/workflow?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <WorkflowPageHeader
        eyebrow="AI Workflow Engine"
        title="企业自动化工作流"
        description="将业务事件、AI 判断和可审计动作连接成企业自动化流程。所有数据和动作都按当前企业、团队与角色重新鉴权。"
        context={data?.context}
        onCompanyChange={changeCompany}
        actions={data?.context.canCreate ? <Link href={`/team-os/workflow/create?companyId=${encodeURIComponent(data.context.companyId)}`} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-white transition hover:bg-slate-800"><Plus className="h-4 w-4" aria-hidden="true" />创建流程</Link> : undefined}
      />

      {resource.loading && !data ? <WorkflowLoadingState /> : forbidden ? <WorkflowForbiddenState description="普通成员只能接收自动任务与通知；培训师可查看培训相关流程，企业负责人和团队主管可管理授权范围内的工作流。" /> : resource.error && !data ? <WorkflowErrorState message={resource.error.message} onRetry={() => void resource.reload()} /> : data ? (
        <>
          <WorkflowSectionNavigation context={data.context} />
          {resource.error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">刷新失败，当前继续展示上一次成功加载的数据：{resource.error.message}</div> : null}
          <WorkflowList context={data.context} items={data.items} />
        </>
      ) : null}
    </div>
  );
}
