"use client";

import { Rocket, RotateCcw, Copy } from "lucide-react";
import { useState } from "react";
import type { ReleaseActionResponse, ReleaseConsoleSummary, ReleaseEnvironment } from "@/lib/enterprise/release-console-types";
import { ReleaseStatusBadge } from "@/components/enterprise-admin/IngestReleaseDashboard";

type ActionResult = ReleaseActionResponse & {
  commands?: string[];
  warning?: string;
  auditId?: string | null;
};

const ENVIRONMENTS: ReleaseEnvironment[] = ["dev", "staging", "prod"];

export function IngestReleaseActionsPanel({
  data,
  onActionComplete
}: {
  data: ReleaseConsoleSummary;
  onActionComplete: () => void;
}) {
  const [publishEnv, setPublishEnv] = useState<ReleaseEnvironment>(data.environment);
  const [buildWeb, setBuildWeb] = useState(true);
  const [buildApk, setBuildApk] = useState(true);
  const [buildExe, setBuildExe] = useState(true);
  const [deployWeb, setDeployWeb] = useState(data.environment === "prod");
  const [runQa, setRunQa] = useState(true);
  const [rollbackEnv, setRollbackEnv] = useState<ReleaseEnvironment>("prod");
  const [rollbackRef, setRollbackRef] = useState(data.rollback.releaseTags[0] ?? "");
  const [confirmText, setConfirmText] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [error, setError] = useState("");

  async function runAction(path: string, body: Record<string, unknown>) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      credentials: "include",
      body: JSON.stringify(body)
    });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error?.message ?? payload?.message ?? "操作失败。");
    }

    return payload as ActionResult;
  }

  async function publish() {
    if (!window.confirm("将触发 GitHub Actions 发布流程，构建 Web / APK / EXE，并可选部署 Web 到阿里云。是否继续？")) {
      return;
    }

    setIsPublishing(true);
    setError("");
    setResult(null);

    try {
      const payload = await runAction("/api/admin/ingest-release/actions/publish", {
        environment: publishEnv,
        buildWeb,
        buildApk,
        buildExe,
        deployWeb,
        runQa
      });
      setResult(payload);
      onActionComplete();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "发布触发失败。");
    } finally {
      setIsPublishing(false);
    }
  }

  async function rollback() {
    if (!window.confirm("回滚会影响线上版本，请确认 release tag 与目标 commit。是否继续？")) {
      return;
    }

    setIsRollingBack(true);
    setError("");
    setResult(null);

    try {
      const payload = await runAction("/api/admin/ingest-release/actions/rollback", {
        environment: rollbackEnv,
        rollbackRef,
        confirmText
      });
      setResult(payload);
      onActionComplete();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "回滚触发失败。");
    } finally {
      setIsRollingBack(false);
    }
  }

  async function copyCommand() {
    const text = result?.manualCommand ?? result?.commands?.join("\n");

    if (text) {
      await navigator.clipboard?.writeText(text);
    }
  }

  return (
    <section className="rounded-[26px] border border-[#ededeb] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[#202020]">一键发布 / 一键回滚</h2>
          <p className="mt-1 text-xs leading-5 text-[#777]">只触发 GitHub workflow 或生成手动命令；不会在 UI/API 中直接 SSH、reset 或 migration。</p>
        </div>
        <div className="flex gap-2">
          <ReleaseStatusBadge status={data.permissions.canPublish} label="publish" />
          <ReleaseStatusBadge status={data.permissions.canRollback} label="rollback" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl bg-[#f8f8f7] p-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-4 w-4 text-[#128246]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#202020]">发布流程</p>
          </div>
          <div className="mt-3 grid gap-3 text-sm">
            <label className="text-xs font-semibold text-[#777]">
              环境
              <select
                value={publishEnv}
                onChange={(event) => {
                  const value = event.target.value as ReleaseEnvironment;
                  setPublishEnv(value);
                  setDeployWeb(value === "prod");
                }}
                className="mt-1 h-10 w-full rounded-2xl border border-[#e5e7eb] bg-white px-3 text-sm outline-none focus:border-[#128246]"
              >
                {ENVIRONMENTS.map((environment) => (
                  <option key={environment} value={environment}>{environment}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-[#555]">
              <CheckOption label="Web" value={buildWeb} onChange={setBuildWeb} />
              <CheckOption label="APK" value={buildApk} onChange={setBuildApk} />
              <CheckOption label="EXE" value={buildExe} onChange={setBuildExe} />
              <CheckOption label="Deploy Web" value={deployWeb} onChange={setDeployWeb} />
              <CheckOption label="Run QA" value={runQa} onChange={setRunQa} />
            </div>
            <button
              type="button"
              onClick={publish}
              disabled={isPublishing || !data.permissions.canPublish}
              className="h-10 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white transition hover:bg-black disabled:bg-[#d9d9d6] disabled:text-[#777]"
            >
              {isPublishing ? "触发中..." : "一键发布"}
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-[#fff8ef] p-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-[#9a6500]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#202020]">安全回滚</p>
          </div>
          <div className="mt-3 grid gap-3">
            <label className="text-xs font-semibold text-[#777]">
              环境
              <select
                value={rollbackEnv}
                onChange={(event) => setRollbackEnv(event.target.value as ReleaseEnvironment)}
                className="mt-1 h-10 w-full rounded-2xl border border-[#f0d9ae] bg-white px-3 text-sm outline-none focus:border-[#9a6500]"
              >
                {ENVIRONMENTS.map((environment) => (
                  <option key={environment} value={environment}>{environment}</option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[#777]">
              rollback ref
              <input
                value={rollbackRef}
                onChange={(event) => setRollbackRef(event.target.value)}
                placeholder="release/admin-ingest-..."
                className="mt-1 h-10 w-full rounded-2xl border border-[#f0d9ae] bg-white px-3 text-sm outline-none focus:border-[#9a6500]"
              />
            </label>
            <label className="text-xs font-semibold text-[#777]">
              确认文本
              <input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder="CONFIRM_ROLLBACK"
                className="mt-1 h-10 w-full rounded-2xl border border-[#f0d9ae] bg-white px-3 text-sm outline-none focus:border-[#9a6500]"
              />
            </label>
            <button
              type="button"
              onClick={rollback}
              disabled={isRollingBack || !data.permissions.canRollback || confirmText !== "CONFIRM_ROLLBACK"}
              className="h-10 rounded-2xl bg-[#9a6500] px-4 text-sm font-semibold text-white transition hover:bg-[#825500] disabled:bg-[#ead9bb] disabled:text-[#9a6500]"
            >
              {isRollingBack ? "触发中..." : "一键回滚"}
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-2xl bg-[#fff5f7] px-4 py-3 text-sm font-semibold text-[#b93b4a]">{error}</p> : null}
      {result ? (
        <div className="mt-4 rounded-2xl border border-[#ededeb] bg-[#fbfbfa] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#202020]">{result.dispatched ? "已触发 GitHub Actions" : "未触发，已生成手动命令"}</p>
              <p className="mt-1 text-xs text-[#777]">workflow：{result.workflow} · ref：{result.ref} · reason：{result.reason ?? "none"}</p>
            </div>
            <div className="flex gap-2">
              {result.runUrl ? (
                <a href={result.runUrl} target="_blank" className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#128246] shadow-sm hover:bg-[#f0fbf3]">打开 Actions</a>
              ) : null}
              {result.manualCommand || result.commands?.length ? (
                <button
                  type="button"
                  onClick={copyCommand}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#555] shadow-sm hover:bg-[#efefed]"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  复制命令
                </button>
              ) : null}
            </div>
          </div>
          {result.manualCommand || result.commands?.length ? (
            <pre className="mt-3 overflow-x-auto rounded-2xl bg-[#202020] p-3 text-xs leading-6 text-white">
              {result.manualCommand ?? result.commands?.join("\n")}
            </pre>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CheckOption({
  label,
  value,
  onChange
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-2xl bg-white px-3 py-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-[#d6d6d2] text-[#128246]"
      />
      {label}
    </label>
  );
}
