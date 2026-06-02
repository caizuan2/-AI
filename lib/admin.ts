import "server-only";

import { normalizePhone } from "@/lib/auth/phone";
import { getCurrentAuthUser, type CurrentUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function readPhoneEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(normalizePhone);
}

export function getAdminConfig() {
  return {
    userIds: readCsvEnv("ADMIN_USER_IDS"),
    emails: readCsvEnv("ADMIN_EMAILS"),
    phones: readPhoneEnv("ADMIN_PHONES")
  };
}

export function isAdminUser(user: Pick<CurrentUser, "id" | "email" | "phone">) {
  const config = getAdminConfig();
  const userId = user.id.trim().toLowerCase();
  const email = user.email?.trim().toLowerCase() ?? "";
  const phone = user.phone ? normalizePhone(user.phone) : "";

  if (config.userIds.includes(userId) || config.emails.includes(email) || config.phones.includes(phone)) {
    return true;
  }

  return false;
}

export async function requireAdminUser() {
  const user = await getCurrentAuthUser();

  if (!isAdminUser(user)) {
    throw new ForbiddenError("仅管理员可以访问管理后台。");
  }

  return user;
}
