import { ManagerCopilotPage } from "@/apps/team-os/features/copilot/pages/ManagerCopilotPage";

export const metadata = { title: "主管助手 | AI Team OS" };

export default function ManagerCopilotRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <ManagerCopilotPage initialCompanyId={companyId} />;
}
