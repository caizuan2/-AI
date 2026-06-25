import type { Metadata } from "next";
import { ClientAuthGate } from "@/app/(user)/chat-ui/components/ClientAuthGate";
import { ChatShell } from "@/app/(user)/chat-ui/components/ChatShell";
import { enforceUserAppPageAccess } from "@/lib/auth/page-guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "小董AI",
  description: "GPT OS 用户端统一对话入口"
};

export default async function AppChatPage() {
  await enforceUserAppPageAccess("/app/chat");

  return (
    <ClientAuthGate>
      <ChatShell />
    </ClientAuthGate>
  );
}
