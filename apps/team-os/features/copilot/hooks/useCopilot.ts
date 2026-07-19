"use client";

import * as React from "react";
import type {
  CopilotAssistantRole,
  CopilotDashboardData,
  CopilotInsightsData
} from "@/apps/team-os/features/copilot/types";
import {
  CopilotClientError,
  fetchCopilotDashboard,
  fetchCopilotInsights,
  syncCopilotInsights
} from "@/apps/team-os/features/copilot/services/copilot-client";

function normalizeError(error: unknown) {
  return error instanceof CopilotClientError
    ? error
    : new CopilotClientError(error instanceof Error ? error.message : "AI 助手加载失败，请稍后重试。");
}

export function useCopilotDashboard(role: CopilotAssistantRole, companyId?: string) {
  const [data, setData] = React.useState<CopilotDashboardData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<CopilotClientError | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchCopilotDashboard(role, companyId);
      if (requestId === requestRef.current) setData(next);
    } catch (caught) {
      if (requestId === requestRef.current) {
        setData(null);
        setError(normalizeError(caught));
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [companyId, role]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  React.useEffect(() => {
    if (!data || typeof window === "undefined") return;
    const day = new Date().toISOString().slice(0, 10);
    const key = `team-os-copilot-sync:${role}:${data.context.companyId}:${day}`;
    if (window.localStorage.getItem(key) === "done") return;
    let active = true;
    setSyncing(true);
    void syncCopilotInsights({ assistantRole: role, companyId: data.context.companyId })
      .then(() => {
        if (active) window.localStorage.setItem(key, "done");
      })
      .catch(() => undefined)
      .finally(() => { if (active) setSyncing(false); });
    return () => { active = false; };
  }, [data, role]);

  return { data, loading, error, syncing, reload };
}

export function useCopilotInsights(role: CopilotAssistantRole, companyId?: string) {
  const [data, setData] = React.useState<CopilotInsightsData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [error, setError] = React.useState<CopilotClientError | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchCopilotInsights({ assistantRole: role, companyId }));
    } catch (caught) {
      setData(null);
      setError(normalizeError(caught));
    } finally {
      setLoading(false);
    }
  }, [companyId, role]);

  const sync = React.useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncCopilotInsights({ assistantRole: role, companyId });
      await reload();
    } catch (caught) {
      setError(normalizeError(caught));
    } finally {
      setSyncing(false);
    }
  }, [companyId, reload, role]);

  React.useEffect(() => { void reload(); }, [reload]);

  return { data, loading, syncing, error, reload, sync };
}
