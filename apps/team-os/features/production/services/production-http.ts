import { ValidationError } from "@/lib/errors";

const DEFAULT_MAX_BODY_BYTES = 64 * 1024;
const ABSOLUTE_MAX_BODY_BYTES = 1024 * 1024;

export type TeamOsJsonReadOptions = {
  maxBytes?: number;
};

function normalizedLimit(maxBytes: number | undefined) {
  const value = maxBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isInteger(value) || value < 1 || value > ABSOLUTE_MAX_BODY_BYTES) {
    throw new Error("Team OS JSON body limit must be between 1 byte and 1 MiB.");
  }
  return value;
}

function limitMessage(limit: number) {
  return limit % 1024 === 0
    ? `请求内容不能超过 ${limit / 1024} KiB。`
    : `请求内容不能超过 ${limit} 字节。`;
}

export async function readTeamOsJson(
  request: Request,
  options: TeamOsJsonReadOptions = {}
): Promise<unknown> {
  const limit = normalizedLimit(options.maxBytes);
  const declaredLength = request.headers.get("content-length");
  if (declaredLength && /^\d+$/.test(declaredLength) && Number(declaredLength) > limit) {
    throw new ValidationError(limitMessage(limit));
  }

  const reader = request.body?.getReader();
  if (!reader) {
    throw new ValidationError("请求体必须是合法 JSON。");
  }

  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        throw new ValidationError(limitMessage(limit));
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("无法读取请求内容。");
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ValidationError("请求体必须是合法 JSON。");
  }
}
