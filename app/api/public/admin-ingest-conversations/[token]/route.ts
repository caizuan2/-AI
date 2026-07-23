import { NextResponse } from "next/server";
import {
  appendAdminIngestPublicGroupMessage,
  getActiveAdminIngestPublicConversation
} from "@/lib/enterprise/admin-ingest-public-conversation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: { token: string } | Promise<{ token: string }>;
};

async function readToken(context: RouteContext) {
  const params = await context.params;

  return typeof params?.token === "string" ? params.token : "";
}

function publicPayload(record: NonNullable<Awaited<ReturnType<typeof getActiveAdminIngestPublicConversation>>>) {
  return {
    token: record.token,
    kind: record.kind,
    title: record.title,
    updatedAt: record.updatedAt,
    messages: record.messages,
    groupMessages: record.groupMessages
  };
}

export async function GET(_request: Request, context: RouteContext) {
  const record = await getActiveAdminIngestPublicConversation(await readToken(context));

  if (!record) {
    return NextResponse.json({
      ok: false,
      success: false,
      message: "链接不存在或已关闭。"
    }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    success: true,
    data: publicPayload(record)
  });
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const record = await appendAdminIngestPublicGroupMessage(
      await readToken(context),
      await request.json()
    );

    return NextResponse.json({
      ok: true,
      success: true,
      data: publicPayload(record)
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      success: false,
      message: error instanceof Error ? error.message : "群聊消息发送失败。"
    }, { status: 400 });
  }
}
