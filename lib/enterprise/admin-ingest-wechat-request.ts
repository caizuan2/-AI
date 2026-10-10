type AdminIngestWechatAttachment = {
  recognitionMode?: string;
};

type AdminIngestWechatRetryInput = {
  attempt: number;
  modelProvider: string;
  errorCode?: string;
  causeCode?: string;
};

type AdminIngestHealthPreflightInput = {
  modelProvider: string;
  skipHealthPreflight?: boolean;
};

export function hasAdminIngestWechatConversationAttachment(
  attachments: AdminIngestWechatAttachment[]
) {
  return attachments.some((attachment) => attachment.recognitionMode === "wechat_conversation");
}

export function shouldRetryAdminIngestWechatModelTimeout(
  input: AdminIngestWechatRetryInput
) {
  void input;
  return false;
}

export function shouldRunAdminIngestHealthPreflight(
  input: AdminIngestHealthPreflightInput
) {
  if (
    input.modelProvider === "doubao-pro"
    || input.modelProvider === "deepseek-pro"
    || input.modelProvider === "deepseek-flash"
  ) {
    return false;
  }

  return input.skipHealthPreflight !== true;
}
