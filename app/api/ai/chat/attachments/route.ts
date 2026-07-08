import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { getStore } from "@netlify/blobs";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import {
  createChatImageOcrMetadata,
  extractChatImageText
} from "@/lib/ai-chat/image-ocr";
import { requireAiChatAccess } from "@/lib/auth/guards";
import { AppError, ValidationError, toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHAT_ATTACHMENT_SIZE_MB = 300;
const MAX_CHAT_ATTACHMENT_SIZE_BYTES =
  MAX_CHAT_ATTACHMENT_SIZE_MB * 1024 * 1024;
const CHAT_ATTACHMENT_STORE_NAME = "chat-attachments";
const NETLIFY_BLOBS_CONFIG_ERROR =
  "文件上传服务未配置：缺少 Netlify Blobs 环境变量。";
const allowedAttachmentMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["application/octet-stream", "bin"],
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["application/json", "json"],
  ["text/csv", "csv"],
  ["application/csv", "csv"],
  ["text/html", "html"],
  ["text/css", "css"],
  ["text/javascript", "js"],
  ["application/javascript", "js"],
  ["application/x-javascript", "js"],
  ["application/typescript", "ts"],
  ["text/x-dart", "dart"],
  ["application/xml", "xml"],
  ["text/xml", "xml"],
  ["application/zip", "zip"],
  ["application/x-zip-compressed", "zip"],
  ["application/x-zip", "zip"],
  ["application/msword", "doc"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "docx",
  ],
  ["application/vnd.ms-powerpoint", "ppt"],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pptx",
  ],
  ["application/vnd.ms-excel", "xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
]);
const allowedAttachmentExtensions = new Map(
  Array.from(allowedAttachmentMimeTypes.entries()).map(
    ([mimeType, extension]) => [extension, mimeType],
  ),
);
allowedAttachmentExtensions.set("jpeg", "image/jpeg");
allowedAttachmentExtensions.set("jpg", "image/jpeg");

function safeFileBaseName(name: string) {
  return (
    path
      .basename(name)
      .replace(/[^\w.-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "attachment"
  );
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
    consistency: "strong",
  });
}

function shouldUseLocalUploadFallback() {
  return process.env.CHAT_ATTACHMENT_STORAGE?.trim() !== "netlify-blobs";
}

function getSafeUserPrefix(userId: string) {
  return userId.replace(/[^\w-]+/g, "") || "user";
}

function getDatePathParts(date = new Date()) {
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
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

  if (
    inferredMimeType &&
    (!mimeType ||
      mimeType === "application/octet-stream" ||
      !allowedAttachmentMimeTypes.has(mimeType))
  ) {
    return inferredMimeType;
  }

  if (!mimeType) {
    return "application/octet-stream";
  }

  return mimeType;
}

function validateAttachmentFile(file: File, mimeType: string) {
  if (!allowedAttachmentMimeTypes.has(mimeType)) {
    throw new ValidationError(
      "附件类型不支持，请重新选择图片、PDF、Office 或文本文件。",
    );
  }
}

async function saveAttachmentToLocalPublicUploads(input: {
  actorId: string;
  arrayBuffer: ArrayBuffer;
  extension: string;
  filename: string;
  mimeType: string;
  size: number;
  publicBaseUrl: string;
}) {
  const uploadRoot =
    process.env.CHAT_ATTACHMENT_UPLOAD_DIR?.trim() ||
    process.env.UPLOAD_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "/var/www/ai-knowledge/uploads"
      : path.join(process.cwd(), "public", "uploads"));
  const uploadDirectory = path.join(uploadRoot, "chat-attachments");
  const storageName = `${getSafeUserPrefix(input.actorId)}-${Date.now()}-${randomUUID()}.${input.extension}`;
  const publicPath = `/uploads/chat-attachments/${storageName}`;
  const publicUrl = new URL(publicPath, input.publicBaseUrl).toString();

  const targetPath = path.join(uploadDirectory, storageName);

  try {
    console.info("chat_attachment.local_upload.start", {
      actorId: getSafeUserPrefix(input.actorId),
      filename: input.filename,
      size: input.size,
      mimeType: input.mimeType,
      uploadDirectory,
      targetPath,
      publicUrl,
    });
    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(targetPath, Buffer.from(input.arrayBuffer));
    console.info("chat_attachment.local_upload.success", {
      actorId: getSafeUserPrefix(input.actorId),
      filename: input.filename,
      size: input.size,
      mimeType: input.mimeType,
      targetPath,
      publicUrl,
    });
  } catch (error) {
    console.error("chat_attachment.local_upload.failed", {
      actorId: getSafeUserPrefix(input.actorId),
      filename: input.filename,
      size: input.size,
      mimeType: input.mimeType,
      uploadDirectory,
      targetPath,
      publicUrl,
      error,
    });
    throw new AppError(
      "APP_ERROR",
      "文件上传服务暂不可用：服务器无法保存附件，请检查上传目录权限。",
      500,
    );
  }

  return {
    url: publicUrl,
    storage: "local-public",
    referenceId: storageName,
    blobKey: undefined,
  };
}

function getPublicBaseUrl(request: Request) {
  const configured =
    process.env.CHAT_ATTACHMENT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim();

  if (configured) {
    return configured.endsWith("/") ? configured : `${configured}/`;
  }

  return new URL(request.url).origin;
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
      userId: input.actorId,
    },
  });

  const downloadUrl = `/api/ai/chat/attachments/download?key=${encodeURIComponent(blobKey)}`;

  return {
    url: downloadUrl,
    storage: "netlify-blobs",
    referenceId: blobKey,
    blobKey,
  };
}

function unauthorizedUploadResponse() {
  const message = "请先登录后再上传文件。";

  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "UNAUTHORIZED",
      message,
      error: {
        code: "UNAUTHORIZED",
        message
      },
    },
    { status: 401 },
  );
}

function methodNotAllowedResponse() {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "METHOD_NOT_ALLOWED",
      message: "请使用 POST multipart/form-data 上传聊天附件。",
    },
    { status: 405 },
  );
}

function fileTooLargeResponse() {
  return NextResponse.json(
    {
      ok: false,
      success: false,
      code: "FILE_TOO_LARGE",
      error: "FILE_TOO_LARGE",
      message: `单个附件不能超过 ${MAX_CHAT_ATTACHMENT_SIZE_MB}MB`,
    },
    { status: 413 },
  );
}

function getFirstUploadedFile(formData: FormData) {
  for (const fieldName of ["file", "files", "attachment", "attachments"]) {
    for (const value of formData.getAll(fieldName)) {
      if (value instanceof File) {
        return value;
      }
    }
  }

  return null;
}

export function GET() {
  return methodNotAllowedResponse();
}

export async function POST(request: Request) {
  let actor: Awaited<ReturnType<typeof requireAiChatAccess>>;

  try {
    actor = await requireAiChatAccess(request, "ai_chat_attachment");
  } catch (error) {
    if (toAppError(error).code === "UNAUTHORIZED") {
      return unauthorizedUploadResponse();
    }

    return apiError(error);
  }

  try {
    const formData = await request.formData();
    const file = getFirstUploadedFile(formData);

    if (!(file instanceof File)) {
      throw new ValidationError("请上传聊天附件。");
    }

    if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
      return fileTooLargeResponse();
    }

    const mimeType = inferAttachmentMimeType(file);

    validateAttachmentFile(file, mimeType);

    const extension = allowedAttachmentMimeTypes.get(mimeType) ?? "bin";
    const originalName = safeFileBaseName(file.name);
    const arrayBuffer = await file.arrayBuffer();
    const ocrMetadata = createChatImageOcrMetadata(
      await extractChatImageText({
        arrayBuffer,
        filename: originalName,
        mimeType
      }),
    );
    const savedAttachment = shouldUseLocalUploadFallback()
      ? await saveAttachmentToLocalPublicUploads({
          actorId: actor.id,
          arrayBuffer,
          extension,
          filename: originalName,
          mimeType,
          size: file.size,
          publicBaseUrl: getPublicBaseUrl(request),
        })
      : await saveAttachmentToNetlifyBlobs({
          actorId: actor.id,
          arrayBuffer,
          extension,
          filename: originalName,
          mimeType,
          size: file.size,
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
          ...(savedAttachment.blobKey
            ? { blobKey: savedAttachment.blobKey }
            : {}),
          ...ocrMetadata,
        },
      },
    };

    return NextResponse.json(
      {
        ok: true,
        success: true,
        data: responseData,
        attachment: responseData.attachment,
        url: responseData.attachment.url,
        publicUrl: responseData.attachment.publicUrl,
        fileUrl: responseData.attachment.fileUrl,
        downloadUrl: responseData.attachment.downloadUrl,
        name: responseData.attachment.name,
        size: responseData.attachment.size,
        mimeType: responseData.attachment.mimeType,
        type: responseData.attachment.type,
      },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
