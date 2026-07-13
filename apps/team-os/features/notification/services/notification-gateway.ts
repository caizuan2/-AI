import "server-only";

import { logger } from "@/lib/logger";
import { toTeamOsSafeErrorMetadata } from "@/apps/team-os/features/production/services/production-logger";
import type {
  CreateNotificationInput,
  IntegrationProvider,
  NotificationChannel,
  NotificationProvider,
  NotificationRepositories,
  NotificationRepository,
  NotificationPreferenceRepository,
  IntegrationConfigRepository,
  SendNotificationInput,
  SendNotificationResult
} from "@/apps/team-os/features/notification/types";
import {
  notificationProviderRegistry,
  type NotificationProviderRegistry
} from "@/apps/team-os/features/notification/providers";
import { notificationRepositories } from "@/apps/team-os/features/notification/services/notification-repositories";
import { resolveNotificationAccess } from "@/apps/team-os/features/notification/services/notification-access";
import {
  normalizeCreateNotificationInput,
  normalizeNotificationChannel
} from "@/apps/team-os/features/notification/utils/notification-input";

const EXTERNAL_PROVIDER_BY_CHANNEL: Partial<Record<NotificationChannel, IntegrationProvider>> = {
  WECHAT: "WECHAT_WORK",
  DINGTALK: "DINGTALK",
  FEISHU: "FEISHU"
};

function preferenceDefaults() {
  return new Map<NotificationChannel, boolean>([
    ["IN_APP", true],
    ["EMAIL", false],
    ["WECHAT", false],
    ["DINGTALK", false],
    ["FEISHU", false]
  ]);
}

export class NotificationGateway {
  private readonly notificationRepository: NotificationRepository;
  private readonly preferenceRepository: NotificationPreferenceRepository;
  private readonly integrationRepository: IntegrationConfigRepository;
  private readonly providers: NotificationProviderRegistry;

  constructor(
    repositories: NotificationRepositories = notificationRepositories,
    providers: NotificationProviderRegistry = notificationProviderRegistry
  ) {
    this.notificationRepository = repositories.notifications;
    this.preferenceRepository = repositories.preferences;
    this.integrationRepository = repositories.integrations;
    this.providers = providers;
  }

  createNotification(input: CreateNotificationInput) {
    return this.notificationRepository.create(normalizeCreateNotificationInput(input));
  }

  async sendNotification(input: SendNotificationInput): Promise<SendNotificationResult> {
    const normalized = normalizeCreateNotificationInput(input);
    await resolveNotificationAccess({
      userId: normalized.userId,
      requestedCompanyId: normalized.companyId,
      requestedTeamId: normalized.teamId,
      scope: "MINE"
    });
    const preferences = preferenceDefaults();
    for (const preference of await this.preferenceRepository.list(normalized.userId)) {
      preferences.set(preference.channel, preference.enabled);
    }
    const requestedChannels: NotificationChannel[] = Array.from(
      new Set<NotificationChannel>((input.channels ?? ["IN_APP"]).map(normalizeNotificationChannel))
    );
    const attempts: SendNotificationResult["attempts"] = [];

    for (const channel of requestedChannels) {
      if (!preferences.get(channel)) {
        attempts.push({ channel, status: "SKIPPED", reason: "用户已关闭该通知渠道。" });
        continue;
      }
      if (channel === "IN_APP") {
        try {
          const created = await this.createNotification(normalized);
          attempts.push({ channel, status: "CREATED", notificationId: created.id });
        } catch (error) {
          logger.warn("team_os_notification_in_app_failed", {
            companyId: normalized.companyId,
            userId: normalized.userId,
            type: normalized.type,
            error: toTeamOsSafeErrorMetadata(error)
          });
          attempts.push({ channel, status: "FAILED", reason: "站内通知创建失败。" });
        }
        continue;
      }
      if (channel === "EMAIL") {
        attempts.push({ channel, status: "SKIPPED", reason: "邮件 Provider 尚未启用。" });
        continue;
      }

      const providerName = EXTERNAL_PROVIDER_BY_CHANNEL[channel];
      const provider: NotificationProvider | undefined = providerName ? this.providers[providerName] : undefined;
      if (!providerName || !provider) {
        attempts.push({ channel, status: "SKIPPED", reason: "通知 Provider 不可用。" });
        continue;
      }
      try {
        const integration = await this.integrationRepository.findStored(normalized.companyId, providerName);
        if (!integration?.enabled) {
          attempts.push({ channel, status: "SKIPPED", reason: "企业尚未启用该连接。" });
          continue;
        }
        const outcome = await provider.sendMessage(normalized, { mode: input.mode ?? "PRODUCTION" });
        attempts.push({
          channel,
          status: outcome.accepted ? "CREATED" : "SKIPPED",
          reason: outcome.reason
        });
      } catch (error) {
        logger.warn("team_os_notification_provider_failed", {
          companyId: normalized.companyId,
          userId: normalized.userId,
          provider: providerName,
          error: toTeamOsSafeErrorMetadata(error)
        });
        attempts.push({ channel, status: "FAILED", reason: "第三方通知发送失败。" });
      }
    }

    return { attempts };
  }

  async testProvider(input: {
    companyId: string;
    userId: string;
    provider: IntegrationProvider;
  }) {
    await resolveNotificationAccess({
      userId: input.userId,
      requestedCompanyId: input.companyId,
      scope: "MINE"
    });
    const integration = await this.integrationRepository.findStored(input.companyId, input.provider);
    if (!integration?.enabled) {
      return {
        provider: input.provider,
        mode: "TEST" as const,
        delivered: false as const,
        reason: "企业尚未完成并启用该连接。"
      };
    }
    const result = await this.providers[input.provider].sendMessage({
      companyId: input.companyId,
      userId: input.userId,
      title: "AI Team OS 测试消息",
      content: "Provider 安全抽象测试，不执行真实网络外发。",
      source: "SYSTEM"
    }, { mode: "TEST" });
    return {
      provider: result.provider,
      mode: "TEST" as const,
      delivered: false as const,
      reason: result.reason
    };
  }
}

export const notificationGateway = new NotificationGateway();
