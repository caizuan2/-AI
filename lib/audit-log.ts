import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logger, toSafeErrorLog } from "@/lib/logger";
import type { AppRole } from "@/lib/rbac/roles";

export type AuditAction =
  | "ADMIN_ANALYTICS_VIEW"
  | "ADMIN_DEBUG_CHECK_CODE"
  | "ADMIN_DEBUG_ENV_VIEW"
  | "ADMIN_LICENSE_DISABLE"
  | "ADMIN_LICENSE_GENERATE"
  | "ADMIN_LICENSE_VIEW"
  | "ADMIN_OVERVIEW_VIEW"
  | "ADMIN_USER_UPDATE"
  | "CHAT_ASK"
  | "CHAT_BLOCKED_UNSAFE_INPUT"
  | "CHAT_PROVIDER_NOT_CONFIGURED"
  | "CHAT_RETRIEVE"
  | "archive_conversation"
  | "create_group_chat"
  | "delete_conversation"
  | "FILE_UPLOAD"
  | "INGEST_CREATE"
  | "INGEST_CHAT_CONFIRM"
  | "INGEST_CHAT_PREVIEW"
  | "INGEST_FILE_UPLOAD"
  | "INGEST_JOB_FAILED"
  | "INGEST_JOB_RETRY"
  | "INGEST_JOB_SUCCESS"
  | "INGEST_TEXT_CREATE"
  | "JOB_RETRY"
  | "KNOWLEDGE_SOFT_DELETE_DENIED"
  | "KNOWLEDGE_SOFT_DELETE_SUCCESS"
  | "KNOWLEDGE_VIEW"
  | "RBAC_ACCESS_DENIED"
  | "disable_user"
  | "demote_user_role"
  | "enable_user"
  | "last_super_admin_protected"
  | "promote_to_enterprise_admin"
  | "promote_to_ingest_admin"
  | "promote_to_super_admin"
  | "rename_conversation"
  | "share_conversation"
  | "update_feature_flag"
  | "update_user_role";

export interface AuditRequestContext {
  ip: string | null;
  userAgent: string | null;
}

export interface WriteAuditLogInput {
  userId: string | null;
  role: AppRole | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  request?: Request;
  metadata?: Prisma.InputJsonValue;
}

function getHeaderValue(headers: Headers, name: string) {
  const value = headers.get(name)?.trim();

  return value || null;
}

export function getAuditRequestContext(request?: Request): AuditRequestContext {
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

export async function writeAuditLog(input: WriteAuditLogInput) {
  const requestContext = getAuditRequestContext(input.request);

  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        role: input.role,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        ip: requestContext.ip,
        userAgent: requestContext.userAgent,
        metadata: input.metadata ?? undefined
      }
    });
  } catch (error) {
    logger.warn("audit_log.write_failed", {
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      error: toSafeErrorLog(error)
    });
  }
}
