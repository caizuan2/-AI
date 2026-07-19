import { Badge } from "@/components/ui/badge";
import { memberStatusLabels, organizationStatusLabels, roleLabels } from "@/apps/team-os/features/organization/utils/organization-labels";
import type { TeamMemberStatus, TeamOrganizationStatus, TeamRole } from "@/apps/team-os/features/organization/types";

export function RoleBadge({ role }: { role: TeamRole }) {
  return <Badge variant={role === "TEAM_OWNER" ? "default" : "secondary"}>{roleLabels[role]}</Badge>;
}

export function OrganizationStatusBadge({ status }: { status: TeamOrganizationStatus }) {
  return <Badge variant={status === "ACTIVE" ? "default" : "warning"}>{organizationStatusLabels[status]}</Badge>;
}

export function MemberStatusBadge({ status }: { status: TeamMemberStatus }) {
  return <Badge variant={status === "ACTIVE" ? "default" : "warning"}>{memberStatusLabels[status]}</Badge>;
}
