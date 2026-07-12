"use client";

import Link from "next/link";
import { AiCoachSectionNavigation } from "@/apps/team-os/features/ai-coach/components/AiCoachSectionNavigation";
import { AiCoachEmptyState, AiCoachErrorState, AiCoachLoadingState } from "@/apps/team-os/features/ai-coach/components/AiCoachState";
import { ConversationAnalysisForm } from "@/apps/team-os/features/ai-coach/components/ConversationAnalysisForm";
import { useCoachAnalysisOptions } from "@/apps/team-os/features/ai-coach/hooks/useCoachAnalysisOptions";

export function AiCoachAnalyzePage() {
  const { data, loading, error, reload } = useCoachAnalysisOptions();

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div><p className="text-sm font-medium text-indigo-700">AI 员工教练系统</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">客户沟通分析</h1><p className="mt-2 text-sm leading-6 text-slate-600">员工提交自己的沟通记录，系统生成每日成长报告。</p></div>
      <AiCoachSectionNavigation />
      {loading ? <AiCoachLoadingState label="正在准备分析选项…" /> : error ? <AiCoachErrorState message={error} onRetry={() => void reload()} /> : data.teams.length === 0 ? (
        <AiCoachEmptyState title="没有可分析的团队" description="当前账号没有启用中的团队成员身份。" action={<Link href="/team-os/organization" className="focus-ring inline-flex h-10 items-center rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white">前往组织管理</Link>} />
      ) : <ConversationAnalysisForm options={data} />}
    </div>
  );
}
