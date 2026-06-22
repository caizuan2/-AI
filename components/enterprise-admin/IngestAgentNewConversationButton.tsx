"use client";

import { Plus } from "lucide-react";

export function IngestAgentNewConversationButton({
  onCreate
}: {
  onCreate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onCreate}
      className="flex h-8 w-full items-center gap-2 rounded-xl px-2 text-left text-xs font-semibold text-[#128246] transition hover:bg-white"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      新建对话
    </button>
  );
}
