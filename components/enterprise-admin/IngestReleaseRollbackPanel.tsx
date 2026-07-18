"use client";

import { Copy, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { ReleaseConsoleSummary, RollbackPlanResponse } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";

export function IngestReleaseRollbackPanel({ data }: { data: ReleaseConsoleSummary }) {
  const [targetTag, setTargetTag] = useState(data.rollback.releaseTags[0] ?? "");
  const [plan, setPlan] = useState<RollbackPlanResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function generatePlan() {
    setIsLoading(true);
    setError("");
    setPlan(null);

    try {
      const response = await fetch("/api/admin/ingest-release/rollback-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ targetTag })
      });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message ?? payload?.message ?? "生成回滚计划失败。");
      }

      setPlan(payload as RollbackPlanResponse);
    } catch (planError) {
      setError(planError instanceof Error ? planError.message : "生成回滚计划失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function copyPlan() {
    if (!plan) {
      return;
    }

    await navigator.clipboard?.writeText(plan.commands.join("\n"));
  }

  return (
    <section className="rounded-[26px] border border-[#ffe1a6] bg-[#fffaf0] p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-[#9a6500]" aria-hidden="true" />
            <h2 className="text-base font-semibold text-[#202020]">回滚中心</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#9a6500]">{data.rollback.warning}</p>
        </div>
        <div className="flex gap-2">
          <ReleaseStatusBadge status={data.rollback.workflowExists} label="workflow" />
          <ReleaseStatusBadge status={data.rollback.scriptExists} label="script" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-2xl bg-white p-4">
          <label className="text-xs font-semibold text-[#777]" htmlFor="rollback-target">可回滚 release tag</label>
          <input
            id="rollback-target"
            value={targetTag}
            onChange={(event) => setTargetTag(event.target.value)}
            placeholder="release/admin-ingest-..."
            className="mt-2 h-10 w-full rounded-2xl border border-[#e5e7eb] bg-[#fbfbfa] px-3 text-sm outline-none focus:border-[#128246]"
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={generatePlan}
              disabled={isLoading || !data.permissions.canCopyRollbackCommand}
              className="h-10 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#d9d9d6] disabled:text-[#777]"
            >
              {isLoading ? "生成中..." : "生成回滚指令"}
            </button>
            <button
              type="button"
              onClick={copyPlan}
              disabled={!plan}
              className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#f3f3f1] px-4 text-sm font-semibold text-[#555] transition hover:bg-[#e9e9e6] disabled:opacity-50"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
              复制
            </button>
          </div>
          {error ? <p className="mt-3 text-xs font-semibold text-[#b93b4a]">{error}</p> : null}
          <p className="mt-3 text-xs text-[#777]">backup 分支：{data.rollback.backupBranches.length ? data.rollback.backupBranches.join("、") : "暂无"}</p>
        </div>

        <pre className="min-h-[180px] overflow-x-auto rounded-2xl bg-[#202020] p-4 text-xs leading-6 text-white">
          {plan ? plan.commands.join("\n") : "这里会生成安全回滚命令草稿；不会自动执行 git reset、pm2 restart 或 ssh。"}
        </pre>
      </div>
    </section>
  );
}
