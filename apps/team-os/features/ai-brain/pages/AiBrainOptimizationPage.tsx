"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lightbulb, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiBrainPageHeader } from "@/apps/team-os/features/ai-brain/components/AiBrainPageHeader";
import { AiBrainSectionNavigation } from "@/apps/team-os/features/ai-brain/components/AiBrainSectionNavigation";
import { AiBrainErrorState, AiBrainForbiddenState, AiBrainLoadingState } from "@/apps/team-os/features/ai-brain/components/AiBrainState";
import { KnowledgeOptimizationList } from "@/apps/team-os/features/ai-brain/components/KnowledgeOptimizationList";
import { useAiBrainOptimizations } from "@/apps/team-os/features/ai-brain/hooks/useAiBrainData";
import { AiBrainClientError, generateAiBrainOptimizations } from "@/apps/team-os/features/ai-brain/services/ai-brain-client";

export function AiBrainOptimizationPage({ initialCompanyId }: { initialCompanyId?: string }) {
  const router = useRouter();
  const [companyId, setCompanyId] = React.useState(initialCompanyId);
  const resource = useAiBrainOptimizations(companyId);
  const data = resource.data;
  const [generating, setGenerating] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    router.replace(`/team-os/ai-brain/optimization?companyId=${encodeURIComponent(nextCompanyId)}`, { scroll: false });
  }

  async function generate() {
    if (!data || data.context.permissionLevel !== "OWNER") return;
    setGenerating(true);
    setActionError(null);
    setNotice(null);
    try {
      const result = await generateAiBrainOptimizations({ companyId: data.context.companyId });
      setNotice(result.upstream?.status === "unavailable"
        ? `已生成 ${result.generatedCount ?? 0} 条本地优化建议；现有知识库优化服务暂不可用，本次未读取或修改知识库。${result.upstream.message ? ` ${result.upstream.message}` : ""}`
        : `优化分析已完成，新增 ${result.generatedCount ?? 0} 条建议。`);
      await resource.reload();
    } catch (caught) {
      setActionError(caught instanceof AiBrainClientError ? caught.message : "优化分析失败，请稍后重试。");
    } finally {
      setGenerating(false);
    }
  }

  const owner = data?.context.permissionLevel === "OWNER";
  const forbidden = resource.error?.code === "FORBIDDEN";
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <AiBrainPageHeader
        eyebrow="Knowledge Optimization"
        title="知识优化中心"
        description="基于明确的错误回答、知识缺口和可用知识信号生成建议；不直接修改知识库内容。"
        context={data?.context}
        onCompanyChange={changeCompany}
        actions={owner ? <Button className="h-11" onClick={() => void generate()} disabled={generating}>{generating ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lightbulb className="h-4 w-4" aria-hidden="true" />}{generating ? "分析中…" : "生成优化建议"}</Button> : undefined}
      />

      {resource.loading && !data ? <AiBrainLoadingState /> : forbidden && !data ? <AiBrainForbiddenState description="知识优化涉及企业级知识质量信号，仅企业负责人可以进入此页面并触发分析。" /> : resource.error && !data ? <AiBrainErrorState message={resource.error.message} onRetry={() => void resource.reload()} /> : data ? (
        <>
          <AiBrainSectionNavigation context={data.context} />
          {!owner ? <AiBrainForbiddenState description="团队主管和培训师可以查看自己范围内的候选知识，但企业级知识优化仅由企业负责人执行。" /> : (
            <>
              {resource.error ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800" role="alert">刷新失败，当前继续展示上一次成功加载的数据：{resource.error.message}</div> : null}
              {actionError ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">{actionError}</div> : null}
              {notice ? <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />{notice}</div> : null}
              <KnowledgeOptimizationList context={data.context} items={data.items} />
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
