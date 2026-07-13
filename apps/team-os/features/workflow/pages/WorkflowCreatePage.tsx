"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { WorkflowCreateForm } from "@/apps/team-os/features/workflow/components/WorkflowCreateForm";
import { WorkflowPageHeader } from "@/apps/team-os/features/workflow/components/WorkflowPageHeader";
import { WorkflowSectionNavigation } from "@/apps/team-os/features/workflow/components/WorkflowSectionNavigation";
import {
  WorkflowErrorState,
  WorkflowForbiddenState,
  WorkflowLoadingState
} from "@/apps/team-os/features/workflow/components/WorkflowState";
import { useWorkflowList } from "@/apps/team-os/features/workflow/hooks/useWorkflowData";

export function WorkflowCreatePage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const resource = useWorkflowList(companyId);
  const data = resource.data;
  const forbidden = resource.error?.code === "FORBIDDEN";

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    router.replace(`/team-os/workflow/create?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <WorkflowPageHeader
        eyebrow="Workflow Designer"
        title="创建自动化流程"
        description="从经过约束的企业模板开始，明确事件、AI 判断门槛和动作顺序。保存定义不会立即触发生产动作。"
        context={data?.context}
        onCompanyChange={changeCompany}
      />

      {resource.loading && !data ? <WorkflowLoadingState label="正在准备流程设计器…" /> : forbidden ? <WorkflowForbiddenState description="当前角色无权创建企业工作流。请使用企业负责人或团队主管账号，并确认已加入有效团队。" /> : resource.error && !data ? <WorkflowErrorState message={resource.error.message} onRetry={() => void resource.reload()} /> : data ? (
        <>
          <WorkflowSectionNavigation context={data.context} />
          {!data.context.canCreate ? <WorkflowForbiddenState description="培训师只能查看培训相关流程，普通成员只能接收自动任务；只有企业负责人和团队主管可以创建流程。" /> : (
            <WorkflowCreateForm
              key={data.context.companyId}
              context={data.context}
              templates={data.templates}
              onCreated={() => router.push(`/team-os/workflow?companyId=${encodeURIComponent(data.context.companyId)}`)}
            />
          )}
        </>
      ) : null}
    </div>
  );
}
