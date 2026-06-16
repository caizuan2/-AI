import { NextResponse } from "next/server";
import { systemEntry } from "@/lib/saas-core/orchestrator/system-entry.service";
import type { OrchestratorRequest } from "@/types/orchestrator";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const startedAt = Date.now();

  try {
    const body = await request.json() as OrchestratorRequest;
    const result = await systemEntry.handle(body);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : "Orchestrator request failed."
        },
        executionTime: Date.now() - startedAt,
        timestamp: Date.now()
      },
      {
        status: 400
      }
    );
  }
}
