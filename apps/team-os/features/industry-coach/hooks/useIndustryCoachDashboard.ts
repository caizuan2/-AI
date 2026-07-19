"use client";

import * as React from "react";
import {
  fetchCoachRules,
  fetchIndustryStandards
} from "@/apps/team-os/features/industry-coach/services/industry-coach-client";
import type { CoachRulesData, IndustryStandardsData } from "@/apps/team-os/features/industry-coach/types";

interface IndustryCoachDashboardData {
  standards: IndustryStandardsData;
  rules: CoachRulesData;
}

export function useIndustryCoachDashboard(initialCompanyId?: string) {
  const [data, setData] = React.useState<IndustryCoachDashboardData | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string | null>(initialCompanyId ?? null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const activeRequest = React.useRef(0);
  const initialCompanyIdRef = React.useRef(initialCompanyId);

  const selectCompany = React.useCallback((companyId: string | null) => {
    activeRequest.current += 1;
    setLoading(true);
    setError(null);
    setSelectedCompanyId(companyId);
  }, []);

  React.useEffect(() => {
    if (initialCompanyIdRef.current !== initialCompanyId) {
      initialCompanyIdRef.current = initialCompanyId;
      const nextCompanyId = initialCompanyId ?? null;
      if (nextCompanyId !== selectedCompanyId) selectCompany(nextCompanyId);
    }
  }, [initialCompanyId, selectCompany, selectedCompanyId]);

  const reload = React.useCallback(async () => {
    const requestId = ++activeRequest.current;
    setLoading(true);
    setError(null);
    try {
      const [standards, rules] = await Promise.all([
        fetchIndustryStandards(selectedCompanyId),
        fetchCoachRules(selectedCompanyId)
      ]);
      if (requestId === activeRequest.current) setData({ standards, rules });
    } catch (caught) {
      if (requestId === activeRequest.current) setError(caught instanceof Error ? caught.message : "行业教练数据加载失败。");
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
  }, [selectedCompanyId]);

  React.useEffect(() => {
    void reload();
    return () => { activeRequest.current += 1; };
  }, [reload]);

  return { data, loading, error, reload, selectedCompanyId, selectCompany };
}
