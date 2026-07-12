import Link from "next/link";
import { CalendarDays, Pencil, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OrganizationStatusBadge, RoleBadge } from "@/apps/team-os/features/organization/components/OrganizationBadges";
import type { OrganizationTeam } from "@/apps/team-os/features/organization/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function TeamList({ teams, onEdit }: { teams: OrganizationTeam[]; onEdit: (team: OrganizationTeam) => void }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {teams.map((team) => (
        <Card key={team.id} className="border-slate-200">
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <CardTitle className="truncate text-lg">{team.name}</CardTitle>
                {team.description !== null ? <CardDescription className="line-clamp-3">{team.description || "暂未填写团队描述。"}</CardDescription> : null}
              </div>
              <OrganizationStatusBadge status={team.status} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {team.currentUserRole ? <RoleBadge role={team.currentUserRole} /> : null}
              {team.memberCount !== null ? <span className="inline-flex items-center gap-1.5"><UsersRound className="h-3.5 w-3.5" />{team.memberCount} 名成员</span> : null}
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" />{formatDate(team.createdAt)} 创建</span>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              {team.permissions.canViewSelf ? (
                <Link href={`/team-os/organization/members?companyId=${encodeURIComponent(team.companyId)}`} className="focus-ring inline-flex h-9 items-center justify-center rounded-lg border border-line bg-white px-3 text-xs font-semibold text-ink hover:bg-slate-50">
                  {team.permissions.canViewMembers ? "成员管理" : "我的资料"}
                </Link>
              ) : null}
              {team.permissions.canManageTeam ? <Button size="sm" variant="outline" onClick={() => onEdit(team)}><Pencil className="h-3.5 w-3.5" />编辑团队</Button> : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
