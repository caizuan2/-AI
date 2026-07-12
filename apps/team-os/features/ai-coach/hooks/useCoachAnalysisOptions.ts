"use client";

import * as React from "react";
import { fetchCoachAnalysisOptions } from "@/apps/team-os/features/ai-coach/services/ai-coach-client";
import type { CoachAnalysisOptions } from "@/apps/team-os/features/ai-coach/types";

const EMPTY_OPTIONS: CoachAnalysisOptions = { employee: { id: "", name: "" }, teams: [], submissions: [], providers: [] };

export function useCoachAnalysisOptions() {
  const [data, setData] = React.useState<CoachAnalysisOptions>(EMPTY_OPTIONS);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchCoachAnalysisOptions();
      if (requestId === requestIdRef.current) setData(nextData);
    } catch (caught) {
      if (requestId === requestIdRef.current) setError(caught instanceof Error ? caught.message : "分析选项加载失败。");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
    return () => { requestIdRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}
