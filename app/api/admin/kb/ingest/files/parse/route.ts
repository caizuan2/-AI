import { apiError } from "@/lib/api-response";
import { IngestFullAccessRequiredError, ValidationError } from "@/lib/errors";
import { hasDatabaseUrl } from "@/lib/server-config";
import {
  ADMIN_INGEST_DEFAULT_PAGE_BATCH_SIZE,
  ADMIN_INGEST_MAX_PAGE_BATCH_SIZE,
  ADMIN_INGEST_MAX_PAGE_START,
  ADMIN_INGEST_MIN_PAGE_BATCH_SIZE,
  parseAdminIngestFile
} from "@/lib/enterprise/ingest-file-parser";
import { requireAdminIngestChatAccess } from "@/lib/enterprise/admin-ingest-auth";
import { isAdminIngestImageAttachment } from "@/lib/enterprise/admin-ingest-attachment-access";
import { warmAdminIngestLocalOcrWorker } from "@/lib/enterprise/ingest-local-ocr";
import { createAdminIngestLatencyTrace } from "@/lib/enterprise/admin-ingest-latency-trace";
import type { IngestAccessTier } from "@/lib/enterprise/ingest-access-policy";
import {
  getIngestModelOptionByProvider,
  type IngestModelProvider
} from "@/lib/enterprise/ingest-model-options";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_PARSE_BYTES = 50 * 1024 * 1024;

function readMaxParseBytes() {
  const configured = Number(process.env.ADMIN_INGEST_PARSE_MAX_BYTES);

  return Number.isFinite(configured) && configured > 0
    ? Math.min(100 * 1024 * 1024, Math.max(1024 * 1024, Math.floor(configured)))
    : DEFAULT_MAX_PARSE_BYTES;
}

function jsonUtf8(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function isLocalDevWithoutDatabase(request: Request) {
  if (process.env.NODE_ENV === "production" || hasDatabaseUrl()) {
    return false;
  }

  const hostname = new URL(request.url).hostname;

  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInteger(input: {
  value: FormDataEntryValue | null;
  fallback: number;
  min: number;
  max: number;
  label: string;
}) {
  const raw = readString(input.value);

  if (!raw) {
    return input.fallback;
  }

  if (!/^\d+$/.test(raw)) {
    throw new ValidationError(`${input.label}必须是整数。`);
  }

  const value = Number(raw);

  if (!Number.isSafeInteger(value) || value < input.min || value > input.max) {
    throw new ValidationError(`${input.label}必须在 ${input.min}-${input.max} 之间。`);
  }

  return value;
}

const STRICT_WEB_INGEST_PROVIDERS = new Set<IngestModelProvider>([
  "deepseek-pro",
  "deepseek-flash",
  "doubao-pro"
]);

interface AdminIngestParseModelAffinity {
  modelProvider: "deepseek-pro" | "deepseek-flash" | "doubao-pro";
  preferredModel: string;
  selectedModelLabel: string;
  strictModelAffinity: true;
}

function readAdminIngestParseModelAffinity(formData: FormData): AdminIngestParseModelAffinity | null {
  const strictValue = readString(formData.get("strictModelAffinity")).toLowerCase();

  if (!strictValue) {
    return null;
  }

  if (strictValue !== "true" && strictValue !== "false") {
    throw new ValidationError("附件解析模型身份标记无效。");
  }

  if (strictValue === "false") {
    return null;
  }

  const modelProvider = readString(formData.get("modelProvider"));
  const preferredModel = readString(formData.get("preferredModel"));
  const selectedModelLabel = readString(formData.get("selectedModelLabel"));

  if (!STRICT_WEB_INGEST_PROVIDERS.has(modelProvider as IngestModelProvider)) {
    throw new ValidationError("Web 投喂端附件解析仅允许使用 DeepSeek Pro、DeepSeek Flash 或 Doubao Pro 严格模型身份。");
  }

  const selectedOption = getIngestModelOptionByProvider(modelProvider);

  if (preferredModel !== selectedOption.defaultModel || selectedModelLabel !== selectedOption.label) {
    throw new ValidationError("附件解析请求中的模型身份与当前 Agent 选择不一致。");
  }

  return {
    modelProvider: modelProvider as AdminIngestParseModelAffinity["modelProvider"],
    preferredModel,
    selectedModelLabel,
    strictModelAffinity: true
  };
}

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  const latencyTrace = createAdminIngestLatencyTrace({
    traceId: request.headers.get("x-admin-ingest-trace-id")
      ?? request.headers.get("x-request-id"),
    startedAt: requestStartedAt
  });
  const authStartedAt = Date.now();
  let accessTier: IngestAccessTier = "full_ingest";
  let cacheAccountScope = "local-dev";

  try {
    const chatAccess = await requireAdminIngestChatAccess();
    accessTier = chatAccess.access.accessTier;
    cacheAccountScope = chatAccess.actor.id;
  } catch (error) {
    if (!isLocalDevWithoutDatabase(request)) {
      return apiError(error);
    }
  }
  latencyTrace.mark("auth_completed", authStartedAt);

  const maxParseBytes = readMaxParseBytes();
  const contentLength = Number(request.headers.get("content-length"));

  if (Number.isFinite(contentLength) && contentLength > maxParseBytes + 1024 * 1024) {
    return apiError(new ValidationError(`附件超过解析安全上限（${Math.floor(maxParseBytes / 1024 / 1024)} MB）。`));
  }

  let formData: FormData;
  const formDataStartedAt = Date.now();

  try {
    formData = await request.formData();
  } catch {
    return apiError(new ValidationError("文件解析接口需要 multipart/form-data。"));
  }
  latencyTrace.mark("form_data_completed", formDataStartedAt);

  let modelAffinity: AdminIngestParseModelAffinity | null;
  let pageStart: number;
  let pageBatchSize: number;

  try {
    modelAffinity = readAdminIngestParseModelAffinity(formData);
    pageStart = readPositiveInteger({
      value: formData.get("pageStart"),
      fallback: 1,
      min: 1,
      max: ADMIN_INGEST_MAX_PAGE_START,
      label: "附件起始页"
    });
    pageBatchSize = readPositiveInteger({
      value: formData.get("pageBatchSize"),
      fallback: ADMIN_INGEST_DEFAULT_PAGE_BATCH_SIZE,
      min: ADMIN_INGEST_MIN_PAGE_BATCH_SIZE,
      max: ADMIN_INGEST_MAX_PAGE_BATCH_SIZE,
      label: "附件分页批次"
    });
  } catch (error) {
    return apiError(error);
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return apiError(new ValidationError("缺少要解析的文件。"));
  }

  if (file.size > maxParseBytes) {
    return apiError(new ValidationError(`附件超过解析安全上限（${Math.floor(maxParseBytes / 1024 / 1024)} MB）。`));
  }

  const fileName = readString(formData.get("fileName")) || file.name;
  const mimeType = readString(formData.get("mimeType")) || file.type || "application/octet-stream";
  const recognitionModeValue = readString(formData.get("recognitionMode"));
  const recognitionMode = recognitionModeValue === "wechat_conversation"
    ? "wechat_conversation" as const
    : undefined;
  const wechatOutputModeValue = readString(formData.get("wechatOutputMode"));
  const wechatOutputMode = wechatOutputModeValue === "full_answer"
    ? "full_answer" as const
    : wechatOutputModeValue === "reply_script"
      ? "reply_script" as const
      : undefined;

  if (recognitionModeValue && !recognitionMode) {
    return apiError(new ValidationError("图片识别模式无效。"));
  }
  if (wechatOutputModeValue && (!wechatOutputMode || !recognitionMode)) {
    return apiError(new ValidationError("微信截图输出模式无效。"));
  }
  const tailRoleVerificationPolicy = recognitionMode === "wechat_conversation"
    && wechatOutputMode === "full_answer"
    && (
      modelAffinity?.modelProvider === "deepseek-pro"
      || modelAffinity?.modelProvider === "deepseek-flash"
    )
    ? "tail_strict" as const
    : "global" as const;

  const shouldPrewarmLocalOcr = mimeType.toLowerCase().startsWith("image/")
    || /\.(?:pdf|pptx)$/i.test(fileName);

  if (shouldPrewarmLocalOcr) {
    const workerPrewarmStartedAt = Date.now();

    void warmAdminIngestLocalOcrWorker()
      .then(() => latencyTrace.mark("worker_prewarm_completed", workerPrewarmStartedAt))
      .catch(() => latencyTrace.mark("worker_prewarm_completed", workerPrewarmStartedAt));
  }

  const bufferStartedAt = Date.now();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  latencyTrace.mark("buffer_completed", bufferStartedAt);

  if (
    accessTier !== "full_ingest"
    && !isAdminIngestImageAttachment({ fileName, mimeType, bytes: buffer })
  ) {
    return apiError(new IngestFullAccessRequiredError(
      "当前账号需要投喂端卡密才能上传文件。相机和图片识别仍可正常使用。"
    ));
  }

  const parsed = await parseAdminIngestFile({
    fileName,
    mimeType,
    sizeBytes: file.size || buffer.byteLength,
    buffer,
    pageStart,
    pageBatchSize,
    recognitionMode,
    wechatOutputMode,
    signal: request.signal,
    cacheAccountScope,
    latencyTrace,
    tailRoleVerificationPolicy
  });

  const responseData = modelAffinity
    ? { ...parsed, modelAffinity }
    : parsed;

  latencyTrace.mark("response_ready", requestStartedAt);

  return jsonUtf8({
    data: responseData,
    ...responseData
  });
}
