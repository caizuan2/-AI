import { EmployeeCopilotPage } from "@/apps/team-os/features/copilot/pages/EmployeeCopilotPage";

export const metadata = { title: "员工助手 | AI Team OS" };

export default function EmployeeCopilotRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <EmployeeCopilotPage initialCompanyId={companyId} />;
}
