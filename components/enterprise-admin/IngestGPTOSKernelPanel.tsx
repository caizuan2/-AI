"use client";

import { Cpu, DatabaseZap, Gauge, Layers3, RotateCw, ServerCog } from "lucide-react";
import type { GptOSKernelState } from "@/lib/enterprise/gpt-os-kernel-runtime";

export function IngestGPTOSKernelPanel({
  kernel,
  compact = false
}: {
  kernel?: GptOSKernelState | null;
  compact?: boolean;
}) {
  if (!kernel) {
    return null;
  }

  return (
    <section className={[
      "rounded-[22px] border border-[#e7e7e4] bg-white p-3 text-xs text-[#555] shadow-sm",
      compact ? "mt-3" : "mt-4"
    ].join(" ")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <ServerCog className="h-4 w-4 text-[#315bf6]" aria-hidden="true" />
            Autonomous OS Kernel
            <span className={["rounded-full px-2 py-0.5 text-[11px]", kernel.running ? "bg-[#e9f8ef] text-[#13733a]" : "bg-[#ffecef] text-[#b93b4a]"].join(" ")}>
              {kernel.running ? "running" : "stopped"}
            </span>
          </div>
          <p className="mt-1 text-[#777]">
            Daemon tick {kernel.backgroundWorker.ticks} · {kernel.loopState} · {kernel.backgroundWorker.lastAction}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pill>{`queue ${kernel.resourceUsage.queueLength}`}</Pill>
          <Pill>{`active ${kernel.resourceUsage.activeTaskCount}`}</Pill>
          <Pill>{`done ${kernel.resourceUsage.completedTaskCount}`}</Pill>
        </div>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <Metric icon={Layers3} label="Scheduler" value={kernel.selfTuning.schedulingMode} />
        <Metric icon={DatabaseZap} label="Memory" value={`${Math.round(kernel.memoryState.memoryUsage * 100)}%`} />
        <Metric icon={Gauge} label="Self tuning" value={`${Math.round(kernel.selfTuning.score * 100)}%`} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-[#f7f7f6] p-3">
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <Cpu className="h-3.5 w-3.5 text-[#315bf6]" aria-hidden="true" />
            Agent resources
          </div>
          <div className="mt-2 space-y-1.5">
            {kernel.agentPool.map((agent) => (
              <div key={agent.id} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
                <span className="font-semibold text-[#202020]">{agent.id}</span>
                <span className="rounded-full bg-[#f0f0ee] px-2 py-0.5 text-[11px] text-[#666]">
                  {agent.status} · {Math.round(agent.load * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-[#f7f7f6] p-3">
          <div className="flex items-center gap-2 font-semibold text-[#202020]">
            <RotateCw className="h-3.5 w-3.5 text-[#128246]" aria-hidden="true" />
            System self tuning
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill>{kernel.selfTuning.status}</Pill>
            <Pill>{kernel.selfTuning.memoryStrategy}</Pill>
            <Pill>{kernel.selfTuning.agentStrategy}</Pill>
            <Pill>{kernel.selfTuning.costStrategy}</Pill>
          </div>
          <ul className="mt-2 space-y-1.5 text-[#666]">
            {kernel.selfTuning.improvements.slice(0, 4).map((item) => (
              <li key={item} className="leading-5">- {item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-[#f7f7f6] p-3">
        <p className="font-semibold text-[#202020]">Cross-task memory</p>
        <p className="mt-1 leading-5 text-[#777]">{kernel.memoryState.lastLearning}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {kernel.memoryState.crossTaskPatterns.slice(0, 8).map((signal) => (
            <Pill key={signal}>{signal}</Pill>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-[#f7f7f6] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#888]">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <p className="mt-1 font-semibold text-[#202020]">{value}</p>
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <span className="rounded-full bg-[#f0f0ee] px-2 py-0.5 text-[11px] font-semibold text-[#666]">
      {children}
    </span>
  );
}
