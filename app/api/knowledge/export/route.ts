import { prisma } from "@/lib/prisma";
import { apiError, apiSuccess, databaseConfigError } from "@/lib/api-response";
import { requireKbAdmin } from "@/lib/auth/guards";
import { writeAuditLog } from "@/lib/audit-log";
import { ValidationError } from "@/lib/errors";
import {
  isKnowledgeExportFormat,
  serializeKnowledgeExport,
  type KnowledgeExportResponse
} from "@/lib/knowledge/import-export";
import { hasDatabaseUrl } from "@/lib/server-config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  let currentUser: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    currentUser = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "knowledge_item",
      metadata: {
        operation: "knowledge_export"
      }
    });
  } catch (error) {
    return apiError(error);
  }

  if (!hasDatabaseUrl()) {
    return apiError(databaseConfigError("导出知识库"));
  }

  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") ?? "json";

  if (!isKnowledgeExportFormat(format)) {
    return apiError(new ValidationError("导出格式仅支持 json、markdown、csv。"));
  }

  try {
    const items = await prisma.knowledgeItem.findMany({
      where: { userId: currentUser.id, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        chunks: {
          orderBy: { chunkIndex: "asc" },
          select: {
            id: true,
            chunkText: true,
            chunkIndex: true,
            metadata: true,
            createdAt: true
          }
        }
      }
    });

    await writeAuditLog({
      userId: currentUser.id,
      role: currentUser.role,
      action: "KNOWLEDGE_VIEW",
      targetType: "knowledge_item",
      request,
      metadata: {
        scope: "export",
        format,
        itemCount: items.length
      }
    });

    return apiSuccess<KnowledgeExportResponse>(serializeKnowledgeExport(items, format));
  } catch (error) {
    return apiError(error);
  }
}
