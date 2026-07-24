import { NextResponse } from "next/server";
import { requireAdminIngestChatActor } from "@/lib/enterprise/admin-ingest-auth";
import {
  createOrUpdateAdminIngestPublicConversation,
  revokeAdminIngestPublicConversation
} from "@/lib/enterprise/admin-ingest-public-conversation-store";
import type { AdminIngestPublicLinkKind } from "@/lib/enterprise/admin-ingest-public-conversation-data";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>;
};

async function readConversationId(context: RouteContext) {
  const params = await context.params;

  return typeof params?.id === "string" ? params.id.trim() : "";
}

function readKind(value: unknown): AdminIngestPublicLinkKind {
  if (value === "share" || value === "group") {
    return value;
  }

  throw new Error("公开链接类型无效。");
}

function buildPublicUrl(request: Request, kind: AdminIngestPublicLinkKind, token: string) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host") || requestUrl.host;
  const protocol = forwardedProto === "https" || forwardedProto === "http"
    ? forwardedProto
    : requestUrl.protocol.replace(":", "");
  const path = kind === "share" ? `/ingest-share/${token}` : `/ingest-group/${token}`;

  return new URL(path, `${protocol}://${host}`).toString();
}

function jsonError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({
      ok: false,
      success: false,
      errorCode: error.code,
      message: error.message
    }, { status: error.statusCode });
  }

  return NextResponse.json({
    ok: false,
    success: false,
    errorCode: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : "公开链接操作失败。"
  }, { status: 500 });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireAdminIngestChatActor();
    const conversationId = await readConversationId(context);

    if (!conversationId) {
      throw new Error("投喂端对话不存在。");
    }

    const body = await request.json() as Record<string, unknown>;
    const kind = readKind(body.kind);
    const record = await createOrUpdateAdminIngestPublicConversation({
      ownerUserId: actor.id,
      conversationId,
      kind,
      title: body.title,
      messages: body.messages,
      existingToken: body.token
    });

    return NextResponse.json({
      ok: true,
      success: true,
      data: {
        token: record.token,
        kind: record.kind,
        status: record.status,
        url: buildPublicUrl(request, kind, record.token),
        updatedAt: record.updatedAt
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const actor = await requireAdminIngestChatActor();
    const conversationId = await readConversationId(context);
    const body = await request.json() as Record<string, unknown>;
    const record = await revokeAdminIngestPublicConversation({
      ownerUserId: actor.id,
      conversationId,
      token: body.token
    });

    return NextResponse.json({
      ok: true,
      success: true,
      data: {
        token: record.token,
        kind: record.kind,
        status: record.status,
        updatedAt: record.updatedAt
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
