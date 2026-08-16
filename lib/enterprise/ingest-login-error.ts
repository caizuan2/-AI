function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readMessage(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (!isRecord(value)) {
    return "";
  }

  const rootError = isRecord(value.error) ? value.error : null;
  const data = isRecord(value.data) ? value.data : null;
  const dataError = data && isRecord(data.error) ? data.error : null;
  const candidates = [
    rootError?.message,
    value.message,
    dataError?.message,
    data?.message
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }

  return "";
}

export function getIngestLoginErrorMessage(error: unknown) {
  const details = isRecord(error) && isRecord(error.details) ? error.details : null;
  const bodyMessage = readMessage(details?.body);
  const errorMessage = error instanceof Error ? error.message.trim() : "";
  const message = bodyMessage || errorMessage;
  const normalized = message.toLowerCase();

  if (message.includes("账号错误") || message.includes("账号不存在")) {
    return "账号错误。";
  }

  if (message.includes("密码错误") || message.includes("密码不正确")) {
    return "密码错误。";
  }

  if (message.includes("账号已禁用")) {
    return "账号已禁用。";
  }

  if (message.includes("合法手机号") || message.includes("手机号格式")) {
    return "账号格式错误。";
  }

  if (message.includes("请输入密码")) {
    return "请输入密码。";
  }

  if (message.includes("请输入手机号") || message.includes("请输入账号")) {
    return "请输入账号。";
  }

  if (normalized.includes("rate") || message.includes("请求过于频繁")) {
    return "登录尝试过于频繁，请稍后再试。";
  }

  if (normalized.includes("network") || normalized.includes("fetch")) {
    return "网络连接失败，请稍后重试。";
  }

  if (normalized.includes("unauthorized") || message.includes("手机号或密码错误")) {
    return "账号或密码错误。";
  }

  return "登录失败，请稍后重试。";
}
