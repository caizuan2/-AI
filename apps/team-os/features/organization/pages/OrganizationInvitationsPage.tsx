"use client";

import { useRouter } from "next/navigation";
import { InvitationForm } from "@/apps/team-os/features/organization/components/InvitationForm";
import { OrganizationCompanySelector } from "@/apps/team-os/features/organization/components/OrganizationCompanySelector";
import { OrganizationSectionNavigation } from "@/apps/team-os/features/organization/components/OrganizationSectionNavigation";
import { OrganizationErrorState, OrganizationLoadingState } from "@/apps/team-os/features/organization/components/OrganizationState";
import { useMembers } from "@/apps/team-os/features/organization/hooks/useMembers";

export function OrganizationInvitationsPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const { data, loading, error, reload, selectedCompanyId, selectCompany } = useMembers(initialCompanyId);
  const canManageMembers = data.teams.some((team) => team.canManageMembers);

  function handleCompanyChange(companyId: string) {
    selectCompany(companyId);
    router.replace(`/team-os/organization/invitations?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }
  const activeCompanyId = selectedCompanyId ?? data.companyId;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><p className="text-sm font-medium text-indigo-700">企业组织中心</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">邀请成员</h1><p className="mt-2 text-sm text-slate-600">为主管、培训师或员工生成团队邀请记录。</p></div>
      <OrganizationCompanySelector companyId={activeCompanyId} companyName={data.companyName} companies={data.companies} disabled={loading} onChange={handleCompanyChange} />
      <OrganizationSectionNavigation canManageMembers={canManageMembers} companyId={activeCompanyId} />
      {loading ? <OrganizationLoadingState /> : error ? <OrganizationErrorState message={error} onRetry={() => void reload()} /> : <InvitationForm key={data.companyId} teams={data.teams} />}
    </div>
  );
}
