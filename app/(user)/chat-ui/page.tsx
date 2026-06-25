import type { Metadata } from "next";
import * as React from "react";
import { ChatShell } from "./components/ChatShell";
import { ClientAuthGate } from "./components/ClientAuthGate";

export const metadata: Metadata = {
  title: "小董AI",
  description: "AI Knowledge OS 用户端业务问题处理助手"
};

export default function ChatUiPage() {
  return (
    <ClientAuthGate>
      <ChatShell />
    </ClientAuthGate>
  );
}
