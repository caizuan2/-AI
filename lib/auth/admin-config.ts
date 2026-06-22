import "server-only";

import { BOOTSTRAP_SUPER_ADMIN_PHONE } from "@/lib/auth/bootstrap-super-admin";
import { normalizePhone } from "@/lib/auth/phone";
import type { CurrentUser } from "@/lib/auth";

const BOOTSTRAP_ADMIN_PHONES = [BOOTSTRAP_SUPER_ADMIN_PHONE];

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
    phones: Array.from(new Set([...BOOTSTRAP_ADMIN_PHONES, ...readPhoneEnv("ADMIN_PHONES")]))
  };
}

export function isAdminUser(user: Pick<CurrentUser, "id" | "phone">) {
  const config = getAdminConfig();
  const userId = user.id.trim().toLowerCase();
  const phone = user.phone ? normalizePhone(user.phone) : "";

  return config.userIds.includes(userId) || config.phones.includes(phone);
}
