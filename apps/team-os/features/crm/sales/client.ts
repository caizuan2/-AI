"use client";

import type {
  ApiErrorEnvelope,
  ApiSuccessEnvelope
} from "@/apps/team-os/features/crm/types";
import type {
  ChangeCrmContractStatusInput,
  ChangeCrmOpportunityStageInput,
  ConvertCrmLeadInput,
  CreateCrmContractInput,
  CreateCrmLeadInput,
  CreateCrmOpportunityInput,
  CreateCrmReceivableInput,
  CrmContractRecord,
  CrmDashboardData,
  CrmLeadRecord,
  CrmListResult,
  CrmOpportunityRecord,
  CrmReceivableRecord,
  RecordCrmPaymentInput,
  UpdateCrmLeadInput
} from "@/apps/team-os/features/crm/sales/types";

export class CrmSalesClientError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "CrmSalesClientError";
  }
}

async function readResponse<T>(responseValue: Response | Promise<Response>): Promise<T> {
  const response = await responseValue;
  const payload = await response.json().catch(() => null) as
    | ApiSuccessEnvelope<T>
    | ApiErrorEnvelope
    | null;
  if (!payload || typeof payload !== "object") {
    throw new CrmSalesClientError("接口返回格式不正确，请稍后重试。", response.status);
  }
  if (!response.ok || payload.success !== true) {
    const errorPayload = payload as ApiErrorEnvelope;
    throw new CrmSalesClientError(
      errorPayload.error?.message || errorPayload.message || "CRM 操作失败，请稍后重试。",
      response.status
    );
  }
  return payload.data;
}

function query(input: Record<string, string | number | boolean | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

async function write<T>(url: string, method: "POST" | "PATCH", body: unknown) {
  return readResponse<T>(await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }));
}

export function fetchCrmSalesDashboard() {
  return readResponse<CrmDashboardData>(
    fetch("/api/team-os/crm/sales/dashboard", { cache: "no-store" })
  );
}

export function fetchCrmLeads(filters: {
  q?: string;
  status?: string;
  teamId?: string;
  limit?: number;
} = {}) {
  return readResponse<CrmListResult<CrmLeadRecord>>(
    fetch(`/api/team-os/crm/sales/leads?${query({ ...filters, limit: filters.limit ?? 50 })}`, {
      cache: "no-store"
    })
  );
}

export function createCrmLead(input: CreateCrmLeadInput) {
  return write<{ leadId: string }>("/api/team-os/crm/sales/leads", "POST", input);
}

export function updateCrmLead(leadId: string, input: UpdateCrmLeadInput) {
  return write<{ leadId: string; status: string }>(
    `/api/team-os/crm/sales/leads/${encodeURIComponent(leadId)}`,
    "PATCH",
    input
  );
}

export function convertCrmLead(leadId: string, input: ConvertCrmLeadInput) {
  return write<{ leadId: string; customerId: string }>(
    `/api/team-os/crm/sales/leads/${encodeURIComponent(leadId)}/convert`,
    "POST",
    input
  );
}

export function fetchCrmOpportunities(filters: {
  q?: string;
  stage?: string;
  teamId?: string;
  customerId?: string;
  limit?: number;
} = {}) {
  return readResponse<CrmListResult<CrmOpportunityRecord>>(
    fetch(`/api/team-os/crm/sales/opportunities?${query({ ...filters, limit: filters.limit ?? 50 })}`, {
      cache: "no-store"
    })
  );
}

export function createCrmOpportunity(input: CreateCrmOpportunityInput) {
  return write<{ opportunityId: string }>(
    "/api/team-os/crm/sales/opportunities",
    "POST",
    input
  );
}

export function changeCrmOpportunityStage(
  opportunityId: string,
  input: ChangeCrmOpportunityStageInput
) {
  return write<{ opportunityId: string; stage: string; status: string }>(
    `/api/team-os/crm/sales/opportunities/${encodeURIComponent(opportunityId)}/stage`,
    "POST",
    input
  );
}

export function fetchCrmContracts(filters: {
  q?: string;
  status?: string;
  teamId?: string;
  customerId?: string;
  limit?: number;
} = {}) {
  return readResponse<CrmListResult<CrmContractRecord>>(
    fetch(`/api/team-os/crm/sales/contracts?${query({ ...filters, limit: filters.limit ?? 50 })}`, {
      cache: "no-store"
    })
  );
}

export function createCrmContract(input: CreateCrmContractInput) {
  return write<{ contractId: string }>("/api/team-os/crm/sales/contracts", "POST", input);
}

export function changeCrmContractStatus(
  contractId: string,
  input: ChangeCrmContractStatusInput
) {
  return write<{ contractId: string; status: string }>(
    `/api/team-os/crm/sales/contracts/${encodeURIComponent(contractId)}/status`,
    "PATCH",
    input
  );
}

export function fetchCrmReceivables(filters: {
  q?: string;
  status?: string;
  teamId?: string;
  customerId?: string;
  contractId?: string;
  overdueOnly?: boolean;
  limit?: number;
} = {}) {
  return readResponse<CrmListResult<CrmReceivableRecord>>(
    fetch(`/api/team-os/crm/sales/receivables?${query({ ...filters, limit: filters.limit ?? 50 })}`, {
      cache: "no-store"
    })
  );
}

export function createCrmReceivable(input: CreateCrmReceivableInput) {
  return write<{ receivableId: string }>("/api/team-os/crm/sales/receivables", "POST", input);
}

export function recordCrmPayment(receivableId: string, input: RecordCrmPaymentInput) {
  return write<{ receivableId: string; status: string; receivedAmount: string }>(
    `/api/team-os/crm/sales/receivables/${encodeURIComponent(receivableId)}/payment`,
    "POST",
    input
  );
}
