import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const allowedAvatarMimeTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);
const allowedAvatarExtensions = new Map(
  Array.from(allowedAvatarMimeTypes.entries()).map(([mimeType, extension]) => [
    extension,
    mimeType,
  ]),
);
allowedAvatarExtensions.set("jpeg", "image/jpeg");
allowedAvatarExtensions.set("jpg", "image/jpeg");

interface AvatarResponse {
  avatar_url: string;
}

function inferAvatarMimeType(file: File) {
  const mimeType = file.type.trim().toLowerCase();

  if (allowedAvatarMimeTypes.has(mimeType)) {
    return mimeType;
  }

  const extension = path.extname(file.name).slice(1).toLowerCase();
  const inferredMimeType = allowedAvatarExtensions.get(extension);

  if (
    inferredMimeType &&
    (!mimeType ||
      mimeType === "application/octet-stream" ||
      !allowedAvatarMimeTypes.has(mimeType))
  ) {
    return inferredMimeType;
  }

  return mimeType;
}

function validateAvatarFile(file: File, mimeType: string) {
  if (!allowedAvatarMimeTypes.has(mimeType)) {
    throw new ValidationError("头像仅支持 jpg、jpeg、png、webp 图片。");
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new ValidationError("头像大小不能超过 2MB。");
  }
}

function getUploadRoot() {
  return (
    process.env.CHAT_AVATAR_UPLOAD_DIR?.trim() ||
    process.env.UPLOAD_DIR?.trim() ||
    (process.env.NODE_ENV === "production"
      ? "/var/www/ai-knowledge/uploads"
      : path.join(process.cwd(), "public", "uploads"))
  );
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

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch (error) {
    return apiError(error);
  }

  try {
    const formData = await request.formData();
    const avatar = formData.get("avatar") ?? formData.get("file");

    if (!(avatar instanceof File)) {
      throw new ValidationError("请上传头像图片。");
    }

    const mimeType = inferAvatarMimeType(avatar);
    validateAvatarFile(avatar, mimeType);

    const extension = allowedAvatarMimeTypes.get(mimeType) ?? "png";
    const avatarDirectory = path.join(getUploadRoot(), "avatars");
    const fileName = `${user.id}-${randomUUID()}.${extension}`;
    const storagePath = path.join(avatarDirectory, fileName);
    const avatarBytes = Buffer.from(await avatar.arrayBuffer());
    const publicUrl = new URL(
      `/uploads/avatars/${fileName}`,
      getPublicBaseUrl(request),
    ).toString();

    try {
      await mkdir(avatarDirectory, { recursive: true });
      await writeFile(storagePath, avatarBytes);

      return apiSuccess<AvatarResponse>({
        avatar_url: publicUrl,
      });
    } catch {
      return apiSuccess<AvatarResponse>({
        avatar_url: `data:${mimeType};base64,${avatarBytes.toString("base64")}`,
      });
    }
  } catch (error) {
    return apiError(error);
  }
}
