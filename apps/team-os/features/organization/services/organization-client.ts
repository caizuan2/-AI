import type {
  AddMemberInput,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CreateInvitationInput,
  CreateTeamInput,
  InvitationRecord,
  MemberListData,
  OrganizationMember,
  OrganizationOverview,
  OrganizationTeam,
  UpdateTeamInput
} from "@/apps/team-os/features/organization/types";

async function readResponse<T>(response: Response): Promise<T> {
  const body = await response.json() as ApiSuccessEnvelope<T> | ApiErrorEnvelope;
  if (!body.success) {
    throw new Error(body.message || body.error?.message || "请求失败，请稍后重试。");
  }
  if (!response.ok || !("data" in body)) {
    throw new Error("接口返回格式不正确。");
  }
  return body.data;
}

export async function fetchOrganization(companyId?: string | null): Promise<OrganizationOverview> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return readResponse<OrganizationOverview>(await fetch(`/api/team-os/organization${query}`, { cache: "no-store" }));
}

export async function createTeam(input: CreateTeamInput): Promise<OrganizationTeam> {
  const data = await readResponse<{ team: OrganizationTeam }>(await fetch("/api/team-os/organization", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.team;
}

export async function updateTeam(input: UpdateTeamInput) {
  const data = await readResponse<{ team: Pick<OrganizationTeam, "id" | "name" | "description" | "status" | "updatedAt"> }>(await fetch("/api/team-os/organization", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.team;
}

export async function fetchMembers(companyId?: string | null): Promise<MemberListData> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  return readResponse<MemberListData>(await fetch(`/api/team-os/members${query}`, { cache: "no-store" }));
}

export async function addMember(input: AddMemberInput): Promise<OrganizationMember> {
  const data = await readResponse<{ member: OrganizationMember }>(await fetch("/api/team-os/members", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.member;
}

export async function createInvitation(input: CreateInvitationInput): Promise<InvitationRecord> {
  const data = await readResponse<{ invitation: InvitationRecord }>(await fetch("/api/team-os/invitations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.invitation;
}
