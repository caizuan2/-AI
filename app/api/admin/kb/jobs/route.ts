import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireKbAdmin } from "@/lib/auth/guards";
import { hasDatabaseUrl } from "@/lib/server-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function serializeJob(job: {
  id: string;
  sourceType: string;
  sourceId: string | null;
  status: string;
  progress: number;
  errorMessage: string | null;
  fileId: string | null;
  knowledgeItemId: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
  file: {
    id: string;
    originalName: string;
    fileType: string;
    fileSize: number;
    status: string;
  } | null;
  knowledgeItem: {
    id: string;
    title: string;
  } | null;
}) {
  return {
    id: job.id,
    sourceType: job.sourceType,
    sourceId: job.sourceId,
    status: job.status,
    progress: job.progress,
    errorMessage: job.errorMessage,
    fileId: job.fileId,
    knowledgeItemId: job.knowledgeItemId,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    file: job.file,
    knowledgeItem: job.knowledgeItem
  };
}

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_jobs",
      requiredAppType: "ingest_admin"
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("读取投喂任务"));
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1, 10_000);
  const pageSize = parsePositiveInt(searchParams.get("pageSize"), 20, 100);
  const status = searchParams.get("status")?.trim();
  const where = {
    ...(actor.role === "super_admin" ? {} : { createdByUserId: actor.id }),
    ...(status ? { status } : {})
  };

  try {
    const [total, jobs] = await prisma.$transaction([
      prisma.ingestionJob.count({ where }),
      prisma.ingestionJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          file: {
            select: {
              id: true,
              originalName: true,
              fileType: true,
              fileSize: true,
              status: true
            }
          },
          knowledgeItem: {
            select: {
              id: true,
              title: true
            }
          }
        }
      })
    ]);
    const totalPages = Math.ceil(total / pageSize);

    return apiSuccess({
      jobs: jobs.map(serializeJob),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
