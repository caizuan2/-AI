"use client";

import * as React from "react";
import { fetchTrainingCourses, TrainingClientError } from "@/apps/team-os/features/training/services/training-client";
import type { TrainingCourseListData, TrainingCourseListFilters } from "@/apps/team-os/features/training/types";

export function useTrainingCourses(filters: TrainingCourseListFilters) {
  const [data, setData] = React.useState<TrainingCourseListData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<TrainingClientError | null>(null);
  const requestRef = React.useRef(0);
  const filterKey = JSON.stringify(filters);

  const reload = React.useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const next = await fetchTrainingCourses(filters);
      if (requestId === requestRef.current) setData(next);
    } catch (caught) {
      if (requestId === requestRef.current) {
        setError(caught instanceof TrainingClientError
          ? caught
          : new TrainingClientError(caught instanceof Error ? caught.message : "课程列表加载失败。"));
      }
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  // filterKey is the stable request identity for the serialized filter object.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  React.useEffect(() => {
    void reload();
    return () => { requestRef.current += 1; };
  }, [reload]);

  return { data, loading, error, reload };
}
