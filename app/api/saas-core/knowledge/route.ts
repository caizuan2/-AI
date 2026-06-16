import { createKnowledge, searchTenantKnowledge } from "@/lib/saas-core/knowledge.service";
import { getPositiveInteger, saasCoreError, saasCoreSuccess } from "@/app/api/saas-core/_shared";
import type { AddKnowledgeInput, SearchKnowledgeInput } from "@/types/saas-core";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const input: SearchKnowledgeInput = {
      tenantId: searchParams.get("tenantId") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      category: searchParams.get("category") ?? undefined,
      page: getPositiveInteger(searchParams.get("page"), 1),
      pageSize: getPositiveInteger(searchParams.get("pageSize"), 20)
    };

    return saasCoreSuccess(await searchTenantKnowledge(input));
  } catch (error) {
    return saasCoreError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as AddKnowledgeInput;

    return saasCoreSuccess(await createKnowledge(body));
  } catch (error) {
    return saasCoreError(error);
  }
}
