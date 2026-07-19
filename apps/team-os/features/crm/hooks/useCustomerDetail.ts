"use client";

import * as React from "react";
import { fetchCustomerDetail } from "@/apps/team-os/features/crm/services/crm-client";
import type { CustomerDetailData } from "@/apps/team-os/features/crm/types";

export function useCustomerDetail(customerId: string) {
  const [data, setData] = React.useState<CustomerDetailData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const activeRequest = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++activeRequest.current;
    setLoading(true);
    setError(null);
    try {
      const nextData = await fetchCustomerDetail(customerId);
      if (requestId === activeRequest.current) setData(nextData);
    } catch (caught) {
      if (requestId === activeRequest.current) setError(caught instanceof Error ? caught.message : "客户详情加载失败。");
    } finally {
      if (requestId === activeRequest.current) setLoading(false);
    }
  }, [customerId]);

  React.useEffect(() => {
    void reload();
    return () => { activeRequest.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}
