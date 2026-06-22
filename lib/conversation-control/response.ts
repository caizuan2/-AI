import { NextResponse } from "next/server";

export function conversationActionSuccess<T extends Record<string, unknown>>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: true,
      success: true,
      ...data,
      data
    },
    init
  );
}
