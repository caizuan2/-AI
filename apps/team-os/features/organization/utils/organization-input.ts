import { isPlainObject } from "@/lib/api/responses";
import { ValidationError } from "@/lib/errors";
import {
  ASSIGNABLE_TEAM_ROLES,
  type AddMemberInput,
  type CreateInvitationInput,
  type CreateTeamInput,
  type UpdateTeamInput
} from "@/apps/team-os/features/organization/types";

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }

  return result;
}

function optionalText(value: unknown, label: string, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  if (typeof value !== "string") {
    throw new ValidationError(`${label}格式不正确。`);
  }

  const result = value.trim();
  if (result.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }

  return result;
}

function email(value: unknown) {
  const result = requiredText(value, "邮箱", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    throw new ValidationError("请输入有效的邮箱地址。");
  }
  return result;
}

function role(value: unknown) {
  if (typeof value !== "string" || !ASSIGNABLE_TEAM_ROLES.includes(value as never)) {
    throw new ValidationError("成员角色不正确。");
  }
  return value as AddMemberInput["role"];
}

export function parseCreateTeamInput(body: unknown): CreateTeamInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  return {
    companyId: optionalText(body.companyId, "企业 ID", 120) || undefined,
    name: requiredText(body.name, "团队名称", 120),
    description: optionalText(body.description, "团队描述", 2000)
  };
}

export function parseUpdateTeamInput(body: unknown): UpdateTeamInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  return {
    teamId: requiredText(body.teamId, "团队 ID", 120),
    name: requiredText(body.name, "团队名称", 120),
    description: optionalText(body.description, "团队描述", 2000)
  };
}

export function parseAddMemberInput(body: unknown): AddMemberInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  return {
    teamId: requiredText(body.teamId, "团队 ID", 120),
    email: email(body.email),
    role: role(body.role)
  };
}

export function parseCreateInvitationInput(body: unknown): CreateInvitationInput {
  return parseAddMemberInput(body);
}
