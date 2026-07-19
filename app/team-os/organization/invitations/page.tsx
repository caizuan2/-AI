import { OrganizationInvitationsPage } from "@/apps/team-os/features/organization/pages/OrganizationInvitationsPage";

export const metadata = { title: "邀请成员 | AI Team OS" };

export default function OrganizationInvitationsRoute({ searchParams }: { searchParams?: { companyId?: string | string[] } }) {
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <OrganizationInvitationsPage initialCompanyId={companyId} />;
}
