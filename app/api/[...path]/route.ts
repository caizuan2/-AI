import { NextResponse } from "next/server";
import { REQUEST_ID_HEADER } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function apiNotFound(request: Request) {
  const requestId = request.headers.get(REQUEST_ID_HEADER) ?? undefined;

  return NextResponse.json(
    {
      ok: false,
      code: "NOT_FOUND",
      message: "请求的 API 不存在。",
      requestId,
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "请求的 API 不存在。",
        requestId
      }
    },
    {
      status: 404
    }
  );
}

export function GET(request: Request) {
  return apiNotFound(request);
}

export function POST(request: Request) {
  return apiNotFound(request);
}

export function PUT(request: Request) {
  return apiNotFound(request);
}

export function PATCH(request: Request) {
  return apiNotFound(request);
}

export function DELETE(request: Request) {
  return apiNotFound(request);
}

export function OPTIONS(request: Request) {
  return apiNotFound(request);
}
