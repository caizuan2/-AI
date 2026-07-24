import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { ValidationError } from "@/lib/errors";

const MAX_ADMIN_INGEST_IMAGE_BYTES = 50 * 1024 * 1024;
const IMAGE_ID_PATTERN = /^[a-f0-9]{64}\.(?:avif|bmp|gif|jpg|png|webp)$/;
const IMAGE_MIME_BY_EXTENSION = new Map([
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"]
]);
const IMAGE_EXTENSION_BY_MIME = new Map([
  ["image/avif", "avif"],
  ["image/bmp", "bmp"],
  ["image/gif", "gif"],
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

function safeOwnerId(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "anonymous";
}

function readConfiguredImageDir() {
  return (
    process.env.ADMIN_INGEST_IMAGE_DIR
    || process.env.AI_KB_ADMIN_INGEST_IMAGE_DIR
    || ""
  ).trim();
}

async function getAdminIngestImageDir() {
  const path = await import("node:path");
  const configured = readConfiguredImageDir();

  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(process.cwd(), configured);
  }

  if (process.platform !== "win32" && process.cwd().startsWith("/var/www/ai-knowledge-main-")) {
    return "/var/www/ai-knowledge-shared/admin-ingest/images";
  }

  return path.join(process.cwd(), "artifacts", "admin-ingest", "images");
}

function readImageExtension(input: { fileName: string; mimeType: string }) {
  const mimeType = input.mimeType.trim().toLowerCase();
  const mimeExtension = IMAGE_EXTENSION_BY_MIME.get(mimeType);

  if (mimeExtension) {
    return mimeExtension;
  }

  const dotIndex = input.fileName.lastIndexOf(".");
  const fileExtension = dotIndex >= 0
    ? input.fileName.slice(dotIndex + 1).trim().toLowerCase()
    : "";

  return IMAGE_MIME_BY_EXTENSION.has(fileExtension)
    ? fileExtension === "jpeg" ? "jpg" : fileExtension
    : "";
}

function validateImageInput(input: {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const extension = readImageExtension(input);

  if (!extension) {
    throw new ValidationError("仅支持 JPG、PNG、WebP、GIF、AVIF 或 BMP 图片。");
  }

  if (input.bytes.byteLength <= 0) {
    throw new ValidationError("图片内容为空，请重新选择。");
  }

  if (input.bytes.byteLength > MAX_ADMIN_INGEST_IMAGE_BYTES) {
    throw new ValidationError("图片不能超过 50 MB。");
  }

  return extension;
}

async function getOwnerImagePath(ownerUserId: string, imageId: string) {
  const path = await import("node:path");
  const root = await getAdminIngestImageDir();

  return path.join(root, `user-${safeOwnerId(ownerUserId)}`, imageId);
}

export async function saveAdminIngestImage(input: {
  ownerUserId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const extension = validateImageInput(input);
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  const imageId = `${hash}.${extension}`;
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const targetPath = await getOwnerImagePath(input.ownerUserId, imageId);
  const temporaryPath = path.join(path.dirname(targetPath), `.${imageId}-${randomUUID()}.tmp`);

  await fs.mkdir(path.dirname(targetPath), { recursive: true });

  try {
    await fs.access(targetPath);
  } catch {
    await fs.writeFile(temporaryPath, input.bytes);

    try {
      await fs.rename(temporaryPath, targetPath);
    } catch (error) {
      await fs.rm(temporaryPath, { force: true });

      try {
        await fs.access(targetPath);
      } catch {
        throw error;
      }
    }
  }

  return {
    imageId,
    contentType: IMAGE_MIME_BY_EXTENSION.get(extension) ?? "application/octet-stream",
    sizeBytes: input.bytes.byteLength
  };
}

export async function readAdminIngestImage(input: {
  ownerUserId: string;
  imageId: unknown;
}) {
  const imageId = typeof input.imageId === "string" ? input.imageId.trim().toLowerCase() : "";

  if (!IMAGE_ID_PATTERN.test(imageId)) {
    throw new ValidationError("图片地址无效。");
  }

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const targetPath = await getOwnerImagePath(input.ownerUserId, imageId);

  try {
    const bytes = await fs.readFile(targetPath);
    const extension = path.extname(imageId).slice(1).toLowerCase();

    return {
      bytes,
      contentType: IMAGE_MIME_BY_EXTENSION.get(extension) ?? "application/octet-stream"
    };
  } catch {
    throw new ValidationError("图片不存在或已失效。");
  }
}

export function buildAdminIngestImageUrl(imageId: string) {
  return `/api/admin/ingest-images?id=${encodeURIComponent(imageId)}`;
}
