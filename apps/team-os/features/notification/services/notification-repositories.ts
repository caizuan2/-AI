import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ForbiddenError, ValidationError } from "@/lib/errors";
import type {
  CreateNotificationInput,
  IntegrationConfigRepository,
  IntegrationConfigSummary,
  MarkNotificationsReadInput,
  NotificationListQuery,
  NotificationPreferenceRecord,
  NotificationPreferenceRepository,
  NotificationRecord,
  NotificationRepository,
  SaveIntegrationConfigInput,
  StoredIntegrationConfig,
  UpdateNotificationPreferenceInput
} from "@/apps/team-os/features/notification/types";
import {
  normalizeCreateNotificationInput,
  normalizeIdentifier,
  normalizeIntegrationProvider,
  normalizeMarkNotificationsReadInput,
  normalizeNotificationListQuery,
  normalizePreferenceUpdates
} from "@/apps/team-os/features/notification/utils/notification-input";
import { isEncryptedIntegrationConfig } from "@/apps/team-os/features/notification/utils/integration-config-crypto";

function serializeNotification(record: {
  id: string;
  companyId: string;
  teamId: string | null;
  userId: string;
  type: NotificationRecord["type"];
  title: string;
  content: string;
  readStatus: NotificationRecord["readStatus"];
  source: string;
  createdAt: Date;
}): NotificationRecord {
  return { ...record, createdAt: record.createdAt.toISOString() };
}

async function assertActiveRecipient(companyId: string, userId: string, teamId?: string) {
  const [user, membership, team] = await Promise.all([
    prisma.user.findFirst({ where: { id: userId, isActive: true }, select: { id: true } }),
    prisma.teamMember.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        ...(teamId
          ? {
              OR: [
                { team: { id: teamId, companyId, status: "ACTIVE" } },
                { role: "TEAM_OWNER", team: { companyId, status: "ACTIVE" } }
              ]
            }
          : { team: { companyId, status: "ACTIVE" } })
      },
      select: { id: true }
    }),
    teamId
      ? prisma.teamOrganization.findFirst({
          where: { id: teamId, companyId, status: "ACTIVE" },
          select: { id: true }
        })
      : Promise.resolve(null)
  ]);
  if (!user || !membership || (teamId && !team)) {
    throw new ForbiddenError("通知收件人不属于当前企业的有效团队。");
  }
}

export class PrismaNotificationRepository implements NotificationRepository {
  async create(input: CreateNotificationInput) {
    const normalized = normalizeCreateNotificationInput(input);
    await assertActiveRecipient(normalized.companyId, normalized.userId, normalized.teamId);
    const created = await prisma.notification.create({ data: normalized });
    return serializeNotification(created);
  }

  async list(input: NotificationListQuery) {
    const query = normalizeNotificationListQuery(input);
    const where: Prisma.NotificationWhereInput = {
      companyId: query.companyId,
      userId: { in: query.userIds },
      ...(query.teamIds ? { teamId: { in: query.teamIds } } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.readStatus ? { readStatus: query.readStatus } : {})
    };
    const [items, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      prisma.notification.count({ where })
    ]);
    return { items: items.map(serializeNotification), total };
  }

  countUnread(input: { companyId: string; teamIds?: string[]; userIds: string[] }) {
    const companyId = normalizeIdentifier(input.companyId, "企业 ID");
    const userIds = Array.from(new Set(input.userIds.map((id) => normalizeIdentifier(id, "用户 ID"))));
    const teamIds = input.teamIds === undefined
      ? undefined
      : Array.from(new Set(input.teamIds.map((id) => normalizeIdentifier(id, "团队 ID"))));
    if (userIds.length === 0) return Promise.resolve(0);
    return prisma.notification.count({
      where: {
        companyId,
        userId: { in: userIds },
        readStatus: "UNREAD",
        ...(teamIds ? { teamId: { in: teamIds } } : {})
      }
    });
  }

  async markAsRead(input: MarkNotificationsReadInput) {
    const normalized = normalizeMarkNotificationsReadInput(input);
    await assertActiveRecipient(normalized.companyId, normalized.userId);
    const result = await prisma.notification.updateMany({
      where: {
        companyId: normalized.companyId,
        userId: normalized.userId,
        readStatus: "UNREAD",
        ...(normalized.all ? {} : { id: { in: normalized.notificationIds } })
      },
      data: { readStatus: "READ" }
    });
    return result.count;
  }
}

function serializePreference(record: {
  id: string;
  userId: string;
  channel: NotificationPreferenceRecord["channel"];
  enabled: boolean;
  createdAt: Date;
}): NotificationPreferenceRecord {
  return { ...record, createdAt: record.createdAt.toISOString() };
}

export class PrismaNotificationPreferenceRepository implements NotificationPreferenceRepository {
  async list(userId: string) {
    const records = await prisma.notificationPreference.findMany({
      where: { userId: normalizeIdentifier(userId, "用户 ID") },
      orderBy: { createdAt: "asc" }
    });
    return records.map(serializePreference);
  }

  async upsertMany(inputs: UpdateNotificationPreferenceInput[]) {
    const normalized = normalizePreferenceUpdates(inputs);
    const records = await prisma.$transaction(normalized.map((input) => prisma.notificationPreference.upsert({
      where: { userId_channel: { userId: input.userId, channel: input.channel } },
      create: input,
      update: { enabled: input.enabled }
    })));
    return records.map(serializePreference);
  }
}

function encryptedValue(config: Prisma.JsonValue): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const value = (config as Record<string, unknown>).encrypted;
  return isEncryptedIntegrationConfig(value) ? value : null;
}

function serializeIntegration(record: {
  id: string;
  companyId: string;
  provider: IntegrationConfigSummary["provider"];
  enabled: boolean;
  config: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}): IntegrationConfigSummary {
  return {
    id: record.id,
    companyId: record.companyId,
    provider: record.provider,
    enabled: record.enabled,
    configured: encryptedValue(record.config) !== null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

export class PrismaIntegrationConfigRepository implements IntegrationConfigRepository {
  async listByCompany(companyId: string) {
    const records = await prisma.integrationConfig.findMany({
      where: { companyId: normalizeIdentifier(companyId, "企业 ID") },
      orderBy: { provider: "asc" }
    });
    return records.map(serializeIntegration);
  }

  async findStored(companyId: string, providerValue: IntegrationConfigSummary["provider"]): Promise<StoredIntegrationConfig | null> {
    const provider = normalizeIntegrationProvider(providerValue);
    const record = await prisma.integrationConfig.findUnique({
      where: {
        companyId_provider: {
          companyId: normalizeIdentifier(companyId, "企业 ID"),
          provider
        }
      }
    });
    if (!record) return null;
    const encryptedConfig = encryptedValue(record.config);
    if (!encryptedConfig) return null;
    return {
      id: record.id,
      companyId: record.companyId,
      provider: record.provider,
      enabled: record.enabled,
      encryptedConfig,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }

  async save(input: SaveIntegrationConfigInput) {
    const companyId = normalizeIdentifier(input.companyId, "企业 ID");
    const provider = normalizeIntegrationProvider(input.provider);
    if (input.encryptedConfig !== undefined && !isEncryptedIntegrationConfig(input.encryptedConfig)) {
      throw new ValidationError("连接配置必须先在服务端完成加密。");
    }
    const existing = await prisma.integrationConfig.findUnique({
      where: { companyId_provider: { companyId, provider } }
    });
    const effectiveConfig = input.encryptedConfig ?? (existing ? encryptedValue(existing.config) : null);
    if (!effectiveConfig) {
      throw new ValidationError("首次配置企业连接时必须提供完整凭据。");
    }
    const config: Prisma.InputJsonObject = { version: 1, encrypted: effectiveConfig };
    const saved = await prisma.integrationConfig.upsert({
      where: { companyId_provider: { companyId, provider } },
      create: { companyId, provider, enabled: input.enabled, config },
      update: {
        enabled: input.enabled,
        ...(input.encryptedConfig === undefined ? {} : { config })
      }
    });
    return serializeIntegration(saved);
  }
}

export const notificationRepositories = {
  notifications: new PrismaNotificationRepository(),
  preferences: new PrismaNotificationPreferenceRepository(),
  integrations: new PrismaIntegrationConfigRepository()
};
