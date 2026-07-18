import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { chatWithFallback } from "@/lib/ai/providers";
import { requireLicensedUser } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { hasUsableChatProvider } from "@/lib/server-config";
import {
  buildChatModeDecisionFromCandidate,
  CHAT_MODE_CONFIGS,
  CHAT_MODE_CLASSIFIER_VERSION,
  detectChatMode,
  toChatModeCandidate,
  type ChatModeCandidate,
  type ChatModeKey
} from "@/app/(user)/chat-ui/lib/intent-mode-router";

export const dynamic = "force-dynamic";

const AI_CLASSIFIER_VERSION = "ai-knowledge-os-v12.5-ai";
const CLASSIFY_TIMEOUT_MS = 3000;
const VALID_MODE_KEYS = new Set<ChatModeKey>([
  "business_problem",
  "reply_script",
  "screenshot_analysis",
  "conversion_path",
  "expert_review",
  "deep_thinking",
  "brain_search"
]);

const CLASSIFIER_PROMPT = [
  "你是小董AI用户端的意图分类器。请根据用户输入，从以下 7 个模式中选择最合适的一个，并给出 0-1 置信度和最多 2 个备选模式。",
  "",
  "模式：",
  "business_problem = 业务问题",
  "reply_script = 回复话术",
  "screenshot_analysis = 客户截图分析",
  "conversion_path = 成交路径",
  "expert_review = 专家研判",
  "deep_thinking = 深度思考",
  "brain_search = 大脑搜索",
  "",
  "判断原则：",
  "- 明确问“怎么回复/客户说/话术/发给客户”，优先 reply_script。",
  "- 有图片、截图、聊天截图、识别图片，优先 screenshot_analysis。",
  "- 问知识库、资料、标准答案、怎么使用，优先 brain_search。",
  "- 问成交、推进、下单、转化、跟进，优先 conversion_path。",
  "- 问风险、判断、客户意图、策略、专业角度，优先 expert_review。",
  "- 问为什么、底层逻辑、深度分析、复杂拆解，优先 deep_thinking。",
  "- 无明显特征，选择 business_problem。",
  "",
  "只返回 JSON，不要解释，不要输出 Markdown。JSON Schema：",
  "{\"mode\":\"reply_script\",\"confidence\":0.92,\"reason\":\"一句话原因\",\"alternatives\":[{\"mode\":\"conversion_path\",\"confidence\":0.64,\"reason\":\"一句话原因\"}]}"
].join("\n");

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown) {
  return value === true;
}

function normalizeModeKey(value: unknown): ChatModeKey | null {
  const text = readString(value);

  return VALID_MODE_KEYS.has(text as ChatModeKey) ? text as ChatModeKey : null;
}

function clampConfidence(value: unknown, fallback = 0.5) {
  const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, numberValue));
}

function toResponsePayload(decision: ReturnType<typeof detectChatMode>, sourceOverride?: "ai" | "rules") {
  return {
    mode: decision.mode.key,
    modeLabel: decision.mode.label,
    confidence: decision.confidence,
    reason: decision.reason,
    alternatives: decision.alternatives,
    source: sourceOverride ?? decision.source,
    classifierVersion: decision.classifierVersion
  };
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);

  return match?.[0] ?? "";
}

function normalizeAiClassifierResult(value: unknown) {
  if (!isPlainObject(value)) {
    return null;
  }

  const modeKey = normalizeModeKey(value.mode);

  if (!modeKey) {
    return null;
  }

  const alternatives = Array.isArray(value.alternatives)
    ? value.alternatives
      .map((item): ChatModeCandidate | null => {
        if (!isPlainObject(item)) {
          return null;
        }

        const key = normalizeModeKey(item.mode ?? item.key);

        return key
          ? toChatModeCandidate(key, clampConfidence(item.confidence, 0.45), readString(item.reason) || CHAT_MODE_CONFIGS[key].prompt)
          : null;
      })
      .filter((item): item is ChatModeCandidate => Boolean(item))
    : [];

  return buildChatModeDecisionFromCandidate({
    candidate: toChatModeCandidate(
      modeKey,
      clampConfidence(value.confidence, 0.72),
      readString(value.reason) || CHAT_MODE_CONFIGS[modeKey].prompt
    ),
    source: "ai",
    alternatives,
    classifierVersion: AI_CLASSIFIER_VERSION
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CHAT_MODE_CLASSIFY_TIMEOUT")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function classifyWithExistingProvider(input: {
  message: string;
  hasImage: boolean;
  hasAttachment: boolean;
}) {
  if (!hasUsableChatProvider("deepseek") && !hasUsableChatProvider("qwen") && !hasUsableChatProvider("openai")) {
    return null;
  }

  const content = JSON.stringify({
    message: input.message,
    hasImage: input.hasImage,
    hasAttachment: input.hasAttachment
  });
  const result = await withTimeout(chatWithFallback({
    system: CLASSIFIER_PROMPT,
    messages: [
      {
        role: "user",
        content
      }
    ],
    temperature: 0,
    maxTokens: 180,
    requestId: `chat-mode-classifier-${Date.now()}`
  }), CLASSIFY_TIMEOUT_MS);
  const jsonText = extractJsonObject(result.text);

  if (!jsonText) {
    return null;
  }

  return normalizeAiClassifierResult(JSON.parse(jsonText));
}

export async function POST(request: Request) {
  try {
    await requireLicensedUser();

    const body = await request.json().catch(() => null);

    if (!isPlainObject(body)) {
      throw new ValidationError("请求体必须是 JSON 对象。");
    }

    const message = readString(body.message);
    const hasImage = readBoolean(body.hasImage);
    const hasAttachment = readBoolean(body.hasAttachment);
    const manualMode = normalizeModeKey(body.manualMode);
    const fallbackDecision = detectChatMode({
      text: message,
      hasImage,
      hasAttachment,
      manualMode
    });

    if (manualMode || message.length < 4) {
      return apiSuccess(toResponsePayload(fallbackDecision));
    }

    try {
      const aiDecision = await classifyWithExistingProvider({
        message,
        hasImage,
        hasAttachment
      });

      if (aiDecision) {
        return apiSuccess(toResponsePayload(aiDecision, "ai"));
      }
    } catch {
      // The classifier is a UI assist layer. Provider failures must fall back to rules.
    }

    return apiSuccess({
      ...toResponsePayload(fallbackDecision, "rules"),
      classifierVersion: fallbackDecision.classifierVersion || CHAT_MODE_CLASSIFIER_VERSION
    });
  } catch (error) {
    return apiError(error);
  }
}
