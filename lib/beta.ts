import "server-only";

import { isAdminUser } from "@/lib/admin";
import { getCurrentUser } from "@/lib/auth";
import { ForbiddenError } from "@/lib/errors";

export async function requireBetaAccess() {
  const user = await getCurrentUser();

  if (!user.betaAccess && !isAdminUser(user)) {
    throw new ForbiddenError("当前账号尚未开通 Beta 测试资格。");
  }

  return user;
}
