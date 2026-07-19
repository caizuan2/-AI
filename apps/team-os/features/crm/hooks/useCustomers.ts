"use client";

import * as React from "react";
import { fetchCustomers } from "@/apps/team-os/features/crm/services/crm-client";
import type { CustomerListData, CustomerListFilters } from "@/apps/team-os/features/crm/types";

const PAGE_SIZE = 30;

export type CrmListFilterState = Omit<CustomerListFilters, "cursor" | "limit">;

export function useCustomers(filters: CrmListFilterState) {
  const [data, setData] = React.useState<CustomerListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const activeRequest = React.useRef(0);
  const loadingMoreRef = React.useRef(false);
  const filterKey = JSON.stringify(filters);

  const reload = React.useCallback(async () => {
    const requestId = ++activeRequest.current;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const nextData = await fetchCustomers({ ...filters, limit: PAGE_SIZE });
      if (requestId === activeRequest.current) setData(nextData);
    } catch (caught) {
      if (requestId === activeRequest.current) setError(caught instanceof Error ? caught.message : "客户列表加载失败。");
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
  // filterKey is the stable request identity; individual filter values are serialized into it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  React.useEffect(() => {
    void reload();
    return () => { activeRequest.current += 1; };
  }, [reload]);

  const loadMore = React.useCallback(async () => {
    if (!data?.nextCursor || loadingMoreRef.current) return;
    const requestId = activeRequest.current;
    const expectedFilterKey = filterKey;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setError(null);
    try {
      const nextData = await fetchCustomers({ ...filters, cursor: data.nextCursor, limit: PAGE_SIZE });
      if (requestId === activeRequest.current && expectedFilterKey === filterKey) {
        setData((current) => current ? {
          ...nextData,
          items: [...current.items, ...nextData.items.filter((item) => !current.items.some((existing) => existing.id === item.id))]
        } : nextData);
      }
    } catch (caught) {
      if (requestId === activeRequest.current) setError(caught instanceof Error ? caught.message : "更多客户加载失败。");
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [data, filterKey, filters]);

  return { data, loading, loadingMore, error, reload, loadMore };
}
