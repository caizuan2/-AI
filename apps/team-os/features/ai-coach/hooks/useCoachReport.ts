"use client";

import * as React from "react";
import { fetchCoachReport } from "@/apps/team-os/features/ai-coach/services/ai-coach-client";
import type { CoachReport } from "@/apps/team-os/features/ai-coach/types";

export function useCoachReport(reportId: string) {
  const [data, setData] = React.useState<CoachReport | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchCoachReport(reportId);
      if (requestId === requestIdRef.current) setData(nextData);
    } catch (caught) {
      if (requestId === requestIdRef.current) setError(caught instanceof Error ? caught.message : "成长报告加载失败。");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [reportId]);

  React.useEffect(() => {
    void reload();
    return () => { requestIdRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}
