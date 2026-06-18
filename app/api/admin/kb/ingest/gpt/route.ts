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
    return apiError(error);
  }
}
