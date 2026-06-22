"use client";

import { CheckCircle2, Circle, OctagonAlert, Pause, Play, ShieldCheck, Square, XCircle } from "lucide-react";
import type {
  AutonomousStep,
  AutonomousTaskResult,
  AutonomousTaskStatus
} from "@/lib/enterprise/gpt-os-autonomous-executor";
import type { AutonomousTaskStateSnapshot } from "@/lib/enterprise/gpt-os-task-state";

type TaskLike = AutonomousTaskResult | AutonomousTaskStateSnapshot | null | undefined;

interface IngestAutonomousTaskPanelProps {
  task?: TaskLike;
  enabled?: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
  onApproveStep?: (stepId: string) => void;
  compact?: boolean;
}

const statusLabels: Record<AutonomousTaskStatus, string> = {
  idle: "waiting",
  planning: "planning",
  running: "running",
  needs_approval: "needs approval",
  paused: "paused",
  completed: "done",
  failed: "blocked",
  cancelled: "cancelled"
};

function statusClass(status: AutonomousTaskStatus) {
  if (status === "completed") return "bg-[#e9f8ef] text-[#13733a]";
  if (status === "needs_approval") return "bg-[#fff4db] text-[#9a6500]";
  if (status === "failed" || status === "cancelled") return "bg-[#ffecef] text-[#b93b4a]";
  if (status === "running" || status === "planning") return "bg-[#eaf0ff] text-[#315bf6]";

  return "bg-[#f0f0ee] text-[#666]";
}

function riskClass(risk: AutonomousStep["risk"]) {
  if (risk === "safe") return "bg-[#e9f8ef] text-[#13733a]";
  if (risk === "review_required") return "bg-[#fff4db] text-[#9a6500]";

  return "bg-[#ffecef] text-[#b93b4a]";
}

function StepIcon({ step }: { step: AutonomousStep }) {
  if (step.status === "completed") return <CheckCircle2 className="h-4 w-4 text-[#13733a]" aria-hidden="true" />;
  if (step.status === "needs_approval") return <ShieldCheck className="h-4 w-4 text-[#9a6500]" aria-hidden="true" />;
  if (step.status === "failed") return <OctagonAlert className="h-4 w-4 text-[#b93b4a]" aria-hidden="true" />;
  if (step.status === "cancelled") return <XCircle className="h-4 w-4 text-[#b93b4a]" aria-hidden="true" />;

  return <Circle className="h-4 w-4 text-[#aaa]" aria-hidden="true" />;
}

export function IngestAutonomousTaskPanel({
  task,
  enabled = false,
  onToggleEnabled,
  onPause,
  onResume,
  onCancel,
  onApproveStep,
  compact = false
}: IngestAutonomousTaskPanelProps) {
  const steps = task?.steps ?? [];

  return (
    <section className={[
      "rounded-[22px] border border-[#e7e7e4] bg-white p-3 text-xs text-[#555] shadow-sm",
      compact ? "mt-3" : "mt-4"
    ].join(" ")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <ShieldCheck className="h-4 w-4 text-[#13733a]" aria-hidden="true" />
            自主执行
            <span className={["rounded-full px-2 py-0.5 text-[11px]", statusClass(task?.status ?? "idle")].join(" ")}>
              {statusLabels[task?.status ?? "idle"]}
            </span>
          </div>
          <p className="mt-1 truncate text-[#777]">
            {task?.goal ?? "默认关闭。开启后只自动执行低风险分析和草稿步骤。"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => onToggleEnabled?.(!enabled)}
            className={[
              "rounded-full px-3 py-1.5 font-semibold transition",
              enabled ? "bg-[#202020] text-white" : "bg-[#f0f0ee] text-[#666] hover:bg-[#e7e7e4]"
            ].join(" ")}
          >
            {enabled ? "已开启" : "开启"}
          </button>
          <button type="button" onClick={onPause} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f6f5] text-[#555] hover:bg-[#ededeb]" aria-label="暂停自主任务">
            <Pause className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={onResume} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f6f6f5] text-[#555] hover:bg-[#ededeb]" aria-label="继续自主任务">
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={onCancel} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#fff3f4] text-[#b93b4a] hover:bg-[#ffecef]" aria-label="取消自主任务">
            <Square className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {task?.summaryResult ? (
        <p className="mt-3 rounded-2xl bg-[#f7f7f6] px-3 py-2 leading-5 text-[#666]">{task.summaryResult}</p>
      ) : null}

      {steps.length ? (
        <div className="mt-3 space-y-2">
          {steps.map((step, index) => (
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
                      {statusLabels[step.status]}
                    </span>
                  </div>
                  <p className="mt-1 leading-5 text-[#777]">{step.result ?? step.error ?? step.description}</p>
                </div>
              </div>
              {step.status === "needs_approval" ? (
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApproveStep?.(step.id)}
                    className="rounded-full bg-[#202020] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-black"
                  >
                    确认该步骤（{step.risk}）
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-2xl bg-[#f7f7f6] px-3 py-2 leading-5 text-[#777]">
          输入复杂任务后会生成执行计划。低风险步骤自动产出草稿；保存、导出、发布、删除等动作必须人工确认。
        </p>
      )}
    </section>
  );
}
