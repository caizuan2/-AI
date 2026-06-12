import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireRole } from "@/lib/auth/guards";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CHAT_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const allowedAttachmentMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["application/pdf", "pdf"],
  ["text/plain", "txt"],
  ["text/markdown", "md"],
  ["application/msword", "doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"]
]);

function safeFileBaseName(name: string) {
  return path.basename(name).replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "attachment";
}

function getAttachmentType(mimeType: string) {
  return mimeType.startsWith("image/") ? "image" : "file";
}

function validateAttachmentFile(file: File) {
  if (!allowedAttachmentMimeTypes.has(file.type)) {
    throw new ValidationError("附件类型不支持，请重新选择图片、PDF、Word 或文本文件。");
  }

  if (file.size > MAX_CHAT_ATTACHMENT_SIZE_BYTES) {
    throw new ValidationError("单个附件不能超过 10MB。");
  }
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
    return apiError(error);
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") ?? formData.get("attachment");

    if (!(file instanceof File)) {
      throw new ValidationError("请上传聊天附件。");
    }

    validateAttachmentFile(file);

    const extension = allowedAttachmentMimeTypes.get(file.type) ?? "bin";
    const uploadDirectory = path.join(process.cwd(), "public", "uploads", "chat-attachments");
    const userPrefix = String(actor.id).replace(/[^\w-]+/g, "") || "user";
    const originalName = safeFileBaseName(file.name);
    const storageName = `${userPrefix}-${Date.now()}-${randomUUID()}.${extension}`;
    const publicUrl = `/uploads/chat-attachments/${storageName}`;

    await mkdir(uploadDirectory, { recursive: true });
    await writeFile(path.join(uploadDirectory, storageName), Buffer.from(await file.arrayBuffer()));

    return apiSuccess({
      attachment: {
        id: randomUUID(),
        name: file.name || originalName,
        filename: originalName,
        type: getAttachmentType(file.type),
        mimeType: file.type,
        mime_type: file.type,
        size: file.size,
        url: publicUrl,
        publicUrl,
        reference_id: storageName,
        metadata: {
          storage: "public/uploads/chat-attachments"
        }
      }
    }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
