"use client";

import type { KnowledgeOSCoreState } from "@/lib/enterprise/knowledge-os-core-types";

export type KnowledgeOSFetchStatus = "ok" | "unauthenticated" | "forbidden" | "not_found" | "error";

export type KnowledgeOSApiResult<T> = {
  ok: boolean;
  status: KnowledgeOSFetchStatus;
  httpStatus: number;
  data: T | null;
  message: string;
};

export type KnowledgeOSRiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type KnowledgeOSReadiness = "ready" | "warning" | "blocked" | "unknown";

export type KnowledgeOSHealthTarget = {
  id?: string;
  name?: string;
  agentId?: string;
  knowledgeBaseId?: string;
  namespace?: string;
  chunkCount?: number;
  knowledgeBaseCount?: number;
  healthScore?: number;
  riskIndex?: number;
  riskLevel?: KnowledgeOSRiskLevel;
  readiness?: KnowledgeOSReadiness;
  highRiskCount?: number;
  reviewRequiredCount?: number;
  lowQualityCount?: number;
  highValueCount?: number;
  unknownMetadataCount?: number;
  latestUpdatedAt?: string | null;
};

export type KnowledgeOSReleaseResponse = {
  ok?: boolean;
  success?: boolean;
  releaseReadiness?: KnowledgeOSReadiness;
  systemHealthScore?: number;
  ragHealthScore?: number;
  agentHealthScore?: number;
  knowledgeBaseHealthScore?: number;
  policyHealthScore?: number;
  lifecycleHealthScore?: number;
  trendHealthScore?: number;
  feedbackHealthScore?: number;
  behaviorHealthScore?: number;
  riskIndex?: number;
  riskLevel?: KnowledgeOSRiskLevel;
  summary?: {
    totalChunks?: number;
    totalAgents?: number;
    totalKnowledgeBases?: number;
    highRiskCount?: number;
    criticalRiskCount?: number;
    reviewRequiredCount?: number;
    lowQualityCount?: number;
    unknownMetadataCount?: number;
    archiveCandidateCount?: number;
    blockedAutoActionCount?: number;
  };
  agents?: KnowledgeOSHealthTarget[];
  knowledgeBases?: KnowledgeOSHealthTarget[];
  distributions?: {
    policy?: Record<string, number>;
    lifecycle?: Record<string, number>;
    trend?: Record<string, number>;
  };
  recommendations?: Array<{
    type?: string;
    severity?: string;
    message?: string;
    agentId?: string;
    knowledgeBaseId?: string;
    namespace?: string;
    score?: number;
  }>;
  shadowMode?: boolean;
  dataQuality?: string;
  diagnostics?: Record<string, unknown>;
};

export type KnowledgeOSGenericAnalysisResponse = {
  ok?: boolean;
  success?: boolean;
  summary?: Record<string, unknown>;
  release?: Pick<
    KnowledgeOSReleaseResponse,
    "releaseReadiness" | "systemHealthScore" | "ragHealthScore" | "agentHealthScore" | "knowledgeBaseHealthScore" | "riskIndex" | "riskLevel" | "shadowMode"
  >;
  diagnostics?: Record<string, unknown>;
};

export type KnowledgeOSDashboardData = {
  dataCore: KnowledgeOSApiResult<KnowledgeOSCoreState>;
  release: KnowledgeOSApiResult<KnowledgeOSReleaseResponse>;
  policy: KnowledgeOSApiResult<KnowledgeOSGenericAnalysisResponse>;
  lifecycle: KnowledgeOSApiResult<KnowledgeOSGenericAnalysisResponse>;
  trends: KnowledgeOSApiResult<KnowledgeOSGenericAnalysisResponse>;
  optimize: KnowledgeOSApiResult<KnowledgeOSGenericAnalysisResponse>;
};

function friendlyStatus(status: number) {
  if (status === 401) {
    return { status: "unauthenticated" as const, message: "请先登录后查看 Knowledge OS 数据。" };
  }

  if (status === 403) {
    return { status: "forbidden" as const, message: "无权限查看 Knowledge OS 数据。" };
  }

  if (status === 404) {
    return { status: "not_found" as const, message: "接口未就绪。" };
  }

  return { status: "error" as const, message: "数据读取失败，请稍后重试。" };
}

async function fetchKnowledgeOSJson<T>(url: string): Promise<KnowledgeOSApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store"
    });
    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok) {
      const status = friendlyStatus(response.status);
      let message = status.message;

      if (contentType.includes("application/json")) {
        const body = await response.json().catch(() => null) as { message?: unknown; error?: unknown } | null;
        const bodyMessage = typeof body?.message === "string"
          ? body.message
          : typeof body?.error === "string"
            ? body.error
            : "";

        message = bodyMessage || message;
      }

      return {
        ok: false,
        status: status.status,
        httpStatus: response.status,
        data: null,
        message
      };
    }

    if (!contentType.includes("application/json")) {
      return {
        ok: false,
        status: "error",
        httpStatus: response.status,
        data: null,
        message: "接口返回非 JSON 内容，已安全忽略。"
      };
    }

    const data = await response.json() as T;

    return {
      ok: true,
      status: "ok",
      httpStatus: response.status,
      data,
      message: ""
    };
  } catch {
    return {
      ok: false,
      status: "error",
      httpStatus: 0,
      data: null,
      message: "网络请求失败，控制台已进入降级显示。"
    };
  }
}

export function fetchKnowledgeOSRelease() {
  return fetchKnowledgeOSJson<KnowledgeOSReleaseResponse>("/api/admin/knowledge/release");
}

export function fetchKnowledgeOSDataCore() {
  return fetchKnowledgeOSJson<KnowledgeOSCoreState>("/api/admin/knowledge/data-core");
}

export function fetchKnowledgeOSPolicy() {
  return fetchKnowledgeOSJson<KnowledgeOSGenericAnalysisResponse>("/api/admin/knowledge/policy");
}

export function fetchKnowledgeOSLifecycle() {
  return fetchKnowledgeOSJson<KnowledgeOSGenericAnalysisResponse>("/api/admin/knowledge/lifecycle");
}

export function fetchKnowledgeOSTrends() {
  return fetchKnowledgeOSJson<KnowledgeOSGenericAnalysisResponse>("/api/admin/knowledge/trends");
}

export function fetchKnowledgeOSOptimize() {
  return fetchKnowledgeOSJson<KnowledgeOSGenericAnalysisResponse>("/api/admin/knowledge/optimize");
}

function okResult<T>(data: T, message = ""): KnowledgeOSApiResult<T> {
  return {
    ok: true,
    status: "ok",
    httpStatus: 200,
    data,
    message
  };
}

function skippedResult<T>(message = "由 Data Core 统一提供。"): KnowledgeOSApiResult<T> {
  return {
    ok: true,
    status: "ok",
    httpStatus: 200,
    data: null,
    message
  };
}

function coreToRelease(core: KnowledgeOSCoreState): KnowledgeOSReleaseResponse {
  return {
    ok: core.success,
    success: core.success,
    releaseReadiness: core.releaseReadiness,
    systemHealthScore: core.systemHealthScore,
    ragHealthScore: core.ragHealthScore,
    agentHealthScore: core.agentHealthScore,
    knowledgeBaseHealthScore: core.knowledgeBaseHealthScore,
    policyHealthScore: core.policyHealthScore,
    lifecycleHealthScore: core.lifecycleHealthScore,
    trendHealthScore: core.trendHealthScore,
    feedbackHealthScore: core.feedbackHealthScore,
    behaviorHealthScore: core.behaviorHealthScore,
    riskIndex: core.riskIndex,
    riskLevel: core.riskLevel,
    summary: core.summary,
    agents: core.agents,
    knowledgeBases: core.knowledgeBases,
    distributions: core.distributions,
    recommendations: core.recommendations,
    shadowMode: core.diagnostics.shadowMode,
    dataQuality: core.dataQuality,
    diagnostics: core.diagnostics
  };
}

export async function fetchKnowledgeOSDashboard(): Promise<KnowledgeOSDashboardData> {
  const dataCore = await fetchKnowledgeOSDataCore();

  if (dataCore.ok && dataCore.data) {
    return {
      dataCore,
      release: okResult(coreToRelease(dataCore.data), "Data Core v4"),
      policy: skippedResult(),
      lifecycle: skippedResult(),
      trends: skippedResult(),
      optimize: skippedResult()
    };
  }

  const [release, policy, lifecycle, trends, optimize] = await Promise.all([
    fetchKnowledgeOSRelease(),
    fetchKnowledgeOSPolicy(),
    fetchKnowledgeOSLifecycle(),
    fetchKnowledgeOSTrends(),
    fetchKnowledgeOSOptimize()
  ]);

  return {
    dataCore,
    release,
    policy,
    lifecycle,
    trends,
    optimize
  };
}
