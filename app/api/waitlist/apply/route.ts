import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { ensureAppUser, getCurrentAuthUser } from "@/lib/auth";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface WaitlistApplyResponse {
  betaAccess: boolean;
  betaRequestedAt: string | null;
  alreadyRequested: boolean;
}

export async function POST() {
  let authUser: Awaited<ReturnType<typeof getCurrentAuthUser>>;

  try {
    authUser = await getCurrentAuthUser();
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("申请测试资格"));
  }

  try {
    const user = await ensureAppUser(authUser);

    if (user.betaAccess) {
      return apiSuccess<WaitlistApplyResponse>({
        betaAccess: true,
        betaRequestedAt: user.betaRequestedAt?.toISOString() ?? null,
        alreadyRequested: Boolean(user.betaRequestedAt)
      });
    }

    const requestedAt = user.betaRequestedAt ?? new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        betaRequestedAt: requestedAt
      },
      select: {
        betaAccess: true,
        betaRequestedAt: true
      }
    });

    return apiSuccess<WaitlistApplyResponse>({
      betaAccess: updated.betaAccess,
      betaRequestedAt: updated.betaRequestedAt?.toISOString() ?? null,
      alreadyRequested: Boolean(user.betaRequestedAt)
    });
  } catch (error) {
    return apiError(error);
  }
}
