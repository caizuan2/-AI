export type AdminIngestWechatOutputMode = "reply_script" | "full_answer";

export const DEFAULT_ADMIN_INGEST_WECHAT_OUTPUT_MODE: AdminIngestWechatOutputMode = "reply_script";

export function normalizeAdminIngestWechatOutputMode(
  value: unknown
): AdminIngestWechatOutputMode {
  return value === "full_answer"
    ? "full_answer"
    : DEFAULT_ADMIN_INGEST_WECHAT_OUTPUT_MODE;
}
