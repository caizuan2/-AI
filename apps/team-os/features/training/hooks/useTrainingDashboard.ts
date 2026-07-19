"use client";

import * as React from "react";
import { fetchTrainingDashboard, TrainingClientError } from "@/apps/team-os/features/training/services/training-client";
import type { TrainingDashboardData } from "@/apps/team-os/features/training/types";

function normalizeError(error: unknown) {
  return error instanceof TrainingClientError
    ? error
    : new TrainingClientError(error instanceof Error ? error.message : "培训首页加载失败。");
}

export function useTrainingDashboard(companyId?: string) {
  const [data, setData] = React.useState<TrainingDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<TrainingClientError | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchTrainingDashboard(companyId);
      if (requestId === requestRef.current) setData(next);
    } catch (caught) {
      if (requestId === requestRef.current) setError(normalizeError(caught));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [companyId]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}
