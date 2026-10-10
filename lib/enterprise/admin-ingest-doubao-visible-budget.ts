"use client";

export const ADMIN_INGEST_VISIBLE_BUDGET_MS = 60_000;
export const ADMIN_INGEST_DOUBAO_VISIBLE_BUDGET_MS = ADMIN_INGEST_VISIBLE_BUDGET_MS;
// OCR cannot be skipped: its hard deadline is the same post-persistence budget
// as the model reply, not a separate 10-second deadline that consumes the whole SLO.
export const ADMIN_INGEST_VISIBLE_PARSE_WAIT_MS = ADMIN_INGEST_VISIBLE_BUDGET_MS;
export const ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE =
  "ADMIN_INGEST_DOUBAO_VISIBLE_ANSWER_TIMEOUT";

export function shouldApplyAdminIngestVisibleBudget(provider?: string | null) {
  return provider === "doubao-pro"
    || provider === "deepseek-pro"
    || provider === "deepseek-flash";
}

export function shouldApplyAdminIngestDoubaoVisibleBudget(provider?: string | null) {
  return provider === "doubao-pro";
}

export function createAdminIngestDoubaoVisibleTimeoutError(modelLabel: string) {
  const visibleBudgetSeconds = Math.round(
    ADMIN_INGEST_VISIBLE_BUDGET_MS / 1_000
  );
  const error = new Error(
    `${ADMIN_INGEST_DOUBAO_VISIBLE_TIMEOUT_CODE}: ${modelLabel || "当前模型"} 已达到 ${visibleBudgetSeconds} 秒时限，本轮未形成完整正文。`
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
