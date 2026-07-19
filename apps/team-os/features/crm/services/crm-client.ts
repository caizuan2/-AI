import type {
  AnalyzeCustomerInput,
  AnalyzeCustomerResult,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
  CreateCustomerFollowUpInput,
  CreateCustomerInput,
  CreateCustomerResult,
  CustomerDetailData,
  CustomerFollowUpRecord,
  CustomerListData,
  CustomerListFilters
} from "@/apps/team-os/features/crm/types";

export class CrmClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "CrmClientError";
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new CrmClientError("接口返回格式不正确，请稍后重试。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new CrmClientError("接口返回格式不正确，请稍后重试。");
  }
  const body = parsed as ApiSuccessEnvelope<T> | ApiErrorEnvelope;

  if (!response.ok || body.success !== true || !("data" in body)) {
    const errorBody = body as ApiErrorEnvelope;
    throw new CrmClientError(
      errorBody.message || errorBody.error?.message || "请求失败，请稍后重试。",
      errorBody.code || errorBody.error?.code
    );
  }

  return body.data;
}

function customerQuery(filters: CustomerListFilters) {
  const query = new URLSearchParams();
  if (filters.companyId) query.set("companyId", filters.companyId);
  if (filters.teamId) query.set("teamId", filters.teamId);
  if (filters.search?.trim()) query.set("q", filters.search.trim());
  if (filters.stage) query.set("stage", filters.stage);
  if (filters.level) query.set("level", filters.level);
  if (filters.tag) query.set("tag", filters.tag);
  if (filters.cursor) query.set("cursor", filters.cursor);
  query.set("limit", String(filters.limit));
  return query.toString();
}

export async function fetchCustomers(filters: CustomerListFilters): Promise<CustomerListData> {
  return readResponse<CustomerListData>(await fetch(`/api/team-os/crm/customers?${customerQuery(filters)}`, { cache: "no-store" }));
}

export async function createCustomer(input: CreateCustomerInput): Promise<CreateCustomerResult> {
  return readResponse<CreateCustomerResult>(await fetch("/api/team-os/crm/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetailData> {
  return readResponse<CustomerDetailData>(await fetch(`/api/team-os/crm/customer/${encodeURIComponent(customerId)}`, { cache: "no-store" }));
}

export async function createCustomerFollowUp(input: CreateCustomerFollowUpInput): Promise<CustomerFollowUpRecord> {
  const data = await readResponse<{ followUp: CustomerFollowUpRecord }>(await fetch("/api/team-os/crm/follow-up", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.followUp;
}

export async function analyzeCustomer(input: AnalyzeCustomerInput): Promise<AnalyzeCustomerResult> {
  return readResponse<AnalyzeCustomerResult>(await fetch("/api/team-os/crm/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}
