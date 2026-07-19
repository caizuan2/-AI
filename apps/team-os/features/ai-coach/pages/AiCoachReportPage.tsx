"use client";

import { AiCoachSectionNavigation } from "@/apps/team-os/features/ai-coach/components/AiCoachSectionNavigation";
import { AiCoachErrorState, AiCoachLoadingState } from "@/apps/team-os/features/ai-coach/components/AiCoachState";
import { GrowthReportView } from "@/apps/team-os/features/ai-coach/components/GrowthReportView";
import { useCoachReport } from "@/apps/team-os/features/ai-coach/hooks/useCoachReport";

export function AiCoachReportPage({ reportId }: { reportId: string }) {
  const { data, loading, error, reload } = useCoachReport(reportId);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <AiCoachSectionNavigation />
      {loading ? <AiCoachLoadingState label="正在读取成长报告…" /> : error ? <AiCoachErrorState message={error} onRetry={() => void reload()} /> : data ? <GrowthReportView report={data} /> : null}
    </div>
  );
}
