"use client";

import * as React from "react";
import { fetchTrainingRecommendations, TrainingClientError } from "@/apps/team-os/features/training/services/training-client";
import type { TrainingRecommendationData } from "@/apps/team-os/features/training/types";

export function useTrainingRecommendations(companyId?: string, enabled = true) {
  const [data, setData] = React.useState<TrainingRecommendationData | null>(null);
  const [loading, setLoading] = React.useState(enabled);
  const [error, setError] = React.useState<TrainingClientError | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchTrainingRecommendations(companyId);
      if (requestId === requestRef.current) setData(next);
    } catch (caught) {
      if (requestId === requestRef.current) {
        setError(caught instanceof TrainingClientError
          ? caught
          : new TrainingClientError(caught instanceof Error ? caught.message : "培训推荐生成失败。"));
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [companyId, enabled]);

  React.useEffect(() => {
    setData(null);
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}
