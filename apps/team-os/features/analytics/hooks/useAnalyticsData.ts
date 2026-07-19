"use client";

import * as React from "react";
import type {
  AiAnalyticsData,
  AnalyticsDashboardData,
  AnalyticsRangeDays,
  CrmAnalyticsData,
  TeamAnalyticsData,
  TrainingAnalyticsData
} from "@/apps/team-os/features/analytics/types";
import {
  AnalyticsClientError,
  fetchAiAnalytics,
  fetchAnalyticsDashboard,
  fetchCrmAnalytics,
  fetchTeamAnalytics,
  fetchTrainingAnalytics
} from "@/apps/team-os/features/analytics/services/analytics-client";

type AnalyticsFetcher<T> = (query: { companyId?: string; days: AnalyticsRangeDays }) => Promise<T>;

function normalizeError(error: unknown) {
  return error instanceof AnalyticsClientError
    ? error
    : new AnalyticsClientError(error instanceof Error ? error.message : "数据加载失败，请稍后重试。");
}

function useAnalyticsResource<T>(
  fetcher: AnalyticsFetcher<T>,
  companyId: string | undefined,
  days: AnalyticsRangeDays
) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<AnalyticsClientError | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const nextData = await fetcher({ companyId, days });
      if (requestId === requestRef.current) setData(nextData);
    } catch (caught) {
      if (requestId === requestRef.current) setError(normalizeError(caught));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [companyId, days, fetcher]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}

export function useAnalyticsDashboard(companyId: string | undefined, days: AnalyticsRangeDays) {
  return useAnalyticsResource<AnalyticsDashboardData>(fetchAnalyticsDashboard, companyId, days);
}

export function useTeamAnalytics(companyId: string | undefined, days: AnalyticsRangeDays) {
  return useAnalyticsResource<TeamAnalyticsData>(fetchTeamAnalytics, companyId, days);
}

export function useCrmAnalytics(companyId: string | undefined, days: AnalyticsRangeDays) {
  return useAnalyticsResource<CrmAnalyticsData>(fetchCrmAnalytics, companyId, days);
}

export function useTrainingAnalytics(companyId: string | undefined, days: AnalyticsRangeDays) {
  return useAnalyticsResource<TrainingAnalyticsData>(fetchTrainingAnalytics, companyId, days);
}

export function useAiAnalytics(companyId: string | undefined, days: AnalyticsRangeDays) {
  return useAnalyticsResource<AiAnalyticsData>(fetchAiAnalytics, companyId, days);
}
