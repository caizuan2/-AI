"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  message?: string;
  error?: {
    message?: string;
  };
}

interface TenantAnalytics {
  tenant: {
    id: string | null;
    name: string;
    plan: string;
    status: string;
  };
  summary: {
    knowledgeCount: number;
    trainingTotal: number;
    queryTotal: number;
    recentQueryHitRate: number;
    vectorCoverageRate: number;
    vectorPendingCount: number;
  };
}

async function readApiData<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok || !payload?.ok || !payload.data) {
    throw new Error(payload?.message ?? payload?.error?.message ?? "企业上下文加载失败。");
  }

  return payload.data;
}

export function IngestTenantSummary({ compact = false }: { compact?: boolean }) {
  const [analytics, setAnalytics] = useState<TenantAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("本地预览模式，登录后将同步企业知识库。");

  useEffect(() => {
    let cancelled = false;

    async function loadTenant() {
      try {
        const response = await fetch("/api/core/analytics", { cache: "no-store" });
        const data = await readApiData<TenantAnalytics>(response);

        if (!cancelled) {
          setAnalytics(data);
          setStatusMessage("本地预览模式，登录后将同步企业知识库。");
        }
      } catch {
        if (!cancelled) {
          setStatusMessage("本地预览模式，登录后将同步企业知识库。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadTenant();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl bg-[#f0f0ee] px-3 py-2 text-xs font-semibold text-[#777]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        企业空间加载中
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className="rounded-2xl bg-[#f1f1ef] px-3 py-2 text-xs font-medium text-[#777]">
        {statusMessage}
      </div>
    );
  }

  return (
    <div className={compact
      ? "flex items-center gap-2 rounded-2xl bg-[#f0f0ee] px-3 py-2 text-xs font-semibold text-[#555]"
      : "rounded-2xl border border-[#e7e7e4] bg-white px-3 py-2 text-xs text-[#555] shadow-sm"}
    >
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-[#128246]" aria-hidden="true" />
        <span className="font-semibold text-[#202020]">{analytics.tenant.name}</span>
        <span className="text-[#999]">{analytics.tenant.id ?? "ALL"}</span>
      </div>
      {!compact ? (
        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-[#777]">
          <span>知识 {analytics.summary.knowledgeCount}</span>
          <span>训练 {analytics.summary.trainingTotal}</span>
          <span>查询 {analytics.summary.queryTotal}</span>
          <span>命中率 {analytics.summary.recentQueryHitRate}%</span>
          <span>向量覆盖 {analytics.summary.vectorCoverageRate}%</span>
          <span>待索引 {analytics.summary.vectorPendingCount}</span>
        </div>
      ) : null}
    </div>
  );
}
