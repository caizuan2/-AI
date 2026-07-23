export type IngestModelHealthLike = {
  ok: boolean;
  errorCode?: string;
};

const PERMANENT_DOUBAO_HEALTH_ERRORS = new Set([
  "DOUBAO_API_KEY_MISSING",
  "DOUBAO_API_KEY_INVALID",
  "DOUBAO_BASE_URL_INVALID",
  "DOUBAO_MODEL_UNAVAILABLE",
  "DOUBAO_INFERENCE_LIMIT_PAUSED"
]);

export function shouldDisableDoubaoForHealth(status: IngestModelHealthLike) {
  return !status.ok && Boolean(status.errorCode && PERMANENT_DOUBAO_HEALTH_ERRORS.has(status.errorCode));
}
