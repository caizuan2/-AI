import "server-only";

import { requireRole } from "@/lib/auth/guards";

export async function requireConversationUser(request: Request, targetType: string, targetId?: string | null) {
  return requireRole("user", {
    request,
    requireLicense: true,
    deniedAction: "RBAC_ACCESS_DENIED",
    targetType,
    targetId: targetId ?? null
  });
}

export async function readOptionalJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
