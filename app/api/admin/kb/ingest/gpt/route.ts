import { NextResponse } from "next/server";
import { apiError, apiSuccess } from "@/lib/api-response";
import { isPlainObject } from "@/lib/api/responses";
import { requireKbAdmin } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";
import { getRequestIdFromHeaders } from "@/lib/logger";
import {
  runOpenAIAdminIngest,
  type OpenAIAdminIngestAttachment
} from "@/lib/enterprise/openai-ingest-client";
import {
  normalizeAdminIngestPlatform,
  type AdminIngestPlatform
} from "@/lib/enterprise/admin-ingest-platform";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readSyncTarget(value: unknown): Array<"web" | "exe" | "apk"> {
  if (!Array.isArray(value)) {
    return ["web", "exe", "apk"];
  }

  const targets = value.filter((item): item is "web" | "exe" | "apk" => item === "web" || item === "exe" || item === "apk");

  return targets.length > 0 ? targets : ["web", "exe", "apk"];
}

function readPlatform(value: unknown): AdminIngestPlatform {
  return normalizeAdminIngestPlatform(readString(value)) ?? "web";
}

function toGptFallbackErrorCode(error: unknown) {
  const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown; name?: unknown } : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name : "";

  if (code === "MISSING_AI_API_KEY" || message.includes("api key") || message.includes("openai_api_key") || message.includes("未配置")) {
    return "OPENAI_API_KEY_MISSING" as const;
  }

  if (name === "AbortError" || message.includes("timeout") || message.includes("超时")) {
    return "OPENAI_TIMEOUT" as const;
  }

  if (message.includes("model") || message.includes("模型不可用")) {
    return "OPENAI_MODEL_UNAVAILABLE" as const;
  }

  return "OPENAI_REQUEST_FAILED" as const;
}

function toGptFallbackMessage(errorCode: ReturnType<typeof toGptFallbackErrorCode>, error: unknown) {
  const record = error && typeof error === "object" ? error as { message?: unknown } : {};
  const message = typeof record.message === "string" ? record.message.trim() : "";

  if (errorCode === "OPENAI_API_KEY_MISSING") {
    return "缺少 OPENAI_API_KEY，已使用本地预览结果";
  }

  if (errorCode === "OPENAI_TIMEOUT") {
    return "GPT 请求超时，已使用本地预览结果";
  }

  if (errorCode === "OPENAI_MODEL_UNAVAILABLE") {
    return "当前 GPT 模型不可用，已使用本地预览结果";
  }

  return message || "GPT 接口暂不可用，已使用本地预览结果";
}

function buildLocalPreview(input: ReturnType<typeof readRequest>, errorCode: ReturnType<typeof toGptFallbackErrorCode>) {
  const category = input.category || input.agentName || "默认知识库";
  const normalized = input.input.replace(/\s+/g, " ").trim();
  const title = normalized.length > 18 ? `${normalized.slice(0, 18)}...` : normalized || "本地预览结构化结果";
  const summary = normalized.length > 140 ? `${normalized.slice(0, 140)}...` : normalized;
  const question = `关于“${title}”，应该如何沉淀为知识？`;
  const answer = summary
    ? `建议先按当前 ${input.agentName || "Agent"} 的知识口径整理，再补充来源、适用场景和标准回复。原始投喂：${summary}`
    : "建议补充原始投喂内容后再进行结构化。";

  return {
    jobId: `preview-${Date.now()}`,
    title: title || "本地预览结构化结果",
    category,
    tags: [category.replace("知识库", ""), "本地预览", errorCode].filter(Boolean),
    summary: summary || "当前为本地预览结果，配置 OPENAI_API_KEY 后可重新生成真实 GPT 结果。",
    qa_pairs: [{ q: question, a: answer }],
    confidence: errorCode === "OPENAI_API_KEY_MISSING" ? 72 : 68,
    should_save: true,
    providerUsed: "local-fallback",
    model: input.selectedModelLabel || input.modelDisplayName || input.preferredModel,
    fallbackUsed: true,
    saveStatus: "pending" as const
  };
}

function buildLocalPreviewReply(localPreview: ReturnType<typeof buildLocalPreview>, message: string) {
  return [
    "## 本地预览结构化结果",
    "",
    message,
    "",
    `- 标题：${localPreview.title}`,
    `- 分类：${localPreview.category}`,
    `- 标签：${localPreview.tags.join("、")}`,
    `- 训练价值评分：${localPreview.confidence}/100`,
    "",
    "### 标准问答",
    `Q：${localPreview.qa_pairs[0]?.q ?? localPreview.title}`,
    `A：${localPreview.qa_pairs[0]?.a ?? localPreview.summary}`,
    "",
    "配置 OPENAI_API_KEY 后，可点击“重新连接 GPT”再“重新生成”。"
  ].join("\n");
}

function readAttachments(value: unknown): OpenAIAdminIngestAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const attachments: OpenAIAdminIngestAttachment[] = [];

  for (const item of value) {
    if (!isPlainObject(item)) {
      continue;
    }

    const fileName = readString(item.fileName);

    if (!fileName) {
      continue;
    }

    attachments.push({
      fileName,
      fileType: readString(item.fileType) || undefined,
      fileSize: typeof item.fileSize === "number" && Number.isFinite(item.fileSize) ? item.fileSize : undefined,
      status: readString(item.status) || undefined
    });

    if (attachments.length >= 12) {
      break;
    }
  }

  return attachments;
}

function readRequest(body: unknown) {
  if (!isPlainObject(body)) {
    throw new ValidationError("请求体必须是 JSON 对象。");
  }

  const input = readString(body.input) || readString(body.content);

  if (!input) {
    throw new ValidationError("投喂内容不能为空。");
  }

  return {
    input,
    attachments: readAttachments(body.attachments),
    agentId: readString(body.agentId) || null,
    agentName: readString(body.agentName) || null,
    category: readString(body.category) || null,
    tenantId: readString(body.tenantId) || null,
    userId: readString(body.userId) || null,
    source: "admin_ingest" as const,
    platform: readPlatform(body.platform),
    syncTarget: readSyncTarget(body.syncTarget),
    modelProvider: readString(body.modelProvider) || "openai",
    modelMode: readString(body.modelMode) || "highest",
    preferredModel: readString(body.preferredModel) || "gpt-5.5",
    gptTier: readString(body.gptTier) || null,
    gptTierLabel: readString(body.gptTierLabel) || null,
    gptVersion: readString(body.gptVersion) || null,
    selectedModelLabel: readString(body.selectedModelLabel) || null,
    modelDisplayName: readString(body.modelDisplayName) || null
  };
}

export async function POST(request: Request) {
  const requestId = getRequestIdFromHeaders(request.headers);
  let actor: Awaited<ReturnType<typeof requireKbAdmin>>;

  try {
    actor = await requireKbAdmin(request, {
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "admin_kb_ingest_gpt"
    });
  } catch (error) {
    return apiError(error);
  }

  let input: ReturnType<typeof readRequest>;

  try {
    input = readRequest(await request.json());
  } catch (error) {
    return apiError(error instanceof Error ? error : new ValidationError("请求体必须是合法 JSON。"));
  }

  if (input.modelProvider !== "openai") {
    return apiError(new ValidationError("管理员 GPT 投喂接口仅支持 modelProvider=openai。"));
  }

  if (input.modelMode !== "highest") {
    return apiError(new ValidationError("管理员 GPT 投喂接口仅支持 modelMode=highest。"));
  }

  try {
    const result = await runOpenAIAdminIngest({
      input: input.input,
      attachments: input.attachments,
      agentId: input.agentId,
      agentName: input.agentName,
      category: input.category,
      tenantId: input.tenantId,
      userId: input.userId ?? actor.id,
      source: input.source,
      platform: input.platform,
      syncTarget: input.syncTarget,
      preferredModel: input.preferredModel,
      gptTier: input.gptTier,
      gptTierLabel: input.gptTierLabel,
      gptVersion: input.gptVersion,
      selectedModelLabel: input.selectedModelLabel,
      modelDisplayName: input.modelDisplayName,
      requestId
    });

    return apiSuccess(result);
  } catch (error) {
    const errorCode = toGptFallbackErrorCode(error);
    const message = toGptFallbackMessage(errorCode, error);
    const localPreview = buildLocalPreview(input, errorCode);

    return NextResponse.json({
      ok: false,
      fallback: true,
      errorCode,
      message,
      selectedModelLabel: input.selectedModelLabel || input.modelDisplayName || "GPT-5.5 超高",
      model: input.preferredModel,
      localPreview,
      replyMarkdown: buildLocalPreviewReply(localPreview, message)
    }, { status: 200 });
  }
}
