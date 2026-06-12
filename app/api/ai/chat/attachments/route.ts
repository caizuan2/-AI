import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getStore } from "@netlify/blobs";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireRole } from "@/lib/auth/guards";
import { AppError, ValidationError, toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHAT_ATTACHMENT_SIZE_MB = 100;
const MAX_CHAT_ATTACHMENT_SIZE_BYTES = MAX_CHAT_ATTACHMENT_SIZE_MB * 1024 * 1024;
const CHAT_ATTACHMENT_STORE_NAME = "chat-attachments";
const NETLIFY_BLOBS_CONFIG_ERROR = "文件上传服务未配置：缺少 Netlify Blobs 环境变量。";
const allowedAttachmentMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
  ["application/vnd.ms-powerpoint", "ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"]
]);
const allowedAttachmentExtensions = new Map(
  Array.from(allowedAttachmentMimeTypes.entries()).map(([mimeType, extension]) => [extension, mimeType])
);
allowedAttachmentExtensions.set("jpeg", "image/jpeg");

function safeFileBaseName(name: string) {
  return path.basename(name).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "attachment";
}

function getAttachmentType(mimeType: string) {
  return mimeType.startsWith("image/") ? "image" : "file";
}

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

function shouldUseLocalUploadFallback() {
  return process.env.NODE_ENV !== "production" && !getNetlifyBlobsConfig();
}

function getSafeUserPrefix(userId: string) {
  return userId.replace(/[^\w-]+/g, "") || "user";
}

function getDatePathParts(date = new Date()) {
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0")
  };
}

function createBlobKey(userId: string, extension: string) {
  const { year, month } = getDatePathParts();

  return `${getSafeUserPrefix(userId)}/${year}/${month}/${randomUUID()}.${extension}`;
}

function inferAttachmentMimeType(file: File) {
  const mimeType = file.type.trim().toLowerCase();

  if (allowedAttachmentMimeTypes.has(mimeType)) {
    return mimeType;
  }

  const extension = path.extname(file.name).slice(1).toLowerCase();
  const inferredMimeType = allowedAttachmentExtensions.get(extension);

  if (inferredMimeType && (!mimeType || mimeType === "application/octet-stream")) {
    return inferredMimeType;
  }

  return mimeType;
}

function validateAttachmentFile(file: File, mimeType: string) {
  if (!allowedAttachmentMimeTypes.has(mimeType)) {
    throw new ValidationError("附件类型不支持，请重新选择图片、PDF、Office 或文本文件。");
  }

  if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
    throw new ValidationError(`单个附件不能超过 ${MAX_CHAT_ATTACHMENT_SIZE_MB}MB。`);
  }
}

async function saveAttachmentToLocalPublicUploads(input: {
  actorId: string;
  arrayBuffer: ArrayBuffer;
  extension: string;
}) {
  const uploadDirectory = path.join(process.cwd(), "public", "uploads", "chat-attachments");
  const storageName = `${getSafeUserPrefix(input.actorId)}-${Date.now()}-${randomUUID()}.${input.extension}`;
  const publicUrl = `/uploads/chat-attachments/${storageName}`;

  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(path.join(uploadDirectory, storageName), Buffer.from(input.arrayBuffer));

  return {
    url: publicUrl,
    storage: "local-public",
    referenceId: storageName,
    blobKey: undefined
  };
}

async function saveAttachmentToNetlifyBlobs(input: {
  actorId: string;
  arrayBuffer: ArrayBuffer;
  extension: string;
  filename: string;
  mimeType: string;
  size: number;
}) {
  const blobKey = createBlobKey(input.actorId, input.extension);
  const store = getChatAttachmentStore();
  const uploadedAt = new Date().toISOString();

  await store.set(blobKey, input.arrayBuffer, {
    metadata: {
      contentType: input.mimeType,
      filename: input.filename,
      size: input.size,
      uploadedAt,
      userId: input.actorId
    }
  });

  const downloadUrl = `/api/ai/chat/attachments/download?key=${encodeURIComponent(blobKey)}`;

  return {
    url: downloadUrl,
    storage: "netlify-blobs",
    referenceId: blobKey,
    blobKey
  };
}

function unauthorizedUploadResponse() {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "UNAUTHORIZED",
      error: "UNAUTHORIZED",
      message: "请先登录后再上传文件。"
    },
    { status: 401 }
  );
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireRole>>;

  try {
    actor = await requireRole("user", {
      request,
      requireLicense: true,
      deniedAction: "RBAC_ACCESS_DENIED",
      targetType: "ai_chat_attachment"
    });
  } catch (error) {
    if (toAppError(error).code === "UNAUTHORIZED") {
      return unauthorizedUploadResponse();
    }

    return apiError(error);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("attachment") ?? formData.get("attachments");

    if (!(file instanceof File)) {
      throw new ValidationError("请上传聊天附件。");
    }

    const mimeType = inferAttachmentMimeType(file);

    validateAttachmentFile(file, mimeType);

    const extension = allowedAttachmentMimeTypes.get(mimeType) ?? "bin";
    const originalName = safeFileBaseName(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const savedAttachment = shouldUseLocalUploadFallback()
      ? await saveAttachmentToLocalPublicUploads({
          actorId: actor.id,
          arrayBuffer,
          extension
        })
      : await saveAttachmentToNetlifyBlobs({
          actorId: actor.id,
          arrayBuffer,
          extension,
          filename: originalName,
          mimeType,
          size: file.size
        });

    const responseData = {
      attachment: {
        id: randomUUID(),
        name: file.name || originalName,
        filename: originalName,
        type: getAttachmentType(mimeType),
        mimeType,
        mime_type: mimeType,
        size: file.size,
        url: savedAttachment.url,
        publicUrl: savedAttachment.url,
        fileUrl: savedAttachment.url,
        downloadUrl: savedAttachment.url,
        storage: savedAttachment.storage,
        blobKey: savedAttachment.blobKey,
        reference_id: savedAttachment.referenceId,
        metadata: {
          storage: savedAttachment.storage,
          ...(savedAttachment.blobKey ? { blobKey: savedAttachment.blobKey } : {})
        }
      }
    };

    return NextResponse.json({
      ok: true,
      success: true,
      data: responseData,
      attachment: responseData.attachment
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
