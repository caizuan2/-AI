import type { TeamRole } from "@/apps/team-os/types";

export const TEAM_ORGANIZATION_STATUSES = ["ACTIVE", "DISABLED"] as const;
export const TEAM_MEMBER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const TEAM_INVITATION_STATUSES = ["PENDING", "ACCEPTED", "EXPIRED"] as const;
export const ASSIGNABLE_TEAM_ROLES = ["TEAM_MANAGER", "TRAINER", "TEAM_MEMBER"] as const;

export type TeamOrganizationStatus = (typeof TEAM_ORGANIZATION_STATUSES)[number];
export type TeamMemberStatus = (typeof TEAM_MEMBER_STATUSES)[number];
export type TeamInvitationStatus = (typeof TEAM_INVITATION_STATUSES)[number];
export type AssignableTeamRole = (typeof ASSIGNABLE_TEAM_ROLES)[number];
export type { TeamRole };

export interface OrganizationPermissions {
  canCreateTeam: boolean;
  canManageOrganization: boolean;
  canManageTeam: boolean;
  canManageMembers: boolean;
  canViewMembers: boolean;
  canViewTraining: boolean;
  canViewSelf: boolean;
}

export interface OrganizationTeam {
  id: string;
  companyId: string;
  name: string;
  description: string | null;
  status: TeamOrganizationStatus;
  memberCount: number | null;
  currentUserRole: TeamRole | null;
  permissions: OrganizationPermissions;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationCompanyOption {
  id: string;
  name: string;
}

export interface OrganizationOverview {
  companyId: string | null;
  companyName: string | null;
  companyIds: string[];
  companies: OrganizationCompanyOption[];
  ownerCompanyIds: string[];
  teams: OrganizationTeam[];
  canBootstrap: boolean;
  canCreateTeam: boolean;
  accessState: "ACTIVE" | "INACTIVE" | "UNASSIGNED";
}

export interface OrganizationMember {
  id: string;
  teamId: string;
  teamName: string;
  userId: string;
  name: string;
  email: string | null;
  role: TeamRole;
  status: TeamMemberStatus;
  joinedAt: string;
  updatedAt: string;
  isSelf: boolean;
}

export interface MemberListData {
  companyId: string | null;
  companyName: string | null;
  companyIds: string[];
  companies: OrganizationCompanyOption[];
  members: OrganizationMember[];
  teams: Array<{
    id: string;
    name: string;
    role: TeamRole;
    canManageMembers: boolean;
  }>;
}

export interface CreateTeamInput {
  companyId?: string;
  name: string;
  description: string;
}

export interface UpdateTeamInput extends CreateTeamInput {
  teamId: string;
}

export interface AddMemberInput {
  teamId: string;
  email: string;
  role: AssignableTeamRole;
}

export interface CreateInvitationInput extends AddMemberInput {}

export interface InvitationRecord {
  id: string;
  teamId: string;
  email: string;
  role: AssignableTeamRole;
  inviteCode: string;
  status: TeamInvitationStatus;
  expiresAt: string;
  createdAt: string;
}

export interface ApiSuccessEnvelope<T> {
  ok: true;
  success: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok?: false;
  success: false;
  message?: string;
  error?: { message?: string };
}
