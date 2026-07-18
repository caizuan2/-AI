"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { addMember } from "@/apps/team-os/features/organization/services/organization-client";
import { roleLabels } from "@/apps/team-os/features/organization/utils/organization-labels";
import type { AssignableTeamRole, MemberListData } from "@/apps/team-os/features/organization/types";

export function AddMemberForm({ teams, onAdded, onCancel }: { teams: MemberListData["teams"]; onAdded: () => void; onCancel: () => void }) {
  const manageableTeams = teams.filter((team) => team.canManageMembers);
  const [teamId, setTeamId] = React.useState(manageableTeams[0]?.id ?? "");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AssignableTeamRole>("TEAM_MEMBER");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!manageableTeams.some((team) => team.id === teamId)) {
      setTeamId(manageableTeams[0]?.id ?? "");
    }
  }, [manageableTeams, teamId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await addMember({ teamId, email, role });
      onAdded();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "成员添加失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="border-indigo-200">
      <CardHeader><CardTitle>添加已注册成员</CardTitle><CardDescription>通过用户绑定邮箱添加；未注册邮箱请改用邀请。</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-3" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">邮箱<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">团队<select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="focus-ring flex h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm" required>{manageableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">角色<select value={role} onChange={(event) => setRole(event.target.value as AssignableTeamRole)} className="focus-ring flex h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"><option value="TEAM_MANAGER">{roleLabels.TEAM_MANAGER}</option><option value="TRAINER">{roleLabels.TRAINER}</option><option value="TEAM_MEMBER">{roleLabels.TEAM_MEMBER}</option></select></label>
          {error ? <p className="text-sm text-rose-700 md:col-span-3" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-3 md:col-span-3"><Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>取消</Button><Button type="submit" disabled={submitting || manageableTeams.length === 0}>{submitting ? "添加中…" : "添加成员"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
