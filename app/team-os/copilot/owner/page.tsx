import { OwnerCopilotPage } from "@/apps/team-os/features/copilot/pages/OwnerCopilotPage";

export const metadata = { title: "老板助手 | AI Team OS" };

export default function OwnerCopilotRoute({ searchParams }: {
  searchParams?: { companyId?: string | string[] };
}) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <OwnerCopilotPage initialCompanyId={companyId} />;
}
