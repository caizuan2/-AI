"use client";

import { AiCoachSectionNavigation } from "@/apps/team-os/features/ai-coach/components/AiCoachSectionNavigation";
import { AiCoachEmptyState, AiCoachErrorState, AiCoachLoadingState } from "@/apps/team-os/features/ai-coach/components/AiCoachState";
import { CoachTeamSelector } from "@/apps/team-os/features/ai-coach/components/CoachTeamSelector";
import { TeamAnalysisList } from "@/apps/team-os/features/ai-coach/components/TeamAnalysisList";
import { useCoachDashboard } from "@/apps/team-os/features/ai-coach/hooks/useCoachDashboard";

export function AiCoachTeamPage() {
  const { data, loading, error, reload, selectTeam, activeTeamId } = useCoachDashboard();
  const viewableTeams = data.teams.filter((team) => team.canViewTeam);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div><p className="text-sm font-medium text-indigo-700">AI 员工教练系统</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">团队成长看板</h1><p className="mt-2 text-sm leading-6 text-slate-600">主管和培训师查看成员今日评分、主要问题与训练建议。</p></div>
      <AiCoachSectionNavigation />
      <CoachTeamSelector teams={viewableTeams} value={activeTeamId} disabled={loading} onChange={selectTeam} />
      {loading ? <AiCoachLoadingState /> : error ? <AiCoachErrorState message={error} onRetry={() => void reload()} /> : data.teams.length === 0 ? (
        <AiCoachEmptyState title="尚未加入可用团队" description="请先完成组织成员配置。" />
      ) : !data.canViewTeam ? (
        <AiCoachEmptyState title="当前角色仅可查看本人报告" description="团队成长看板向企业负责人、团队主管和培训师开放。" />
      ) : data.members.length === 0 ? (
        <AiCoachEmptyState title="团队暂无成员" description="请先在组织管理中添加成员。" />
      ) : <TeamAnalysisList members={data.members} />}
    </div>
  );
}
