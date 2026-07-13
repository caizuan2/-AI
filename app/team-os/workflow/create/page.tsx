import { WorkflowCreatePage } from "@/apps/team-os/features/workflow/pages";

export const metadata = { title: "创建工作流 | AI Team OS" };

export default function WorkflowCreateRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <WorkflowCreatePage initialCompanyId={companyId} />;
}
