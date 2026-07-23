import { readAdminIngestRequestError } from "@/lib/enterprise/admin-ingest-request-error";

export type AdminIngestFailurePresentation = {
  title: string;
  message: string;
  retryable: boolean;
  errorCode?: string;
  causeCode?: string;
};

function readRawErrorText(error: unknown) {
  return error instanceof Error
    ? `${error.name} ${error.message}`.toLowerCase()
    : typeof error === "string"
      ? error.toLowerCase()
      : "";
}

function inferRetryable(error: unknown, status?: number) {
  if (status === 401 || status === 403 || status === 422) {
    return false;
  }

  const normalized = readRawErrorText(error);

  return normalized.includes("failed to fetch")
    || normalized.includes("network")
    || normalized.includes("timeout")
    || normalized.includes("timed out")
    || normalized.includes("econnreset")
    || normalized.includes("502")
    || normalized.includes("503")
    || normalized.includes("504");
}

function buildRetainedStateSuffix(retryable: boolean, nextAction?: string) {
  const action = nextAction
    ?? (retryable
      ? "可以点击“同模型重试”。"
      : "请检查模型连接配置或调整输入后再试。");

  return `系统未切换其他模型。您的输入和附件已保留。${action}`;
}

export function buildAdminIngestFailurePresentation(
  error: unknown,
  fallbackModelLabel: string
): AdminIngestFailurePresentation {
  const details = readAdminIngestRequestError(error);
  const modelLabel = details?.selectedModelLabel?.trim() || fallbackModelLabel.trim() || "当前模型";
  const errorCode = details?.errorCode;
  const causeCode = details?.causeCode;
  // The outer strict-model error is intentionally generic; the cause code carries
  // the actionable provider failure and must take precedence when present.
  const normalizedCode = (causeCode || errorCode || "").toUpperCase();
  const retryable = details?.retryable ?? inferRetryable(error, details?.status);
  const rawText = readRawErrorText(error);
  const networkFailure = rawText.includes("failed to fetch")
    || rawText.includes("network")
    || rawText.includes("econnreset");
  const result = (title: string, reason: string, nextAction?: string): AdminIngestFailurePresentation => ({
    title,
    message: `${reason}${buildRetainedStateSuffix(retryable, nextAction)}`,
    retryable,
    errorCode,
    causeCode
  });

  if (normalizedCode.includes("TIMEOUT") || rawText.includes("timeout") || rawText.includes("timed out")) {
    return result(
      `${modelLabel} 响应超时`,
      "本轮等待模型响应超时，未生成可用正文。",
      retryable ? "可以点击“同模型重试”。" : undefined
    );
  }

  if (normalizedCode.includes("RATE_LIMIT") || normalizedCode.includes("TOO_MANY_REQUESTS")) {
    return result(
      `${modelLabel} 请求繁忙`,
      "当前模型请求量较大，本轮未生成结果。",
      retryable ? "请稍后点击“同模型重试”。" : undefined
    );
  }

  if (normalizedCode.includes("QUOTA") || normalizedCode.includes("INSUFFICIENT_BALANCE")) {
    return result(`${modelLabel} 额度暂不可用`, "当前模型额度或账户余额暂不可用，本轮未生成结果。", "请检查火山方舟额度后再试。");
  }

  if (normalizedCode.includes("API_KEY") || normalizedCode.includes("AUTH")) {
    return result(`${modelLabel} 连接配置不可用`, "当前模型授权或连接配置不可用，本轮未生成结果。", "请检查模型密钥与授权后再试。");
  }

  if (normalizedCode.includes("SAFETY") || normalizedCode.includes("CONTENT_FILTER")) {
    return result("本轮内容未通过模型检查", "当前输入未被模型接受，因此没有生成正文。", "请调整输入内容后重新发送。");
  }

  if (normalizedCode.includes("MODEL_UNAVAILABLE") || normalizedCode.includes("MODEL_NOT_FOUND")) {
    return result(`${modelLabel} 暂时不可用`, "当前选定模型暂时不可用，本轮未生成结果。", "请检查模型开通状态后再试。");
  }

  if (
    normalizedCode.includes("RESPONSE_PARSE")
    || normalizedCode.includes("STREAM")
    || normalizedCode.includes("EMPTY_RESPONSE")
  ) {
    return result(
      `${modelLabel} 返回中断`,
      "模型返回未完整结束或没有形成有效正文，本轮未生成结果。",
      retryable ? "可以点击“同模型重试”。" : undefined
    );
  }

  if (normalizedCode.includes("REQUEST_FAILED") || networkFailure) {
    return result(
      `${modelLabel} 连接中断`,
      "本轮模型请求未正常完成，没有生成正文。",
      retryable ? "请检查网络后点击“同模型重试”。" : undefined
    );
  }

  return result(`${modelLabel} 本轮未完成`, "本轮没有生成可用正文。");
}
