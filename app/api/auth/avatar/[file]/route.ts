import { readFile } from "fs/promises";
import path from "path";
import { apiError } from "@/lib/api-response";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { getAvatarDirectory, getAvatarMimeType, isSafeAvatarFileName } from "@/lib/user-avatar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { file: string } }) {
  try {
    const fileName = decodeURIComponent(params.file ?? "");

    if (!isSafeAvatarFileName(fileName)) {
      throw new ValidationError("头像文件名无效。");
    }

    const avatarBytes = await readFile(path.join(getAvatarDirectory(), fileName)).catch(() => null);

    if (!avatarBytes) {
      throw new NotFoundError("头像不存在。");
    }

    return new Response(avatarBytes, {
      headers: {
        "Cache-Control": "private, max-age=31536000, immutable",
        "Content-Type": getAvatarMimeType(fileName)
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
