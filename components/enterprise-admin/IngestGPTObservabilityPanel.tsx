"use client";

import { Activity, BarChart3, Bot, Clock3, Gauge, GitBranch, Route, ShieldAlert, type LucideIcon } from "lucide-react";
import type { GptOSRouteResult } from "@/lib/enterprise/gpt-os-agent-router";

export function IngestGPTObservabilityPanel({
  observability,
  compact = false
}: {
  observability?: GptOSRouteResult["observability"] | null;
  compact?: boolean;
}) {
  if (!observability) {
    return null;
  }

  const fallbackTone = observability.fallback.fallbackCount > 0
    ? "bg-[#fff3d8] text-[#9a6500]"
    : "bg-[#e9f8ef] text-[#128246]";

  return (
    <section className={["mt-3 rounded-2xl bg-white p-3 shadow-sm", compact ? "text-xs" : "text-sm"].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <Activity className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
            Production Intelligence
          </div>
          <p className="mt-1 truncate text-[#777]">
            {observability.trace.traceId} · {observability.agent.selectedAgentLabel}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${fallbackTone}`}>
          {observability.fallback.fallbackCount > 0 ? "fallback active" : "stable path"}
        </span>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <Metric icon={Route} label="Trace" value={shortId(observability.trace.requestId)} />
        <Metric icon={Clock3} label="Latency" value={`${observability.latency.totalLatencyMs}ms`} />
        <Metric icon={Gauge} label="Cost" value={`$${observability.cost.totalCost.toFixed(6)}`} />
        <Metric icon={Bot} label="Model" value={observability.modelUsage.modelUsed} />
        <Metric icon={ShieldAlert} label="Fallback" value={`${observability.fallback.fallbackCount}`} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <section className="rounded-xl bg-[#f7f7f6] px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
            <Clock3 className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
            Latency breakdown
          </div>
          <div className="mt-2 space-y-1.5">
            {observability.latency.stages.slice(0, 7).map((stage) => (
              <div key={stage.name} className="grid grid-cols-[92px_1fr_52px] items-center gap-2">
                <span className="truncate text-[#777]">{stage.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white">
                  <span
                    className="block h-full rounded-full bg-[#315bf6]"
                    style={{ width: `${Math.min(100, Math.max(4, stage.percent))}%` }}
                  />
                </span>
                <span className="text-right font-semibold text-[#202020]">{stage.latencyMs}ms</span>
              </div>
            ))}
          </div>
          {observability.latency.slowestStage ? (
            <p className="mt-2 leading-5 text-[#777]">
              Slowest stage: {observability.latency.slowestStage.name} · {observability.latency.slowestStage.latencyMs}ms
            </p>
          ) : null}
        </section>

        <section className="rounded-xl bg-[#f7f7f6] px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
            <BarChart3 className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" />
            Cost intelligence
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <MiniMetric label="Prompt" value={`${observability.cost.prompt_tokens}`} />
            <MiniMetric label="Completion" value={`${observability.cost.completion_tokens}`} />
            <MiniMetric label="Reasoning" value={`${observability.cost.reasoning_tokens}`} />
            <MiniMetric label="Tool" value={`$${observability.cost.toolCostEstimate.toFixed(6)}`} />
          </div>
          <p className="mt-2 leading-5 text-[#777]">
            Total tokens {observability.cost.total_tokens}; estimated total {observability.cost.totalCost.toFixed(6)} {observability.cost.currency}.
          </p>
        </section>

        <section className="rounded-xl bg-[#f7f7f6] px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
            <GitBranch className="h-3.5 w-3.5 text-[#a95400]" aria-hidden="true" />
            Agent / tool path
          </div>
          <p className="mt-1 leading-5 text-[#777]">{observability.agent.selectionReason}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill>{`${Math.round(observability.agent.confidence * 100)}% confidence`}</Pill>
            <Pill>{`${observability.tools.toolFeedbackCount} tool feedback`}</Pill>
            <Pill>{`${observability.tools.actionCount} actions`}</Pill>
          </div>
          <p className="mt-2 leading-5 text-[#777]">
            {observability.tools.toolChain.length ? observability.tools.toolChain.join(" → ") : "No tool call recorded for this request."}
          </p>
        </section>

        <section className="rounded-xl bg-[#f7f7f6] px-3 py-2">
          <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
            <ShieldAlert className="h-3.5 w-3.5 text-[#b93b4a]" aria-hidden="true" />
            Fallback analytics
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill>{`count ${observability.fallback.fallbackCount}`}</Pill>
            <Pill>{`rate ${Math.round(observability.fallback.fallbackRate * 100)}%`}</Pill>
            <Pill>{observability.fallback.lastFallbackType ?? "no fallback"}</Pill>
          </div>
          <p className="mt-2 leading-5 text-[#777]">
            Path: {observability.fallback.fallbackModelPath.length ? observability.fallback.fallbackModelPath.join(" → ") : "primary path stable"}
          </p>
        </section>
      </div>

      <div className="mt-3 rounded-xl bg-[#f7f7f6] px-3 py-2">
        <div className="flex items-center gap-1.5 font-semibold text-[#202020]">
          <Route className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
          Request timeline
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {observability.trace.steps.map((step) => (
            <div key={`${step.name}-${step.startedAt}`} className="rounded-lg bg-white px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-[#202020]">{step.label}</p>
                <span className="rounded-full bg-[#f0f0ee] px-2 py-0.5 text-[10px] font-semibold text-[#666]">
                  {step.latencyMs}ms
                </span>
              </div>
              <p className="mt-0.5 leading-5 text-[#777]">{step.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}…${value.slice(-5)}` : value;
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

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-[#666]">
      {children}
    </span>
  );
}
