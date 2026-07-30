import type {
  CreateExpertCatalogAgentInput,
  CreateExpertCatalogZoneInput,
  ExpertCatalogAgent,
  ExpertCatalogSnapshot,
  ExpertCatalogZone,
  UpdateExpertCatalogAgentInput,
  UpdateExpertCatalogZoneInput
} from "@/types/super-admin-expert-catalog";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
  };
};

async function requestCatalog<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const payload = await response.json() as ApiEnvelope<T>;

  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message || "目录操作失败，请稍后重试。");
  }

  return payload.data;
}

export function getExpertCatalogClient() {
  return requestCatalog<ExpertCatalogSnapshot>("/api/super-admin/expert-catalog");
}

export function createExpertCatalogAgentClient(input: CreateExpertCatalogAgentInput) {
  return requestCatalog<ExpertCatalogAgent>("/api/super-admin/expert-catalog/agents", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateExpertCatalogAgentClient(
  agentKey: string,
  input: UpdateExpertCatalogAgentInput
) {
  return requestCatalog<ExpertCatalogAgent>(
    `/api/super-admin/expert-catalog/agents/${encodeURIComponent(agentKey)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
}

export function archiveExpertCatalogAgentClient(agentKey: string) {
  return requestCatalog<ExpertCatalogAgent>(
    `/api/super-admin/expert-catalog/agents/${encodeURIComponent(agentKey)}`,
    {
      method: "DELETE"
    }
  );
}

export function createExpertCatalogZoneClient(input: CreateExpertCatalogZoneInput) {
  return requestCatalog<ExpertCatalogZone>("/api/super-admin/expert-catalog/zones", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateExpertCatalogZoneClient(
  zoneKey: string,
  input: UpdateExpertCatalogZoneInput
) {
  return requestCatalog<ExpertCatalogZone>(
    `/api/super-admin/expert-catalog/zones/${encodeURIComponent(zoneKey)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input)
    }
  );
}

export function archiveExpertCatalogZoneClient(zoneKey: string) {
  return requestCatalog<ExpertCatalogZone>(
    `/api/super-admin/expert-catalog/zones/${encodeURIComponent(zoneKey)}`,
    {
      method: "DELETE"
    }
  );
}
