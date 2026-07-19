export const TEAM_OS_INVITATION_ROLES = ["TEAM_MANAGER", "TRAINER", "TEAM_MEMBER"] as const;

export type TeamOsInvitationRole = (typeof TEAM_OS_INVITATION_ROLES)[number];

export interface TeamOsRegisterInput {
  name: string;
  phone: string;
  email: string;
  password: string;
}

export interface TeamOsRegisterResult {
  user: {
    id: string;
    name: string;
    phone: string;
    email: string;
  };
  nextPath: "/team-os/activate";
}

export interface ActivateTeamOsCompanyInput {
  code: string;
  companyName: string;
  industry: string | null;
}

export interface ActivateTeamOsCompanyResult {
  company: {
    id: string;
    name: string;
    industry: string | null;
  };
  defaultTeam: {
    id: string;
    name: string;
  };
  subscription: {
    id: string;
    planId: string;
    planName: string;
    startDate: string;
    endDate: string;
  };
  role: "TEAM_OWNER";
  idempotent: boolean;
  nextPath: "/team-os/onboarding";
}

export type TeamOsInvitationState = "PENDING" | "ACCEPTED" | "EXPIRED" | "UNAVAILABLE";

export interface TeamOsInvitationDetails {
  teamName: string;
  companyName: string;
  emailMasked: string;
  role: TeamOsInvitationRole;
  status: TeamOsInvitationState;
  expiresAt: string;
  canAccept: boolean;
}

export interface AcceptTeamOsInvitationResult {
  companyId: string;
  companyName: string;
  teamId: string;
  teamName: string;
  membershipId: string;
  role: TeamOsInvitationRole;
  emailBound: boolean;
  idempotent: boolean;
  nextPath: "/team-os/onboarding";
}
