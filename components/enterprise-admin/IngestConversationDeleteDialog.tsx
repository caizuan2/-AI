"use client";

export function IngestConversationDeleteDialog({
  open,
  title,
  onCancel,
  onConfirm
}: {
  open: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 px-4" onMouseDown={onCancel}>
      <div className="w-full max-w-[360px] rounded-[24px] border border-[#e7e7e4] bg-white p-4 shadow-[0_24px_90px_rgba(15,23,42,0.18)]" onMouseDown={(event) => event.stopPropagation()}>
        <p className="text-sm font-semibold text-[#202020]">删除对话</p>
        <p className="mt-2 text-xs leading-5 text-[#777]">删除后将从当前 Agent 的投喂记录中移除该对话。</p>
        <p className="mt-3 truncate rounded-2xl bg-[#f7f7f5] px-3 py-2 text-xs font-semibold text-[#303030]">{title}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="h-9 rounded-full bg-[#f3f3f1] px-4 text-xs font-semibold text-[#555] transition hover:bg-[#ededeb]">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="h-9 rounded-full bg-[#b42318] px-4 text-xs font-semibold text-white transition hover:bg-[#9f1f15]">
            确认删除
          </button>
        </div>
      </div>
    </div>
  );
}
