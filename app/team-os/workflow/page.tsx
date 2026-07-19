import { WorkflowManagementPage } from "@/apps/team-os/features/workflow/pages";

export const metadata = { title: "自动化工作流 | AI Team OS" };

export default function WorkflowRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <WorkflowManagementPage initialCompanyId={companyId} />;
}
