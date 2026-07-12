"use client";

import * as React from "react";
import type {
  TenantCompanyData,
  TenantSubscriptionData,
  TenantUsageData
} from "@/apps/team-os/features/tenant/types";
import {
  fetchTenantCompany,
  fetchTenantSubscription,
  fetchTenantUsage,
  TenantClientError
} from "@/apps/team-os/features/tenant/services/tenant-client";

type TenantFetcher<T> = (companyId?: string) => Promise<T>;

function normalizeError(error: unknown) {
  return error instanceof TenantClientError
    ? error
    : new TenantClientError(error instanceof Error ? error.message : "企业数据加载失败，请稍后重试。");
}

function useTenantResource<T>(fetcher: TenantFetcher<T>, initialCompanyId?: string) {
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<TenantClientError | null>(null);
  const requestRef = React.useRef(0);
  const initialCompanyIdRef = React.useRef(initialCompanyId);

  React.useEffect(() => {
    if (initialCompanyIdRef.current === initialCompanyId) return;
    initialCompanyIdRef.current = initialCompanyId;
    if (companyId === initialCompanyId) return;
    requestRef.current += 1;
    setData(null);
    setError(null);
    setLoading(true);
    setCompanyId(initialCompanyId);
  }, [companyId, initialCompanyId]);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const nextData = await fetcher(companyId);
      if (requestId === requestRef.current) setData(nextData);
    } catch (caught) {
      if (requestId === requestRef.current) setError(normalizeError(caught));
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [companyId, fetcher]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  const selectCompany = React.useCallback((nextCompanyId: string) => {
    if (nextCompanyId === companyId) return;
    requestRef.current += 1;
    setData(null);
    setError(null);
    setLoading(true);
    setCompanyId(nextCompanyId);
  }, [companyId]);

  return { data, loading, error, reload, companyId, selectCompany };
}

export function useTenantCompany(initialCompanyId?: string) {
  return useTenantResource<TenantCompanyData>(fetchTenantCompany, initialCompanyId);
}

export function useTenantSubscription(initialCompanyId?: string) {
  return useTenantResource<TenantSubscriptionData>(fetchTenantSubscription, initialCompanyId);
}

export function useTenantUsage(initialCompanyId?: string) {
  return useTenantResource<TenantUsageData>(fetchTenantUsage, initialCompanyId);
}
