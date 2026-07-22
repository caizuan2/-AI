export type UserEntryErrorFeedback = {
  message: string;
  nameError?: string;
  revealLicenseEntry?: boolean;
};

type UserEntryErrorInput = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
  networkError?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getPublicBackendMessage(message: string) {
  const firstLine = message
    .replace(/^请求处理失败[：:]\s*/, "")
    .split(/\r?\n/)[0]
    ?.trim() || "";

  return /[\u3400-\u9fff]/.test(firstLine) ? firstLine : "";
}

export function readUserEntryErrorMessage(body: unknown) {
  if (!isRecord(body)) {
    return "";
  }

  const nestedError = isRecord(body.error) ? body.error : null;
  const message = nestedError?.message ?? body.message;

  return typeof message === "string" ? message.trim() : "";
}

export function getUserEntryErrorFeedback(input: UserEntryErrorInput): UserEntryErrorFeedback {
  const code = typeof input.code === "string" ? input.code.trim() : "";
  const backendMessage = typeof input.message === "string" ? input.message.trim() : "";
  const publicBackendMessage = getPublicBackendMessage(backendMessage);

  if (input.networkError || (typeof input.status === "number" && input.status >= 500)) {
    return {
      message: "服务暂时不可用，请稍后重试。"
    };
  }

  if (code === "VALIDATION_ERROR" && backendMessage.includes("网名")) {
    const message = "这是新手机号，首次开户请填写网名。";

    return {
      message,
      nameError: message,
      revealLicenseEntry: true
    };
  }

  if (["LICENSE_USED", "LICENSE_ALREADY_USED", "LICENSE_ACTIVATION_LIMIT_REACHED"].includes(code)) {
    return {
      message: "这张卡密已经绑定其他账号，请更换新的未使用卡密。",
      revealLicenseEntry: true
    };
  }

  if (code === "LICENSE_DISABLED") {
    return {
      message: "当前卡密已被禁用，请联系管理员获取新卡密。",
      revealLicenseEntry: true
    };
  }

  if (code === "LICENSE_EXPIRED") {
    return {
      message: "当前卡密已过期，请联系管理员续期或更换卡密。",
      revealLicenseEntry: true
    };
  }

  if (["INVALID_LICENSE_KEY", "LICENSE_NOT_FOUND"].includes(code)) {
    return {
      message: "卡密不存在或格式不正确，请检查后重新输入。",
      revealLicenseEntry: true
    };
  }

  if (code === "LICENSE_APP_TYPE_MISMATCH") {
    return {
      message: "该卡密不适用于用户端，请使用 XT-USER 用户端卡密。",
      revealLicenseEntry: true
    };
  }

  if (code === "LICENSE_REQUIRED") {
    return {
      message: "请输入新的有效用户端卡密后重试。",
      revealLicenseEntry: true
    };
  }

  if (code === "UNAUTHORIZED") {
    return {
      message: "手机号或密码错误，请检查后重新输入。"
    };
  }

  return {
    message: publicBackendMessage || "请求处理失败，请检查输入后重试。"
  };
}
