"use client";

import * as React from "react";
import { fetchTasks } from "@/apps/team-os/features/tasks/services/task-client";
import type { TaskListData, TaskListScope } from "@/apps/team-os/features/tasks/types";

const EMPTY_DATA: TaskListData = { tasks: [], teams: [] };

export function useTasks(scope: TaskListScope) {
  const [data, setData] = React.useState<TaskListData>(EMPTY_DATA);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      setData(await fetchTasks(scope));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "任务加载失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  return { data, loading, error, reload };
}
