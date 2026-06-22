"use client";

import { BarChart3, FileText, Gauge, Route, Sparkles, TrendingUp } from "lucide-react";
import type { GptOSRouteResult } from "@/lib/enterprise/gpt-os-agent-router";

export function IngestGPTBusinessPanel({
  business,
  compact = false
}: {
  business?: GptOSRouteResult["business"] | null;
  compact?: boolean;
}) {
  if (!business) {
    return null;
  }

  const score = business.content.contentScore;

  return (
    <section className={["mt-3 rounded-2xl bg-white p-3 shadow-sm", compact ? "text-xs" : "text-sm"].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <TrendingUp className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" />
            Business OS
          </div>
          <p className="mt-1 truncate text-[#777]">
            {business.content.template.label} · {business.content.structure}
          </p>
        </div>
        <span className={business.monetizationPotential === "high"
          ? "rounded-full bg-[#e9f8ef] px-2.5 py-1 text-[11px] font-semibold text-[#128246]"
          : business.monetizationPotential === "medium"
            ? "rounded-full bg-[#fff3d8] px-2.5 py-1 text-[11px] font-semibold text-[#9a6500]"
            : "rounded-full bg-[#f0f0ee] px-2.5 py-1 text-[11px] font-semibold text-[#666]"}>
          {business.monetizationPotential} value
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <Metric icon={Gauge} label="Value" value={`${business.content.valueScore}/10`} />
        <Metric icon={BarChart3} label="Readiness" value={`${business.revenueReadiness}%`} />
        <Metric icon={FileText} label="Type" value={business.content.type} />
        <Metric icon={Sparkles} label="Score" value={score.scoreLabel} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Block title="内容结构" items={business.content.contentOutline} />
        <Block title="变现链路" items={business.monetizationPath} />
        <Block title="知识增强" items={business.knowledgeEnhancement.slice(0, 5)} />
        <Block title="商业输出" items={business.businessOutputTemplates} />
      </div>

      <div className="mt-3 rounded-xl bg-[#f7f7f6] px-3 py-2">
        <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
          <Route className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
          Content to value chain
        </div>
        <p className="mt-1 leading-5 text-[#777]">{business.valueChain.join(" → ")}</p>
        {business.approvalRequired ? (
          <p className="mt-1 leading-5 text-[#9a6500]">涉及保存、导出或发布类动作时必须等待管理员确认。</p>
        ) : null}
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Gauge;
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

function Block({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl bg-[#f7f7f6] px-3 py-2">
      <p className="font-semibold text-[#202020]">{title}</p>
      <ul className="mt-1 space-y-1 leading-5 text-[#777]">
        {items.slice(0, 5).map((item) => (
          <li key={item} className="flex gap-1.5">
            <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-[#aaa]" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
