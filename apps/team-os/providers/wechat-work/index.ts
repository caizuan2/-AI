import "server-only";

import type {
  NotificationProvider,
  ProviderMessage,
  ProviderSendContext,
  ProviderSendResult
} from "@/apps/team-os/features/notification/types";

const REASON = "企业微信连接当前仅提供安全抽象，未执行任何网络外发。";

export interface WechatWorkAccessTokenResult {
  available: false;
  token: null;
  reason: string;
}

export class WechatWorkNotificationProvider implements NotificationProvider {
  readonly provider = "WECHAT_WORK" as const;

  async getAccessToken(): Promise<WechatWorkAccessTokenResult> {
    return { available: false, token: null, reason: REASON };
  }

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

export const wechatWorkProvider = new WechatWorkNotificationProvider();

export function getAccessToken() {
  return wechatWorkProvider.getAccessToken();
}

export function sendMessage(message: ProviderMessage, context: ProviderSendContext) {
  return wechatWorkProvider.sendMessage(message, context);
}
