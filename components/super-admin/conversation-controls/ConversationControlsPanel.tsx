"use client";

import { Save, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import type {
  ConversationFeatureFlags,
  ConversationFeatureFlagResponse
} from "@/types/conversation-control";

type ConversationControlsPanelProps = {
  initialFlags: ConversationFeatureFlagResponse;
};

const riskClasses = {
  low: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700"
};

function riskLabel(riskLevel: "low" | "medium" | "high") {
  if (riskLevel === "high") {
    return "高风险";
  }

  if (riskLevel === "medium") {
    return "中风险";
  }

  return "低风险";
}

export function ConversationControlsPanel({ initialFlags }: ConversationControlsPanelProps) {
  const [flags, setFlags] = useState(initialFlags);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateFlag(name: keyof ConversationFeatureFlags, enabled: boolean) {
    setFlags((current) => ({
      ...current,
      [name]: enabled,
      items: current.items.map((item) => (
        item.name === name ? { ...item, enabled } : item
      ))
    }));
  }

  function saveFlags() {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      const response = await fetch("/api/super-admin/conversation-features", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          rename: flags.rename,
          archive: flags.archive,
          delete: flags.delete,
          share: flags.share,
          groupChat: flags.groupChat,
          pinCloudSync: flags.pinCloudSync
        })
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok || !payload?.success) {
        setError(payload?.error?.message ?? "保存失败，请稍后重试。");
        return;
      }

      setFlags(payload.data);
      setMessage("功能开关已保存，并写入审计日志。");
    });
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-teal-700">Conversation Feature Flags</p>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-slate-950">历史会话功能开关</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            默认全部关闭。开启后用户端仍需经过本人会话校验、卡密校验和操作审计。
          </p>
        </div>
        <button
          type="button"
          onClick={saveFlags}
          disabled={isPending}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          <Save className="h-4 w-4" />
          {isPending ? "保存中" : "保存开关"}
        </button>
      </div>

      {message ? (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-5 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {flags.items.map((item) => (
          <label key={item.key} className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-950">{item.label}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${riskClasses[item.riskLevel]}`}>
                  {riskLabel(item.riskLevel)}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-500">
                  {item.key}
                </span>
              </span>
              <span className="mt-2 block text-sm leading-6 text-slate-500">{item.description}</span>
            </span>
            <span className="inline-flex items-center gap-3">
              <span className={item.enabled ? "text-sm font-medium text-emerald-700" : "text-sm font-medium text-slate-500"}>
                {item.enabled ? "已开启" : "已关闭"}
              </span>
              <input
                type="checkbox"
                checked={item.enabled}
                onChange={(event) => updateFlag(item.name, event.target.checked)}
                className="h-5 w-5 rounded border-slate-300 text-slate-950"
              />
            </span>
          </label>
        ))}
      </div>

      <div className="mt-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          删除、分享、群聊属于高风险能力。当前接口会先校验开关，再校验用户只能操作自己的 CHAT 会话，并写入审计日志；删除仅写入软删除状态，不物理删除附件和知识库文档。
        </p>
      </div>
    </section>
  );
}
