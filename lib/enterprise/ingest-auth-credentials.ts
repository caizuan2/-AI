import { isPlainObject } from "@/lib/api/responses";
import { normalizePhone, validatePhone } from "@/lib/auth/phone";
import { ValidationError } from "@/lib/errors";

export const INGEST_PASSWORD_MIN_LENGTH = 8;
export const INGEST_PASSWORD_MAX_LENGTH = 128;
export const INGEST_LICENSE_KEY_MAX_LENGTH = 128;

function readString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string") {
      return value;
    }
  }

  return "";
}

function readPhone(record: Record<string, unknown>) {
  const phone = normalizePhone(readString(record, "phone", "username").trim());

  if (!validatePhone(phone)) {
    throw new ValidationError("请输入合法手机号。");
  }

  return phone;
}

function readLicenseKey(record: Record<string, unknown>, label = "投喂端卡密") {
  const licenseKey = readString(record, "licenseKey", "license_key", "code", "key").trim();

  if (!licenseKey) {
    throw new ValidationError(`请输入${label}。`);
  }

  if (licenseKey.length > INGEST_LICENSE_KEY_MAX_LENGTH) {
    throw new ValidationError("卡密格式不正确。");
  }

  return licenseKey;
}

function validatePassword(password: string, label = "密码") {
  if (password.length < INGEST_PASSWORD_MIN_LENGTH) {
    throw new ValidationError(`${label}至少需要 ${INGEST_PASSWORD_MIN_LENGTH} 位。`);
  }

  if (password.length > INGEST_PASSWORD_MAX_LENGTH) {
    throw new ValidationError(`${label}不能超过 ${INGEST_PASSWORD_MAX_LENGTH} 位。`);
  }
}

export function parseIngestRegisterRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const record = body as Record<string, unknown>;
  const phone = readPhone(record);
  const password = readString(record, "password");
  const confirmPassword = readString(record, "confirmPassword", "confirm_password");
  const licenseKey = readLicenseKey(record, "小董AI卡密");
  const name = readString(record, "name").trim() || phone;

  validatePassword(password);

  if (confirmPassword && password !== confirmPassword) {
    throw new ValidationError("两次输入的密码不一致。");
  }

  return {
    phone,
    password,
    name,
    licenseKey
  };
}

export function parseIngestPasswordResetRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const record = body as Record<string, unknown>;
  const phone = readPhone(record);
  const licenseKey = readLicenseKey(record, "小董AI卡密");
  const newPassword = readString(record, "newPassword", "new_password");
  const confirmPassword = readString(record, "confirmPassword", "confirm_password");

  if (!newPassword || !confirmPassword) {
    throw new ValidationError("请输入新密码和确认密码。");
  }

  validatePassword(newPassword, "新密码");

  if (newPassword !== confirmPassword) {
    throw new ValidationError("两次输入的新密码不一致。");
  }

  return {
    phone,
    licenseKey,
    newPassword
  };
}
