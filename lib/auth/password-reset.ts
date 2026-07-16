import { isPlainObject } from "@/lib/api/responses";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { ValidationError } from "@/lib/errors";

export const PASSWORD_RESET_MIN_LENGTH = 8;
export const PASSWORD_RESET_MAX_LENGTH = 128;

export interface PasswordResetInput {
  phone: string;
  licenseKey: string;
  newPassword: string;
}

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

export function parsePasswordResetRequest(body: unknown): PasswordResetInput {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const record = body as Record<string, unknown>;
  const phone = normalizePhone(readString(record, "phone"));
  const licenseKey = readString(record, "licenseKey", "license_key", "code").trim();
  const newPassword = readString(record, "newPassword", "new_password");
  const confirmPassword = readString(record, "confirmPassword", "confirm_password");

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }

  if (!licenseKey) {
    throw new ValidationError("请输入该账号原先激活使用的用户端卡密。");
  }

  if (licenseKey.length > 128) {
    throw new ValidationError("卡密格式不正确。");
  }

  if (!newPassword || !confirmPassword) {
    throw new ValidationError("请输入新密码和确认密码。");
  }

  if (newPassword.length < PASSWORD_RESET_MIN_LENGTH) {
    throw new ValidationError(`新密码至少需要 ${PASSWORD_RESET_MIN_LENGTH} 位。`);
  }

  if (newPassword.length > PASSWORD_RESET_MAX_LENGTH) {
    throw new ValidationError(`新密码不能超过 ${PASSWORD_RESET_MAX_LENGTH} 位。`);
  }

  if (newPassword !== confirmPassword) {
    throw new ValidationError("两次输入的新密码不一致。");
  }

  return {
    phone,
    licenseKey,
    newPassword
  };
}
