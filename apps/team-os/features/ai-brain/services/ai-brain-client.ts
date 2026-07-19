import type {
  AiBrainApiError,
  AiBrainApiSuccess,
  AiBrainDashboardData,
  AiBrainFeedbackData,
  AiBrainOptimizationData,
  CreateKnowledgeFeedbackInput,
  ExtractKnowledgeInput,
  KnowledgeCandidateRecord,
  KnowledgeCandidateSourceType,
  KnowledgeCandidateStatus,
  KnowledgeFeedbackRecord,
  OptimizeKnowledgeInput,
  ReviewKnowledgeInput
} from "@/apps/team-os/features/ai-brain/types";

export class AiBrainClientError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "AiBrainClientError";
  }
}

export interface AiBrainOptimizationMutationData extends AiBrainOptimizationData {
  generatedCount?: number;
  upstream?: {
    status: "not-requested" | "available" | "unavailable";
    message?: string;
  };
}

export async function readAiBrainResponse<T>(responseValue: Response | Promise<Response>): Promise<T> {
  const response = await responseValue;
  let parsed: unknown;
  try {
    parsed = await response.json() as unknown;
  } catch {
    throw new AiBrainClientError("接口返回格式不正确，请稍后重试。");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AiBrainClientError("接口返回格式不正确，请稍后重试。");
  }
  const body = parsed as AiBrainApiSuccess<T> | AiBrainApiError;
  if (!response.ok || body.success !== true || !("data" in body)) {
    const error = body as AiBrainApiError;
    throw new AiBrainClientError(
      error.message || error.error?.message || "AI Brain 请求失败，请稍后重试。",
      error.code || error.error?.code
    );
  }
  return body.data;
}

function queryString(values: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function fetchAiBrainCandidates(input: {
  companyId?: string;
  status?: KnowledgeCandidateStatus;
  sourceType?: KnowledgeCandidateSourceType;
  limit?: number;
} = {}) {
  return readAiBrainResponse<AiBrainDashboardData>(fetch(
    `/api/team-os/ai-brain/candidates${queryString(input)}`,
    { cache: "no-store" }
  ));
}

export function fetchAiBrainFeedback(companyId?: string, limit = 100) {
  return readAiBrainResponse<AiBrainFeedbackData>(fetch(
    `/api/team-os/ai-brain/feedback${queryString({ companyId, limit })}`,
    { cache: "no-store" }
  ));
}

export function submitAiBrainFeedback(input: CreateKnowledgeFeedbackInput) {
  return readAiBrainResponse<KnowledgeFeedbackRecord>(fetch("/api/team-os/ai-brain/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function extractAiBrainKnowledge(input: ExtractKnowledgeInput) {
  return readAiBrainResponse<KnowledgeCandidateRecord>(fetch("/api/team-os/ai-brain/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function fetchAiBrainOptimizations(companyId?: string, limit = 100) {
  return readAiBrainResponse<AiBrainOptimizationData>(fetch(
    `/api/team-os/ai-brain/optimize${queryString({ companyId, limit })}`,
    { cache: "no-store" }
  ));
}

export function generateAiBrainOptimizations(input: OptimizeKnowledgeInput) {
  return readAiBrainResponse<AiBrainOptimizationMutationData>(fetch("/api/team-os/ai-brain/optimize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}

export function reviewAiBrainCandidate(input: ReviewKnowledgeInput) {
  return readAiBrainResponse<KnowledgeCandidateRecord>(fetch("/api/team-os/ai-brain/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  }));
}
