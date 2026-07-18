import { CopilotWorkspacePage } from "@/apps/team-os/features/copilot/pages/CopilotWorkspacePage";

export function ManagerCopilotPage({ initialCompanyId }: { initialCompanyId?: string }) {
  return <CopilotWorkspacePage assistantRole="MANAGER_ASSISTANT" initialCompanyId={initialCompanyId} />;
}
