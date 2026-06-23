import { getStore } from "@netlify/blobs";
import { apiError } from "@/lib/api-response";
import { requireRole } from "@/lib/auth/guards";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_ATTACHMENT_STORE_NAME = "chat-attachments";
const NETLIFY_BLOBS_CONFIG_ERROR = "文件上传服务未配置：缺少 Netlify Blobs 环境变量。";
const safeBlobKeyPattern = /^[A-Za-z0-9_-]+\/\d{4}\/\d{2}\/[A-Fa-f0-9-]+\.[A-Za-z0-9]+$/;

function getNetlifyBlobsConfig() {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID?.trim();
  const token = process.env.NETLIFY_BLOBS_TOKEN?.trim();

  return siteID && token ? { siteID, token } : null;
}

function getChatAttachmentStore() {
  const config = getNetlifyBlobsConfig();

  if (!config) {
    throw new AppError("CONFIG_ERROR", NETLIFY_BLOBS_CONFIG_ERROR, 500);
  }

  return getStore({
    name: CHAT_ATTACHMENT_STORE_NAME,
    siteID: config.siteID,
    token: config.token,
    consistency: "strong"
  });
}

function getSafeUserPrefix(userId: string) {
  return userId.replace(/[^\w-]+/g, "") || "user";
}

function getSafeDownloadFilename(value: unknown) {
  if (typeof value !== "string") {
    return "attachment";
  }

  return value.replace(/[/\\"]/g, "_").trim() || "attachment";
}

function getContentType(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "application/octet-stream";
}

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireRole>>;

  try {
    actor = await requireRole("user", {
      request,
      requireLicense: true,
      requiredAppType: "user_app",
      product: "user_app",
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ai_chat_attachment_download"
    });
  } catch (error) {
    return apiError(error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key")?.trim() ?? "";

    if (!safeBlobKeyPattern.test(key)) {
      throw new ValidationError("附件地址无效。");
    }

    if (!key.startsWith(`${getSafeUserPrefix(actor.id)}/`)) {
      throw new ForbiddenError("当前账号没有权限访问该附件。");
    }

    const store = getChatAttachmentStore();
    const blob = await store.getWithMetadata(key, {
      type: "arrayBuffer",
      consistency: "strong"
    });

    if (!blob) {
      throw new NotFoundError("附件不存在或已失效。");
    }

    const metadata = blob.metadata ?? {};
    const metadataUserId = metadata.userId;

    if (typeof metadataUserId === "string" && metadataUserId !== actor.id) {
      throw new ForbiddenError("当前账号没有权限访问该附件。");
    }

    const filename = getSafeDownloadFilename(metadata.filename);
    const contentType = getContentType(metadata.contentType);

    return new Response(blob.data, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
