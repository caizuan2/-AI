"use client";

import * as React from "react";
import { fetchOrganization } from "@/apps/team-os/features/organization/services/organization-client";
import type { OrganizationOverview } from "@/apps/team-os/features/organization/types";

const EMPTY_ORGANIZATION: OrganizationOverview = {
  companyId: null,
  companyName: null,
  companyIds: [],
  companies: [],
  ownerCompanyIds: [],
  teams: [],
  canBootstrap: false,
  canCreateTeam: false,
  accessState: "UNASSIGNED"
};

export function useOrganization(initialCompanyId?: string) {
  const [data, setData] = React.useState<OrganizationOverview>(EMPTY_ORGANIZATION);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = React.useState<string | null>(initialCompanyId ?? null);
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
      if (nextCompanyId !== selectedCompanyId) {
        selectCompany(nextCompanyId);
      }
    }
  }, [initialCompanyId, selectCompany, selectedCompanyId]);

  const reload = React.useCallback(async () => {
    const requestId = ++activeRequest.current;
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchOrganization(selectedCompanyId);
      if (requestId === activeRequest.current) {
        setData(nextData);
      }
    } catch (caught) {
      if (requestId === activeRequest.current) {
        setError(caught instanceof Error ? caught.message : "组织信息加载失败。");
      }
    } finally {
      if (requestId === activeRequest.current) {
        setLoading(false);
      }
    }
  }, [selectedCompanyId]);

  React.useEffect(() => {
    void reload();
    return () => {
      activeRequest.current += 1;
    };
  }, [reload]);

  return { data, loading, error, reload, selectedCompanyId, selectCompany };
}
