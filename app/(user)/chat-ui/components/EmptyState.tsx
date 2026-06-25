"use client";

import * as React from "react";
import type { ChatMode } from "../types";

interface EmptyStateProps {
  mode: ChatMode;
  onModeChange: (mode: ChatMode) => void;
}

export function EmptyState({ mode, onModeChange }: EmptyStateProps) {
  void mode;
  void onModeChange;

  return (
    <div className="flex min-h-[360px] flex-1 items-center justify-center px-8 text-center">
      <div className="max-w-[360px] text-slate-400">
        <p className="text-xl font-semibold text-slate-900">Hi，我是你的业务问题处理助手</p>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          把客户对话、微信截图或业务问题发给我，我会调用企业知识库并生成解决方案。
        </p>
      </div>
    </div>
  );
}
