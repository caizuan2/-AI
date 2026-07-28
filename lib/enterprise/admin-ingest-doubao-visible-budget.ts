"use client";

export const ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS = 120_000;
export const ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE =
  "ADMIN_INGEST_DOUBAO_VISIBLE_ANSWER_TIMEOUT";

export function shouldApplyAdminIngestDoubaoVisibleBudget(provider?: string | null) {
  return provider === "doubao-pro";
}

export function createAdminIngestDoubaoVisibleTimeoutError(modelLabel: string) {
  const error = new Error(
    `${ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE}: ${modelLabel || "当前豆包模型"} 深度思考已达到 120 秒，本轮未形成完整正文。`
  );

  error.name = ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE;
  return error;
}

export function isAdminIngestDoubaoVisibleTimeoutError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE
    || error.message.includes(ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE);
}
