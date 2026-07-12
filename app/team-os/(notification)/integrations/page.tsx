import { IntegrationsPage } from "@/apps/team-os/features/notification/pages/IntegrationsPage";

export const metadata = { title: "企业连接 | AI Team OS" };

export default function IntegrationsRoute({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <IntegrationsPage initialCompanyId={companyId} />;
}
