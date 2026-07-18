import { CopilotInsightsPage } from "@/apps/team-os/features/copilot/pages/CopilotInsightsPage";
import type { CopilotAssistantRole } from "@/apps/team-os/features/copilot/types";

export const metadata = { title: "AI 洞察中心 | AI Team OS" };

const roles = new Set<CopilotAssistantRole>([
  "EMPLOYEE_ASSISTANT",
  "MANAGER_ASSISTANT",
  "OWNER_ASSISTANT"
]);

export default function CopilotInsightsRoute({ searchParams }: {
  searchParams?: {
    role?: string | string[];
    companyId?: string | string[];
  };
}) {
  const requestedRole = typeof searchParams?.role === "string" ? searchParams.role : undefined;
  const role = requestedRole && roles.has(requestedRole as CopilotAssistantRole)
    ? requestedRole as CopilotAssistantRole
    : "EMPLOYEE_ASSISTANT";
  const companyId = typeof searchParams?.companyId === "string" ? searchParams.companyId : undefined;
  return <CopilotInsightsPage initialRole={role} initialCompanyId={companyId} />;
}
