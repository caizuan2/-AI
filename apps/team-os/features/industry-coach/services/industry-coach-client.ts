import type {
  CoachRuleRecord,
  CoachRulesData,
  CreateCoachRuleInput,
  CreateIndustryStandardInput,
  IndustryStandardRecord,
  IndustryStandardsData
} from "@/apps/team-os/features/industry-coach/types";

type ApiEnvelope<T> = {
  success?: boolean;
  data?: T;
  message?: string;
  error?: { message?: string };
};

async function readResponse<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T>;
  try {
    body = await response.json() as ApiEnvelope<T>;
  } catch {
    throw new Error("接口返回格式不正确，请稍后重试。");
  }

  if (!response.ok || body.success !== true || !("data" in body)) {
    throw new Error(body.message || body.error?.message || "请求失败，请稍后重试。");
  }

  return body.data as T;
}

function companyQuery(companyId?: string | null) {
  return companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
}

export async function fetchIndustryStandards(companyId?: string | null): Promise<IndustryStandardsData> {
  return readResponse<IndustryStandardsData>(await fetch(
    `/api/team-os/industry-coach/standards${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}

export async function createIndustryStandard(input: CreateIndustryStandardInput): Promise<IndustryStandardRecord> {
  const data = await readResponse<{ standard: IndustryStandardRecord }>(await fetch("/api/team-os/industry-coach/standards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.standard;
}

export async function fetchCoachRules(companyId?: string | null): Promise<CoachRulesData> {
  return readResponse<CoachRulesData>(await fetch(
    `/api/team-os/industry-coach/rules${companyQuery(companyId)}`,
    { cache: "no-store" }
  ));
}

export async function createCoachRule(input: CreateCoachRuleInput): Promise<CoachRuleRecord> {
  const data = await readResponse<{ rule: CoachRuleRecord }>(await fetch("/api/team-os/industry-coach/rules", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
  return data.rule;
}
