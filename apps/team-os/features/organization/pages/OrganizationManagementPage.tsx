"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { OrganizationSectionNavigation } from "@/apps/team-os/features/organization/components/OrganizationSectionNavigation";
import { OrganizationSummary } from "@/apps/team-os/features/organization/components/OrganizationSummary";
import { OrganizationEmptyState, OrganizationErrorState, OrganizationLoadingState } from "@/apps/team-os/features/organization/components/OrganizationState";
import { TeamForm } from "@/apps/team-os/features/organization/components/TeamForm";
import { TeamList } from "@/apps/team-os/features/organization/components/TeamList";
import { useOrganization } from "@/apps/team-os/features/organization/hooks/useOrganization";
import type { OrganizationTeam } from "@/apps/team-os/features/organization/types";

export function OrganizationManagementPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const { data, loading, error, reload, selectedCompanyId, selectCompany } = useOrganization(initialCompanyId);
  const [creating, setCreating] = React.useState(false);
  const [editingTeam, setEditingTeam] = React.useState<OrganizationTeam | null>(null);
  const canManageMembers = data.teams.some((team) => team.permissions.canManageMembers);

  async function handleSaved() {
    setCreating(false);
    setEditingTeam(null);
    await reload();
  }

  function handleCompanyChange(companyId: string) {
    setCreating(false);
    setEditingTeam(null);
    selectCompany(companyId);
    router.replace(`/team-os/organization?companyId=${encodeURIComponent(companyId)}`, { scroll: false });
  }

  const ownerCompanies = data.companies
    .filter((company) => data.ownerCompanyIds.includes(company.id))
    .sort((left, right) => left.id === data.companyId ? -1 : right.id === data.companyId ? 1 : 0);
  const activeCompanyId = selectedCompanyId ?? data.companyId;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-sm font-medium text-indigo-700">企业组织中心</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">组织管理</h1><p className="mt-2 text-sm text-slate-600">建立企业、团队、成员和角色权限基础。</p></div>
        {data.canCreateTeam && data.teams.length > 0 ? <Button onClick={() => { setEditingTeam(null); setCreating(true); }} disabled={loading}><Plus className="h-4 w-4" />创建团队</Button> : null}
      </div>

      <OrganizationSectionNavigation canManageMembers={canManageMembers} companyId={activeCompanyId} />

      {!loading && (creating || editingTeam) ? <TeamForm team={editingTeam ?? undefined} companies={ownerCompanies} onSaved={() => void handleSaved()} onCancel={() => { setCreating(false); setEditingTeam(null); }} /> : null}

      {loading ? <OrganizationLoadingState /> : error ? <OrganizationErrorState message={error} onRetry={() => void reload()} /> : data.teams.length === 0 ? (
        <OrganizationEmptyState canBootstrap={data.canBootstrap} accessState={data.accessState} onCreate={() => setCreating(true)} />
      ) : (
        <>
          <OrganizationSummary data={data} onCompanyChange={handleCompanyChange} />
          <div><h2 className="mb-4 text-lg font-semibold">团队列表</h2><TeamList teams={data.teams} onEdit={setEditingTeam} /></div>
        </>
      )}
    </div>
  );
}
