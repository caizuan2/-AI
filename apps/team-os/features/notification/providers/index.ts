import "server-only";

import type {
  IntegrationProvider,
  NotificationProvider
} from "@/apps/team-os/features/notification/types";
import { wechatWorkProvider } from "@/apps/team-os/providers/wechat-work";
import { dingtalkProvider } from "@/apps/team-os/providers/dingtalk";
import { feishuProvider } from "@/apps/team-os/providers/feishu";

export type NotificationProviderRegistry = Readonly<Record<IntegrationProvider, NotificationProvider>>;

export const notificationProviderRegistry: NotificationProviderRegistry = Object.freeze({
  WECHAT_WORK: wechatWorkProvider,
  DINGTALK: dingtalkProvider,
  FEISHU: feishuProvider
});
