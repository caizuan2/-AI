import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireKbAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/prisma";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

interface CheckStaleResponse {
  checkedAt: string;
  markedStale: number;
  activeCount: number;
  staleCount: number;
  archivedCount: number;
}

async function buildResponse(userId: string, checkedAt: Date, markedStale: number): Promise<CheckStaleResponse> {
  const [activeCount, staleCount, archivedCount] = await prisma.$transaction([
    prisma.knowledgeItem.count({
      where: {
        userId,
        status: "active",
        deletedAt: null
      }
    }),
    prisma.knowledgeItem.count({
      where: {
        userId,
        status: "stale",
        deletedAt: null
      }
    }),
    prisma.knowledgeItem.count({
      where: {
        userId,
        status: "archived",
        deletedAt: null
      }
    })
  ]);

  return {
    checkedAt: checkedAt.toISOString(),
    markedStale,
    activeCount,
    staleCount,
    archivedCount
  };
}

export async function POST() {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await requireKbAdmin(undefined, {
      targetType: "knowledge_item"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("检查过期知识"));
  }

  try {
    const checkedAt = new Date();
    const result = await prisma.knowledgeItem.updateMany({
      where: {
        userId: currentUser.id,
        status: "active",
        deletedAt: null,
        expiresAt: {
          lte: checkedAt
        }
      },
      data: {
        status: "stale"
      }
    });

    return apiSuccess<CheckStaleResponse>(await buildResponse(currentUser.id, checkedAt, result.count));
  } catch (error) {
    return apiError(error);
  }
}

export async function GET() {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await requireKbAdmin(undefined, {
      targetType: "knowledge_item"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("检查过期知识"));
  }

  try {
    return apiSuccess<CheckStaleResponse>(await buildResponse(currentUser.id, new Date(), 0));
  } catch (error) {
    return apiError(error);
  }
}
