"use client";

import { useState, type FormEvent } from "react";
import { X } from "lucide-react";

export interface IngestCreateAgentPayload {
  name: string;
  category: string;
  description: string;
  type: string;
}

const agentTypes = [
  "知识生产",
  "产品知识",
  "客服话术",
  "售后知识",
  "企业制度",
  "销售知识"
];

export function IngestCreateAgentDialog({
  open,
  onClose,
  onCreate
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (payload: IngestCreateAgentPayload) => boolean;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("默认知识库");
  const [description, setDescription] = useState("");
  const [type, setType] = useState(agentTypes[0]);
  const [error, setError] = useState("");

  if (!open) {
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("请输入 Agent 名称");
      return;
    }

    const created = onCreate({
      name: name.trim(),
      category: category.trim() || "默认知识库",
      description: description.trim() || "新建知识生产 Agent，等待后续训练。",
      type
    });

    if (created) {
      setName("");
      setCategory("默认知识库");
      setDescription("");
      setType(agentTypes[0]);
      setError("");
      onClose();
    }
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/12 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-[420px] rounded-[26px] border border-[#e7e7e4] bg-white p-4 shadow-[0_24px_80px_rgba(15,23,42,0.16)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[#202020]">新建 Knowledge Agent</h2>
            <p className="mt-1 text-xs text-[#858580]">本地预览创建，字段已预留 Web / EXE / APK 同步。</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f6f6f5] text-[#555] hover:bg-[#ededeb]" aria-label="关闭新建 Agent">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block text-xs font-semibold text-[#666]">
            Agent 名称
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-10 w-full rounded-2xl border border-[#e6e6e3] bg-[#fbfbfa] px-3 text-sm text-[#202020] outline-none focus:border-[#20b25b] focus:bg-white"
              placeholder="例如：售前报价 Agent"
            />
          </label>
          <label className="block text-xs font-semibold text-[#666]">
            知识库分类
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="mt-1 h-10 w-full rounded-2xl border border-[#e6e6e3] bg-[#fbfbfa] px-3 text-sm text-[#202020] outline-none focus:border-[#20b25b] focus:bg-white"
              placeholder="默认知识库"
            />
          </label>
          <label className="block text-xs font-semibold text-[#666]">
            简短描述
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              className="mt-1 w-full resize-none rounded-2xl border border-[#e6e6e3] bg-[#fbfbfa] px-3 py-2 text-sm leading-6 text-[#202020] outline-none focus:border-[#20b25b] focus:bg-white"
              placeholder="这个 Agent 负责什么知识生产场景？"
            />
          </label>
          <div className="block text-xs font-semibold text-[#666]">
            Agent 类型
            <div className="mt-2 grid grid-cols-2 gap-2">
              {agentTypes.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setType(item)}
                  className={[
                    "h-9 rounded-2xl border px-3 text-xs font-semibold transition",
                    type === item
                      ? "border-[#202020] bg-[#202020] text-white shadow-sm"
                      : "border-[#e6e6e3] bg-[#fbfbfa] text-[#555] hover:bg-white"
                  ].join(" ")}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error ? <p className="mt-3 text-xs font-semibold text-[#b93b4a]">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="h-10 rounded-2xl bg-[#f4f4f2] px-4 text-sm font-semibold text-[#555] hover:bg-[#ededeb]">
            取消
          </button>
          <button type="submit" className="h-10 rounded-2xl bg-[#202020] px-4 text-sm font-semibold text-white hover:bg-black">
            创建 Agent
          </button>
        </div>
      </form>
    </div>
  );
}
