import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { requireRole } from "@/lib/auth/guards";
import { AppError, ValidationError, toAppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHAT_ATTACHMENT_SIZE_MB = 100;
const MAX_CHAT_ATTACHMENT_SIZE_BYTES = MAX_CHAT_ATTACHMENT_SIZE_MB * 1024 * 1024;
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
    const uploadDirectory = path.join(process.cwd(), "public", "uploads", "chat-attachments");
    const userPrefix = String(actor.id).replace(/[^\w-]+/g, "") || "user";
    const originalName = safeFileBaseName(file.name);
    const storageName = `${userPrefix}-${Date.now()}-${randomUUID()}.${extension}`;
    const publicUrl = `/uploads/chat-attachments/${storageName}`;

    try {
      await mkdir(uploadDirectory, { recursive: true });
      await writeFile(path.join(uploadDirectory, storageName), Buffer.from(await file.arrayBuffer()));
    } catch {
      throw new AppError(
        "APP_ERROR",
        "文件上传服务暂不可用：当前部署环境无法保存附件，请稍后重试或联系管理员。",
        500
      );
    }

    const responseData = {
      attachment: {
        id: randomUUID(),
        name: file.name || originalName,
        filename: originalName,
        type: getAttachmentType(mimeType),
        mimeType,
        mime_type: mimeType,
        size: file.size,
        url: publicUrl,
        publicUrl,
        fileUrl: publicUrl,
        reference_id: storageName,
        metadata: {
          storage: "public/uploads/chat-attachments"
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
