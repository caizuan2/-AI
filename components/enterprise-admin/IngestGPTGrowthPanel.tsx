"use client";

import { BarChart3, GitBranch, Leaf, RefreshCw, Route, Search, Sparkles, TrendingUp, type LucideIcon } from "lucide-react";
import type { GptOSRouteResult } from "@/lib/enterprise/gpt-os-agent-router";

export function IngestGPTGrowthPanel({
  growth,
  compact = false
}: {
  growth?: GptOSRouteResult["growth"] | null;
  compact?: boolean;
}) {
  if (!growth) {
    return null;
  }

  const potentialTone = growth.growthPotential === "high"
    ? "bg-[#e9f8ef] text-[#128246]"
    : growth.growthPotential === "medium"
      ? "bg-[#fff3d8] text-[#9a6500]"
      : "bg-[#f0f0ee] text-[#666]";

  return (
    <section className={["mt-3 rounded-2xl bg-white p-3 shadow-sm", compact ? "text-xs" : "text-sm"].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <Leaf className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" />
            Autonomous Growth OS
          </div>
          <p className="mt-1 truncate text-[#777]">{growth.optimizationSummary}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${potentialTone}`}>
          {growth.growthPotential} growth
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <Metric icon={TrendingUp} label="Value" value={`${growth.contentValueBefore} → ${growth.contentValueAfter}`} />
        <Metric icon={BarChart3} label="Delta" value={`+${growth.improvementDelta}`} />
        <Metric icon={Search} label="SEO" value={`${growth.amplifier.seoScore}/100`} />
        <Metric icon={GitBranch} label="Reuse" value={`${growth.reuse.reuseCount} assets`} />
        <Metric icon={RefreshCw} label="Status" value={growth.scheduler.optimizationStatus} />
      </div>

      <div className="mt-3 rounded-xl bg-[#f7f7f6] px-3 py-2">
        <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
          <Route className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
          Growth loop
        </div>
        <p className="mt-1 leading-5 text-[#777]">{growth.growthLoop.join(" → ")}</p>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Block
          title={`生命周期 · ${growth.lifecycle.currentStage}`}
          items={[
            growth.lifecycle.assetState,
            growth.lifecycle.refreshNeeded ? "需要进入 Knowledge Refresh Loop" : "当前内容可直接进入复用链",
            ...growth.lifecycle.refreshReasons,
            ...growth.lifecycle.stages.map((stage) => `${stage.stage}: ${stage.status}`)
          ]}
        />
        <Block title="价值放大动作" items={growth.amplifier.amplificationActions} />
        <Block title="复用衍生资产" items={growth.reuse.derivativeAssets} />
        <Block
          title="增长调度任务"
          items={growth.scheduler.scheduledTasks.map((task) => `${task.title}${task.approvalRequired ? "（需人工确认）" : ""}`)}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section className="rounded-xl bg-[#f7f7f6] px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
            <Sparkles className="h-3.5 w-3.5 text-[#a95400]" aria-hidden="true" />
            SEO / value lift
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <MiniMetric label="Clarity" value={`+${growth.amplifier.clarityLift}%`} />
            <MiniMetric label="Structure" value={`+${growth.amplifier.structureLift}%`} />
            <MiniMetric label="Business" value={`+${growth.amplifier.businessValueLift}%`} />
          </div>
          {growth.amplifier.keywordClusters.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {growth.amplifier.keywordClusters.map((keyword) => <Pill key={keyword}>{keyword}</Pill>)}
            </div>
          ) : null}
        </section>

        <section className="rounded-xl bg-[#f7f7f6] px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
            <GitBranch className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" />
            Reuse chain
          </div>
          <p className="mt-1 leading-5 text-[#777]">{growth.reuse.reuseChain.join(" → ")}</p>
          <p className="mt-1 leading-5 text-[#777]">{growth.reuse.refreshLoop}</p>
        </section>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-[#f7f7f6] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#999]">
        <Icon className="h-3 w-3" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 truncate font-semibold text-[#202020]">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#999]">{label}</p>
      <p className="mt-0.5 font-semibold text-[#202020]">{value}</p>
    </div>
  );
}

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-[#f7f7f6] px-3 py-2">
      <p className="font-semibold text-[#202020]">{title}</p>
      <ul className="mt-1 space-y-1 leading-5 text-[#777]">
        {items.slice(0, 6).map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-[#aaa]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#666]">
      {children}
    </span>
  );
}
