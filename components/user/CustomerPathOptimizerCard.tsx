"use client";

import { Route } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuntimeV4CustomerPathOptimization } from "@/lib/knowledge-runtime/runtime-v4-growth-types";

export function CustomerPathOptimizerCard({
  path,
  className,
}: {
  path?: RuntimeV4CustomerPathOptimization | null;
  className?: string;
}) {
  if (!path) return null;

  return (
    <div className={cn("rounded-2xl bg-white/85 px-3 py-3 text-xs leading-5 text-emerald-950 ring-1 ring-emerald-100", className)}>
      <div className="mb-2 inline-flex items-center gap-1.5 font-semibold">
        <Route className="h-3.5 w-3.5" aria-hidden="true" />
        成交路径优化
      </div>
      <p><span className="font-semibold">当前路径：</span>{path.currentPath}</p>
      <p className="mt-1"><span className="font-semibold">瓶颈：</span>{path.bottleneck}</p>
      <p className="mt-1"><span className="font-semibold">下一步优化：</span>{path.nextOptimization}</p>
      {path.stopCondition ? <p className="mt-1 text-amber-700">停止条件：{path.stopCondition}</p> : null}
    </div>
  );
}
