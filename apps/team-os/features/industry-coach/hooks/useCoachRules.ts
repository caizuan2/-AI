"use client";

import * as React from "react";
import { fetchCoachRules } from "@/apps/team-os/features/industry-coach/services/industry-coach-client";
import type { CoachRulesData } from "@/apps/team-os/features/industry-coach/types";

export function useCoachRules(initialCompanyId?: string) {
  const [data, setData] = React.useState<CoachRulesData | null>(null);
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
      const nextData = await fetchCoachRules(selectedCompanyId);
      if (requestId === activeRequest.current) setData(nextData);
    } catch (caught) {
      if (requestId === activeRequest.current) setError(caught instanceof Error ? caught.message : "评分规则加载失败。");
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
