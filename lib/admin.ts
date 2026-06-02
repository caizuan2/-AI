import "server-only";

import { getCurrentAuthUser, type CurrentUser } from "@/lib/auth";
import { LOCAL_AUTH_DEFAULT_EMAIL } from "@/lib/auth/local";
import { ForbiddenError } from "@/lib/errors";
import { hasSupabaseConfig } from "@/lib/supabase/config";

function readCsvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminConfig() {
  return {
    userIds: readCsvEnv("ADMIN_USER_IDS"),
    emails: readCsvEnv("ADMIN_EMAILS")
  };
}

export function isAdminUser(user: Pick<CurrentUser, "id" | "email">) {
  const config = getAdminConfig();
  const userId = user.id.trim().toLowerCase();
  const email = user.email.trim().toLowerCase();

  if (config.userIds.includes(userId) || config.emails.includes(email)) {
    return true;
  }

  return !hasSupabaseConfig() &&
    config.userIds.length === 0 &&
    config.emails.length === 0 &&
    email === LOCAL_AUTH_DEFAULT_EMAIL;
}

export async function requireAdminUser() {
  const user = await getCurrentAuthUser();

  if (!isAdminUser(user)) {
    throw new ForbiddenError("仅管理员可以访问管理后台。");
  }

  return user;
}
