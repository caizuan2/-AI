import { WorkflowExecutionsPage } from "@/apps/team-os/features/workflow/pages";

export const metadata = { title: "工作流执行记录 | AI Team OS" };

export default function WorkflowExecutionsRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <WorkflowExecutionsPage initialCompanyId={companyId} />;
}
