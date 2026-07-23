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

const WECHAT_RETRYABLE_MODEL_TIMEOUT_CODES = new Set([
  "DEEPSEEK_TIMEOUT",
  "DOUBAO_TIMEOUT"
]);

function normalizeErrorCode(value?: string) {
  return value?.trim().toUpperCase() ?? "";
}

export function hasAdminIngestWechatConversationAttachment(
  attachments: AdminIngestWechatAttachment[]
) {
  return attachments.some((attachment) => attachment.recognitionMode === "wechat_conversation");
}

export function shouldRetryAdminIngestWechatModelTimeout(
  input: AdminIngestWechatRetryInput
) {
  if (
    input.attempt !== 0
    || (input.modelProvider !== "deepseek-pro" && input.modelProvider !== "doubao-pro")
  ) {
    return false;
  }

  return [
    normalizeErrorCode(input.errorCode),
    normalizeErrorCode(input.causeCode)
  ].some((code) => WECHAT_RETRYABLE_MODEL_TIMEOUT_CODES.has(code));
}

export function shouldRunAdminIngestHealthPreflight(
  input: AdminIngestHealthPreflightInput
) {
  return input.modelProvider !== "doubao-pro" && input.skipHealthPreflight !== true;
}
