import { OrganizationManagementPage } from "@/apps/team-os/features/organization/pages/OrganizationManagementPage";

export const metadata = { title: "组织管理 | AI Team OS" };

export default function OrganizationPage({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <OrganizationManagementPage initialCompanyId={companyId} />;
}
