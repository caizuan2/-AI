import type { Prisma } from "@prisma/client";
import { NotFoundError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { AppRole } from "@/lib/rbac/roles";

export interface SoftDeleteKnowledgeActor {
  id: string;
  role: AppRole;
}

export interface SoftDeleteKnowledgeResult {
  id: string;
  deleted: true;
  deletedAt: Date;
  alreadyDeleted: boolean;
}

type KnowledgeSoftDeleteRecord = {
  id: string;
  userId: string;
  title: string;
  sourceType: string;
  sourceId: string | null;
  sourceTitle: string | null;
  deletedAt: Date | null;
};

type SoftDeleteKnowledgeTransaction = {
  knowledgeItem: {
    findUnique(args: unknown): Promise<KnowledgeSoftDeleteRecord | null>;
    update(args: unknown): Promise<{
      id: string;
      deletedAt: Date | null;
    }>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

type SoftDeleteKnowledgeDb = {
  $transaction<T>(action: (tx: SoftDeleteKnowledgeTransaction) => Promise<T>): Promise<T>;
};

export interface SoftDeleteKnowledgeInput {
  knowledgeItemId: string;
  actor: SoftDeleteKnowledgeActor;
  request?: Request;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
}

function getHeaderValue(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();

  return value || null;
}

function getRequestContext(request?: Request) {
  if (!request) {
    return {
      ip: null,
      userAgent: null
    };
  }

  const forwardedFor = getHeaderValue(request.headers, "x-forwarded-for")?.split(",")[0]?.trim() || null;
  const realIp = getHeaderValue(request.headers, "x-real-ip");
  const vercelForwardedFor = getHeaderValue(request.headers, "x-vercel-forwarded-for")?.split(",")[0]?.trim() || null;

  return {
    ip: forwardedFor || vercelForwardedFor || realIp,
    userAgent: getHeaderValue(request.headers, "user-agent")
  };
}

export async function softDeleteKnowledgeItem(
  input: SoftDeleteKnowledgeInput,
  db: SoftDeleteKnowledgeDb = prisma as unknown as SoftDeleteKnowledgeDb
): Promise<SoftDeleteKnowledgeResult> {
  const requestContext = getRequestContext(input.request);
  const reason = input.reason?.trim() || "super_admin_soft_delete";

  return db.$transaction(async (tx) => {
    const existing = await tx.knowledgeItem.findUnique({
      where: {
        id: input.knowledgeItemId
      },
      select: {
        id: true,
        userId: true,
        title: true,
        sourceType: true,
        sourceId: true,
        sourceTitle: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new NotFoundError("知识不存在。");
    }

    if (existing.deletedAt) {
      await tx.auditLog.create({
        data: {
          userId: input.actor.id,
          role: input.actor.role,
          action: "KNOWLEDGE_SOFT_DELETE_SUCCESS",
          targetType: "knowledge_item",
          targetId: existing.id,
          ip: requestContext.ip,
          userAgent: requestContext.userAgent,
          metadata: {
            alreadyDeleted: true,
            ownerUserId: existing.userId,
            sourceType: existing.sourceType,
            sourceId: existing.sourceId,
            sourceTitle: existing.sourceTitle,
            reason,
            ...(typeof input.metadata === "object" && input.metadata !== null && !Array.isArray(input.metadata)
              ? input.metadata
              : {})
          }
        }
      });

      return {
        id: existing.id,
        deleted: true,
        deletedAt: existing.deletedAt,
        alreadyDeleted: true
      };
    }

    const deletedAt = new Date();
    const updated = await tx.knowledgeItem.update({
      where: {
        id: existing.id
      },
      data: {
        status: "archived",
        deletedAt,
        deletedByUserId: input.actor.id,
        deleteReason: reason
      },
      select: {
        id: true,
        deletedAt: true
      }
    });

    await tx.auditLog.create({
      data: {
        userId: input.actor.id,
        role: input.actor.role,
        action: "KNOWLEDGE_SOFT_DELETE_SUCCESS",
        targetType: "knowledge_item",
        targetId: existing.id,
        ip: requestContext.ip,
        userAgent: requestContext.userAgent,
        metadata: {
          alreadyDeleted: false,
          ownerUserId: existing.userId,
          sourceType: existing.sourceType,
          sourceId: existing.sourceId,
          sourceTitle: existing.sourceTitle,
          reason,
          ...(typeof input.metadata === "object" && input.metadata !== null && !Array.isArray(input.metadata)
            ? input.metadata
            : {})
        }
      }
    });

    return {
      id: updated.id,
      deleted: true,
      deletedAt: updated.deletedAt ?? deletedAt,
      alreadyDeleted: false
    };
  });
}
