"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddMemberForm } from "@/apps/team-os/features/organization/components/AddMemberForm";
import { MemberList } from "@/apps/team-os/features/organization/components/MemberList";
import { OrganizationCompanySelector } from "@/apps/team-os/features/organization/components/OrganizationCompanySelector";
import { OrganizationSectionNavigation } from "@/apps/team-os/features/organization/components/OrganizationSectionNavigation";
import { OrganizationErrorState, OrganizationLoadingState } from "@/apps/team-os/features/organization/components/OrganizationState";
import { useMembers } from "@/apps/team-os/features/organization/hooks/useMembers";

export function OrganizationMembersPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const { data, loading, error, reload, selectedCompanyId, selectCompany } = useMembers(initialCompanyId);
  const [adding, setAdding] = React.useState(false);
  const canManageMembers = data.teams.some((team) => team.canManageMembers);

  async function handleAdded() {
    setAdding(false);
    await reload();
  }

  function handleCompanyChange(companyId: string) {
    setAdding(false);
    selectCompany(companyId);
    router.replace(`/team-os/organization/members?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }
  const activeCompanyId = selectedCompanyId ?? data.companyId;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">企业组织中心</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">成员管理</h1><p className="mt-2 text-sm text-slate-600">查看姓名、角色、所属团队、状态和加入时间。</p></div>
        {canManageMembers && !loading ? (
          <div className="flex flex-wrap gap-3">
            <Link href={activeCompanyId ? `/team-os/organization/invitations?companyId=${encodeURIComponent(activeCompanyId)}` : "/team-os/organization/invitations"} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-slate-50"><Send className="h-4 w-4" />邀请成员</Link>
            <Button onClick={() => setAdding((value) => !value)}><Plus className="h-4 w-4" />添加成员</Button>
          </div>
        ) : null}
      </div>

      <OrganizationCompanySelector companyId={activeCompanyId} companyName={data.companyName} companies={data.companies} disabled={loading} onChange={handleCompanyChange} />
      <OrganizationSectionNavigation canManageMembers={canManageMembers} companyId={activeCompanyId} />
      {!loading && adding ? <AddMemberForm key={data.companyId} teams={data.teams} onAdded={() => void handleAdded()} onCancel={() => setAdding(false)} /> : null}
      {loading ? <OrganizationLoadingState /> : error ? <OrganizationErrorState message={error} onRetry={() => void reload()} /> : <MemberList members={data.members} />}
    </div>
  );
}
