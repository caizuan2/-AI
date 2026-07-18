import type { CopilotAssistantRole } from "@/apps/team-os/features/copilot/types";
import type { CopilotAgent } from "@/apps/team-os/features/copilot/agents/types";
import { EmployeeAgent } from "@/apps/team-os/features/copilot/agents/employee-agent";
import { ManagerAgent } from "@/apps/team-os/features/copilot/agents/manager-agent";
import { OwnerAgent } from "@/apps/team-os/features/copilot/agents/owner-agent";

const agents: Record<CopilotAssistantRole, CopilotAgent> = {
  EMPLOYEE_ASSISTANT: new EmployeeAgent(),
  MANAGER_ASSISTANT: new ManagerAgent(),
  OWNER_ASSISTANT: new OwnerAgent()
};

export function getCopilotAgent(role: CopilotAssistantRole) {
  return agents[role];
}

export { EmployeeAgent, ManagerAgent, OwnerAgent };
