import { CopilotWorkspacePage } from "@/apps/team-os/features/copilot/pages/CopilotWorkspacePage";

export function EmployeeCopilotPage({ initialCompanyId }: { initialCompanyId?: string }) {
  return <CopilotWorkspacePage assistantRole="EMPLOYEE_ASSISTANT" initialCompanyId={initialCompanyId} />;
}
