"use client";

import type { GptOSRouteResult } from "@/lib/enterprise/gpt-os-agent-router";
import { toUserFriendlyMessage } from "@/lib/enterprise/gpt-os-fallback-normalizer";

const BLOCKED = [
  "AI正在优化请求路径",
  "系统正在重试",
  "optimizing",
  "replanning",
  "internal_only"
];

type GptOSPanelData = (GptOSRouteResult & {
  status?: string;
  message?: unknown;
  exposeToUI?: boolean;
  debug?: unknown;
  diagnostics?: unknown;
  error?: unknown;
  ui?: unknown;
}) | null | undefined;

export function IngestGPTOSPanel({
  gptOS,
  className = ""
}: {
  gptOS?: GptOSRouteResult | null;
  className?: string;
}) {
  const data = gptOS as GptOSPanelData;
  const panelStatus = (data as { status?: string } | null | undefined)?.status;
  const panelMessage = typeof data?.message === "string" ? data.message : "";
  const friendlyError = toUserFriendlyMessage(data?.error);

  if (
    !data ||
    data.exposeToUI === false ||
    data.debug ||
    data.diagnostics ||
    BLOCKED.some((message) => panelMessage.includes(message)) ||
    BLOCKED.includes(panelStatus ?? "")
  ) {
    return null;
  }

  if (!friendlyError) {
    return null;
  }

  return (
    <div className={["mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600", className].join(" ")}>
      <div className="font-medium">{friendlyError.title}</div>
      <div>{friendlyError.message}</div>
    </div>
  );
}
