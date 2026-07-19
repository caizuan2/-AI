"use client";

import * as React from "react";
import type {
  WorkflowExecutionListData,
  WorkflowListData
} from "@/apps/team-os/features/workflow/types";
import {
  fetchWorkflowExecutions,
  fetchWorkflowList,
  WorkflowClientError
} from "@/apps/team-os/features/workflow/services/workflow-client";

function normalizeError(error: unknown) {
  return error instanceof WorkflowClientError
    ? error
    : new WorkflowClientError(error instanceof Error ? error.message : "工作流数据加载失败，请稍后重试。");
}

function useWorkflowResource<T>(loader: () => Promise<T>) {
  const [data, setData] = React.useState<T | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<WorkflowClientError | null>(null);
  const requestRef = React.useRef(0);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await loader();
      if (requestRef.current === requestId) setData(next);
    } catch (caught) {
      if (requestRef.current === requestId) {
        setData(null);
        setError(normalizeError(caught));
      }
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, [loader]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}

export function useWorkflowList(companyId?: string) {
  const loader = React.useCallback(() => fetchWorkflowList(companyId), [companyId]);
  return useWorkflowResource<WorkflowListData>(loader);
}

export function useWorkflowExecutions(companyId?: string, limit = 50) {
  const loader = React.useCallback(
    () => fetchWorkflowExecutions(companyId, limit),
    [companyId, limit]
  );
  return useWorkflowResource<WorkflowExecutionListData>(loader);
}
