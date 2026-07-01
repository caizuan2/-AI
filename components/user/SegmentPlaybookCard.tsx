"use client";

import { UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV4SegmentPlaybook } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

export function SegmentPlaybookCard({
  playbooks,
  className,
}: {
  playbooks?: RuntimeV4SegmentPlaybook[] | null;
  className?: string;
}) {
  if (!playbooks || playbooks.length === 0) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <UsersRound className="h-3.5 w-3.5" aria-hidden="true" />
        客户分层打法
      </div>
      <div className="space-y-2">
        {playbooks.slice(0, 2).map((playbook) => (
          <div key={playbook.customerSegment} className="rounded-xl bg-emerald-50/70 px-3 py-2">
            <p className="font-semibold">{playbook.customerSegment} · {playbook.bestTone}</p>
            <p className="mt-1">{playbook.bestNextAction}</p>
            <p className="mt-1 text-slate-600">{playbook.reason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
