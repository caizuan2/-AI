"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createInvitation } from "@/apps/team-os/features/organization/services/organization-client";
import { roleLabels } from "@/apps/team-os/features/organization/utils/organization-labels";
import type { AssignableTeamRole, InvitationRecord, MemberListData } from "@/apps/team-os/features/organization/types";

export function InvitationForm({ teams }: { teams: MemberListData["teams"] }) {
  const manageableTeams = teams.filter((team) => team.canManageMembers);
  const [teamId, setTeamId] = React.useState(manageableTeams[0]?.id ?? "");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<AssignableTeamRole>("TEAM_MEMBER");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [invitation, setInvitation] = React.useState<InvitationRecord | null>(null);

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
      setInvitation(await createInvitation({ teamId, email, role }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "邀请创建失败，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  if (invitation) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/60">
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          <h2 className="mt-4 text-xl font-semibold text-emerald-950">邀请已创建</h2>
          <p className="mt-2 text-sm text-emerald-800">邀请码</p>
          <code className="mt-2 max-w-full overflow-x-auto rounded-lg bg-white px-4 py-3 text-sm text-emerald-900">{invitation.inviteCode}</code>
          <p className="mt-3 text-xs text-emerald-700">有效期至 {new Date(invitation.expiresAt).toLocaleString("zh-CN")}</p>
          <Button className="mt-5" variant="outline" onClick={() => { setInvitation(null); setEmail(""); }}>继续邀请</Button>
        </CardContent>
      </Card>
    );
  }

  if (manageableTeams.length === 0) {
    return <Card><CardContent className="flex min-h-48 items-center justify-center text-center text-sm text-slate-500">只有企业负责人可以创建成员邀请。</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader><CardTitle>邀请成员</CardTitle><CardDescription>邀请记录有效期为 7 天，本阶段不会自动创建成员账号。</CardDescription></CardHeader>
      <CardContent>
        <form className="grid gap-5 md:grid-cols-3" onSubmit={handleSubmit}>
          <label className="space-y-2 text-sm font-medium text-slate-700">邮箱<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required /></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">团队<select value={teamId} onChange={(event) => setTeamId(event.target.value)} className="focus-ring flex h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm" required>{manageableTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
          <label className="space-y-2 text-sm font-medium text-slate-700">角色<select value={role} onChange={(event) => setRole(event.target.value as AssignableTeamRole)} className="focus-ring flex h-11 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink shadow-sm"><option value="TEAM_MANAGER">{roleLabels.TEAM_MANAGER}</option><option value="TRAINER">{roleLabels.TRAINER}</option><option value="TEAM_MEMBER">{roleLabels.TEAM_MEMBER}</option></select></label>
          {error ? <p className="text-sm text-rose-700 md:col-span-3" role="alert">{error}</p> : null}
          <div className="flex justify-end md:col-span-3"><Button type="submit" disabled={submitting}>{submitting ? "创建中…" : "生成邀请"}</Button></div>
        </form>
      </CardContent>
    </Card>
  );
}
