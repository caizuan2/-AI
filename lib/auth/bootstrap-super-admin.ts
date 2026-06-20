import { normalizePhone } from "@/lib/auth/phone";

export const BOOTSTRAP_SUPER_ADMIN_PHONE = normalizePhone("13352833702");

export function isBootstrapSuperAdminPhone(phone?: string | null) {
  return Boolean(phone) && normalizePhone(phone ?? "") === BOOTSTRAP_SUPER_ADMIN_PHONE;
}

export function isBootstrapSuperAdminUser(user: { phone?: string | null }) {
  return isBootstrapSuperAdminPhone(user.phone);
}
