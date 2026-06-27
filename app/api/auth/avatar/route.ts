import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { apiError, apiSuccess } from "@/lib/api-response";
import { requireUser } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import {
  clearUserAvatarProfile,
  getAvatarDirectory,
  writeUserAvatarProfile
} from "@/lib/user-avatar";

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
  avatar_url: string | null;
  avatarUrl?: string | null;
  updated_at?: string | null;
  avatar_updated_at?: string | null;
  avatarUpdatedAt?: string | null;
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

export async function DELETE() {
  try {
    const user = await requireUser();
    const result = await clearUserAvatarProfile(user.id);

    return apiSuccess<AvatarResponse>({
      ...result,
      avatarUrl: result.avatar_url,
      avatar_updated_at: result.updated_at,
      avatarUpdatedAt: result.updated_at
    });
  } catch (error) {
    return apiError(error);
  }
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
    const avatarDirectory = getAvatarDirectory();
    const fileName = `${user.id}-${randomUUID()}.${extension}`;
    const storagePath = path.join(avatarDirectory, fileName);
    const avatarBytes = Buffer.from(await avatar.arrayBuffer());

    try {
      await mkdir(avatarDirectory, { recursive: true });
      await writeFile(storagePath, avatarBytes);
      const profile = await writeUserAvatarProfile(user.id, fileName, request);
      const avatarUrl = profile?.avatar_url ?? new URL(`/api/auth/avatar/${fileName}`, getPublicBaseUrl(request)).toString();

      return apiSuccess<AvatarResponse>({
        avatar_url: avatarUrl,
        avatarUrl,
        updated_at: profile?.updated_at ?? null,
        avatar_updated_at: profile?.updated_at ?? null,
        avatarUpdatedAt: profile?.updated_at ?? null
      });
    } catch {
      const avatarUrl = `data:${mimeType};base64,${avatarBytes.toString("base64")}`;
      const updatedAt = new Date().toISOString();

      return apiSuccess<AvatarResponse>({
        avatar_url: avatarUrl,
        avatarUrl,
        updated_at: updatedAt,
        avatar_updated_at: updatedAt,
        avatarUpdatedAt: updatedAt
      });
    }
  } catch (error) {
    return apiError(error);
  }
}
