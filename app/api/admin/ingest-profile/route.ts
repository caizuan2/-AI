import { apiError, apiSuccess } from "@/lib/api-response";
import { ValidationError } from "@/lib/errors";
import { requireAdminIngestChatActor } from "@/lib/enterprise/admin-ingest-auth";
import {
  readAdminIngestAccountProfile,
  writeAdminIngestAccountAvatar,
  writeAdminIngestAccountName
} from "@/lib/enterprise/admin-ingest-account-profile-store";
import {
  buildAdminIngestImageUrl,
  saveAdminIngestImage
} from "@/lib/enterprise/admin-ingest-image-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_INGEST_AVATAR_BYTES = 10 * 1024 * 1024;

function toProfileResponse(profile: Awaited<ReturnType<typeof readAdminIngestAccountProfile>>) {
  return {
    name: profile.name,
    avatarUrl: profile.avatarImageId
      ? buildAdminIngestImageUrl(profile.avatarImageId)
      : null,
    hasCustomName: Boolean(profile.name),
    hasCustomAvatar: Boolean(profile.avatarImageId)
  };
}

export async function GET() {
  try {
    const actor = await requireAdminIngestChatActor();
    const profile = await readAdminIngestAccountProfile(actor.id);

    return apiSuccess(toProfileResponse(profile), {
      headers: {
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireAdminIngestChatActor();
    const payload = await request.json().catch(() => {
      throw new ValidationError("请求体必须是合法 JSON。");
    });
    const name = typeof payload?.name === "string" ? payload.name : "";
    const profile = await writeAdminIngestAccountName({
      ownerUserId: actor.id,
      name
    });

    return apiSuccess(toProfileResponse(profile));
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestChatActor();
    const formData = await request.formData();
    const avatar = formData.get("avatar");

    if (!(avatar instanceof File) || !avatar.type.startsWith("image/")) {
      throw new ValidationError("请选择需要永久保存的头像图片。");
    }

    if (avatar.size > MAX_ADMIN_INGEST_AVATAR_BYTES) {
      throw new ValidationError("头像图片不能超过 10 MB。");
    }

    const saved = await saveAdminIngestImage({
      ownerUserId: actor.id,
      fileName: avatar.name,
      mimeType: avatar.type,
      bytes: new Uint8Array(await avatar.arrayBuffer())
    });
    const profile = await writeAdminIngestAccountAvatar({
      ownerUserId: actor.id,
      avatarImageId: saved.imageId
    });

    return apiSuccess(toProfileResponse(profile));
  } catch (error) {
    return apiError(error);
  }
}
