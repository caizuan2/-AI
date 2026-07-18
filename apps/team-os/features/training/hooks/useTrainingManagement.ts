"use client";

import * as React from "react";
import { fetchTrainingManagement, TrainingClientError } from "@/apps/team-os/features/training/services/training-client";
import type { TrainingManagementData } from "@/apps/team-os/features/training/types";

export function useTrainingManagement(companyId?: string) {
  const [data, setData] = React.useState<TrainingManagementData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<TrainingClientError | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchTrainingManagement(companyId);
      if (requestId === requestRef.current) setData(next);
    } catch (caught) {
      if (requestId === requestRef.current) {
        setError(caught instanceof TrainingClientError
          ? caught
          : new TrainingClientError(caught instanceof Error ? caught.message : "培训管理数据加载失败。"));
      }
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
