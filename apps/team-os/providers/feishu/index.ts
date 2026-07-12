import "server-only";

import type {
  NotificationProvider,
  ProviderMessage,
  ProviderSendContext,
  ProviderSendResult
} from "@/apps/team-os/features/notification/types";

const REASON = "飞书连接当前仅提供安全抽象，未执行任何网络外发。";

export class FeishuNotificationProvider implements NotificationProvider {
  readonly provider = "FEISHU" as const;

  async sendMessage(
    _message: ProviderMessage,
    context: ProviderSendContext
  ): Promise<ProviderSendResult> {
    return {
      provider: this.provider,
      mode: context.mode,
      accepted: false,
      delivered: false,
      reason: REASON
    };
  }
}

export const feishuProvider = new FeishuNotificationProvider();

export function sendMessage(message: ProviderMessage, context: ProviderSendContext) {
  return feishuProvider.sendMessage(message, context);
}
