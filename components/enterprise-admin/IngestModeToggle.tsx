"use client";

import { useState } from "react";
import { MessageSquareText, MonitorCog } from "lucide-react";
import { IngestChatGPTShell } from "@/components/enterprise-admin/IngestChatGPTShell";
import { IngestEXEShell } from "@/components/enterprise-admin/IngestEXEShell";

type IngestMode = "chat" | "workbench";

export function IngestModeToggle() {
  const [mode, setMode] = useState<IngestMode>("workbench");

  return (
    <div className="relative h-screen overflow-hidden bg-[#f7f7f6]">
      <div className="absolute left-1/2 top-3 z-50 flex -translate-x-1/2 rounded-2xl border border-[#e7e7e4] bg-white/95 p-1 text-sm font-semibold shadow-[0_10px_30px_rgba(15,23,42,0.08)] backdrop-blur">
        <button
          type="button"
          onClick={() => setMode("chat")}
          className={[
            "flex h-9 items-center gap-2 rounded-xl px-4 transition",
            mode === "chat" ? "bg-[#202020] text-white" : "text-[#555] hover:bg-[#f5f5f3] hover:text-[#202020]"
          ].join(" ")}
        >
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Chat 模式
        </button>
        <button
          type="button"
          onClick={() => setMode("workbench")}
          className={[
            "flex h-9 items-center gap-2 rounded-xl px-4 transition",
            mode === "workbench" ? "bg-[#202020] text-white" : "text-[#555] hover:bg-[#f5f5f3] hover:text-[#202020]"
          ].join(" ")}
        >
          <MonitorCog className="h-4 w-4" aria-hidden="true" />
          工作台模式
        </button>
      </div>

      <div className={mode === "chat" ? "block" : "hidden"} aria-hidden={mode !== "chat"}>
        <IngestChatGPTShell />
      </div>
      <div className={mode === "workbench" ? "block" : "hidden"} aria-hidden={mode !== "workbench"}>
        <IngestEXEShell />
      </div>
    </div>
  );
}
