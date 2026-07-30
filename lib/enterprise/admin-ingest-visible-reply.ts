const DEEPSEEK_ADMIN_INGEST_PROVIDERS = new Set([
  "deepseek",
  "deepseek-pro"
]);

function readProvider(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function unwrapJsonCodeFence(value: string) {
  const match = value.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? value.trim();
}

function readReplyMarkdownFromParsedValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "";
  }

  const replyMarkdown = (value as Record<string, unknown>).replyMarkdown;
  return typeof replyMarkdown === "string" ? replyMarkdown.trim() : "";
}

function extractClosedJsonStringField(value: string, fieldName: string) {
  const fieldPattern = new RegExp(`"${fieldName}"\\s*:\\s*"`, "i");
  const match = fieldPattern.exec(value);

  if (!match) {
    return "";
  }

  const valueStart = match.index + match[0].length;
  let escaped = false;

  for (let index = valueStart; index < value.length; index += 1) {
    const character = value[index];

    if (character === `"` && !escaped) {
      const encodedString = `"${value.slice(valueStart, index)}"`;

      try {
        const decoded = JSON.parse(encodedString);
        return typeof decoded === "string" ? decoded.trim() : "";
      } catch {
        return "";
      }
    }

    if (character === "\\") {
      escaped = !escaped;
    } else {
      escaped = false;
    }
  }

  return "";
}

/**
 * DeepSeek 精准话术偶尔会返回外层不完整的结构化 JSON，但其中
 * replyMarkdown 已完整闭合。这里只修正管理员投喂端的可见正文，
 * 不修改模型请求、模型原始响应或其他 provider 的输出。
 */
export function normalizeAdminIngestVisibleReply(
  content: string,
  provider?: string | null
) {
  if (!DEEPSEEK_ADMIN_INGEST_PROVIDERS.has(readProvider(provider))) {
    return content;
  }

  const candidate = unwrapJsonCodeFence(content);

  try {
    const parsed = JSON.parse(candidate) as unknown;
    const replyMarkdown = readReplyMarkdownFromParsedValue(parsed);

    if (replyMarkdown) {
      return replyMarkdown;
    }
  } catch {
    // A closed replyMarkdown field can still be recovered from a malformed tail.
  }

  return extractClosedJsonStringField(candidate, "replyMarkdown") || content;
}

export function hasRenderedAdminIngestReply(input: {
  messages: ReadonlyArray<{
    id: string;
    role: string;
    content: string;
  }>;
  requestId?: string | null;
}) {
  const requestId = input.requestId?.trim();

  if (!requestId) {
    return false;
  }

  return input.messages.some((message) => (
    message.id === `assistant-result-${requestId}`
    && message.role === "assistant"
    && message.content.trim().length > 0
  ));
}
