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
  ["image/png", "png"],
  ["image/webp", "webp"]
]);

interface AvatarResponse {
  avatar_url: string;
}

function validateAvatarFile(file: File) {
  if (!allowedAvatarMimeTypes.has(file.type)) {
    throw new ValidationError("头像仅支持 jpg、jpeg、png、webp 图片。");
  }

  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new ValidationError("头像大小不能超过 2MB。");
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
    const avatar = formData.get("avatar");

    if (!(avatar instanceof File)) {
      throw new ValidationError("请上传头像图片。");
    }

    validateAvatarFile(avatar);

    const extension = allowedAvatarMimeTypes.get(avatar.type) ?? "png";
    const avatarDirectory = path.join(process.cwd(), "public", "uploads", "avatars");
    const fileName = `${user.id}-${randomUUID()}.${extension}`;
    const storagePath = path.join(avatarDirectory, fileName);

    await mkdir(avatarDirectory, { recursive: true });
    await writeFile(storagePath, Buffer.from(await avatar.arrayBuffer()));

    return apiSuccess<AvatarResponse>({
      avatar_url: `/uploads/avatars/${fileName}`
    });
  } catch (error) {
    return apiError(error);
  }
}
