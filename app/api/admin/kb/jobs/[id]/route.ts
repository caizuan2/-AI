import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireKbAdmin } from "@/lib/auth/guards";
import { NotFoundError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(request: Request, context: RouteContext) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_job",
      targetId: context.params.id
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取投喂任务详情"));
  }

  try {
    const job = await prisma.ingestionJob.findFirst({
      where: {
        id: context.params.id,
        ...(actor.role === "super_admin" ? {} : { createdByUserId: actor.id })
      },
      include: {
        file: {
          select: {
            id: true,
            originalName: true,
            fileType: true,
            fileSize: true,
            status: true,
            categoryId: true,
            tags: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            deletedAt: true
          }
        },
        knowledgeItem: {
          select: {
            id: true,
            title: true,
            summary: true,
            category: true,
            tags: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        }
      }
    });

    if (!job) {
      return apiError(new NotFoundError("投喂任务不存在。"));
    }

    return apiSuccess({
      job: {
        id: job.id,
        sourceType: job.sourceType,
        sourceId: job.sourceId,
        status: job.status,
        progress: job.progress,
        errorMessage: job.errorMessage,
        fileId: job.fileId,
        knowledgeItemId: job.knowledgeItemId,
        metadata: job.metadata,
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
        finishedAt: job.finishedAt?.toISOString() ?? null,
        file: job.file
          ? {
              ...job.file,
              createdAt: job.file.createdAt.toISOString(),
              updatedAt: job.file.updatedAt.toISOString(),
              deletedAt: job.file.deletedAt?.toISOString() ?? null
            }
          : null,
        knowledgeItem: job.knowledgeItem
          ? {
              ...job.knowledgeItem,
              createdAt: job.knowledgeItem.createdAt.toISOString(),
              updatedAt: job.knowledgeItem.updatedAt.toISOString()
            }
          : null
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
