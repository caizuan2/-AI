import "server-only";

export type { AppUser, CurrentUser } from "@/lib/auth/session";
export {
  createSession,
  destroySession,
  getCurrentUser,
  getCurrentUser as getCurrentAuthUser,
  requireUser
} from "@/lib/auth/session";

export async function ensureAppUser(user: import("@/lib/auth/session").AppUser) {
  return user;
}
