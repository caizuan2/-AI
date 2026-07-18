"use client";

import { Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV5EvolvedPath } from "@/lib/knowledge-runtime/runtime-v5-strategy-types";

export function EvolvedPathCard({
  path,
  className,
}: {
  path?: RuntimeV5EvolvedPath | null;
  className?: string;
}) {
  if (!path) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <Route className="h-3.5 w-3.5" aria-hidden="true" />
        成交路径自优化
      </div>
      <p><span className="font-semibold">路径：</span>{path.recommendedPath}</p>
      <p className="mt-1"><span className="font-semibold">下一步：</span>{path.nextStep}</p>
      <p className="mt-1 text-slate-600">{path.whyThisPath}</p>
      {path.stopCondition ? <p className="mt-1 text-amber-700">停止条件：{path.stopCondition}</p> : null}
    </div>
  );
}
