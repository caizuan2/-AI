import "server-only";

import type { Prisma } from "@prisma/client";
import { getAuditRequestContext } from "@/lib/audit-log";
import { prisma } from "@/lib/prisma";
import type { RbacUser } from "@/lib/auth/rbac";
import type {
  ConversationFeatureFlagItem,
  ConversationFeatureFlagResponse,
  ConversationFeatureFlags
} from "@/types/conversation-control";

const flagDefinitions: Array<Omit<ConversationFeatureFlagItem, "enabled">> = [
  {
    key: "conversation.rename.enabled",
    name: "rename",
    label: "重命名会话",
    description: "允许用户在本人历史会话范围内修改会话标题。",
    riskLevel: "low"
  },
  {
    key: "conversation.archive.enabled",
    name: "archive",
    label: "归档会话",
    description: "允许用户将本人历史会话标记为归档，不影响知识库数据。",
    riskLevel: "low"
  },
  {
    key: "conversation.delete.enabled",
    name: "delete",
    label: "删除会话",
    description: "允许用户软删除本人历史会话；附件和知识库原始文档不会被物理删除。",
    riskLevel: "high"
  },
  {
    key: "conversation.share.enabled",
    name: "share",
    label: "分享会话",
    description: "允许为本人会话生成分享预留状态，必须受审计和后续访问策略保护。",
    riskLevel: "high"
  },
  {
    key: "conversation.group_chat.enabled",
    name: "groupChat",
    label: "开始群聊",
    description: "允许基于本人会话创建群聊预留状态，后续需接入成员权限边界。",
    riskLevel: "high"
  },
  {
    key: "conversation.pin.cloud_sync_enabled",
    name: "pinCloudSync",
    label: "云端置顶同步",
    description: "预留云端置顶同步开关；当前用户端仍可保持本地排序。",
    riskLevel: "medium"
  }
];

export const defaultConversationFeatureFlags: ConversationFeatureFlags = {
  rename: false,
  archive: false,
  delete: false,
  share: false,
  groupChat: false,
  pinCloudSync: false
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeFlags(value: unknown): ConversationFeatureFlags | null {
  if (!isRecord(value)) {
    return null;
  }

  const next = { ...defaultConversationFeatureFlags };
  let found = false;

  for (const definition of flagDefinitions) {
    const byName = readBoolean(value[definition.name]);
    const byKey = readBoolean(value[definition.key]);
    const enabled = byName ?? byKey;

    if (typeof enabled === "boolean") {
      next[definition.name] = enabled;
      found = true;
    }
  }

  return found ? next : null;
}

function extractFlagsFromMetadata(metadata: unknown) {
  if (!isRecord(metadata)) {
    return null;
  }

  return normalizeFlags(metadata.after);
}

export function buildConversationFeatureFlagResponse(flags: ConversationFeatureFlags): ConversationFeatureFlagResponse {
  return {
    ...flags,
    items: flagDefinitions.map((definition) => ({
      ...definition,
      enabled: flags[definition.name]
    }))
  };
}

export async function getConversationFeatureFlags(): Promise<ConversationFeatureFlags> {
  const latestUpdate = await prisma.auditLog.findFirst({
    where: {
      action: "update_feature_flag",
      targetType: "conversation_feature_flags"
    },
    orderBy: {
      createdAt: "desc"
    },
    select: {
      metadata: true
    }
  });

  return extractFlagsFromMetadata(latestUpdate?.metadata) ?? { ...defaultConversationFeatureFlags };
}

export async function updateConversationFeatureFlags(
  actor: Pick<RbacUser, "id" | "role">,
  input: unknown,
  request?: Request
) {
  const requestedFlags = normalizeFlags(input);
  const before = await getConversationFeatureFlags();
  const requestContext = getAuditRequestContext(request);
  const after = {
    ...before,
    ...(requestedFlags ?? {})
  };
  const changedKeys = flagDefinitions
    .filter((definition) => before[definition.name] !== after[definition.name])
    .map((definition) => definition.key);

  await prisma.auditLog.create({
    data: {
      userId: actor.id,
      role: actor.role,
      action: "update_feature_flag",
      targetType: "conversation_feature_flags",
      targetId: "global",
      ip: requestContext.ip,
      userAgent: requestContext.userAgent,
      metadata: {
        operatorUserId: actor.id,
        action: "update_feature_flag",
        resourceType: "conversation_feature_flags",
        resourceId: "global",
        before,
        after,
        changedKeys,
        source: "super_admin_console"
      } satisfies Prisma.InputJsonObject
    }
  });

  return after;
}
