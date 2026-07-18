import { CopilotWorkspacePage } from "@/apps/team-os/features/copilot/pages/CopilotWorkspacePage";

export function OwnerCopilotPage({ initialCompanyId }: { initialCompanyId?: string }) {
  return <CopilotWorkspacePage assistantRole="OWNER_ASSISTANT" initialCompanyId={initialCompanyId} />;
}
