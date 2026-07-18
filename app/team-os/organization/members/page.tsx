import { OrganizationMembersPage } from "@/apps/team-os/features/organization/pages/OrganizationMembersPage";

export const metadata = { title: "成员管理 | AI Team OS" };

export default function OrganizationMembersRoute({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <OrganizationMembersPage initialCompanyId={companyId} />;
}
