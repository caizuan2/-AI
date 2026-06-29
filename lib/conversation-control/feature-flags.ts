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

type FlagDefinition = Omit<ConversationFeatureFlagItem, "enabled"> & {
  aliases: string[];
};

const flagDefinitions: FlagDefinition[] = [
  {
    key: "conversation.rename.enabled",
    name: "rename",
    label: "重命名会话",
    description: "允许用户在本人历史会话范围内修改会话标题。",
    riskLevel: "low",
    aliases: ["conversation.rename.enabled", "rename", "rename.enabled", "conversationRenameEnabled"]
  },
  {
    key: "conversation.archive.enabled",
    name: "archive",
    label: "归档会话",
    description: "允许用户将本人历史会话标记为归档，不影响知识库数据。",
    riskLevel: "low",
    aliases: ["conversation.archive.enabled", "archive", "archive.enabled", "conversationArchiveEnabled"]
  },
  {
    key: "conversation.delete.enabled",
    name: "delete",
    label: "删除会话",
    description: "允许用户软删除本人历史会话；附件和知识库原始文档不会被物理删除。",
    riskLevel: "high",
    aliases: ["conversation.delete.enabled", "delete", "delete.enabled", "conversationDeleteEnabled"]
  },
  {
    key: "conversation.share.enabled",
    name: "share",
    label: "分享会话",
    description: "允许为本人会话生成分享预留状态，必须受审计和后续访问策略保护。",
    riskLevel: "high",
    aliases: ["conversation.share.enabled", "share", "share.enabled", "conversationShareEnabled"]
  },
  {
    key: "conversation.group_chat.enabled",
    name: "groupChat",
    label: "开始群聊",
    description: "允许基于本人会话创建群聊预留状态，后续需接入成员权限边界。",
    riskLevel: "high",
    aliases: [
      "conversation.group_chat.enabled",
      "conversation.groupChat.enabled",
      "groupChat",
      "group_chat",
      "groupChat.enabled",
      "group_chat.enabled",
      "conversationGroupChatEnabled"
    ]
  },
  {
    key: "conversation.pin.cloud_sync_enabled",
    name: "pinCloudSync",
    label: "云端置顶同步",
    description: "预留云端置顶同步开关；当前用户端仍可保持本地排序。",
    riskLevel: "medium",
    aliases: [
      "conversation.pin.cloud_sync_enabled",
      "pinCloudSync",
      "pin_cloud_sync",
      "pinCloudSync.enabled",
      "pin_cloud_sync.enabled",
      "conversationPinCloudSyncEnabled"
    ]
  }
];

export const defaultConversationFeatureFlags: ConversationFeatureFlags = {
  rename: true,
  archive: true,
  delete: true,
  share: true,
  groupChat: true,
  pinCloudSync: false
};

const releasedConversationFeatureFloor: Partial<ConversationFeatureFlags> = {
  rename: true,
  archive: true,
  delete: true,
  share: true,
  groupChat: true
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function readPathValue(record: Record<string, unknown>, path: string) {
  if (Object.prototype.hasOwnProperty.call(record, path)) {
    return record[path];
  }

  const parts = path.split(".");
  let current: unknown = record;

  for (const part of parts) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

function getCandidateRecords(value: Record<string, unknown>) {
  return [
    value,
    value.after,
    value.features,
    value.flags,
    value.conversationFeatures,
    isRecord(value.after) ? value.after.features : null,
    isRecord(value.after) ? value.after.flags : null,
    isRecord(value.after) ? value.after.conversationFeatures : null
  ].filter(isRecord);
}

function readFlagValue(candidates: Record<string, unknown>[], definition: FlagDefinition) {
  for (const candidate of candidates) {
    for (const alias of definition.aliases) {
      const value = readBoolean(readPathValue(candidate, alias));

      if (typeof value === "boolean") {
        return value;
      }
    }
  }

  return undefined;
}

export function normalizeConversationFeatureFlags(
  value: unknown,
  options: { includeDefaults?: boolean } = {}
): Partial<ConversationFeatureFlags> | null {
  if (!isRecord(value)) {
    return null;
  }

  const includeDefaults = options.includeDefaults ?? true;
  const candidates = getCandidateRecords(value);
  const next: Partial<ConversationFeatureFlags> = includeDefaults ? { ...defaultConversationFeatureFlags } : {};
  let found = false;

  for (const definition of flagDefinitions) {
    const enabled = readFlagValue(candidates, definition);

    if (typeof enabled === "boolean") {
      next[definition.name] = enabled;
      found = true;
    }
  }

  return found ? next : null;
}

function extractFlagsFromMetadata(metadata: unknown) {
  return normalizeConversationFeatureFlags(metadata, { includeDefaults: true }) as ConversationFeatureFlags | null;
}

function applyReleasedFeatureFloor(flags: ConversationFeatureFlags): ConversationFeatureFlags {
  return {
    ...flags,
    ...releasedConversationFeatureFloor
  };
}

function buildDisabledReasons(flags: ConversationFeatureFlags) {
  return flagDefinitions.reduce<Partial<Record<keyof ConversationFeatureFlags, string>>>((reasons, definition) => {
    if (!flags[definition.name]) {
      reasons[definition.name] = "FEATURE_DISABLED";
    }

    return reasons;
  }, {});
}

function buildFeatureMap(flags: ConversationFeatureFlags) {
  return flagDefinitions.reduce<ConversationFeatureFlagResponse["features"]>((features, definition) => {
    features[definition.key] = flags[definition.name];

    return features;
  }, {} as ConversationFeatureFlagResponse["features"]);
}

export function buildConversationFeatureFlagResponse(
  flags: ConversationFeatureFlags,
  reasons?: ConversationFeatureFlagResponse["reasons"]
): ConversationFeatureFlagResponse {
  return {
    ...flags,
    features: buildFeatureMap(flags),
    items: flagDefinitions.map((definition) => ({
      key: definition.key,
      name: definition.name,
      label: definition.label,
      description: definition.description,
      riskLevel: definition.riskLevel,
      enabled: flags[definition.name]
    })),
    reasons: {
      ...buildDisabledReasons(flags),
      ...(reasons ?? {})
    }
  };
}

export async function getConversationFeatureFlagSnapshot(): Promise<{
  flags: ConversationFeatureFlags;
  source: "audit_log" | "default";
  sourceAuditLogId: string | null;
  sourceCreatedAt: string | null;
}> {
  const updates = await prisma.auditLog.findMany({
    where: {
      action: "update_feature_flag",
      targetType: "conversation_feature_flags"
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20,
    select: {
      id: true,
      createdAt: true,
      metadata: true
    }
  });

  for (const update of updates) {
    const flags = extractFlagsFromMetadata(update.metadata);

    if (flags) {
      return {
        flags: applyReleasedFeatureFloor(flags),
        source: "audit_log",
        sourceAuditLogId: update.id,
        sourceCreatedAt: update.createdAt.toISOString()
      };
    }
  }

  return {
    flags: applyReleasedFeatureFloor({ ...defaultConversationFeatureFlags }),
    source: "default",
    sourceAuditLogId: null,
    sourceCreatedAt: null
  };
}

export async function getConversationFeatureFlags(): Promise<ConversationFeatureFlags> {
  const snapshot = await getConversationFeatureFlagSnapshot();

  return snapshot.flags;
}

export async function updateConversationFeatureFlags(
  actor: Pick<RbacUser, "id" | "role">,
  input: unknown,
  request?: Request
) {
  const requestedFlags = normalizeConversationFeatureFlags(input, { includeDefaults: false });
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
