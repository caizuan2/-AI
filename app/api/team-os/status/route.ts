import { NextResponse } from "next/server";
import { TEAM_OS_STATUS } from "@/apps/team-os/services/status";

export function GET() {
  return NextResponse.json(TEAM_OS_STATUS);
}
