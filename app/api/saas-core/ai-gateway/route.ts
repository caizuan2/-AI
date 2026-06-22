import { getAIGatewayStats, recordAIRequest } from "@/lib/saas-core/ai-gateway.service";
import { saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";
import type { LogAIRequestInput, QueryFilter } from "@/types/saas-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filter: QueryFilter = {
      tenantId: searchParams.get("tenantId") ?? undefined
    };

    return saasCoreSuccess(await getAIGatewayStats(filter));
  } catch (error) {
    return saasCoreError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as LogAIRequestInput;

    return saasCoreSuccess(await recordAIRequest(body));
  } catch (error) {
    return saasCoreError(error);
  }
}
