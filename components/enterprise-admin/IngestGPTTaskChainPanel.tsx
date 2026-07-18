"use client";

import { CheckCircle2, Circle, Clock3, OctagonAlert, Pause, Play, ShieldCheck, Square, Workflow } from "lucide-react";
import type {
  TaskChainExecutionResult,
  TaskChainStatus,
  TaskStep,
  TaskStepStatus
} from "@/lib/enterprise/gpt-os-task-chain-engine";

interface IngestGPTTaskChainPanelProps {
  chain?: TaskChainExecutionResult | null;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onApproveStep?: (stepId: string) => void;
  compact?: boolean;
  readOnly?: boolean;
}

const statusLabels: Record<TaskChainStatus, string> = {
  running: "running",
  paused: "paused",
  waiting_approval: "waiting approval",
  completed: "completed",
  blocked: "blocked",
  cancelled: "cancelled"
};

const stepStatusLabels: Record<TaskStepStatus, string> = {
  waiting: "waiting",
  running: "running",
  done: "done",
  waiting_approval: "approval",
  blocked: "blocked",
  cancelled: "cancelled"
};

function statusClass(status: TaskChainStatus | TaskStepStatus) {
  if (status === "completed" || status === "done") return "bg-[#e9f8ef] text-[#13733a]";
  if (status === "waiting_approval") return "bg-[#fff4db] text-[#9a6500]";
  if (status === "blocked" || status === "cancelled") return "bg-[#ffecef] text-[#b93b4a]";
  if (status === "running") return "bg-[#eaf0ff] text-[#315bf6]";
  if (status === "paused") return "bg-[#f0f0ee] text-[#666]";

  return "bg-[#f6f6f5] text-[#777]";
}

function riskClass(risk: TaskStep["risk"]) {
  if (risk === "safe") return "bg-[#e9f8ef] text-[#13733a]";
  if (risk === "review_required") return "bg-[#fff4db] text-[#9a6500]";

  return "bg-[#ffecef] text-[#b93b4a]";
}

function StepIcon({ step }: { step: TaskStep }) {
  if (step.status === "done") return <CheckCircle2 className="h-4 w-4 text-[#13733a]" aria-hidden="true" />;
  if (step.status === "waiting_approval") return <ShieldCheck className="h-4 w-4 text-[#9a6500]" aria-hidden="true" />;
  if (step.status === "blocked") return <OctagonAlert className="h-4 w-4 text-[#b93b4a]" aria-hidden="true" />;
  if (step.status === "running") return <Clock3 className="h-4 w-4 text-[#315bf6]" aria-hidden="true" />;

  return <Circle className="h-4 w-4 text-[#aaa]" aria-hidden="true" />;
}

export function IngestGPTTaskChainPanel({
  chain,
  onPause,
  onResume,
  onCancel,
  onApproveStep,
  compact = false,
  readOnly = false
}: IngestGPTTaskChainPanelProps) {
  if (!chain) {
    return null;
  }

  const progress = Math.round(chain.progress * 100);

  return (
    <section className={[
      "rounded-[22px] border border-[#e7e7e4] bg-white p-3 text-xs text-[#555] shadow-sm",
      compact ? "mt-3" : "mt-4"
    ].join(" ")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-[#202020]">
            <Workflow className="h-4 w-4 text-[#315bf6]" aria-hidden="true" />
            Digital Worker Task Chain
            <span className={["rounded-full px-2 py-0.5 text-[11px]", statusClass(chain.status)].join(" ")}>
              {statusLabels[chain.status]}
            </span>
            <span className="rounded-full bg-[#f0f0ee] px-2 py-0.5 text-[11px] text-[#666]">
              {progress}% progress
            </span>
          </div>
          <p className="mt-1 leading-5 text-[#777]">{chain.goal}</p>
        </div>
        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" onClick={onPause} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f6f5] text-[#555] hover:bg-[#ededeb]" aria-label="暂停任务链">
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={onResume} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f6f5] text-[#555] hover:bg-[#ededeb]" aria-label="继续任务链">
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff3f4] text-[#b93b4a] hover:bg-[#ffecef]" aria-label="取消任务链">
              <Square className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-3 rounded-2xl bg-[#f7f7f6] px-3 py-2 leading-5 text-[#666]">
        {chain.summary}
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eeeeec]">
        <div className="h-full rounded-full bg-[#315bf6]" style={{ width: `${progress}%` }} />
      </div>

      <div className="mt-3 space-y-2">
        {chain.steps.map((step, index) => (
          <div key={step.id} className="rounded-2xl border border-[#efefed] bg-[#fbfbfa] p-3">
            <div className="flex items-start gap-2">
              <StepIcon step={step} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-semibold text-[#202020]">{index + 1}. {step.title}</p>
                  <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", riskClass(step.risk)].join(" ")}>
                    {step.risk}
                  </span>
                  <span className={["rounded-full px-2 py-0.5 text-[11px] font-semibold", statusClass(step.status)].join(" ")}>
                    {stepStatusLabels[step.status]}
                  </span>
                  {step.agentId ? (
                    <span className="rounded-full bg-[#f0f0ee] px-2 py-0.5 text-[11px] font-semibold text-[#666]">
                      {step.agentId}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 leading-5 text-[#777]">{step.result ?? step.error ?? step.description}</p>
              </div>
            </div>
            {!readOnly && step.status === "waiting_approval" ? (
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => onApproveStep?.(step.id)}
                  className="rounded-full bg-[#202020] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black"
                >
                  确认并继续任务链
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
