import { apiError } from "@/lib/api-response";
import { ValidationError } from "@/lib/errors";
import { requireAdminIngestChatActor } from "@/lib/enterprise/admin-ingest-auth";
import {
  buildAdminIngestImageUrl,
  readAdminIngestImage,
  saveAdminIngestImage
} from "@/lib/enterprise/admin-ingest-image-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ADMIN_INGEST_IMAGE_BYTES = 50 * 1024 * 1024;

function jsonUtf8(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdminIngestChatActor();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ValidationError("请选择需要永久保留的图片。");
    }

    if (file.size > MAX_ADMIN_INGEST_IMAGE_BYTES) {
      throw new ValidationError("图片不能超过 50 MB。");
    }

    const saved = await saveAdminIngestImage({
      ownerUserId: actor.id,
      fileName: file.name,
      mimeType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer())
    });

    return jsonUtf8({
      ok: true,
      data: {
        imageId: saved.imageId,
        imageUrl: buildAdminIngestImageUrl(saved.imageId),
        contentType: saved.contentType,
        sizeBytes: saved.sizeBytes
      }
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const actor = await requireAdminIngestChatActor();
    const imageId = new URL(request.url).searchParams.get("id");
    const image = await readAdminIngestImage({
      ownerUserId: actor.id,
      imageId
    });

    return new Response(image.bytes, {
      headers: {
        "Content-Type": image.contentType,
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return apiError(error);
  }
}
