import { getStore } from "@netlify/blobs";
import { readFile } from "fs/promises";
import path from "path";
import { apiError } from "@/lib/api-response";
import { requireAiChatAccess } from "@/lib/auth/guards";
import { AppError, ForbiddenError, NotFoundError, ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHAT_ATTACHMENT_STORE_NAME = "chat-attachments";
const NETLIFY_BLOBS_CONFIG_ERROR = "文件上传服务未配置：缺少 Netlify Blobs 环境变量。";
const safeBlobKeyPattern = /^[A-Za-z0-9_-]+\/\d{4}\/\d{2}\/[A-Fa-f0-9-]+\.[A-Za-z0-9]+$/;
const safeLocalPublicAttachmentKeyPattern = /^[A-Za-z0-9_-]+-\d{10,}-[A-Fa-f0-9-]+\.[A-Za-z0-9]+$/;
const localAttachmentContentTypes = new Map([
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
  ["pdf", "application/pdf"],
  ["txt", "text/plain; charset=utf-8"],
  ["md", "text/markdown; charset=utf-8"],
  ["json", "application/json; charset=utf-8"],
  ["csv", "text/csv; charset=utf-8"]
]);

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

function getLocalUploadRoot() {
  return (
    process.env.CHAT_ATTACHMENT_UPLOAD_DIR?.trim() ||
    process.env.UPLOAD_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "/var/www/ai-knowledge/uploads"
      : path.join(process.cwd(), "public", "uploads"))
  );
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

function getLocalAttachmentContentType(key: string) {
  const extension = path.extname(key).slice(1).toLowerCase();

  return localAttachmentContentTypes.get(extension) ?? "application/octet-stream";
}

async function readLocalPublicAttachment(actorId: string, key: string) {
  if (!safeLocalPublicAttachmentKeyPattern.test(key)) {
    throw new ValidationError("附件地址无效。");
  }

  if (!key.startsWith(`${getSafeUserPrefix(actorId)}-`)) {
    throw new ForbiddenError("当前账号没有权限访问该附件。");
  }

  const uploadDirectory = path.join(getLocalUploadRoot(), "chat-attachments");
  const filename = path.basename(key);
  const targetPath = path.join(uploadDirectory, filename);

  try {
    return await readFile(targetPath);
  } catch {
    throw new NotFoundError("附件不存在或已失效。");
  }
}

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireAiChatAccess>>;

  try {
    actor = await requireAiChatAccess(request, "ai_chat_attachment_download");
  } catch (error) {
    return apiError(error);
  }

  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key")?.trim() ?? "";

    if (safeLocalPublicAttachmentKeyPattern.test(key)) {
      const data = await readLocalPublicAttachment(actor.id, key);
      const filename = getSafeDownloadFilename(key);

      return new Response(data, {
        headers: {
          "Content-Type": getLocalAttachmentContentType(key),
          "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          "Cache-Control": "private, max-age=3600",
          "X-Content-Type-Options": "nosniff"
        }
      });
    }

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
