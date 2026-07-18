"use client";

import * as React from "react";
import type {
  AiBrainDashboardData,
  AiBrainFeedbackData,
  AiBrainOptimizationData,
  KnowledgeCandidateSourceType,
  KnowledgeCandidateStatus
} from "@/apps/team-os/features/ai-brain/types";
import {
  AiBrainClientError,
  fetchAiBrainCandidates,
  fetchAiBrainFeedback,
  fetchAiBrainOptimizations
} from "@/apps/team-os/features/ai-brain/services/ai-brain-client";

function normalizeError(error: unknown) {
  return error instanceof AiBrainClientError
    ? error
    : new AiBrainClientError(error instanceof Error ? error.message : "AI Brain 数据加载失败，请稍后重试。");
}

function useAiBrainResource<T>(loader: () => Promise<T>) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<AiBrainClientError | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loader();
      if (requestRef.current === requestId) setData(next);
    } catch (caught) {
      if (requestRef.current === requestId) setError(normalizeError(caught));
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [loader]);

  React.useEffect(() => {
    setData(null);
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}

export function useAiBrainDashboard(companyId?: string) {
  const loader = React.useCallback(
    () => fetchAiBrainCandidates({ companyId, limit: 6 }),
    [companyId]
  );
  return useAiBrainResource<AiBrainDashboardData>(loader);
}

export function useAiBrainCandidates(input: {
  companyId?: string;
  status?: KnowledgeCandidateStatus;
  sourceType?: KnowledgeCandidateSourceType;
}) {
  const { companyId, sourceType, status } = input;
  const loader = React.useCallback(
    () => fetchAiBrainCandidates({ companyId, sourceType, status, limit: 100 }),
    [companyId, sourceType, status]
  );
  return useAiBrainResource<AiBrainDashboardData>(loader);
}

export function useAiBrainFeedback(companyId?: string) {
  const loader = React.useCallback(() => fetchAiBrainFeedback(companyId), [companyId]);
  return useAiBrainResource<AiBrainFeedbackData>(loader);
}

export function useAiBrainOptimizations(companyId?: string) {
  const loader = React.useCallback(() => fetchAiBrainOptimizations(companyId), [companyId]);
  return useAiBrainResource<AiBrainOptimizationData>(loader);
}
