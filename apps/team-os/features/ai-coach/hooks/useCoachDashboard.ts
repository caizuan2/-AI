"use client";

import * as React from "react";
import { fetchCoachDashboard } from "@/apps/team-os/features/ai-coach/services/ai-coach-client";
import type { CoachDashboardData } from "@/apps/team-os/features/ai-coach/types";

const EMPTY_DASHBOARD: CoachDashboardData = {
  date: "",
  selectedTeamId: null,
  teams: [],
  canViewTeam: false,
  analyzedCount: 0,
  averageScore: 0,
  rankings: [],
  problemStats: [],
  members: []
};

export function useCoachDashboard() {
  const [data, setData] = React.useState<CoachDashboardData>(EMPTY_DASHBOARD);
  const [selectedTeamId, setSelectedTeamId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const requestIdRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchCoachDashboard(selectedTeamId);
      if (requestId === requestIdRef.current) setData(nextData);
    } catch (caught) {
      if (requestId === requestIdRef.current) setError(caught instanceof Error ? caught.message : "AI 教练数据加载失败。");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [selectedTeamId]);

  React.useEffect(() => {
    void reload();
    return () => { requestIdRef.current += 1; };
  }, [reload]);

  const selectTeam = React.useCallback((teamId: string) => {
    requestIdRef.current += 1;
    setLoading(true);
    setError(null);
    setSelectedTeamId(teamId);
  }, []);

  return {
    data,
    loading,
    error,
    reload,
    selectTeam,
    activeTeamId: selectedTeamId ?? data.selectedTeamId
  };
}
