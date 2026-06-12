import type { Metadata } from "next";
import * as React from "react";
import { ChatShell } from "./components/ChatShell";
import { ClientAuthGate } from "./components/ClientAuthGate";

export const metadata: Metadata = {
  title: "AI 知识库助手",
  description: "DeepSeek / 豆包风格的用户端知识库问答页面"
};

export default function ChatUiPage() {
  return (
    <ClientAuthGate>
      <ChatShell />
    </ClientAuthGate>
  );
}
