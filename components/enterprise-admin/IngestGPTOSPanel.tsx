"use client";

import { useState } from "react";
import {
  Activity,
  BadgeDollarSign,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDashed,
  Gauge,
  Loader2,
  Pin,
  PinOff,
  PlugZap,
  ShieldCheck,
  Workflow
} from "lucide-react";
import {
  GPT_OS_EXPERIENCE_MODES,
  getGptOSExperienceConfig,
  getGptOSExperienceModeLabel,
  resolveGptOSExperienceMode,
  type GptOSExperienceMode
} from "@/lib/enterprise/gpt-os-experience-layer";
import type { GptOSWorkflowExecution, GptOSWorkflowStepStatus } from "@/lib/enterprise/gpt-os-workflow-engine";

interface IngestGPTOSPanelProps {
  execution: GptOSWorkflowExecution | null;
  isRunning?: boolean;
  selectedModel?: string;
  className?: string;
  defaultCollapsed?: boolean;
  defaultMode?: GptOSExperienceMode;
}

function StepIcon({ status }: { status: GptOSWorkflowStepStatus }) {
  if (status === "running") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1f8f55]" aria-hidden="true" />;
  }

  if (status === "done") {
    return <CheckCircle2 className="h-3.5 w-3.5 text-[#1f8f55]" aria-hidden="true" />;
  }

  return <CircleDashed className="h-3.5 w-3.5 text-[#a1a19b]" aria-hidden="true" />;
}

function formatCost(value: number) {
  return `$${value.toFixed(6)}`;
}

function formatMs(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}s`;
  }

  return `${Math.round(value)}ms`;
}

function TechnicalRow({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-[#ecece9] py-1.5 last:border-b-0">
      <span className="shrink-0 text-[#8a8a85]">{label}</span>
      <span className="min-w-0 truncate font-semibold text-[#303030]">{value}</span>
    </div>
  );
}

function buildHumanReadableDebugSteps(execution: GptOSWorkflowExecution) {
  const workflowSteps = execution.steps.slice(0, 4).map((step, index) => `Step ${index + 1}: ${step.label} · ${step.status}`);
  const toolStep = execution.toolResults[0]
    ? `Step ${workflowSteps.length + 1}: Selected tool ${execution.toolResults[0].pluginName} and used the result to refine the answer.`
    : `Step ${workflowSteps.length + 1}: No external tool result was needed for this answer.`;
  const finalStep = `Step ${workflowSteps.length + 2}: Output generated with ${execution.runtime.detectedUxMode.toUpperCase()} experience mode.`;

  return [...workflowSteps, toolStep, finalStep];
}

export function IngestGPTOSPanel({
  execution,
  isRunning = false,
  selectedModel = "GPT-5.5 超高",
  className = "",
  defaultCollapsed = true,
  defaultMode = "simple"
}: IngestGPTOSPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
  const [isAutoMode, setIsAutoMode] = useState(true);
  const [experienceMode, setExperienceMode] = useState<GptOSExperienceMode>(defaultMode);
  const [isDeveloperOpen, setIsDeveloperOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  if (!execution) {
    return null;
  }

  const steps = execution.steps.map((step) => step.id === "call-model" && isRunning
    ? { ...step, status: "running" as const }
    : step);
  const cost = execution.runtime.cost;
  const modelTruth = execution.runtime.modelTruth;
  const latestReasoning = execution.runtime.reasoningTrace[execution.runtime.reasoningTrace.length - 1];
  const latestToolTrace = execution.runtime.toolTrace[execution.runtime.toolTrace.length - 1];
  const effectiveMode = resolveGptOSExperienceMode({
    autoMode: isAutoMode,
    detectedMode: execution.runtime.detectedUxMode,
    manualMode: experienceMode
  });
  const experience = getGptOSExperienceConfig(effectiveMode);
  const showDeveloperPanel = experience.showDeveloperPanel && (isDeveloperOpen || isPinned || isAutoMode);
  const toolNames = execution.toolResults.length
    ? Array.from(new Set(execution.toolResults.map((result) => result.pluginName)))
    : execution.plugins.map((call) => call.plugin.name);
  const readableDebugSteps = buildHumanReadableDebugSteps(execution);

  if (!isExpanded) {
    return (
      <aside className={["pointer-events-auto", className].join(" ")}>
        <button
          type="button"
          onClick={() => setIsExpanded(true)}
          className="group flex w-full items-center justify-between gap-3 rounded-full border border-[#e7e7e4] bg-white/92 px-3 py-2 text-left text-[#202020] shadow-[0_12px_35px_rgba(15,23,42,0.08)] backdrop-blur transition hover:bg-white"
          aria-label="查看技术信息"
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#eaf8f0] text-[#15904c]">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-[#303030]">查看技术信息</span>
              <span className="block truncate text-[11px] text-[#8a8a85]">
                {isRunning ? "OS 正在执行" : `Auto Mode: ${isAutoMode ? "ON" : "OFF"}`}
              </span>
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#8a8a85] transition group-hover:translate-x-0.5" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  // 这个面板只展示 GPT OS 观测信息，不接管原有投喂 UI、模型调用或 runtime 执行逻辑。
  return (
    <aside className={[
      "pointer-events-auto rounded-[22px] border border-[#e7e7e4] bg-white/94 p-3 text-[#202020] shadow-[0_18px_55px_rgba(15,23,42,0.10)] backdrop-blur",
      className
    ].join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[#eaf8f0] text-[#15904c]">
            <Bot className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-[#7a7a75]">体验模式 · OS 信息隔离</p>
            <h2 className="truncate text-sm font-semibold">{experience.title}</h2>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsExpanded(false)}
          className="shrink-0 rounded-full bg-[#f4f4f2] px-2 py-1 text-[11px] font-semibold text-[#666] transition hover:bg-[#eeeeeb]"
        >
          收起
        </button>
      </div>

      <div className="mt-3 flex rounded-full border border-[#ededeb] bg-[#f5f5f3] p-1">
        <button
          type="button"
          onClick={() => {
            setIsAutoMode((current) => !current);
            setIsDeveloperOpen(execution.runtime.detectedUxMode === "dev");
          }}
          className={[
            "flex h-7 flex-[1.15] items-center justify-center rounded-full px-2 text-[11px] font-bold tracking-[0.08em] transition",
            isAutoMode ? "bg-[#202020] text-white shadow-sm" : "text-[#777] hover:text-[#202020]"
          ].join(" ")}
          aria-pressed={isAutoMode}
        >
          AUTO {isAutoMode ? "ON" : "OFF"}
        </button>
        {GPT_OS_EXPERIENCE_MODES.map((mode) => (
          <button
            key={mode.mode}
            type="button"
            onClick={() => {
              setIsAutoMode(false);
              setExperienceMode(mode.mode);
              setIsDeveloperOpen(mode.mode === "dev");
            }}
            className={[
              "flex h-7 flex-1 items-center justify-center rounded-full px-2 text-[11px] font-bold tracking-[0.08em] transition",
              effectiveMode === mode.mode ? "bg-white text-[#202020] shadow-sm" : "text-[#777] hover:text-[#202020]"
            ].join(" ")}
            aria-pressed={effectiveMode === mode.mode}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="mt-2 rounded-2xl bg-[#f8f8f7] p-2.5 text-[11px] leading-5 text-[#666]">
        <p className="font-semibold text-[#303030]">{experience.title}</p>
        <p className="mt-1">{experience.description}</p>
        <p className="mt-1 truncate text-[#8a8a85]">
          Auto Mode: {isAutoMode ? "ON" : "OFF"} · Current Mode: {getGptOSExperienceModeLabel(effectiveMode)} {isAutoMode ? "(auto detected)" : "(manual)"}
        </p>
        <p className="truncate text-[#8a8a85]">{execution.runtime.uxReason}</p>
      </div>

      {experience.showTechnicalDetails ? (
        <div className="mt-3 rounded-2xl bg-[#f8f8f7] p-2.5 text-[11px] leading-5 text-[#666]">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          高级信息
        </div>
        <div className="mt-2">
          <TechnicalRow label="实际模型" value={modelTruth.actualModel || selectedModel} />
          <TechnicalRow label="目标模型" value={modelTruth.expectedModel} />
          <TechnicalRow label="模型验证" value={modelTruth.modelVerified ? "通过" : "待确认"} />
          <TechnicalRow label="fallback" value={modelTruth.fallbackUsed ? modelTruth.fallbackSource : "none"} />
        </div>
        </div>
      ) : null}

      {experience.showTechnicalDetails && execution.runtime.whyThisAnswer.length ? (
        <div className="mt-2 rounded-2xl bg-[#f8f8f7] p-2.5 text-[11px] leading-5 text-[#666]">
          <p className="font-semibold text-[#303030]">为什么这样回答</p>
          <div className="mt-1 space-y-1">
            {execution.runtime.whyThisAnswer.slice(0, 3).map((reason) => (
              <p key={reason} className="line-clamp-2">- {reason}</p>
            ))}
          </div>
        </div>
      ) : null}

      {experience.showCostAndModel ? (
        <div className="mt-2 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-[#f8f8f7] p-2.5 text-[11px] leading-5 text-[#666]">
          <div className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
            <BadgeDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
            成本
          </div>
          <p className="mt-1 font-semibold text-[#303030]">{formatCost(cost.totalCost)}</p>
          <p className="truncate">tokens {cost.totalTokens}</p>
          <p className="truncate">reasoning {cost.reasoningTokens}</p>
        </div>
        <div className="rounded-2xl bg-[#f8f8f7] p-2.5 text-[11px] leading-5 text-[#666]">
          <div className="flex items-center gap-1.5 font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
            <Gauge className="h-3.5 w-3.5" aria-hidden="true" />
            性能
          </div>
          <p className="mt-1 font-semibold text-[#303030]">loop {execution.runtime.loopCount}</p>
          <p className="truncate">tools {execution.runtime.toolCalls}/{execution.runtime.maxToolCalls}</p>
          <p className="truncate">tool time {formatMs(cost.toolExecutionTime)}</p>
        </div>
        </div>
      ) : null}

      {experience.showDeveloperPanel ? (
        <div className="mt-2 rounded-2xl bg-[#f8f8f7] p-2.5">
        <button
          type="button"
          onClick={() => setIsDeveloperOpen((current) => !current)}
          className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]"
          aria-expanded={showDeveloperPanel}
        >
          <span className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            开发者 OS 面板
          </span>
          {showDeveloperPanel ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        </button>

        {showDeveloperPanel ? (
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-2.5 py-2 text-[11px] text-[#666]">
              <span className="truncate">固定调试视图</span>
              <button
                type="button"
                onClick={() => setIsPinned((current) => !current)}
                className="inline-flex h-7 items-center gap-1 rounded-full border border-[#e6e6e3] bg-[#fafafa] px-2 font-semibold text-[#555] transition hover:bg-[#eeeeeb]"
                aria-pressed={isPinned}
              >
                {isPinned ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
                {isPinned ? "取消固定" : "固定"}
              </button>
            </div>

            <div className="rounded-xl bg-white p-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">可读执行过程</p>
              <div className="mt-2 space-y-1.5 text-[11px] leading-5 text-[#555]">
                {readableDebugSteps.map((step) => (
                  <p key={step} className="rounded-lg bg-[#f8f8f7] px-2 py-1">{step}</p>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
                <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
                Workflow
              </div>
              <div className="mt-2 space-y-1.5">
                {steps.map((step) => (
                  <div key={step.id} className="flex items-center gap-2 text-xs">
                    <StepIcon status={step.status} />
                    <span className="min-w-0 flex-1 truncate text-[#4a4a45]">{step.label}</span>
                    <span className="shrink-0 text-[10px] font-semibold text-[#9a9a94]">{step.status}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-white p-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
                <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
                工具调用
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {toolNames.length ? toolNames.map((name) => (
                  <span key={name} className="rounded-full bg-[#f5f5f3] px-2 py-1 text-[11px] font-semibold text-[#565650]">
                    {name} ✔
                  </span>
                )) : (
                  <span className="rounded-full bg-[#f5f5f3] px-2 py-1 text-[11px] font-semibold text-[#777]">无工具调用</span>
                )}
              </div>
              {latestToolTrace ? (
                <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#777]">
                  {latestToolTrace.pluginName}: {latestToolTrace.summary}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl bg-white p-2.5 text-[11px] leading-5 text-[#666]">
              <p className="font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">推理轨迹</p>
              <p className="mt-1 line-clamp-3 text-[#303030]">{latestReasoning?.decision ?? "Waiting for semantic trace."}</p>
              <p className="mt-1 truncate text-[#8a8a85]">{latestReasoning?.step ?? "pending"}</p>
            </div>
          </div>
        ) : null}
        </div>
      ) : null}
    </aside>
  );
}
