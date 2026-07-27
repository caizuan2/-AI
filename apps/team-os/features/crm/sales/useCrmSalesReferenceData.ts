"use client";

import * as React from "react";
import { fetchCustomers } from "@/apps/team-os/features/crm/services/crm-client";
import type { CustomerListData } from "@/apps/team-os/features/crm/types";

export function useCrmSalesReferenceData() {
  const [data, setData] = React.useState<CustomerListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async (teamId?: string) => {
    setLoading(true);
    setError("");
    try {
      const next = await fetchCustomers({ teamId, limit: 50 });
      setData(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "CRM 团队与客户数据加载失败。");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const selectTeam = React.useCallback(async (teamId: string) => {
    await load(teamId);
  }, [load]);

  return {
    data,
    context: data?.context,
    customers: data?.items ?? [],
    selectedTeamId: data?.context.selectedTeamId,
    loading,
    error,
    reload: load,
    selectTeam
  };
}
