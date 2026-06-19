"use client";

import { X } from "lucide-react";
import type { IngestChatAgent, IngestTrainingRecord } from "@/lib/enterprise/mock-chat";

function statusText(status: IngestChatAgent["status"]) {
  if (status === "archived") {
    return "已归档";
  }

  if (status === "deleted_local") {
    return "已从本地移除";
  }

  return "启用 / 本地预览";
}

export function IngestAgentDetailPanel({
  open,
  agent,
  records,
  onClose
}: {
  open: boolean;
  agent: IngestChatAgent;
  records: IngestTrainingRecord[];
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  const agentRecords = records.filter((record) => record.agentId === agent.id || record.category === agent.role || record.agentName === agent.name);
  const recentRecord = agentRecords[0];
  const knowledgeCount = agent.knowledgeCount ?? Math.max(agentRecords.length, agent.id === "chief" ? 128 : 0);
  const isManaged = agent.managedBySuperAdmin === true;

  return (
    <div className="absolute inset-y-0 right-0 z-[70] flex w-full justify-end bg-black/10">
      <aside className="h-full w-full max-w-[420px] overflow-y-auto border-l border-[#e8e8e5] bg-[#fbfbfa] p-4 shadow-[-18px_0_45px_rgba(15,23,42,0.12)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e9f8ef] text-lg font-semibold text-[#128246]">
              {agent.avatar}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#128246]">Agent 详情</p>
                <span className="rounded-full bg-[#e9f8ef] px-2 py-0.5 text-[11px] font-semibold text-[#128246]">当前使用中</span>
              </div>
              <h2 className="mt-1 truncate text-lg font-semibold text-[#202020]">{agent.name}</h2>
              <p className="mt-0.5 text-xs text-[#858580]">{agent.role}</p>
            </div>
          </div>
          <button type="button" aria-label="关闭 Agent 详情" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#555] shadow-sm hover:bg-[#f3f3f1]">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 rounded-[24px] border border-[#e7e7e4] bg-white p-4">
          <p className="text-sm leading-6 text-[#555]">{agent.description}</p>
          <div className="mt-4 grid gap-2 text-xs text-[#62625e]">
            <Info label="当前 Agent" value={agent.name} />
            <Info label="选中状态" value="已选中" />
            <Info label="类型" value={agent.category ?? agent.role} />
            <Info label="所属知识库" value={agent.role} />
            <Info label="来源" value={isManaged ? "超级管理员配置" : "投喂端自建"} />
            <Info label="知识数量" value={`${knowledgeCount} 条`} />
            <Info label="训练记录" value={`${agentRecords.length} 条`} />
            <Info label="最近投喂" value={recentRecord?.resultTitle ?? "暂无新投喂"} />
            <Info label="三端同步" value="Web / EXE / APK" />
            <Info label="当前状态" value={statusText(agent.status)} />
            <Info label="用户端可见" value={agent.visibleToUserClient ? "是" : "待超级管理员审核"} />
          </div>
        </div>

        <div className="mt-4 rounded-2xl bg-[#f0f0ee] p-3 text-xs leading-5 text-[#777]">
          {isManaged
            ? "该 Agent 由超级管理员配置，投喂管理员仅可选择并投喂知识。"
            : "该 Agent 为投喂端自建，归档或删除只影响当前投喂工作台，不会删除已保存知识。"}
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-[#f8f8f7] px-3 py-2">
      <span className="text-[#8b8b86]">{label}</span>
      <span className="truncate font-semibold text-[#303030]">{value}</span>
    </div>
  );
}
