import { Mail, UserRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { MemberStatusBadge, RoleBadge } from "@/apps/team-os/features/organization/components/OrganizationBadges";
import type { OrganizationMember } from "@/apps/team-os/features/organization/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function MemberList({ members }: { members: OrganizationMember[] }) {
  if (members.length === 0) {
    return <Card className="border-dashed"><CardContent className="flex min-h-44 items-center justify-center text-sm text-slate-500">暂无可查看的成员信息。</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      {members.map((member) => (
        <Card key={member.id}>
          <CardContent className="grid gap-4 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] md:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-700"><UserRound className="h-5 w-5" /></span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{member.name}{member.isSelf ? "（我）" : ""}</p>
                <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500"><Mail className="h-3 w-3" />{member.email || "未绑定邮箱"}</p>
              </div>
            </div>
            <div><p className="text-xs text-slate-500">所属团队</p><p className="mt-1 text-sm font-medium">{member.teamName}</p></div>
            <div className="flex flex-wrap gap-2"><RoleBadge role={member.role} /><MemberStatusBadge status={member.status} /></div>
            <div className="text-xs text-slate-500">加入于 {formatDate(member.joinedAt)}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
