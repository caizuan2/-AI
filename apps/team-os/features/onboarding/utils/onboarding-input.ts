import { isPlainObject } from "@/lib/api/responses";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { ValidationError } from "@/lib/errors";
import type {
  ActivateTeamOsCompanyInput,
  TeamOsRegisterInput
} from "@/apps/team-os/features/onboarding/types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITATION_CODE_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function requiredText(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw new ValidationError(`${label}不能为空。`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ValidationError(`${label}不能超过 ${maxLength} 个字符。`);
  }
  return normalized;
}

export function normalizeTeamOsEmail(value: string) {
  return value.trim().toLowerCase();
}

export function parseTeamOsRegisterInput(body: unknown): TeamOsRegisterInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const name = requiredText(body.name, "姓名", 80);
  const phone = normalizePhone(requiredText(body.phone, "手机号", 24));
  const email = normalizeTeamOsEmail(requiredText(body.email, "邮箱", 254));
  const password = typeof body.password === "string" ? body.password : "";

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new ValidationError("请输入有效的邮箱地址。");
  }
  if (password.length < 8) {
    throw new ValidationError("密码至少需要 8 位。");
  }
  if (password.length > 128) {
    throw new ValidationError("密码不能超过 128 位。");
  }

  return { name, phone, email, password };
}

export function parseActivateTeamOsCompanyInput(body: unknown): ActivateTeamOsCompanyInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const code = requiredText(body.code, "企业授权码", 180);
  const companyName = requiredText(body.companyName, "企业名称", 120);
  const industryValue = typeof body.industry === "string" ? body.industry.trim() : "";
  if (industryValue.length > 120) {
    throw new ValidationError("所属行业不能超过 120 个字符。");
  }

  return {
    code,
    companyName,
    industry: industryValue || null
  };
}

export function parseTeamOsInvitationCode(value: unknown) {
  const code = typeof value === "string" ? value.trim() : "";
  if (!INVITATION_CODE_PATTERN.test(code)) {
    throw new ValidationError("邀请链接格式不正确。");
  }
  return code;
}

export function isTeamOsInvitationCode(value: string | null | undefined): value is string {
  return typeof value === "string" && INVITATION_CODE_PATTERN.test(value);
}

export function maskInvitationEmail(email: string) {
  const [local = "", domain = ""] = normalizeTeamOsEmail(email).split("@");
  if (!local || !domain) return "***";
  const visibleLocal = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  const [domainName = "", ...suffix] = domain.split(".");
  const visibleDomain = domainName.slice(0, 1);
  return `${visibleLocal}${"*".repeat(Math.max(2, local.length - visibleLocal.length))}@${visibleDomain}***${suffix.length ? `.${suffix.join(".")}` : ""}`;
}
