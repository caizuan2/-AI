import { ClientAuthGate } from "@/app/(user)/chat-ui/components/ClientAuthGate";
import { ChatShell } from "@/app/(user)/chat-ui/components/ChatShell";

export function AppChatExperience() {
  return (
    <ClientAuthGate>
      <ChatShell />
    </ClientAuthGate>
  );
}
